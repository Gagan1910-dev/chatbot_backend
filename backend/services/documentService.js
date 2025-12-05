import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import Document from '../models/Document.js';
import DocumentChunk from '../models/DocumentChunk.js';

const CHUNK_SIZE = 1000; // characters per chunk
const CHUNK_OVERLAP = 200; // overlap between chunks

export const extractTextFromFile = async (filePath, fileType) => {
  try {
    if (fileType === 'pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (fileType === 'docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }
    throw new Error('Unsupported file type');
  } catch (error) {
    throw new Error(`Error extracting text: ${error.message}`);
  }
};

export const chunkText = (text) => {
  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + CHUNK_SIZE, text.length);
    const chunk = text.substring(startIndex, endIndex);
    
    chunks.push({
      content: chunk.trim(),
      startChar: startIndex,
      endChar: endIndex,
    });

    startIndex = endIndex - CHUNK_OVERLAP;
  }

  return chunks;
};

export const processDocument = async (documentId) => {
  try {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Update status to processing
    document.status = 'processing';
    await document.save();

    // Extract text
    const text = await extractTextFromFile(document.filePath, document.fileType);

    // Delete existing chunks
    await DocumentChunk.deleteMany({ documentId });

    // Create chunks
    const chunks = chunkText(text);
    const chunkDocuments = chunks.map((chunk, index) => ({
      documentId,
      chunkIndex: index,
      content: chunk.content,
      metadata: {
        startChar: chunk.startChar,
        endChar: chunk.endChar,
      },
    }));

    await DocumentChunk.insertMany(chunkDocuments);

    // Update document
    document.status = 'completed';
    document.chunkCount = chunks.length;
    await document.save();

    return { success: true, chunkCount: chunks.length };
  } catch (error) {
    const document = await Document.findById(documentId);
    if (document) {
      document.status = 'failed';
      await document.save();
    }
    throw error;
  }
};




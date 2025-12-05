import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import Document from '../models/Document.js';
import { processDocument } from '../services/documentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /\.(pdf|docx)$/i;
  if (allowedTypes.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and DOCX files are allowed'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileType = path.extname(req.file.originalname).slice(1).toLowerCase();
    const filePath = req.file.path;

    const document = new Document({
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath,
      fileType,
      fileSize: req.file.size,
      uploadedBy: req.user.userId,
      status: 'pending',
    });

    await document.save();

    // Process document asynchronously
    processDocument(document._id).catch((error) => {
      console.error('Document processing error:', error);
    });

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: document._id,
        filename: document.originalName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        status: document.status,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDocuments = async (req, res) => {
  try {
    const documents = await Document.find()
      .populate('uploadedBy', 'username email')
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance

    // Return empty array if no documents (instead of null)
    res.json(documents || []);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch documents' });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete file from filesystem
    try {
      const fs = await import('fs/promises');
      await fs.unlink(document.filePath);
    } catch (fileError) {
      // Log but don't fail if file doesn't exist
      console.warn('File deletion warning (file may not exist):', fileError.message);
    }

    // Delete chunks
    try {
      const DocumentChunk = (await import('../models/DocumentChunk.js')).default;
      await DocumentChunk.deleteMany({ documentId: id });
    } catch (chunkError) {
      console.warn('Chunk deletion warning:', chunkError.message);
    }

    // Delete document
    await Document.findByIdAndDelete(id);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    // Ensure response is sent even on error
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to delete document' });
    }
  }
};

export const triggerIngestion = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Process document asynchronously in background to avoid timeout
    processDocument(id).catch((error) => {
      console.error('Background document processing error:', error);
    });

    // Send immediate response
    res.json({
      message: 'Document processing started',
      documentId: id,
    });
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).json({ error: error.message });
  }
};




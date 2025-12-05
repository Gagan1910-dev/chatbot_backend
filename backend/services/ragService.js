import FAQ from '../models/FAQ.js';
import DocumentChunk from '../models/DocumentChunk.js';

const MAX_FAQ_RESULTS = 5;
const MAX_CHUNK_RESULTS = 5;

export const retrieveRelevantContext = async (query) => {
  try {
    // Search FAQs
    const faqs = await FAQ.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_FAQ_RESULTS)
      .select('question answer');

    // If no text search results, try regex search
    let faqResults = faqs;
    if (faqs.length === 0) {
      const regex = new RegExp(query.split(' ').join('|'), 'i');
      faqResults = await FAQ.find({
        $or: [
          { question: regex },
          { answer: regex },
        ],
      }).limit(MAX_FAQ_RESULTS).select('question answer');
    }

    // Search document chunks
    const chunks = await DocumentChunk.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_CHUNK_RESULTS)
      .populate('documentId', 'filename originalName')
      .select('content documentId');

    // If no text search results, try regex search
    let chunkResults = chunks;
    if (chunks.length === 0) {
      const regex = new RegExp(query.split(' ').join('|'), 'i');
      chunkResults = await DocumentChunk.find({
        content: regex,
      })
        .limit(MAX_CHUNK_RESULTS)
        .populate('documentId', 'filename originalName')
        .select('content documentId');
    }

    return {
      faqs: faqResults,
      chunks: chunkResults,
    };
  } catch (error) {
    console.error('Error retrieving context:', error);
    return { faqs: [], chunks: [] };
  }
};

export const buildContextualPrompt = (query, context, chatHistory = []) => {
  let prompt = `You are a helpful customer support assistant for a company. Use the following information to answer the user's question accurately and helpfully.

`;

  // Add FAQs context
  if (context.faqs && context.faqs.length > 0) {
    prompt += `## Frequently Asked Questions (FAQs):\n\n`;
    context.faqs.forEach((faq, index) => {
      prompt += `${index + 1}. Q: ${faq.question}\n   A: ${faq.answer}\n\n`;
    });
  }

  // Add document chunks context
  if (context.chunks && context.chunks.length > 0) {
    prompt += `## Company Documents:\n\n`;
    context.chunks.forEach((chunk, index) => {
      const docName = chunk.documentId?.originalName || 'Document';
      prompt += `[From ${docName}]\n${chunk.content}\n\n`;
    });
  }

  // Add conversation history
  if (chatHistory && chatHistory.length > 0) {
    prompt += `## Previous Conversation:\n\n`;
    chatHistory.slice(-5).forEach((msg) => {
      prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    });
    prompt += `\n`;
  }

  prompt += `## Current Question:\n${query}\n\n`;
  prompt += `Please provide a helpful, accurate answer based on the information provided above. If the information doesn't contain the answer, say so politely and offer to help with other questions.`;

  return prompt;
};




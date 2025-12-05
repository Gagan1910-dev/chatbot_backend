// services/documentService.js
// Lightweight version — NO PDF parsing or chunking (Render safe)

export const processDocument = async (documentId) => {
  // No processing needed — AI will read files directly using URLs
  return {
    success: true,
    message: "Document processing skipped. AI will analyze documents directly."
  };
};

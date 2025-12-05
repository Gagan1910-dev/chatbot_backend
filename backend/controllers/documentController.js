import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import Document from "../models/Document.js";
import { processDocument } from "../services/documentService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer storage for PDFs/DOCX
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// Upload document
export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const document = await Document.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileType: path.extname(req.file.originalname).slice(1),
      fileSize: req.file.size,
      uploadedBy: req.user.userId,
      status: "uploaded",
    });

    res.json({
      message: "Document uploaded successfully",
      document: {
        id: document._id,
        name: document.originalName,
        url: `/uploads/${document.filename}`,
        status: "uploaded",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get document list
export const getDocuments = async (req, res) => {
  try {
    const docs = await Document.find().sort({ createdAt: -1 }).lean();
    res.json(docs);
  } catch {
    res.status(500).json({ error: "Failed to fetch documents" });
  }
};

// Delete document
export const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    await Document.findByIdAndDelete(req.params.id);

    res.json({ message: "Document deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Manual ingestion (disabled)
export const triggerIngestion = async (req, res) => {
  res.json({
    message: "Ingestion disabled — AI will read documents directly using URLs.",
    documentId: req.params.id,
  });
};

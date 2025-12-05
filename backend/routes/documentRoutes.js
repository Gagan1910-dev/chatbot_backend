import express from 'express';
import {
  upload,
  uploadDocument,
  getDocuments,
  deleteDocument,
  triggerIngestion,
} from '../controllers/documentController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/upload', authenticate, requireAdmin, upload.single('file'), uploadDocument);
router.get('/list', authenticate, requireAdmin, getDocuments);
router.delete('/:id', authenticate, requireAdmin, deleteDocument);
router.post('/:id/ingest', authenticate, requireAdmin, triggerIngestion);

export default router;




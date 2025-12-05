import express from "express";
import { sendMessage, getChatHistory } from "../controllers/chatController.js";
import { optionalAuth, authenticate } from "../middleware/auth.js";

const router = express.Router();

// Chat endpoint (supports anonymous users)
router.post("/message", optionalAuth, sendMessage);

// History requires login
router.get("/history", authenticate, getChatHistory);

export default router;

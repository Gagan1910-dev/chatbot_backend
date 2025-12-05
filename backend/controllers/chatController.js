// controllers/chatController.js

import ChatHistory from "../models/ChatHistory.js";
import Document from "../models/Document.js";
import {
  retrieveRelevantContext,
  buildContextualPrompt,
} from "../services/ragService.js";
import { generateResponse } from "../services/llmService.js";

export const sendMessage = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const userId = req.user?.userId || null;
    const userSessionId = sessionId || `guest-${Date.now()}`;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // ------------------------------------------------------------
    // 1️⃣ GET ALL UPLOADED DOCUMENTS AND ATTACH AS RAG SOURCES
    // ------------------------------------------------------------
    const documents = await Document.find().lean();

    const documentUrls = documents.map((doc) => ({
      type: doc.fileType === "pdf" ? "pdf" : "document",
      url: `${process.env.BASE_URL || "https://fluxai-910t.onrender.com"}/uploads/${doc.filename}`,
    }));

    console.log("🔗 Attached document URLs:", documentUrls);

    // ------------------------------------------------------------
    // 2️⃣ RETRIEVE TEXT-BASED RAG CONTEXT (OPTIONAL)
    // ------------------------------------------------------------
    const textContext = await retrieveRelevantContext(message);

    // ------------------------------------------------------------
    // 3️⃣ GET CHAT HISTORY (if authenticated user)
    // ------------------------------------------------------------
    let chatHistory = null;
    let historyMessages = [];

    if (userId) {
      chatHistory = await ChatHistory.findOne({ userId, sessionId: userSessionId });
      historyMessages = chatHistory?.messages || [];
    }

    // ------------------------------------------------------------
    // 4️⃣ PREPARE FINAL PROMPT FOR THE LLM
    // ------------------------------------------------------------
    const prompt = buildContextualPrompt(message, textContext, historyMessages);

    const provider = process.env.LLM_PROVIDER?.toLowerCase() || "openai";
    console.log("🤖 Using LLM Provider:", provider);

    // ------------------------------------------------------------
    // 5️⃣ GROQ MODE (NO STREAMING)
    // ------------------------------------------------------------
    if (provider === "groq") {
      try {
        const response = await generateResponse(prompt, false, documentUrls);

        // Save chat history
        if (userId) {
          if (!chatHistory) {
            chatHistory = new ChatHistory({
              userId,
              sessionId: userSessionId,
              messages: [],
            });
          }

          chatHistory.messages.push({ role: "user", content: message });
          chatHistory.messages.push({ role: "assistant", content: response });
          await chatHistory.save();
        }

        return res.json({ message: response });
      } catch (err) {
        console.error("Groq Error:", err);
        return res.status(500).json({ error: err.message });
      }
    }

    // ------------------------------------------------------------
    // 6️⃣ STREAMING MODE FOR OPENAI / GEMINI / CLAUDE / DEEPSEEK
    // ------------------------------------------------------------
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    try {
      const stream = await generateResponse(prompt, true, documentUrls);

      // Unified streaming handler
      for await (const chunk of stream) {
        const content =
          chunk.choices?.[0]?.delta?.content || // OpenAI
          chunk.text?.() || // Gemini
          chunk.delta?.text || // Claude
          ""; // fallback

        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
        }
      }

      // Stream end
      res.write(`data: ${JSON.stringify({ content: "", done: true })}\n\n`);

      // Save chat history
      if (userId) {
        if (!chatHistory) {
          chatHistory = new ChatHistory({
            userId,
            sessionId: userSessionId,
            messages: [],
          });
        }

        chatHistory.messages.push({ role: "user", content: message });
        chatHistory.messages.push({ role: "assistant", content: fullResponse });
        await chatHistory.save();
      }

      res.end();
    } catch (err) {
      console.error("Streaming Error:", err);
      res.write(
        `data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`
      );
      res.end();
    }
  } catch (err) {
    console.error("Chat Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ------------------------------------------------------------
//  GET CHAT HISTORY
// ------------------------------------------------------------
export const getChatHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.query;

    const query = { userId };
    if (sessionId) query.sessionId = sessionId;

    const history = await ChatHistory.find(query)
      .sort({ updatedAt: -1 })
      .limit(10);

    res.json(history);
  } catch (error) {
    console.error("Get chat history error:", error);
    res.status(500).json({ error: error.message });
  }
};

import ChatHistory from '../models/ChatHistory.js';
import { retrieveRelevantContext, buildContextualPrompt } from '../services/ragService.js';
import { generateResponse } from '../services/llmService.js';

export const sendMessage = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const userId = req.user?.userId || null;
    const userSessionId = sessionId || `guest-${Date.now()}`;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Retrieve RAG context
    const context = await retrieveRelevantContext(message);

    // Load history for logged-in user
    let chatHistory = null;
    let historyMessages = [];

    if (userId) {
      chatHistory = await ChatHistory.findOne({
        userId,
        sessionId: userSessionId,
      });
      historyMessages = chatHistory?.messages || [];
    }

    // Build contextual prompt
    const prompt = buildContextualPrompt(message, context, historyMessages);

    const provider = process.env.LLM_PROVIDER?.toLowerCase() || 'openai';
    console.log('Using LLM provider:', provider);

    // ---------------------------------------------------------
    //  GROQ MODE  → NO STREAMING   (IMPORTANT!!)
    // ---------------------------------------------------------
    if (provider === "groq") {
      try {
        const groqResponse = await generateResponse(prompt, false); // ⛔ no stream

        // Save history
        if (userId) {
          if (!chatHistory) {
            chatHistory = new ChatHistory({
              userId,
              sessionId: userSessionId,
              messages: [],
            });
          }

          chatHistory.messages.push({ role: "user", content: message });
          chatHistory.messages.push({ role: "assistant", content: groqResponse });
          chatHistory.updatedAt = new Date();
          await chatHistory.save();
        }

        // 🔥 Return normal JSON response
        return res.json({ message: groqResponse });
      } catch (error) {
        console.error("Groq error:", error);
        return res.status(500).json({ error: error.message });
      }
    }

    // ---------------------------------------------------------
    //  STREAMING MODE FOR OTHER LLM PROVIDERS
    // ---------------------------------------------------------
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    try {
      const stream = await generateResponse(prompt, true);

      // ----------------------- OPENAI -----------------------
      if (provider === 'openai') {
        for await (const chunk of stream) {
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
          }
        }
      }

      // ----------------------- AZURE -----------------------
      else if (provider === 'azure') {
        await new Promise((resolve, reject) => {
          stream.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') {
                return resolve();
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullResponse += content;
                  res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
                }
              } catch {}
            }
          });

          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }

      // ----------------------- GEMINI -----------------------
      else if (provider === 'gemini') {
        for await (const chunk of stream) {
          const text = chunk.text();
          if (text) {
            fullResponse += text;
            res.write(`data: ${JSON.stringify({ content: text, done: false })}\n\n`);
          }
        }
      }

      // ----------------------- CLAUDE -----------------------
      else if (provider === 'claude') {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            fullResponse += chunk.delta.text;
            res.write(`data: ${JSON.stringify({ content: chunk.delta.text, done: false })}\n\n`);
          }
        }
      }

      // ----------------------- DEEPSEEK -----------------------
      else if (provider === 'deepseek') {
        await new Promise((resolve, reject) => {
          stream.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') return resolve();

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullResponse += content;
                  res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
                }
              } catch {}
            }
          });

          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }

      // END STREAM SIGNAL
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

        chatHistory.messages.push({ role: 'user', content: message });
        chatHistory.messages.push({ role: 'assistant', content: fullResponse });
        chatHistory.updatedAt = new Date();
        await chatHistory.save();
      }

      res.end();

    } catch (err) {
      console.error("Streaming error:", err);
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
// GET CHAT HISTORY
// ------------------------------------------------------------
export const getChatHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.query;

    const query = { userId };
    if (sessionId) query.sessionId = sessionId;

    const chatHistory = await ChatHistory.find(query)
      .sort({ updatedAt: -1 })
      .limit(10);

    res.json(chatHistory);
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ error: error.message });
  }
};

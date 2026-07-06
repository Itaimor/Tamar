import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  buildChatRagContext,
  buildTamarChatSystemInstruction,
  ChatRagAuthError,
  extractBearerToken,
} from "./chat-rag-context.js";

export default async function handler(req: any, res: any) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.GEMINI_TAMAR_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI API is not defined." });
  }

  try {
    const { prompt, history } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required in the request body." });
    }

    const token = extractBearerToken(req.headers.authorization);
    const ragContext = token
      ? await buildChatRagContext(token).catch((error) => {
          if (error instanceof ChatRagAuthError) throw error;
          console.warn("Chat RAG context unavailable:", error);
          return { text: "" };
        })
      : { text: "" };

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      systemInstruction: {
        role: "system",
        parts: [{ text: buildTamarChatSystemInstruction(ragContext.text) }]
      },
    });

    const chat = model.startChat({
      history: history || [],
    });

    const result = await chat.sendMessage(prompt);
    const responseText = result.response.text();

    return res.status(200).json({ text: responseText });
  } catch (error: any) {
    if (error instanceof ChatRagAuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate content." });
  }
}

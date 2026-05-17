import { GoogleGenerativeAI } from "@google/generative-ai";

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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      systemInstruction: {
        role: "system",
        parts: [{ text: "You are Tamar, a professional and empathetic AI Health Assistant specializing in IBS and digestive health. Your goal is to help users log their meals, analyze potential triggers, and provide soothing recommendations based on their symptoms. Keep responses concise, supportive, and informative. Always clarify that you are an AI and not a doctor." }]
      },
    });

    const chat = model.startChat({
      history: history || [],
    });

    const result = await chat.sendMessage(prompt);
    const responseText = result.response.text();

    return res.status(200).json({ text: responseText });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate content." });
  }
}

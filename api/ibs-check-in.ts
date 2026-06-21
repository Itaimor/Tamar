import { GoogleGenerativeAI } from "@google/generative-ai";

type IbsMessage = {
  role: "user" | "assistant";
  text: string;
};

const parseJsonObject = (text: string) => {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace >= firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;

  return JSON.parse(jsonText);
};

const buildPrompt = (messages: IbsMessage[]) => `
You are Tamar's IBS check-in interviewer.

Goal:
Collect enough information for a structured IBS symptom and food-window check-in.

You must return JSON only. No markdown. No extra prose.

Required output shape:
{
  "assistant_message": "short user-facing message",
  "result": {
    "complete": false,
    "feeling": {
      "severity": 0,
      "symptoms": [],
      "summary": "",
      "confidence": 0
    },
    "food_windows": {
      "hours_0_8": [],
      "hours_9_16": [],
      "hours_17_24": []
    },
    "missing_fields": ["feeling", "hours_0_8", "hours_9_16", "hours_17_24"]
  }
}

Rules:
- Ask one concise follow-up question at a time when information is missing.
- Vary wording naturally, but stay focused.
- Required fields are: how the user feels, foods eaten in the last 0-8 hours, 9-16 hours ago, and 17-24 hours ago.
- Severity is 0 to 1. 0 means no digestive symptoms. 1 means very bad symptoms.
- Whenever you ask for severity, explicitly say "0 means no symptoms/good, 1 means very severe/bad".
- Mention symptoms only if the user reports them.
- Split foods into plain food strings. Do not invent ingredients or foods.
- If the user says they do not remember a window, keep it empty and list it in missing_fields.
- Set complete true only when feeling and all three food windows have usable answers.
- Never diagnose. Use "track", "possible", and "pattern" language.
- Do not call the user Tamar. Tamar is the assistant name.
- If result.complete is true, do not ask whether to save. The app will save automatically. Say the check-in has enough information and is ready.
- assistant_message should either ask for missing information or briefly say the check-in has enough information.

Conversation:
${messages.map((message) => `${message.role}: ${message.text}`).join("\n")}
`;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.GEMINI_TAMAR_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI API is not defined." });
  }

  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const safeMessages: IbsMessage[] = messages
      .filter((message: any) => message && (message.role === "user" || message.role === "assistant") && typeof message.text === "string")
      .map((message: any) => ({ role: message.role, text: message.text.slice(0, 1200) }))
      .slice(-12);

    if (safeMessages.length === 0) {
      return res.status(400).json({ error: "messages are required." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
      },
    });

    const result = await model.generateContent(buildPrompt(safeMessages));
    const responseText = result.response.text();
    const parsed = parseJsonObject(responseText);

    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("IBS check-in Gemini Error:", error);
    return res.status(500).json({ error: error.message || "Failed to run IBS check-in." });
  }
}

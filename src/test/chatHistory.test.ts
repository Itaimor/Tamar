import { beforeEach, describe, expect, it } from "vitest";
import {
  getChatHistoryStorageKey,
  initialChatMessages,
  loadChatHistory,
  MAX_VISIBLE_CHAT_MESSAGES,
  saveChatHistory,
} from "@/lib/chatHistory";

describe("chat history helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("restores saved messages for the same user", () => {
    const messages = [
      ...initialChatMessages,
      { role: "user" as const, text: "What did we discuss?" },
      { role: "ai" as const, text: "We discussed your lunch." },
    ];

    saveChatHistory("user-1", messages);

    expect(loadChatHistory("user-1")).toEqual(messages);
  });

  it("keeps chat histories isolated between users", () => {
    saveChatHistory("user-1", [
      ...initialChatMessages,
      { role: "user", text: "Private message" },
    ]);

    expect(loadChatHistory("user-2")).toEqual(initialChatMessages);
  });

  it("keeps only the most recent bounded history plus the greeting", () => {
    const manyMessages = Array.from({ length: MAX_VISIBLE_CHAT_MESSAGES + 20 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "ai" as const,
      text: `Message ${index}`,
    }));

    saveChatHistory("user-1", manyMessages);
    const restored = loadChatHistory("user-1");

    expect(restored).toHaveLength(MAX_VISIBLE_CHAT_MESSAGES);
    expect(restored[0]).toEqual(initialChatMessages[0]);
    expect(restored.at(-1)?.text).toBe(`Message ${manyMessages.length - 1}`);
  });

  it("falls back safely when stored data is invalid", () => {
    window.localStorage.setItem(getChatHistoryStorageKey("user-1"), "{not-json");

    expect(loadChatHistory("user-1")).toEqual(initialChatMessages);
  });
});

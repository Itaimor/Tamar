export type ChatMessage = {
  role: "ai" | "user";
  text: string;
};

export const initialChatMessages: ChatMessage[] = [
  {
    role: "ai",
    text: "Hello! I'm Tamar, your digestive health companion. How can I help you today? You can log a meal, ask about symptoms, or request an analysis of your recent history.",
  },
];

export const MAX_VISIBLE_CHAT_MESSAGES = 80;

const CHAT_HISTORY_STORAGE_PREFIX = "tamar:chatHistory:v1";

export const trimChatMessages = (nextMessages: ChatMessage[]) => {
  if (nextMessages.length <= MAX_VISIBLE_CHAT_MESSAGES) return nextMessages;

  return [
    initialChatMessages[0],
    ...nextMessages.slice(-(MAX_VISIBLE_CHAT_MESSAGES - 1)),
  ];
};

const normalizeChatMessages = (value: unknown): ChatMessage[] => {
  if (!Array.isArray(value)) return initialChatMessages;

  const validMessages = value.filter(
    (message): message is ChatMessage =>
      Boolean(
        message &&
        typeof message === "object" &&
        ("role" in message) &&
        (message.role === "ai" || message.role === "user") &&
        ("text" in message) &&
        typeof message.text === "string" &&
        message.text.trim(),
      ),
  );

  const messagesWithGreeting =
    validMessages[0]?.role === initialChatMessages[0].role &&
    validMessages[0]?.text === initialChatMessages[0].text
      ? validMessages
      : [initialChatMessages[0], ...validMessages];

  return trimChatMessages(messagesWithGreeting);
};

export const getChatHistoryStorageKey = (userId: string) =>
  `${CHAT_HISTORY_STORAGE_PREFIX}:${userId}`;

export const loadChatHistory = (
  userId: string | null | undefined,
  storage: Pick<Storage, "getItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
): ChatMessage[] => {
  if (!userId || !storage) return initialChatMessages;

  try {
    const stored = storage.getItem(getChatHistoryStorageKey(userId));
    return stored ? normalizeChatMessages(JSON.parse(stored)) : initialChatMessages;
  } catch {
    return initialChatMessages;
  }
};

export const saveChatHistory = (
  userId: string | null | undefined,
  messages: ChatMessage[],
  storage: Pick<Storage, "setItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
) => {
  if (!userId || !storage) return;

  try {
    storage.setItem(
      getChatHistoryStorageKey(userId),
      JSON.stringify(normalizeChatMessages(messages)),
    );
  } catch {
    // Chat remains available in memory when storage is unavailable or full.
  }
};

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  loadChatHistory,
  saveChatHistory,
  trimChatMessages,
} from "@/lib/chatHistory";
import type { ChatMessage } from "@/lib/chatHistory";

export type { ChatMessage } from "@/lib/chatHistory";

export type IbsTranscriptMessage = {
  role: "assistant" | "user";
  text: string;
};

export type RecipeFeedbackRecipe = {
  id: number;
  title: string;
};

export type RecipeFeedbackState = {
  recipe: RecipeFeedbackRecipe;
  step: "confirm" | "liked" | "feeling";
};

type ChatSessionContextValue = {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  ibsTranscript: IbsTranscriptMessage[] | null;
  setIbsTranscript: Dispatch<SetStateAction<IbsTranscriptMessage[] | null>>;
  isAwaitingFoodLog: boolean;
  setIsAwaitingFoodLog: Dispatch<SetStateAction<boolean>>;
  recipeFeedback: RecipeFeedbackState | null;
  setRecipeFeedback: Dispatch<SetStateAction<RecipeFeedbackState | null>>;
};

const ChatSessionContext = createContext<ChatSessionContextValue | undefined>(undefined);

export const ChatSessionProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [messages, setRawMessages] = useState<ChatMessage[]>(() => loadChatHistory(user?.id));
  const [isLoading, setIsLoading] = useState(false);
  const [ibsTranscript, setIbsTranscript] = useState<IbsTranscriptMessage[] | null>(null);
  const [isAwaitingFoodLog, setIsAwaitingFoodLog] = useState(false);
  const [recipeFeedback, setRecipeFeedback] = useState<RecipeFeedbackState | null>(null);

  const setMessages = useCallback<Dispatch<SetStateAction<ChatMessage[]>>>((value) => {
    setRawMessages((prev) => {
      const nextMessages = typeof value === "function" ? value(prev) : value;
      return trimChatMessages(nextMessages);
    });
  }, []);

  useEffect(() => {
    saveChatHistory(user?.id, messages);
  }, [messages, user?.id]);

  const value = useMemo(
    () => ({
      messages,
      setMessages,
      isLoading,
      setIsLoading,
      ibsTranscript,
      setIbsTranscript,
      isAwaitingFoodLog,
      setIsAwaitingFoodLog,
      recipeFeedback,
      setRecipeFeedback,
    }),
    [messages, setMessages, isLoading, ibsTranscript, isAwaitingFoodLog, recipeFeedback],
  );

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
};

export const useChatSession = () => {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error("useChatSession must be used inside ChatSessionProvider");
  }
  return context;
};

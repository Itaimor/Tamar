import { Camera, Mic, Send, BarChart3, Loader2 } from "lucide-react";
import tamarLogo from "@/assets/tamar-logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

const initialMessages = [
  {
    role: "ai" as const,
    text: "Hello! I'm Tamar, your digestive health companion. How can I help you today? You can log a meal, ask about symptoms, or request an analysis of your recent history.",
  },
];

const chips = ["Analyze my Lunch", "Log Stress Level", "View Weekly Risk"];

const ChatScreen = () => {
  const [messages, setMessages] = useState(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent | string) => {
    const text = typeof e === "string" ? e : inputValue;
    if (!text.trim() || isLoading) return;

    const userMessage = { role: "user" as const, text };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // The Gemini API requires history to start with a 'user' message.
      // We find the first user message and take everything from there.
      const history = messages
        .map(m => ({
          role: m.role === "user" ? "user" as const : "model" as const,
          parts: [{ text: m.text }],
        }));

      const firstUserIndex = history.findIndex(m => m.role === "user");
      const validHistory = firstUserIndex !== -1 ? history.slice(firstUserIndex) : [];

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: text,
          history: validHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch response from Tamar backend");
      }

      const data = await response.json();
      const responseText = data.text;

      setMessages((prev) => [...prev, { role: "ai" as const, text: responseText }]);
    } catch (error) {
      console.error("Gemini Error:", error);
      toast.error("Failed to get response from Tamar. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background md:bg-card md:border md:rounded-3xl md:shadow-lg md:overflow-hidden md:mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={tamarLogo} alt="Tamar" className="h-10 w-10 md:h-12 md:w-12 rounded-full border bg-white p-1" />
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-safe border-2 border-background"></div>
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Tamar</h2>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${isLoading ? "bg-warning animate-bounce" : "bg-safe animate-pulse"}`}></span>
              {isLoading ? "Tamar is thinking..." : "AI Health Assistant"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-muted rounded-full transition-colors hidden md:block">
            <BarChart3 size={18} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6">
        <AnimatePresence mode="popLayout">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`${msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"} shadow-sm md:max-w-[70%] lg:max-w-[65%]`}>
                <p className="text-sm md:text-[15px] leading-relaxed whitespace-pre-wrap">
                  {msg.text.split(/(\*\*.*?\*\*)/g).map((part, j) =>
                    part.startsWith("**") && part.endsWith("**") ? (
                      <strong key={j} className="font-bold">{part.slice(2, -2)}</strong>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </p>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="chat-bubble-ai flex items-center gap-2 py-3 px-4">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Tamar is typing...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Footer Area */}
      <div className="bg-background/80 backdrop-blur-md p-4 md:p-6 border-t">
        {/* Chips */}
        <div className="pb-4 flex gap-2 overflow-x-auto no-scrollbar">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleSendMessage(chip)}
              disabled={isLoading}
              className="tamar-chip whitespace-nowrap text-[11px] md:text-xs disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          className="relative flex items-center gap-2 group"
        >
          <div className="flex-1 flex items-center gap-3 bg-muted hover:bg-muted/80 focus-within:bg-muted/60 transition-all rounded-2xl px-4 py-3 md:py-4 border border-transparent focus-within:border-primary/20">
            <Camera size={20} className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors" strokeWidth={1.5} />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message Tamar..."
              className="flex-1 bg-transparent text-sm md:text-base outline-none placeholder:text-muted-foreground"
              disabled={isLoading}
            />
            <Mic size={20} className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors" strokeWidth={1.5} />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl h-11 w-11 md:h-14 md:w-14 flex items-center justify-center transition-all shadow-md active:scale-95 shrink-0 disabled:opacity-50 disabled:grayscale"
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatScreen;

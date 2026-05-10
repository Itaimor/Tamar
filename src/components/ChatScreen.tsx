import { Camera, Mic, Send, BarChart3 } from "lucide-react";
import tamarLogo from "@/assets/tamar-logo.png";
import { motion } from "framer-motion";

const mockMessages = [
  {
    role: "user" as const,
    text: "I just ate a bowl of pasta with garlic sauce.",
  },
  {
    role: "ai" as const,
    text: "Logged ✅ Based on your history, **garlic** has a **65% chance** of causing discomfort within 3 hours. Would you like a tea recommendation to help soothe your stomach?",
  },
  {
    role: "user" as const,
    text: "Yes, please recommend something.",
  },
  {
    role: "ai" as const,
    text: "I'd recommend **ginger-lemon tea** — it's been shown to reduce bloating by up to 40% in your profile. Steep fresh ginger for 5 minutes for best results. 🍵",
  },
];

const chips = ["Analyze my Lunch", "Log Stress Level", "View Weekly Risk"];

const ChatScreen = () => {
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
              <span className="h-1.5 w-1.5 rounded-full bg-safe animate-pulse"></span>
              AI Health Assistant
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
        {mockMessages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
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
      </div>

      {/* Footer Area */}
      <div className="bg-background/80 backdrop-blur-md p-4 md:p-6 border-t">
        {/* Chips */}
        <div className="pb-4 flex gap-2 overflow-x-auto no-scrollbar">
          {chips.map((chip) => (
            <button key={chip} className="tamar-chip whitespace-nowrap text-[11px] md:text-xs">
              {chip}
            </button>
          ))}
        </div>

        {/* Input bar */}
        <div className="relative flex items-center gap-2 group">
          <div className="flex-1 flex items-center gap-3 bg-muted hover:bg-muted/80 focus-within:bg-muted/60 transition-all rounded-2xl px-4 py-3 md:py-4 border border-transparent focus-within:border-primary/20">
            <Camera size={20} className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Message Tamar..."
              className="flex-1 bg-transparent text-sm md:text-base outline-none placeholder:text-muted-foreground"
              readOnly
            />
            <Mic size={20} className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors" strokeWidth={1.5} />
          </div>
          <button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl h-11 w-11 md:h-14 md:w-14 flex items-center justify-center transition-all shadow-md active:scale-95 shrink-0">
            <Send size={20} className="md:size-24" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;

import { Camera, Mic, Send } from "lucide-react";
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-center pt-6 pb-4">
        <img src={tamarLogo} alt="Tamar" className="h-12 w-12" />
        <span className="ml-2 text-xl font-semibold text-foreground">Tamar</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {mockMessages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.text.split(/(\*\*.*?\*\*)/g).map((part, j) =>
                  part.startsWith("**") && part.endsWith("**") ? (
                    <strong key={j}>{part.slice(2, -2)}</strong>
                  ) : (
                    <span key={j}>{part}</span>
                  )
                )}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chips */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
        {chips.map((chip) => (
          <button key={chip} className="tamar-chip whitespace-nowrap text-xs">
            {chip}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div className="px-4 pb-6">
        <div className="flex items-center gap-2 bg-muted rounded-full px-4 py-3">
          <Camera size={20} className="text-muted-foreground" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Message Tamar..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            readOnly
          />
          <Mic size={20} className="text-muted-foreground" strokeWidth={1.5} />
          <button className="bg-primary rounded-full p-1.5 ml-1">
            <Send size={14} className="text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;

import { MessageCircle, Utensils } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";

type FloatingChatButtonProps = {
  onOpen: () => void;
};

const FloatingChatButton = ({ onOpen }: FloatingChatButtonProps) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const params = new URLSearchParams(location.search);
  const isChatOpen = location.pathname === "/app" && (params.get("tab") || "chat") === "chat";
  if (isChatOpen) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-5 right-4 z-40 group flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-primary/15 bg-white/95 px-3 py-2 text-left text-foreground shadow-2xl shadow-primary/20 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-[#fbf7ec] hover:shadow-primary/25 active:translate-y-0 sm:bottom-6 sm:right-6 sm:px-4 sm:py-3"
      aria-label="Open Tamar chat to log food"
      data-tour="floating-chat"
    >
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/25 transition-transform duration-300 group-hover:scale-105">
        <MessageCircle className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#efe5d3] text-primary">
          <Utensils className="h-3.5 w-3.5" />
        </span>
      </span>
      <span className="hidden min-w-0 flex-col sm:flex">
        <span className="text-sm font-bold leading-5">Talk to Tamar</span>
        <span className="max-w-[12rem] truncate text-xs font-medium text-[#667864]">
          Log food through chat
        </span>
      </span>
    </button>
  );
};

export default FloatingChatButton;

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { ChatSessionProvider } from "@/components/ChatSessionProvider";
import { useEffect, useState } from "react";
import Index from "./pages/Index.tsx";
import Home from "./pages/Home.tsx";
import CookBook from "./pages/CookBook.tsx";
import RecipeDetail from "./pages/RecipeDetail.tsx";
import Landing from "./pages/Landing.tsx";
import Pricing from "./pages/Pricing.tsx";
import NotFound from "./pages/NotFound.tsx";
import FloatingChatButton from "@/components/FloatingChatButton";
import ChatScreen from "@/components/ChatScreen";
import DigestiveScrollIndicator from "@/components/DigestiveScrollIndicator";
import ColdStartGuide from "@/components/ColdStartGuide";
import TamarRewardToast from "@/components/TamarRewardToast";
import type { RecipeFeedbackRecipe } from "@/components/ChatSessionProvider";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="wellness-canvas flex min-h-screen items-center justify-center text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-semibold text-[#667864]">Loading Tamar...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return <>{children}</>;
};

const AppShell = () => {
  const { user } = useAuth();
  const [isChatDockOpen, setIsChatDockOpen] = useState(false);
  const [isColdStartGuideOpen, setIsColdStartGuideOpen] = useState(false);
  const [foodLogRequestKey, setFoodLogRequestKey] = useState(0);
  const [recipeFeedbackRequest, setRecipeFeedbackRequest] = useState<{
    key: number;
    recipe: RecipeFeedbackRecipe;
  } | null>(null);
  const location = useLocation();

  const coldStartGuideKey = user ? `tamar:coldStartGuide:${user.id}` : null;
  const params = new URLSearchParams(location.search);
  const isFullChatPage = location.pathname === "/app" && (params.get("tab") || "chat") === "chat";

  useEffect(() => {
    if (!coldStartGuideKey) {
      setIsColdStartGuideOpen(false);
      return;
    }

    try {
      setIsColdStartGuideOpen(!window.localStorage.getItem(coldStartGuideKey));
    } catch {
      setIsColdStartGuideOpen(false);
    }
  }, [coldStartGuideKey]);

  const closeColdStartGuide = (status: "started" | "skipped") => {
    if (coldStartGuideKey) {
      try {
        window.localStorage.setItem(coldStartGuideKey, status);
      } catch {
        // If storage is unavailable, the in-memory close still keeps this session moving.
      }
    }

    setIsColdStartGuideOpen(false);

    if (status === "skipped") {
      window.dispatchEvent(new CustomEvent("tamar:cold-start-skip-all"));
    }
  };

  useEffect(() => {
    if (isFullChatPage) {
      setIsChatDockOpen(false);
    }
  }, [isFullChatPage]);

  useEffect(() => {
    document.documentElement.classList.toggle("tamar-chat-dock-open", isChatDockOpen);
    return () => document.documentElement.classList.remove("tamar-chat-dock-open");
  }, [isChatDockOpen]);

  const openFoodLogDock = () => {
    setIsChatDockOpen(true);
    setFoodLogRequestKey((key) => key + 1);
  };

  useEffect(() => {
    const openRecipeFeedback = (event: Event) => {
      const detail = (event as CustomEvent<RecipeFeedbackRecipe>).detail;
      if (!detail?.id || !detail?.title) return;

      setIsChatDockOpen(true);
      setRecipeFeedbackRequest({
        key: Date.now(),
        recipe: detail,
      });
    };

    window.addEventListener("tamar:open-recipe-feedback-chat", openRecipeFeedback);
    return () => window.removeEventListener("tamar:open-recipe-feedback-chat", openRecipeFeedback);
  }, []);

  return (
    <>
      <div
        className={`min-w-0 transition-[padding] duration-300 ease-out ${
          isChatDockOpen ? "lg:pr-[420px]" : ""
        }`}
      >
        <Routes>
          <Route path="/" element={<AuthGate><Home /></AuthGate>} />
          <Route path="/cookbook" element={<AuthGate><CookBook /></AuthGate>} />
          <Route path="/pricing" element={<AuthGate><Pricing /></AuthGate>} />
          <Route path="/recipes/:recipeId" element={<AuthGate><RecipeDetail /></AuthGate>} />
          <Route path="/app" element={<AuthGate><Index /></AuthGate>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<AuthGate><NotFound /></AuthGate>} />
        </Routes>
      </div>

      {isChatDockOpen && (
        <aside className="fixed inset-x-3 bottom-3 top-20 z-50 rounded-2xl border border-primary/15 bg-[#fbf7ec] shadow-2xl shadow-primary/20 lg:inset-y-4 lg:left-auto lg:right-4 lg:w-[388px] lg:rounded-3xl">
          <ChatScreen
            foodLogRequestKey={foodLogRequestKey}
            recipeFeedbackRequest={recipeFeedbackRequest}
            docked
            onClose={() => setIsChatDockOpen(false)}
          />
        </aside>
      )}

      <ColdStartGuide
        open={Boolean(user && isColdStartGuideOpen)}
        onBegin={() => closeColdStartGuide("started")}
        onSkip={() => closeColdStartGuide("skipped")}
      />
      <FloatingChatButton onOpen={openFoodLogDock} />
      <DigestiveScrollIndicator />
      <TamarRewardToast />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ChatSessionProvider>
            <AppShell />
          </ChatSessionProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

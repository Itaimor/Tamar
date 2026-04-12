import { useState } from "react";
import BottomNav from "@/components/BottomNav";
import ChatScreen from "@/components/ChatScreen";
import AnalysisScreen from "@/components/AnalysisScreen";
import HistoryScreen from "@/components/HistoryScreen";
import InsightsScreen from "@/components/InsightsScreen";

type Tab = "chat" | "analysis" | "history" | "insights";

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto flex flex-col">
      <div className="flex-1 overflow-y-auto pb-20">
        {activeTab === "chat" && <ChatScreen />}
        {activeTab === "analysis" && <AnalysisScreen />}
        {activeTab === "history" && <HistoryScreen />}
        {activeTab === "insights" && <InsightsScreen />}
      </div>
      <BottomNav active={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;

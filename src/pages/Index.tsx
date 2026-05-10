import { useState } from "react";
import BottomNav from "@/components/BottomNav";
import ChatScreen from "@/components/ChatScreen";
import AnalysisScreen from "@/components/AnalysisScreen";
import HistoryScreen from "@/components/HistoryScreen";
import InsightsScreen from "@/components/InsightsScreen";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

type Tab = "chat" | "analysis" | "history" | "insights";

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar active={activeTab} onTabChange={setActiveTab} />
        
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 md:hidden">
            <SidebarTrigger className="-ml-1" />
          </header>
          
          <main className="flex-1 overflow-hidden">
            <div className="max-w-6xl mx-auto w-full h-full px-0 md:px-6 py-0 md:py-6 flex flex-col">
              {activeTab === "chat" && <ChatScreen />}
              <div className="flex-1 overflow-y-auto px-4">
                {activeTab === "analysis" && <AnalysisScreen />}
                {activeTab === "history" && <HistoryScreen />}
                {activeTab === "insights" && <InsightsScreen />}
              </div>
            </div>
          </main>
          
          <div className="md:hidden">
            <BottomNav active={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;

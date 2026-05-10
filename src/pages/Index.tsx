import ChatScreen from "@/components/ChatScreen";
import AnalysisScreen from "@/components/AnalysisScreen";
import HistoryScreen from "@/components/HistoryScreen";
import InsightsScreen from "@/components/InsightsScreen";
import Navbar from "@/components/Navbar";
import { useSearchParams } from "react-router-dom";

type Tab = "chat" | "analysis" | "history" | "insights";

const Index = () => {
  const [searchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) || "chat";

  return (
    <div className="min-h-screen flex flex-col bg-[#141414] text-white">
      <Navbar forceSolid />
      
      <main className="flex-1 pt-24 pb-12 overflow-hidden flex flex-col">
        <div className="max-w-7xl mx-auto w-full h-full px-4 md:px-12 flex flex-col">
          {/* Header area for the specific tool */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold capitalize tracking-tight">
              {activeTab}
            </h2>
            <p className="text-gray-400 mt-2">
              {activeTab === 'chat' && "Your personal health companion is ready to help."}
              {activeTab === 'analysis' && "Deep dive into your health metrics and patterns."}
              {activeTab === 'history' && "Review your past logs and progress over time."}
              {activeTab === 'insights' && "Discover personalized health recommendations."}
            </p>
          </div>

          <div className="flex-1 min-h-0 bg-[#181818] rounded-xl border border-white/5 shadow-2xl overflow-hidden flex flex-col">
            {activeTab === "chat" && <ChatScreen />}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {activeTab === "analysis" && <div className="p-6"><AnalysisScreen /></div>}
              {activeTab === "history" && <div className="p-6"><HistoryScreen /></div>}
              {activeTab === "insights" && <div className="p-6"><InsightsScreen /></div>}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #181818;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
      `}</style>
    </div>
  );
};

export default Index;

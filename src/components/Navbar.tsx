import { useState, useEffect } from "react";
import { Search, Bell, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthDialog from "@/components/AuthDialog";
import { useAuth } from "@/components/AuthProvider";

interface NavbarProps {
  forceSolid?: boolean;
}

const Navbar = ({ forceSolid = false }: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "";

  const initials = displayName
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const getTabParam = (tab: string) => `/app?tab=${tab}`;

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path === "/cookbook" && location.pathname === "/cookbook") return true;
    if (path.includes("tab=")) {
      const tab = path.split("tab=")[1];
      const params = new URLSearchParams(location.search);
      return params.get("tab") === tab;
    }
    return false;
  };

  const linkClass = (path: string) => `
    text-sm font-semibold transition-colors duration-200 
    ${isActive(path) ? 'text-white font-bold' : 'text-gray-300 hover:text-gray-400'}
  `;

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled || forceSolid ? 'bg-[#141414] shadow-lg' : 'bg-gradient-to-b from-black/70 to-transparent'}`}>
      <div className="flex items-center justify-between px-4 md:px-12 py-4">
        <div className="flex items-center gap-8">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform"
            onClick={() => navigate("/")}
          >
            <img src="/favicon.ico" alt="Tamar Logo" className="w-8 h-8 rounded-lg shadow-lg border border-primary/20" />
            <h1 className="text-white text-2xl font-black tracking-tighter italic">TAMAR</h1>
          </div>
          <div className="hidden lg:flex gap-6">
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); navigate("/"); }}
              className={linkClass("/")}
            >
              Home
            </a>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); navigate("/cookbook"); }}
              className={linkClass("/cookbook")}
            >
              CookBook
            </a>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); navigate(getTabParam("chat")); }}
              className={linkClass(getTabParam("chat"))}
            >
              Chat
            </a>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); navigate(getTabParam("analysis")); }}
              className={linkClass(getTabParam("analysis"))}
            >
              Analysis
            </a>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); navigate(getTabParam("history")); }}
              className={linkClass(getTabParam("history"))}
            >
              History
            </a>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); navigate(getTabParam("insights")); }}
              className={linkClass(getTabParam("insights"))}
            >
              Insights
            </a>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Search className="w-5 h-5 text-gray-300 cursor-pointer hover:text-white transition-colors" />
          <Bell className="w-5 h-5 text-gray-300 cursor-pointer hover:text-white transition-colors" />
          <button
            type="button"
            aria-label={user ? "Open account" : "Sign up"}
            onClick={() => setAuthOpen(true)}
            className="w-9 h-9 bg-primary rounded-full flex items-center justify-center cursor-pointer overflow-hidden hover:ring-2 ring-white/30 transition-all text-sm font-bold text-white"
          >
            {user && initials ? initials : <User className="w-5 h-5 text-white" />}
          </button>
        </div>
      </div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </nav>
  );
};

export default Navbar;

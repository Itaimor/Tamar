import { useState, useEffect } from "react";
import { Search, Bell, User, Menu, LogOut, LogIn, Home, BookOpen, MessageSquare, BarChart3, CalendarDays } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthDialog from "@/components/AuthDialog";
import { useAuth } from "@/components/AuthProvider";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavbarProps {
  forceSolid?: boolean;
}

const Navbar = ({ forceSolid = false }: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const getTabParam = (tab: string) => `/app?tab=${tab}`;

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

  const navItems = [
    { name: "Home", path: "/", icon: Home },
    { name: "CookBook", path: "/cookbook", icon: BookOpen },
    { name: "Chat", path: getTabParam("chat"), icon: MessageSquare },
    { name: "Analysis", path: getTabParam("analysis"), icon: BarChart3 },
    { name: "Diary", path: getTabParam("diary"), icon: CalendarDays },
  ];

  const handleNavClick = (path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);



  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path === "/cookbook" && location.pathname === "/cookbook") return true;
    if (path.includes("tab=")) {
      const tab = path.split("tab=")[1];
      const params = new URLSearchParams(location.search);
      const activeTab = params.get("tab") === "history" ? "diary" : params.get("tab");
      return activeTab === tab;
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
              onClick={(e) => { e.preventDefault(); navigate(getTabParam("diary")); }}
              className={linkClass(getTabParam("diary"))}
            >
              Diary
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
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

          {/* Mobile Navigation Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="lg:hidden p-2 text-gray-300 hover:text-white focus:outline-none transition-colors rounded-lg hover:bg-white/5 cursor-pointer"
                aria-label="Open menu"
              >
                <Menu className="w-6 h-6" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[280px] sm:w-[320px] bg-[#141414]/98 border-l border-white/10 backdrop-blur-xl p-0 flex flex-col text-white z-[100]"
            >
              <div className="flex items-center gap-2 px-6 py-5 border-b border-white/5">
                <img src="/favicon.ico" alt="Tamar Logo" className="w-8 h-8 rounded-lg border border-primary/20 shadow-lg" />
                <SheetTitle className="text-white text-xl font-black tracking-tighter italic">TAMAR</SheetTitle>
              </div>

              <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-2">
                {navItems.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.name}
                      onClick={() => handleNavClick(item.path)}
                      className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 w-full text-left group cursor-pointer ${
                        active
                          ? "bg-primary/15 text-white border-l-4 border-primary font-semibold shadow-md shadow-primary/5"
                          : "text-gray-400 hover:text-white hover:bg-white/5 font-medium hover:translate-x-1"
                      }`}
                    >
                      <Icon className={`w-5 h-5 transition-transform duration-300 ${active ? "text-primary scale-110" : "text-gray-400 group-hover:text-white group-hover:scale-110"}`} />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>

              {user ? (
                <div className="p-6 border-t border-white/5 bg-[#181818]/60 flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {initials ? initials : <User className="w-5 h-5 text-white" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-white truncate">{displayName}</span>
                      <span className="text-xs text-gray-500 truncate">{user.email}</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setMobileMenuOpen(false);
                      await signOut();
                    }}
                    className="p-2 text-gray-400 hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10 cursor-pointer shrink-0"
                    aria-label="Sign out"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="p-6 border-t border-white/5 bg-[#181818]/60">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAuthOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold transition-all duration-300 active:scale-95 shadow-lg shadow-primary/10 cursor-pointer"
                  >
                    <LogIn className="w-5 h-5" />
                    <span>Sign In / Sign Up</span>
                  </button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </nav>
  );
};

export default Navbar;

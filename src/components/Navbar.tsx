import { useState, useEffect, useMemo } from "react";
import { Search, Bell, User, Menu, LogOut, LogIn, Home, BookOpen, MessageSquare, BarChart3, CalendarDays, Clock3, HeartPulse, Leaf } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthDialog from "@/components/AuthDialog";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchDefaultRecipes, RecipeItem } from "@/lib/recipes";

interface NavbarProps {
  forceSolid?: boolean;
}

const Navbar = ({ forceSolid = false }: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRecipes, setSearchRecipes] = useState<RecipeItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
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

  useEffect(() => {
    if (!searchOpen || searchRecipes.length > 0 || searchLoading) return;

    const loadSearchRecipes = async () => {
      setSearchLoading(true);
      try {
        setSearchRecipes(await fetchDefaultRecipes(80));
      } catch (error) {
        console.error("Failed to load recipes for search:", error);
      } finally {
        setSearchLoading(false);
      }
    };

    loadSearchRecipes();
  }, [searchLoading, searchOpen, searchRecipes.length]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const source = query ? searchRecipes : searchRecipes.slice(0, 6);

    if (!query) return source.slice(0, 6);

    return source
      .filter((recipe) => {
        const haystack = [
          recipe.title,
          recipe.description || "",
          ...(recipe.ingredients || []),
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [searchQuery, searchRecipes]);

  const openRecipe = (recipeId: number) => {
    setSearchOpen(false);
    setSearchQuery("");
    navigate(`/recipes/${recipeId}`);
  };



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
    rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-all duration-200
    ${isActive(path)
      ? 'bg-white/80 text-primary shadow-sm shadow-primary/10'
      : 'text-[#536451] hover:bg-white/45 hover:text-primary'}
  `;

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled || forceSolid ? 'border-b border-primary/10 bg-[#fbf7ec]/92 shadow-sm shadow-primary/10 backdrop-blur-xl' : 'bg-gradient-to-b from-[#fbf7ec]/90 to-[#fbf7ec]/20 backdrop-blur-sm'}`}>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 md:px-12">
        <div 
          className="flex items-center gap-2 cursor-pointer transition-transform hover:scale-105"
          onClick={() => navigate("/")}
        >
          <img src="/favicon.ico" alt="Tamar Logo" className="w-8 h-8 rounded-lg shadow-lg border border-primary/20" />
          <h1 className="text-primary text-2xl font-black tracking-tighter italic">TAMAR</h1>
        </div>

        <div className="hidden justify-center lg:flex">
          <div className="flex items-center gap-1 rounded-full border border-primary/10 bg-white/45 px-2 py-1.5 shadow-sm shadow-primary/5 backdrop-blur-xl">
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
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="rounded-full p-1.5 text-[#536451] transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            aria-label="Search recipes"
          >
            <Search className="w-5 h-5" />
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative rounded-full p-1.5 text-[#536451] transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                aria-label="Open notifications"
              >
                <Bell className="w-5 h-5" />
                {user && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-[#fbf7ec]" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 rounded-lg border-primary/15 bg-[#fbf7ec] p-0 text-foreground shadow-xl shadow-primary/10">
              <div className="border-b border-primary/10 px-4 py-3">
                <p className="text-sm font-bold text-[#1f3d2b]">Notifications</p>
                <p className="mt-1 text-xs text-[#667864]">
                  {user ? "A few gentle nudges for your Tamar routine." : "Sign in to get personalized reminders."}
                </p>
              </div>
              <div className="p-2">
                {[
                  {
                    icon: HeartPulse,
                    title: "Log how you feel",
                    body: "A quick check-in helps Tamar connect meals with digestion.",
                    path: getTabParam("diary"),
                  },
                  {
                    icon: Leaf,
                    title: "Review food patterns",
                    body: "See what Tamar is learning from your recent entries.",
                    path: getTabParam("analysis"),
                  },
                  {
                    icon: BookOpen,
                    title: "Revisit saved meals",
                    body: "Your CookBook keeps recipes ready for calmer meal planning.",
                    path: "/cookbook",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className="flex w-full gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-primary/8"
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-[#1f3d2b]">{item.title}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-[#667864]">{item.body}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            aria-label={user ? "Open account" : "Sign up"}
            onClick={() => setAuthOpen(true)}
            className="w-9 h-9 bg-primary rounded-full flex items-center justify-center cursor-pointer overflow-hidden hover:ring-2 ring-primary/25 transition-all text-sm font-bold text-white shadow-sm shadow-primary/20"
          >
            {user && initials ? initials : <User className="w-5 h-5 text-white" />}
          </button>

          {/* Mobile Navigation Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="lg:hidden p-2 text-[#536451] hover:text-primary focus:outline-none transition-colors rounded-lg hover:bg-primary/10 cursor-pointer"
                aria-label="Open menu"
              >
                <Menu className="w-6 h-6" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[280px] sm:w-[320px] bg-[#fbf7ec]/98 border-l border-primary/15 backdrop-blur-xl p-0 flex flex-col text-foreground z-[100]"
            >
              <div className="flex items-center gap-2 px-6 py-5 border-b border-primary/10">
                <img src="/favicon.ico" alt="Tamar Logo" className="w-8 h-8 rounded-lg border border-primary/20 shadow-lg" />
                <SheetTitle className="text-primary text-xl font-black tracking-tighter italic">TAMAR</SheetTitle>
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
                          ? "bg-primary/12 text-primary border-l-4 border-primary font-semibold shadow-md shadow-primary/5"
                          : "text-[#536451] hover:text-primary hover:bg-primary/8 font-medium hover:translate-x-1"
                      }`}
                    >
                      <Icon className={`w-5 h-5 transition-transform duration-300 ${active ? "text-primary scale-110" : "text-[#7a8b72] group-hover:text-primary group-hover:scale-110"}`} />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>

              {user ? (
                <div className="p-6 border-t border-primary/10 bg-white/45 flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {initials ? initials : <User className="w-5 h-5 text-white" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-foreground truncate">{displayName}</span>
                      <span className="text-xs text-[#687967] truncate">{user.email}</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setMobileMenuOpen(false);
                      await signOut();
                    }}
                    className="p-2 text-[#687967] hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10 cursor-pointer shrink-0"
                    aria-label="Sign out"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="p-6 border-t border-primary/10 bg-white/45">
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
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="border-primary/15 bg-[#fbf7ec] text-foreground sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-[#1f3d2b]">Search recipes</DialogTitle>
            <DialogDescription className="text-[#667864]">
              Find meals by name, ingredient, or wellness-friendly idea.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667864]" />
            <Input
              autoFocus
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Try rice, salmon, ginger, salad..."
              className="h-12 border-primary/15 bg-white/75 pl-10 text-[#1f3d2b] placeholder:text-[#667864]/60"
            />
          </div>
          <div className="max-h-[420px] overflow-y-auto pr-1">
            {searchLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/10 bg-white/65 px-4 py-5 text-sm text-[#667864]">
                <Clock3 className="h-4 w-4 animate-spin text-primary" />
                Loading recipes
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid gap-2">
                {searchResults.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => openRecipe(recipe.id)}
                    className="flex items-center gap-3 rounded-lg border border-primary/10 bg-white/70 p-3 text-left transition hover:border-primary/25 hover:bg-white"
                  >
                    <img
                      src={recipe.image}
                      alt=""
                      className="h-14 w-16 shrink-0 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#1f3d2b]">{recipe.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#667864]">
                        <span>{recipe.time || "15m"}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{recipe.match || "95%"} match</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-primary/20 bg-white/55 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-[#1f3d2b]">No recipes found</p>
                <p className="mt-1 text-xs text-[#667864]">Try a broader ingredient or meal name.</p>
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearchOpen(false);
              navigate("/");
            }}
            className="justify-start text-primary hover:bg-primary/10 hover:text-primary"
          >
            Browse all recommendations
          </Button>
        </DialogContent>
      </Dialog>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </nav>
  );
};

export default Navbar;

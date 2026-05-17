import { useRef, useState, useEffect } from "react";
import { Play, Plus, Info, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { recordRecipeInteraction, fetchSavedRecipes, toggleSaveRecipe } from "@/lib/recipeInteractions";
import { recipeSections } from "@/lib/recipes";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [savedRecipeIds, setSavedRecipeIds] = useState<string[]>([]);

  useEffect(() => {
    const loadSavedRecipes = async () => {
      if (user) {
        try {
          const saved = await fetchSavedRecipes(user.id);
          setSavedRecipeIds(saved.map((r: any) => r.recipe_id));
        } catch (error) {
          console.error("Failed to load saved recipes:", error);
        }
      } else {
        setSavedRecipeIds([]);
      }
    };
    loadSavedRecipes();
  }, [user]);

  const handleToggleSave = async (item: { id: number; title: string }) => {
    if (!user) {
      toast.info("Please sign up or sign in to save recipes to your CookBook.");
      return;
    }

    const isCurrentlySaved = savedRecipeIds.includes(String(item.id));
    try {
      const isSaved = await toggleSaveRecipe({
        userId: user.id,
        recipeId: item.id,
        recipeTitle: item.title,
        isCurrentlySaved,
      });

      if (isSaved) {
        setSavedRecipeIds((prev) => [...prev, String(item.id)]);
        toast.success(`"${item.title}" saved to your CookBook!`);
      } else {
        setSavedRecipeIds((prev) => prev.filter((id) => id !== String(item.id)));
        toast.success(`"${item.title}" removed from your CookBook.`);
      }
    } catch (error) {
      toast.error("Failed to update saved recipes. Please try again.");
    }
  };


  const handleScroll = (idx: number, direction: "left" | "right") => {
    const container = rowRefs.current[idx];
    if (container) {
      const scrollAmount = container.clientWidth * 0.75;
      if (direction === "left") {
        container.scrollLeft -= scrollAmount;
      } else {
        container.scrollLeft += scrollAmount;
      }
    }
  };

  const sections = recipeSections;

  const handleRecipeUse = async (item: { id: number; title: string }) => {
    if (user) {
      await recordRecipeInteraction({
        userId: user.id,
        recipeId: item.id,
        recipeTitle: item.title,
        interactionType: "started",
      });
    } else {
      toast.info("Sign up to save recipe activity for future recommendations.");
    }

    navigate("/app");
  };

  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans selection:bg-primary selection:text-white overflow-x-hidden">
      <Navbar />

      {/* Hero Section */}
      <div className="relative h-[85vh] w-full">
        <img 
          src="/images/hero.png" 
          alt="Featured Recipe" 
          className="w-full h-full object-cover"
        />
        {/* Gradients to blend image */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
        
        <div className="absolute bottom-[18%] md:bottom-[24%] left-4 md:left-12 max-w-2xl animate-in fade-in slide-in-from-left-8 duration-1000">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-primary/20 text-primary border border-primary/50 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Featured</span>
            <span className="text-gray-300 text-xs font-semibold tracking-widest uppercase">Recipe of the Day</span>
          </div>
          <h2 className="text-5xl md:text-7xl font-black mb-4 md:mb-6 tracking-tight leading-tight">
            Mediterranean <br /> Harvest Bowl
          </h2>
          <p className="text-lg md:text-xl text-gray-200 mb-6 md:mb-8 line-clamp-3 font-medium max-w-lg leading-relaxed">
            Experience the vibrant flavors of the Mediterranean with our signature Harvest Bowl. 
            A perfect harmony of nutty quinoa, roasted spiced chickpeas, and a zesty tahini-lemon drizzle.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button 
              onClick={() =>
                handleRecipeUse({
                  id: 1,
                  title: "Mediterranean Harvest Bowl",
                })
              }
              className="bg-white text-black hover:bg-white/90 gap-3 px-5 py-4 text-base md:px-8 md:py-7 md:text-xl font-bold transition-all hover:scale-105 active:scale-95"
            >
              <Play className="fill-current w-5 h-5 md:w-6 md:h-6" /> Start Cooking
            </Button>
            <Button 
              variant="secondary" 
              className="bg-gray-500/40 text-white hover:bg-gray-500/60 gap-3 px-5 py-4 text-base md:px-8 md:py-7 md:text-xl font-bold backdrop-blur-xl border border-white/10 transition-all hover:scale-105 active:scale-95"
            >
              <Info className="w-5 h-5 md:w-6 md:h-6" /> More Info
            </Button>
          </div>
        </div>
      </div>

      {/* Content Rows */}
      <div className="pb-24 -mt-20 md:-mt-32 relative z-10 space-y-12">
        {sections.map((section, idx) => (
          <div key={idx} className="pl-4 md:pl-12 group/row">
            <div className="flex items-center justify-between pr-4 md:pr-12 mb-3">
              <h3 className="text-xl md:text-2xl font-bold text-white/90 group-hover/row:text-white transition-colors flex items-center gap-2">
                {section.title}
                <ChevronRight className="w-5 h-5 opacity-0 group-hover/row:opacity-100 transition-all -ml-2 group-hover/row:ml-0" />
              </h3>
            </div>
            
            <div className="relative group/carousel">
              {/* Left Scroll Button */}
              <button
                onClick={() => handleScroll(idx, "left")}
                className="absolute left-0 top-0 bottom-6 z-40 bg-black/45 hover:bg-black/70 text-white w-12 items-center justify-center transition-all duration-300 opacity-0 group-hover/carousel:opacity-100 hidden md:flex cursor-pointer border-none backdrop-blur-sm rounded-r-md"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-8 h-8 transition-transform duration-300 hover:scale-125" />
              </button>

              {/* Right Scroll Button */}
              <button
                onClick={() => handleScroll(idx, "right")}
                className="absolute right-0 top-0 bottom-6 z-40 bg-black/45 hover:bg-black/70 text-white w-12 items-center justify-center transition-all duration-300 opacity-0 group-hover/carousel:opacity-100 hidden md:flex cursor-pointer border-none backdrop-blur-sm rounded-l-md"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-8 h-8 transition-transform duration-300 hover:scale-125" />
              </button>

              <div 
                ref={(el) => (rowRefs.current[idx] = el)}
                className="flex gap-2 overflow-x-auto no-scrollbar pb-6 pr-12 scroll-smooth"
              >
                {section.items.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex-none w-[220px] md:w-[320px] aspect-video relative group cursor-pointer rounded-sm overflow-hidden transition-all duration-300 hover:scale-110 hover:z-30 shadow-2xl"
                  >
                    <img 
                      src={item.image} 
                      alt={item.title} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          aria-label={`Start ${item.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRecipeUse(item);
                          }}
                          className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <Play className="fill-black text-black w-4 h-4 ml-0.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={savedRecipeIds.includes(String(item.id)) ? `Remove ${item.title} from cookbook` : `Save ${item.title} to cookbook`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleSave(item);
                          }}
                          className={`w-8 h-8 border-2 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                            savedRecipeIds.includes(String(item.id))
                              ? "bg-green-500 border-green-500 hover:bg-green-600 hover:border-green-600"
                              : "border-gray-400 hover:border-white"
                          }`}
                        >
                          {savedRecipeIds.includes(String(item.id)) ? (
                            <Check className="text-white w-4 h-4" />
                          ) : (
                            <Plus className="text-white w-4 h-4" />
                          )}
                        </button>
                        <div className="ml-auto w-8 h-8 border-2 border-gray-400 rounded-full flex items-center justify-center hover:border-white transition-colors">
                          <ChevronRight className="text-white w-4 h-4 rotate-90" />
                        </div>
                      </div>
                      <p className="font-bold text-sm md:text-base mb-1">{item.title}</p>
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        <span className="text-green-500">98% Match</span>
                        <span className="border border-gray-500 px-1 rounded-sm text-gray-400">HD</span>
                        <span className="text-gray-400">15m</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="px-4 md:px-12 py-20 bg-[#141414] border-t border-white/5 text-gray-500 text-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl">
          <div className="space-y-4">
            <p className="hover:underline cursor-pointer">Audio and Subtitles</p>
            <p className="hover:underline cursor-pointer">Media Center</p>
            <p className="hover:underline cursor-pointer">Privacy</p>
            <p className="hover:underline cursor-pointer">Contact Us</p>
          </div>
          <div className="space-y-4">
            <p className="hover:underline cursor-pointer">Audio Description</p>
            <p className="hover:underline cursor-pointer">Investor Relations</p>
            <p className="hover:underline cursor-pointer">Legal Notices</p>
          </div>
          <div className="space-y-4">
            <p className="hover:underline cursor-pointer">Help Center</p>
            <p className="hover:underline cursor-pointer">Jobs</p>
            <p className="hover:underline cursor-pointer">Cookie Preferences</p>
          </div>
          <div className="space-y-4">
            <p className="hover:underline cursor-pointer">Gift Cards</p>
            <p className="hover:underline cursor-pointer">Terms of Use</p>
            <p className="hover:underline cursor-pointer">Corporate Information</p>
          </div>
        </div>
        <div className="mt-12">
          <Button variant="outline" className="border-gray-500 text-gray-500 hover:text-white hover:border-white rounded-none">
            Service Code
          </Button>
          <p className="mt-8 text-xs">© 2026-2027 Tamar Food, Inc.</p>
        </div>
      </footer>

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default Home;

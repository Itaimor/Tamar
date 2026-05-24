import { useRef, useState, useEffect } from "react";
import { Play, Plus, Info, ChevronRight, ChevronLeft, Check, Heart, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { recordRecipeInteraction, fetchSavedRecipes, toggleSaveRecipe } from "@/lib/recipeInteractions";
import { recipeSections, getRecipeById, RecipeItem, fetchRecipesByIds } from "@/lib/recipes";
import { supabase } from "@/lib/supabase";
import { getMedoidRecipes, calculateUserVector, getRecommendationsFromVector } from "@/lib/coldStart";
import { motion, AnimatePresence } from "framer-motion";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [savedRecipeIds, setSavedRecipeIds] = useState<string[]>([]);
  const [curatedRecipes, setCuratedRecipes] = useState<RecipeItem[]>([]);
  const [trendingRecipes, setTrendingRecipes] = useState<RecipeItem[]>([]);
  const [flavorRecipes, setFlavorRecipes] = useState<RecipeItem[]>([]);
  const [healthyRecipes, setHealthyRecipes] = useState<RecipeItem[]>([]);
  const [quickRecipes, setQuickRecipes] = useState<RecipeItem[]>([]);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(true);
  const [currentMedoidIdx, setCurrentMedoidIdx] = useState(0);
  const [feedback, setFeedback] = useState<Record<number, number>>({});

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

  useEffect(() => {
    const loadRecommendations = async () => {
      if (user && supabase) {
        try {
          const { data, error } = await supabase
            .from("user_recommendations")
            .select("recommended_recipe_ids, match_scores")
            .eq("user_id", user.id)
            .maybeSingle();

          if (data && data.recommended_recipe_ids && data.recommended_recipe_ids.length > 0) {
            const recIds = data.recommended_recipe_ids as string[];
            const loaded = await fetchRecipesByIds(recIds);
            
            // Map the personalized match scores from database
            const mapped = loaded.map((recipe, index) => {
              const score = data.match_scores && data.match_scores[index] !== undefined
                ? data.match_scores[index]
                : 0.95;
              return {
                ...recipe,
                match: `${Math.round(score * 100)}%`
              };
            });
            
            setCuratedRecipes(mapped);
            setIsOnboardingCompleted(true);
            return;
          }
        } catch (error) {
          console.error("Failed to load recommendations:", error);
        }
      }

      // Check local storage for vector fallback
      const localVectorStr = localStorage.getItem("tamar_user_vector");
      if (localVectorStr) {
        try {
          const localVector = JSON.parse(localVectorStr);
          const recIds = getRecommendationsFromVector(localVector);
          const loaded = await fetchRecipesByIds(recIds.slice(0, 6));
          
          // Compute dynamic cosine similarity match scores
          const mapped = loaded.map(recipe => {
            const recipeVector = latentRecipes[recipe.id]?.vector || [0, 0, 0, 0];
            const sim = cosineSimilarity(localVector, recipeVector);
            const normalizedSim = Math.max(0, Math.min(1, (sim + 1) / 2));
            return {
              ...recipe,
              match: `${Math.round(normalizedSim * 100)}%`
            };
          });
          
          setCuratedRecipes(mapped);
          setIsOnboardingCompleted(true);
          return;
        } catch (e) {
          console.error("Error parsing local vector:", e);
        }
      }

      // If no database or local recommendations, prompt onboarding
      setIsOnboardingCompleted(false);
      const defaultRecs = await fetchDefaultRecipes(6);
      setCuratedRecipes(defaultRecs);
    };
    loadRecommendations();
  }, [user]);

  useEffect(() => {
    const loadOtherSections = async () => {
      try {
        const allRecipes = await fetchDefaultRecipes(30);
        setTrendingRecipes(allRecipes.slice(0, 6));
        setFlavorRecipes(allRecipes.slice(6, 12));
        setHealthyRecipes(allRecipes.slice(12, 18));
        setQuickRecipes(allRecipes.slice(18, 24));
      } catch (error) {
        console.error("Failed to load other sections:", error);
      }
    };
    loadOtherSections();
  }, []);

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

  const handleOnboardingComplete = async (finalFeedback: Record<number, number>) => {
    const userVector = calculateUserVector(finalFeedback);
    localStorage.setItem("tamar_user_vector", JSON.stringify(userVector));

    const recIds = getRecommendationsFromVector(userVector);
    const loaded = await fetchRecipesByIds(recIds.slice(0, 6));
    
    // Compute dynamic cosine similarity match scores
    const matchScores = recIds.slice(0, 6).map(id => {
      const recipeVector = latentRecipes[id]?.vector || [0, 0, 0, 0];
      const sim = cosineSimilarity(userVector, recipeVector);
      return Math.max(0, Math.min(1, (sim + 1) / 2));
    });

    const mapped = loaded.map((recipe, index) => ({
      ...recipe,
      match: `${Math.round(matchScores[index] * 100)}%`
    }));

    setCuratedRecipes(mapped);
    setIsOnboardingCompleted(true);
    toast.success("Feed personalized based on your taste profile!");

    if (user && supabase) {
      try {
        const stringRecIds = recIds.slice(0, 6).map(String);
        await supabase
          .from("user_recommendations")
          .upsert({
            user_id: user.id,
            recommended_recipe_ids: stringRecIds,
            match_scores: matchScores,
            user_vector: userVector,
            updated_at: new Date().toISOString()
          });
      } catch (err) {
        console.error("Failed to save recommendations to database:", err);
      }
    }
  };

  const handleSwipe = (like: boolean) => {
    const medoids = getMedoidRecipes();
    const medoid = medoids[currentMedoidIdx];
    const newFeedback = { ...feedback, [medoid.id]: like ? 1.0 : -1.0 };
    setFeedback(newFeedback);

    if (currentMedoidIdx < medoids.length - 1) {
      setCurrentMedoidIdx(prev => prev + 1);
    } else {
      handleOnboardingComplete(newFeedback);
    }
  };

  const handleSkipOnboarding = async () => {
    setIsOnboardingCompleted(true);
    const defaultRecs = await fetchDefaultRecipes(6);
    setCuratedRecipes(defaultRecs);
    toast.info("Onboarding skipped. Using default recipes.");
  };

  const handleResetOnboarding = async () => {
    setIsOnboardingCompleted(false);
    setCurrentMedoidIdx(0);
    setFeedback({});
    const defaultRecs = await fetchDefaultRecipes(6);
    setCuratedRecipes(defaultRecs);
    localStorage.removeItem("tamar_user_vector");
  };


  const [scrollStates, setScrollStates] = useState<{
    [key: number]: { canScrollLeft: boolean; canScrollRight: boolean };
  }>({});

  const updateScrollButtons = (idx: number) => {
    const container = rowRefs.current[idx];
    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      const canScrollLeft = scrollLeft > 1;
      const canScrollRight = scrollLeft + clientWidth < scrollWidth - 2;

      setScrollStates((prev) => {
        const current = prev[idx];
        if (current && current.canScrollLeft === canScrollLeft && current.canScrollRight === canScrollRight) {
          return prev;
        }
        return {
          ...prev,
          [idx]: { canScrollLeft, canScrollRight },
        };
      });
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

  const sections = recipeSections.map((sec) => {
    if (sec.title === "Curated for You") {
      return { ...sec, items: curatedRecipes };
    }
    if (sec.title === "Trending in Your Area") {
      return { ...sec, items: trendingRecipes };
    }
    if (sec.title === "Bursting with Flavor") {
      return { ...sec, items: flavorRecipes };
    }
    if (sec.title === "Healthy & Mindful") {
      return { ...sec, items: healthyRecipes };
    }
    if (sec.title === "Quick & Satisfying") {
      return { ...sec, items: quickRecipes };
    }
    return sec;
  });

  useEffect(() => {
    // Initial check once elements are rendered
    const timer = setTimeout(() => {
      sections.forEach((_, idx) => {
        updateScrollButtons(idx);
      });
    }, 150);

    const handleResize = () => {
      sections.forEach((_, idx) => {
        updateScrollButtons(idx);
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [sections]);

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

  const handleRecipeDetails = (item: { id: number }) => {
    navigate(`/recipes/${item.id}`);
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
              onClick={() => navigate("/recipes/1")}
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
        
        {/* Active Learning Cold Start Onboarding */}
        {!isOnboardingCompleted && (
          <div className="max-w-xl mx-auto px-4 md:px-0 mb-12">
            <div className="bg-[#181818] border border-white/10 rounded-2xl overflow-hidden p-6 shadow-2xl relative">
              <div className="flex items-center gap-2 mb-4 text-primary text-xs uppercase tracking-widest font-extrabold">
                <Sparkles className="w-4 h-4 text-yellow-400 fill-yellow-400 animate-pulse" />
                <span>Personalize Your Taste</span>
              </div>
              <h4 className="text-xl font-bold mb-1 text-white">Help us find your preferences</h4>
              <p className="text-gray-400 text-xs mb-6">Swipe or tap Like/Dislike to immediately generate personalized recipe recommendations.</p>

              <div className="relative aspect-video rounded-xl overflow-hidden mb-6 group border border-white/5 bg-[#141414]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentMedoidIdx}
                    initial={{ opacity: 0, x: 50, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -50, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                    className="absolute inset-0"
                  >
                    <img
                      src={getMedoidRecipes()[currentMedoidIdx].image}
                      alt={getMedoidRecipes()[currentMedoidIdx].title}
                      className="w-full h-full object-cover"
                    />
                    {getMedoidRecipes()[currentMedoidIdx].image === "/images/empty_plate.png" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                        <span className="text-5xl font-extrabold text-white bg-black/75 px-5 py-2.5 rounded-xl border border-white/20 shadow-2xl tracking-wider">
                          #{getMedoidRecipes()[currentMedoidIdx].id}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <span className="bg-primary/20 text-primary border border-primary/50 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded mb-2 inline-block">
                        Medoid {currentMedoidIdx + 1} of {getMedoidRecipes().length}
                      </span>
                      <h5 className="text-lg font-bold text-white leading-tight">{getMedoidRecipes()[currentMedoidIdx].title}</h5>
                      <p className="text-gray-400 text-xs mt-0.5">Cook Time: {getMedoidRecipes()[currentMedoidIdx].time}</p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => handleSwipe(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-red-500/30 hover:border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-bold transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  <X className="w-4 h-4" /> Dislike
                </button>
                <button
                  type="button"
                  onClick={handleSkipOnboarding}
                  className="py-3 px-4 rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => handleSwipe(true)}
                  className="flex-1 py-3 px-4 rounded-xl border border-green-500/30 hover:border-green-500 bg-green-500/10 text-green-400 hover:bg-green-500/20 font-bold transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  <Heart className="w-4 h-4 fill-current" /> Like
                </button>
              </div>
              
              <div className="flex justify-center gap-1.5 mt-6">
                {getMedoidRecipes().map((_, idx) => (
                  <div 
                    key={idx} 
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentMedoidIdx ? "w-6 bg-primary" : "w-1.5 bg-gray-600"
                    }`} 
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {sections.map((section, idx) => (
          <div key={idx} className="pl-4 md:pl-12 group/row">
            <div className="flex items-center justify-between pr-4 md:pr-12 mb-3">
              <h3 className="text-xl md:text-2xl font-bold text-white/90 group-hover/row:text-white transition-colors flex items-center gap-2">
                {section.title}
                <ChevronRight className="w-5 h-5 opacity-0 group-hover/row:opacity-100 transition-all -ml-2 group-hover/row:ml-0" />
              </h3>
              {section.title === "Curated for You" && isOnboardingCompleted && (
                <button
                  type="button"
                  onClick={handleResetOnboarding}
                  className="text-xs text-primary/70 hover:text-primary transition-all flex items-center gap-1 font-semibold border border-primary/20 hover:border-primary/50 px-2.5 py-1 rounded bg-[#141414] cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  Retrain Taste
                </button>
              )}
            </div>

            <div className="relative group/carousel">
              {/* Left Scroll Button */}
              <button
                onClick={() => handleScroll(idx, "left")}
                className={`absolute left-0 top-0 bottom-6 z-40 bg-black/45 hover:bg-black/70 text-white w-12 items-center justify-center transition-all duration-300 hidden md:flex cursor-pointer border-none backdrop-blur-sm rounded-r-md ${
                  scrollStates[idx]?.canScrollLeft
                    ? "opacity-0 group-hover/carousel:opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-8 h-8 transition-transform duration-300 hover:scale-125" />
              </button>

              {/* Right Scroll Button */}
              <button
                onClick={() => handleScroll(idx, "right")}
                className={`absolute right-0 top-0 bottom-6 z-40 bg-black/45 hover:bg-black/70 text-white w-12 items-center justify-center transition-all duration-300 hidden md:flex cursor-pointer border-none backdrop-blur-sm rounded-l-md ${
                  scrollStates[idx]?.canScrollRight !== false
                    ? "opacity-0 group-hover/carousel:opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-label="Scroll right"
              >
                <ChevronRight className="w-8 h-8 transition-transform duration-300 hover:scale-125" />
              </button>

              <div
                ref={(el) => (rowRefs.current[idx] = el)}
                onScroll={() => updateScrollButtons(idx)}
                className="flex gap-2 overflow-x-auto no-scrollbar pb-6 pr-12 scroll-smooth"
              >
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex-none w-[220px] md:w-[320px] aspect-video relative group cursor-pointer rounded-sm overflow-hidden transition-all duration-300 hover:scale-110 hover:z-30 shadow-2xl"
                    onClick={() => handleRecipeDetails(item)}
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    {(item.image === "/images/empty_plate.png" || !item.image) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                        <span className="text-4xl font-extrabold text-white bg-black/70 px-4 py-2 rounded-xl border border-white/20 shadow-2xl tracking-wider">
                          #{item.id}
                        </span>
                      </div>
                    )}
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
                          className={`w-8 h-8 border-2 rounded-full flex items-center justify-center transition-colors cursor-pointer ${savedRecipeIds.includes(String(item.id))
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
                        <span className="text-green-500">{item.match || "95%"} Match</span>
                        <span className="border border-gray-500 px-1 rounded-sm text-gray-400">HD</span>
                        <span className="text-gray-400">{item.time || "15m"}</span>
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

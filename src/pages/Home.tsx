import { useRef, useState, useEffect } from "react";
import { Play, Plus, Info, ChevronRight, ChevronLeft, Check, Heart, X, Sparkles, HeartPulse, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import {
  Cooklist,
  addRecipeToDefaultCooklist,
  createCooklist,
  fetchCooklists,
  fetchRecipeCooklistIds,
  fetchSavedRecipes,
  fetchTasteFeedbackCount,
  recordRecipeInteraction,
  setRecipeCooklists,
} from "@/lib/recipeInteractions";
import {
  recipeSections,
  RecipeItem,
  ensureUniqueRecipeRowImages,
  fetchRecipesByIds,
  fetchDefaultRecipes,
  fetchColdStartRecipes,
} from "@/lib/recipes";
import { fetchAnalysisDashboard } from "@/lib/analysis";
import { supabase } from "@/lib/supabase";
import IbsOnboardingCard from "@/components/IbsOnboardingCard";
import { fetchIbsOnboardingCompleted } from "@/lib/ibsProfile";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";

type SavedRecipeRow = {
  recipe_id: string | number;
};

const HERO_RECIPE_STORAGE_KEY = "tamar:lastHeroRecipe";

const getFirstNSentences = (text: string, n: number): string => {
  if (!text) return "";
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "." || text[i] === "!") {
      count++;
      if (count === n) {
        return text.slice(0, i + 1);
      }
    }
  }
  return text;
};

const Home = () => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [savedRecipeIds, setSavedRecipeIds] = useState<string[]>([]);
  const [curatedRecipes, setCuratedRecipes] = useState<RecipeItem[]>([]);
  const [trendingRecipes, setTrendingRecipes] = useState<RecipeItem[]>([]);
  const [flavorRecipes, setFlavorRecipes] = useState<RecipeItem[]>([]);
  const [healthyRecipes, setHealthyRecipes] = useState<RecipeItem[]>([]);
  const [quickRecipes, setQuickRecipes] = useState<RecipeItem[]>([]);
  const [onboardingRecipes, setOnboardingRecipes] = useState<RecipeItem[]>([]);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(true);
  const [isIbsOnboardingCompleted, setIsIbsOnboardingCompleted] = useState(true);
  const [currentMedoidIdx, setCurrentMedoidIdx] = useState(0);
  const [feedback, setFeedback] = useState<Record<number, number>>({});
  const [recommendationRefreshKey, setRecommendationRefreshKey] = useState(0);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [expandedRecipeCardId, setExpandedRecipeCardId] = useState<number | null>(null);
  const [cooklistDialogRecipe, setCooklistDialogRecipe] = useState<{ id: number; title: string } | null>(null);
  const [cooklists, setCooklists] = useState<Cooklist[]>([]);
  const [selectedCooklistIds, setSelectedCooklistIds] = useState<number[]>([]);
  const [cooklistPickerLoading, setCooklistPickerLoading] = useState(false);
  const [newCooklistName, setNewCooklistName] = useState("");
  const [cachedHeroRecipe, setCachedHeroRecipe] = useState<RecipeItem | null>(() => {
    try {
      const saved = window.localStorage.getItem(HERO_RECIPE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const updateHeroCache = (recipes: RecipeItem[]) => {
    const nextHero = recipes[0];
    if (!nextHero) return;

    setCachedHeroRecipe(nextHero);
    try {
      window.localStorage.setItem(HERO_RECIPE_STORAGE_KEY, JSON.stringify(nextHero));
    } catch {
      // Browser storage can be unavailable in private mode; the live state is enough.
    }
  };

  const loadTasteOnboardingRecipes = async () => {
    const starters = await fetchColdStartRecipes(5);
    if (starters.length > 0) return starters;

    const defaults = await fetchDefaultRecipes(6);
    return defaults.slice(0, 5);
  };

  const queueRecipeImages = (recipes: RecipeItem[]) => {
    if (!session?.access_token || recipes.length === 0) return;

    fetch("/api/fill-recipe-images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipe_ids: recipes.map((recipe) => recipe.id) }),
    }).catch((error) => {
      console.info("Recipe image fill skipped:", error);
    });
  };

  useEffect(() => {
    const loadSavedRecipes = async () => {
      if (user) {
        try {
          const saved = await fetchSavedRecipes(user.id);
          setSavedRecipeIds((saved as SavedRecipeRow[]).map((r) => String(r.recipe_id)));
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
    const loadIbsOnboardingStatus = async () => {
      if (!user || !supabase) {
        setIsIbsOnboardingCompleted(true);
        return;
      }

      try {
        const completed = await fetchIbsOnboardingCompleted(user.id);
        setIsIbsOnboardingCompleted(completed);
      } catch (error) {
        console.error("Failed to load IBS onboarding status:", error);
        setIsIbsOnboardingCompleted(false);
      }
    };

    loadIbsOnboardingStatus();
  }, [user]);

  useEffect(() => {
    const loadRecommendations = async () => {
      if (user && supabase) {
        try {
          const tasteFeedbackCount = await fetchTasteFeedbackCount(user.id);
          if (tasteFeedbackCount === 0) {
            // The taste-feedback questionnaire is mandatory on cold start: it always
            // shows here regardless of whether the user skipped the app tour/tutorial.
            const starters = await loadTasteOnboardingRecipes();
            const defaultRecs = await fetchDefaultRecipes(6);
            setOnboardingRecipes(starters);
            setCuratedRecipes(defaultRecs);
            updateHeroCache(defaultRecs);
            setCurrentMedoidIdx(0);
            setFeedback({});
            setIsOnboardingCompleted(false);
            return;
          }

          if (session?.access_token) {
            const refreshResponse = await fetch("/api/refresh-recommendations", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ user_id: user.id }),
            });

            if (!refreshResponse.ok) {
              const message = await refreshResponse.text();
              console.error("Recommendation refresh failed:", refreshResponse.status, message);
            }
          }

          const { data, error } = await supabase
            .from("user_recommendations")
            .select(
              "recommended_recipe_ids, match_scores, " +
                "trending_recipe_ids, trending_match_scores, " +
                "flavor_recipe_ids, flavor_match_scores, " +
                "healthy_recipe_ids, healthy_match_scores, " +
                "quick_recipe_ids, quick_match_scores, " +
                "updated_at"
            )
            .eq("user_id", user.id)
            .maybeSingle();

          if (data && data.recommended_recipe_ids && data.recommended_recipe_ids.length > 0) {
            const recIds = data.recommended_recipe_ids as string[];
            const loaded = await fetchRecipesByIds(recIds);
            console.info("Loaded CF recommendations", {
              userId: user.id,
              recIds,
              updatedAt: data.updated_at,
            });

            // Attach the personalized match-score band (0.78-0.98 from the
            // recommender) onto each recipe for display in the row card.
            const withMatchScores = (
              recipes: RecipeItem[],
              scores: number[] | null | undefined,
            ): RecipeItem[] =>
              recipes.map((recipe, index) => {
                const score =
                  scores && scores[index] !== undefined ? scores[index] : 0.95;
                return { ...recipe, match: `${Math.round(score * 100)}%` };
              });

            // Pull each category's recipe rows in parallel. Empty/null arrays
            // yield empty lists and leave the existing placeholder set by
            // loadOtherSections in place. Flavor used to fall here while the
            // algo was undecided; with Route A active it is populated now.
            const loadCategoryRow = async (
              ids: string[] | null | undefined,
              scores: number[] | null | undefined,
            ): Promise<RecipeItem[]> => {
              if (!ids || ids.length === 0) return [];
              const items = await fetchRecipesByIds(ids);
              return withMatchScores(items, scores);
            };

            const [trending, flavor, healthy, quick] = await Promise.all([
              loadCategoryRow(
                data.trending_recipe_ids as string[] | null,
                data.trending_match_scores as number[] | null,
              ),
              loadCategoryRow(
                data.flavor_recipe_ids as string[] | null,
                data.flavor_match_scores as number[] | null,
              ),
              loadCategoryRow(
                data.healthy_recipe_ids as string[] | null,
                data.healthy_match_scores as number[] | null,
              ),
              loadCategoryRow(
                data.quick_recipe_ids as string[] | null,
                data.quick_match_scores as number[] | null,
              ),
            ]);

            setCuratedRecipes(withMatchScores(loaded, data.match_scores));
            if (trending.length > 0) setTrendingRecipes(trending);
            if (flavor.length > 0) setFlavorRecipes(flavor);
            if (healthy.length > 0) setHealthyRecipes(healthy);
            if (quick.length > 0) setQuickRecipes(quick);
            setIsOnboardingCompleted(true);
            return;
          }
        } catch (error) {
          console.error("Failed to load recommendations:", error);
        }
      }

      if (user) {
        setIsOnboardingCompleted(true);
        const defaultRecs = await fetchDefaultRecipes(6);
        setCuratedRecipes(defaultRecs);
        updateHeroCache(defaultRecs);
        queueRecipeImages(defaultRecs);
        return;
      }

      const defaultRecs = await fetchDefaultRecipes(6);
      setCuratedRecipes(defaultRecs);
      updateHeroCache(defaultRecs);
      queueRecipeImages(defaultRecs);
    };
    loadRecommendations();
    const loadGentleIngredients = async () => {
      if (!user) return;
      const normalize = (s: string) =>
        String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      try {
        const dashboard = await fetchAnalysisDashboard(user.id);
        const gentleNames = new Set(dashboard.easierFoods.map((f) => normalize(f.name)));
        // annotate currently loaded rows with fuzzy normalization matching
        const annotate = (list: RecipeItem[]) =>
          list.map((r) => {
            const ingTexts = (r.ingredients || []).map((ing) => normalize(ing));
            const isGentle = ingTexts.some((ing) =>
              Array.from(gentleNames).some((g) => ing.includes(g) || g.includes(ing))
            );
            return {
              ...r,
              isGentle,
            };
          });

        setCuratedRecipes((prev) => annotate(prev));
        setTrendingRecipes((prev) => annotate(prev));
        setFlavorRecipes((prev) => annotate(prev));
        setHealthyRecipes((prev) => annotate(prev));
        setQuickRecipes((prev) => annotate(prev));
        setOnboardingRecipes((prev) => annotate(prev));
      } catch (error) {
        console.error("Failed to load analysis for gentle annotations:", error);
      }
    };
    loadGentleIngredients();
  }, [user, session?.access_token, recommendationRefreshKey]);

  useEffect(() => {
    const loadOtherSections = async () => {
      try {
        const allRecipes = await fetchDefaultRecipes(30);
        setTrendingRecipes(allRecipes.slice(6, 12));
        setFlavorRecipes(allRecipes.slice(12, 18));
        setHealthyRecipes(allRecipes.slice(18, 24));
        setQuickRecipes(allRecipes.slice(24, 30));
        queueRecipeImages(allRecipes.slice(0, 30));
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
      if (!isCurrentlySaved) {
        await addRecipeToDefaultCooklist({
          userId: user.id,
          recipeId: item.id,
          recipeTitle: item.title,
        });
        setSavedRecipeIds((prev) => [...prev, String(item.id)]);
        toast.success(`"${item.title}" added to Liked.`);
        setRecommendationRefreshKey((key) => key + 1);
        return;
      }

      setCooklistDialogRecipe(item);
      setCooklistPickerLoading(true);
      const [lists, recipeListIds] = await Promise.all([
        fetchCooklists(user.id),
        fetchRecipeCooklistIds(user.id, item.id),
      ]);
      setCooklists(lists);
      setSelectedCooklistIds(recipeListIds);
    } catch (error) {
      toast.error("Failed to update saved recipes. Please try again.");
    } finally {
      setCooklistPickerLoading(false);
    }
  };

  const handleCooklistCheckedChange = (cooklistId: number, checked: boolean) => {
    setSelectedCooklistIds((current) =>
      checked ? [...new Set([...current, cooklistId])] : current.filter((id) => id !== cooklistId)
    );
  };

  const handleCreateCooklist = async () => {
    if (!user || !cooklistDialogRecipe || !newCooklistName.trim()) return;

    try {
      const newCooklist = await createCooklist(user.id, newCooklistName);
      if (!newCooklist) return;
      setCooklists((current) => [...current, newCooklist]);
      setSelectedCooklistIds((current) => [...new Set([...current, newCooklist.id])]);
      setNewCooklistName("");
      toast.success(`"${newCooklist.name}" created.`);
    } catch (error) {
      toast.error("Failed to create cooklist.");
    }
  };

  const handleSaveCooklistSelection = async () => {
    if (!user || !cooklistDialogRecipe) return;

    try {
      await setRecipeCooklists({
        userId: user.id,
        recipeId: cooklistDialogRecipe.id,
        recipeTitle: cooklistDialogRecipe.title,
        cooklistIds: selectedCooklistIds,
      });

      const stillSaved = selectedCooklistIds.length > 0;
      setSavedRecipeIds((prev) =>
        stillSaved
          ? [...new Set([...prev, String(cooklistDialogRecipe.id)])]
          : prev.filter((id) => id !== String(cooklistDialogRecipe.id))
      );
      setCooklistDialogRecipe(null);
      setRecommendationRefreshKey((key) => key + 1);
      toast.success(stillSaved ? "Cooklists updated." : `"${cooklistDialogRecipe.title}" removed from your CookBook.`);
    } catch (error) {
      toast.error("Failed to update cooklists.");
    }
  };

  const handleSwipe = async (like: boolean) => {
    if (!user || onboardingBusy) return;

    const recipe = onboardingRecipes[currentMedoidIdx];
    if (!recipe) return;

    setOnboardingBusy(true);
    const newFeedback = { ...feedback, [recipe.id]: like ? 1.0 : -1.0 };
    setFeedback(newFeedback);

    try {
      await recordRecipeInteraction({
        userId: user.id,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        interactionType: like ? "liked" : "dismissed",
      });

      if (currentMedoidIdx < onboardingRecipes.length - 1) {
        setCurrentMedoidIdx(prev => prev + 1);
      } else {
        setIsOnboardingCompleted(true);
        setRecommendationRefreshKey((key) => key + 1);
        toast.success("Taste profile saved. Building your CF recommendations.");
      }
    } catch (error) {
      toast.error("Could not save your taste feedback. Please try again.");
    } finally {
      setOnboardingBusy(false);
    }
  };

  const handleResetOnboarding = async () => {
    const starters = await loadTasteOnboardingRecipes();
    setOnboardingRecipes(starters);
    setIsOnboardingCompleted(false);
    setCurrentMedoidIdx(0);
    setFeedback({});
    const defaultRecs = await fetchDefaultRecipes(6);
    setCuratedRecipes(defaultRecs);
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
      return { ...sec, items: ensureUniqueRecipeRowImages(curatedRecipes) };
    }
    if (sec.title === "Trending in Your Area") {
      return { ...sec, items: ensureUniqueRecipeRowImages(trendingRecipes) };
    }
    if (sec.title === "Bursting with Flavor") {
      return { ...sec, items: ensureUniqueRecipeRowImages(flavorRecipes) };
    }
    if (sec.title === "Healthy & Mindful") {
      return { ...sec, items: ensureUniqueRecipeRowImages(healthyRecipes) };
    }
    if (sec.title === "Quick & Satisfying") {
      return { ...sec, items: ensureUniqueRecipeRowImages(quickRecipes) };
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

  const handleRecipeDetails = (item: { id: number }) => {
    navigate(`/recipes/${item.id}`);
  };

  const handleRecipeFeedbackChat = (item: { id: number; title: string }) => {
    if (!user) {
      toast.info("Please sign in so Tamar can save your meal feedback.");
      return;
    }

    window.dispatchEvent(new CustomEvent("tamar:open-recipe-feedback-chat", {
      detail: { id: item.id, title: item.title },
    }));
  };

  const heroRecipe = curatedRecipes[0] || cachedHeroRecipe;
  const heroTitle = heroRecipe?.title || "Mediterranean Harvest Bowl";
  const heroDescription =
    heroRecipe?.description ||
    "Experience the vibrant flavors of the Mediterranean with our signature Harvest Bowl. A perfect harmony of nutty quinoa, roasted spiced chickpeas, and a zesty tahini-lemon drizzle.";

  return (
    <div className="wellness-canvas min-h-screen text-foreground font-sans selection:bg-primary selection:text-white overflow-x-hidden">
      <Navbar />

      {/* Hero Section */}
      <div className="relative h-auto min-h-[560px] md:min-h-[620px] w-full overflow-hidden pt-24 md:pt-28">
        {heroRecipe ? (
          <>
            <div className="absolute right-8 top-20 z-0 hidden h-[520px] max-h-[68%] w-[44%] rounded-[2rem] overflow-hidden border border-white/10 bg-white/10 backdrop-blur-sm md:block xl:w-[42%]">
              <ImageWithSkeleton
                src={heroRecipe.image}
                alt={heroTitle}
                className="h-full w-full object-cover opacity-70 saturate-[0.8]"
                skeletonClassName="bg-secondary animate-pulse"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#f8f5ec]/80 via-transparent to-[#f8f5ec]/30" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#fbf7ec] via-[#fbf7ec] md:via-[#fbf7ec] md:to-[#fbf7ec]/62" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#f1eadb] to-transparent" />
            <div className="relative z-10 ml-4 max-w-[calc(100%-2rem)] pb-20 pt-28 md:ml-12 md:max-w-[46%] md:pb-28 md:pt-28 xl:ml-20 xl:max-w-[50%] animate-in fade-in slide-in-from-left-8 duration-1000">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 bg-white/75 text-primary border border-primary/25 text-[10px] uppercase font-bold px-2 py-1 rounded-full shadow-sm">
                  <HeartPulse className="h-3 w-3" />
                  Gut-aware pick
                </span>
                <span className="text-[#667864] text-xs font-semibold tracking-widest uppercase">Recipe of the Day</span>
              </div>
              <h2 className="[overflow-wrap:anywhere] text-4xl sm:text-5xl md:text-5xl lg:text-6xl xl:text-7xl font-black mb-4 md:mb-6 tracking-tight leading-tight text-[#1f3d2b]">
                {heroTitle}
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-[#536451] mb-6 md:mb-8 font-medium max-w-xl leading-relaxed">
                {getFirstNSentences(heroDescription, 4)}
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={() =>
                    handleRecipeFeedbackChat({
                      id: heroRecipe.id,
                      title: heroTitle,
                    })
                  }
                  className="bg-primary text-primary-foreground hover:bg-primary/90 gap-3 px-5 py-4 text-sm md:px-8 md:py-6 md:text-lg font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
                >
                  <Play className="fill-current w-4 h-4 md:w-5 md:h-5" /> Start Cooking
                </Button>
                <Button
                  onClick={() => navigate(`/recipes/${heroRecipe.id}`)}
                  variant="secondary"
                  className="bg-white/80 text-primary hover:bg-white gap-3 px-5 py-4 text-sm md:px-8 md:py-6 md:text-lg font-bold backdrop-blur-xl border border-primary/15 transition-all hover:scale-105 active:scale-95"
                >
                  <Info className="w-4 h-4 md:w-5 md:h-5" /> More Info
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 bg-secondary animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-t from-[#f1eadb] via-[#fbf7ec]/20 to-transparent" />
            <div className="absolute bottom-32 left-4 w-full max-w-2xl space-y-6 pr-8 md:bottom-48 md:left-12 xl:left-20">
              <div className="flex items-center gap-2">
                <div className="h-5 w-20 bg-primary/10 rounded-sm" />
                <div className="h-4 w-32 bg-primary/10 rounded-sm" />
              </div>
              <div className="space-y-3">
                <div className="h-14 w-3/4 bg-primary/10 rounded-md" />
                <div className="h-14 w-1/2 bg-primary/10 rounded-md" />
              </div>
              <div className="space-y-2">
                <div className="h-5 w-5/6 bg-primary/10 rounded-sm" />
                <div className="h-5 w-2/3 bg-primary/10 rounded-sm" />
              </div>
              <div className="flex gap-4 pt-4">
                <div className="h-12 w-36 bg-primary/10 rounded-lg" />
                <div className="h-12 w-36 bg-primary/10 rounded-lg" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content Rows */}
      <div className="pb-24 -mt-16 md:-mt-24 relative z-10 space-y-12">
        
        {/* Active Learning Cold Start Onboarding */}
        {user && !isIbsOnboardingCompleted && (
          <IbsOnboardingCard
            userId={user.id}
            onCompleted={() => setIsIbsOnboardingCompleted(true)}
          />
        )}

        <Dialog
          open={isIbsOnboardingCompleted && !isOnboardingCompleted && onboardingRecipes.length > 0}
          onOpenChange={() => {}}
        >
          <DialogContent
            hideClose
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            className="max-w-md w-[calc(100vw-2rem)] p-6 rounded-xl border border-primary/15 bg-white/95 shadow-2xl shadow-primary/20 backdrop-blur-md"
          >
            {onboardingRecipes.length > 0 && (
              <>
                <DialogHeader className="space-y-1 text-left">
                  <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-widest font-extrabold">
                    <Leaf className="w-4 h-4 text-primary animate-pulse" />
                    <span>Personalize Your Wellness</span>
                  </div>
                  <DialogTitle className="text-xl font-bold text-[#1f3d2b]">Help Tamar learn what feels good</DialogTitle>
                  <DialogDescription className="text-[#667864] text-xs">
                    Tap Like or Dislike on each recipe to shape recommendations around taste, comfort, and digestion.
                  </DialogDescription>
                </DialogHeader>

                <div className="relative aspect-video rounded-xl overflow-hidden mt-4 mb-6 group border border-primary/10 bg-secondary">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentMedoidIdx}
                      initial={{ opacity: 0, x: 50, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -50, scale: 0.95 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0"
                    >
                      <ImageWithSkeleton
                        src={onboardingRecipes[currentMedoidIdx].image}
                        alt={onboardingRecipes[currentMedoidIdx].title}
                        className="w-full h-full object-cover"
                        skeletonClassName="bg-secondary"
                      />
                      {onboardingRecipes[currentMedoidIdx].image === "/images/empty_plate.png" && (
                        <div className="absolute inset-0 bg-primary/15 pointer-events-none" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1f3d2b]/85 via-[#1f3d2b]/12 to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4">
                        <span className="bg-primary/20 text-primary border border-primary/50 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded mb-2 inline-block">
                          Taste match {currentMedoidIdx + 1} of {onboardingRecipes.length}
                        </span>
                        <h5 className="text-lg font-bold text-white leading-tight">{onboardingRecipes[currentMedoidIdx].title}</h5>
                        <p className="text-white/75 text-xs mt-0.5">Cook Time: {onboardingRecipes[currentMedoidIdx].time}</p>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => handleSwipe(false)}
                    disabled={onboardingBusy}
                    className="flex-1 py-3 px-4 rounded-xl border border-[#c98f7b]/35 hover:border-[#b87361] bg-[#f7e9df] text-[#9f5f4f] hover:bg-[#f1dccf] font-bold transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                  >
                    <X className="w-4 h-4" /> Dislike
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwipe(true)}
                    disabled={onboardingBusy}
                    className="flex-1 py-3 px-4 rounded-xl border border-primary/25 hover:border-primary/45 bg-primary/10 text-primary hover:bg-primary/15 font-bold transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                  >
                    <Heart className="w-4 h-4 fill-current" /> Like
                  </button>
                </div>

                <div className="flex justify-center gap-1.5 mt-6">
                  {onboardingRecipes.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === currentMedoidIdx ? "w-6 bg-primary" : "w-1.5 bg-primary/20"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {sections.map((section, idx) => (
          <div key={idx} className="pl-4 md:pl-12 xl:pl-20 group/row">
            <div className="flex items-center justify-between pr-4 md:pr-12 xl:pr-20 mb-3">
              <h3 className="text-xl md:text-2xl font-bold text-[#1f3d2b] transition-colors flex items-center gap-2">
                {section.title}
                <ChevronRight className="w-5 h-5 text-primary/60 opacity-0 group-hover/row:opacity-100 transition-all -ml-2 group-hover/row:ml-0" />
              </h3>
              {section.title === "Curated for You" && isOnboardingCompleted && (
                <button
                  type="button"
                  onClick={handleResetOnboarding}
                  className="text-xs text-primary/80 hover:text-primary transition-all flex items-center gap-1 font-semibold border border-primary/20 hover:border-primary/50 px-2.5 py-1 rounded bg-white/70 cursor-pointer"
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
                className={`absolute left-0 top-0 bottom-6 z-40 bg-white/85 hover:bg-white text-primary w-12 items-center justify-center transition-all duration-300 hidden md:flex cursor-pointer border border-primary/10 backdrop-blur-sm rounded-r-md shadow-sm ${
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
                className={`absolute right-0 top-0 bottom-6 z-40 bg-white/85 hover:bg-white text-primary w-12 items-center justify-center transition-all duration-300 hidden md:flex cursor-pointer border border-primary/10 backdrop-blur-sm rounded-l-md shadow-sm ${
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
                {section.items.length > 0 ? (
                  section.items.map((item) => {
                    const isExpanded = expandedRecipeCardId === item.id;
                    const visibleIngredients = (item.ingredients || [])
                      .map((ingredient) => ingredient.trim())
                      .filter(Boolean)
                      .slice(0, 5);

                    return (
                    <div
                      key={item.id}
                      className="flex-none w-[220px] md:w-[320px] aspect-[4/3] relative group cursor-pointer rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:z-30 bg-white border border-primary/10 shadow-md shadow-primary/10"
                      onClick={() => handleRecipeDetails(item)}
                    >
                      <ImageWithSkeleton
                        src={item.image}
                        alt={item.title}
                        className="absolute inset-x-0 top-0 h-[68%] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        skeletonClassName="bg-secondary"
                      />
                      {(item.image === "/images/empty_plate.png" || !item.image) && (
                        <div className="absolute inset-x-0 top-0 flex h-[68%] items-center justify-center bg-primary/10 pointer-events-none">
                          <span className="text-4xl font-extrabold text-primary bg-white/80 px-4 py-2 rounded-xl border border-primary/20 shadow-lg tracking-wider">
                            #{item.id}
                          </span>
                        </div>
                      )}
                      <div className="absolute left-3 right-3 top-[calc(68%-2.75rem)] z-10 flex items-center gap-2 opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                        <button
                          type="button"
                          aria-label={`Open meal feedback chat for ${item.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRecipeFeedbackChat(item);
                          }}
                          className="w-8 h-8 rounded-full border-2 border-primary/70 bg-white/95 text-primary flex items-center justify-center hover:bg-primary/10 transition-colors shadow-md shadow-primary/15 backdrop-blur"
                        >
                          <Play className="fill-current w-4 h-4 ml-0.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={savedRecipeIds.includes(String(item.id)) ? `Remove ${item.title} from cookbook` : `Save ${item.title} to cookbook`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleSave(item);
                          }}
                          className={`w-8 h-8 border-2 rounded-full flex items-center justify-center transition-colors cursor-pointer shadow-md shadow-primary/15 backdrop-blur ${savedRecipeIds.includes(String(item.id))
                              ? "border-primary bg-primary text-white hover:bg-primary/90"
                              : "border-primary/70 bg-white/95 text-primary hover:bg-primary/10"
                            }`}
                        >
                          {savedRecipeIds.includes(String(item.id)) ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={isExpanded ? `Hide details for ${item.title}` : `Show ingredients and prep time for ${item.title}`}
                          aria-expanded={isExpanded}
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedRecipeCardId((current) => current === item.id ? null : item.id);
                          }}
                          className={`ml-auto w-8 h-8 border-2 rounded-full flex items-center justify-center transition-colors shadow-md shadow-primary/15 backdrop-blur ${
                            isExpanded
                              ? "border-primary bg-primary text-white"
                              : "border-primary/70 bg-white/95 text-primary hover:bg-primary/10"
                          }`}
                        >
                          <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "-rotate-90" : "rotate-90"}`} />
                        </button>
                      </div>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            key={`prep-overlay-${item.id}`}
                            initial={{ opacity: 0, y: -12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.98 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="absolute left-3 right-3 top-[calc(68%-5.75rem)] z-10 rounded-lg border border-primary/15 bg-white/90 p-2 text-[10px] text-[#536451] shadow-lg shadow-primary/15 backdrop-blur md:text-xs"
                          >
                            <div className="flex items-start justify-between gap-2 font-bold text-[#1f3d2b]">
                              <div>
                                <span>Prep time</span>
                                <div className="text-sm font-semibold text-[#1f3d2b]">{item.time || "15m"}</div>
                              </div>
                              <button
                                type="button"
                                aria-label={`Close prep time details for ${item.title}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedRecipeCardId(null);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/15 bg-white text-[#536451] shadow-sm transition-colors hover:bg-primary/10 hover:text-primary"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="mt-1 text-[#667864] line-clamp-2">
                              {visibleIngredients.length > 0
                                ? visibleIngredients.join(", ")
                                : "Ingredients available on the recipe page"}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div className="absolute inset-x-0 bottom-0 top-[68%] bg-white/96 px-3 pb-3 pt-4 text-[#1f3d2b] transition-all duration-300">
                        <p className="line-clamp-2 [overflow-wrap:anywhere] font-bold text-xs md:text-sm leading-snug mb-1">{item.title}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] md:text-[10px] font-bold">
                          <span className="shrink-0 text-primary">{item.match || "95%"} Match</span>
                          {item.isGentle && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/15 bg-primary/8 px-1.5 md:px-2 py-0.5 text-[#536451]">
                              <Leaf className="h-3 w-3 text-primary" />
                              gentle
                            </span>
                          )}
                          <span className="shrink-0 text-[#667864]">{item.time || "15m"}</span>
                        </div>
                      </div>
                    </div>
                    );
                  })
                ) : (
                  Array.from({ length: 5 }).map((_, sIdx) => (
                    <div
                      key={sIdx}
                      className="flex-none w-[220px] md:w-[320px] aspect-[4/3] relative rounded-lg overflow-hidden bg-white/70 animate-pulse border border-primary/10"
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="px-4 md:px-12 py-20 bg-[#efe5d3] border-t border-primary/10 text-[#667864] text-sm">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <p className="text-lg md:text-xl font-light italic text-[#536451] leading-relaxed">
            "If you are what you eat, then I only want to eat the good stuff" (Remy, Ratatouille)
          </p>
          <p className="mt-8 text-xs">© 2026-2027 Tamar Food, Inc.</p>
        </div>
      </footer>

      <Dialog open={Boolean(cooklistDialogRecipe)} onOpenChange={(open) => !open && setCooklistDialogRecipe(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose cooklists</DialogTitle>
            <DialogDescription className="sr-only">
              Select the cooklists where this recipe should be saved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {cooklistPickerLoading ? (
                <div className="h-20 rounded-lg bg-secondary animate-pulse" />
              ) : (
                cooklists.map((cooklist) => (
                  <label
                    key={cooklist.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-primary/10 px-3 py-2 hover:bg-primary/5"
                  >
                    <Checkbox
                      checked={selectedCooklistIds.includes(cooklist.id)}
                      onCheckedChange={(checked) => handleCooklistCheckedChange(cooklist.id, checked === true)}
                    />
                    <span className="flex-1 text-sm font-semibold text-[#1f3d2b]">{cooklist.name}</span>
                    {cooklist.is_default && <span className="text-xs font-bold text-primary">default</span>}
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={newCooklistName}
                onChange={(event) => setNewCooklistName(event.target.value)}
                placeholder="New cooklist"
                className="min-h-10 flex-1 rounded-lg border border-primary/15 bg-white px-3 text-sm outline-none focus:border-primary"
              />
              <Button type="button" variant="outline" onClick={handleCreateCooklist}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button type="button" className="w-full" onClick={handleSaveCooklistSelection}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

import { useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Check, ChevronRight, Leaf, Loader2, NotebookPen, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import {
  Cooklist,
  CooklistMembership,
  addPersonalRecipeToCooklist,
  deleteCooklist,
  ensureDefaultCooklist,
  fetchCooklistMemberships,
  fetchCooklists,
  fetchRecipeCooklistIds,
  findOrCreateCooklist,
  moveCooklistRecipeMembership,
  recordRecipeInteraction,
  renameCooklist,
  setRecipeCooklists,
} from "@/lib/recipeInteractions";
import { getRecipeById, fetchRecipesByIds, RecipeItem } from "@/lib/recipes";
import AuthDialog from "@/components/AuthDialog";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import ImageUploadDropzone from "@/components/ImageUploadDropzone";
import { useCanopyAccess } from "@/hooks/useCanopyAccess";
import { FoodImageAnalysis, analyzeFoodImage } from "@/lib/foodImageAnalysis";
import { uploadUserImage } from "@/lib/imageUploads";
import { supabase } from "@/lib/supabase";
import {
  fetchActiveHardRestrictions,
  HardRestriction,
  isRecipeAllowedByHardRestrictions,
} from "@/lib/recommendationSafety";

type CookbookRecommendation = {
  recipeId: string;
  source: "catalog" | "personal";
  score?: number | null;
  reason?: string | null;
  membership?: CooklistMembership;
  recipe?: RecipeItem;
};

type StoredCookbookRecommendations = {
  cookbook_recipe_ids?: string[] | null;
  cookbook_recipe_sources?: string[] | null;
  cookbook_match_scores?: number[] | null;
  cookbook_reasons?: string[] | null;
};

type DraggedCooklistRecipe = {
  item: CooklistMembership;
  sourceCooklistId: number;
};

const formatSavedDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const isMissingCookbookRecommendationColumns = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === "42703" ||
    (typeof message === "string" &&
      (message.includes("cookbook_recipe_ids") || message.includes("cookbook recommendation columns")))
  );
};

const normalizeSearch = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildRecipeIngredientsFromPhoto = (analysis: FoodImageAnalysis) => {
  const visible = analysis.visible_ingredients;
  const possible = analysis.possible_hidden_ingredients.map((ingredient) => `Possible: ${ingredient}`);
  return [...visible, ...possible].join("\n");
};

const CookBook = () => {
  const navigate = useNavigate();
  const { user, session, loading: authLoading } = useAuth();
  const { canopyDialog, openImageUploadPrompt } = useCanopyAccess(user);
  const [cooklists, setCooklists] = useState<Cooklist[]>([]);
  const [cooklistRecipesById, setCooklistRecipesById] = useState<Record<number, CooklistMembership[]>>({});
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [recipesMap, setRecipesMap] = useState<Record<string, RecipeItem>>({});
  const [newCooklistName, setNewCooklistName] = useState("");
  const [showNewCooklistForm, setShowNewCooklistForm] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [showPersonalRecipeForm, setShowPersonalRecipeForm] = useState(false);
  const [savingPersonalRecipe, setSavingPersonalRecipe] = useState(false);
  const [personalRecipeTitle, setPersonalRecipeTitle] = useState("");
  const [personalRecipeImageUrl, setPersonalRecipeImageUrl] = useState("");
  const [personalRecipePhotoAnalysis, setPersonalRecipePhotoAnalysis] = useState<FoodImageAnalysis | null>(null);
  const [analyzingPersonalRecipeImage, setAnalyzingPersonalRecipeImage] = useState(false);
  const [personalRecipeIngredients, setPersonalRecipeIngredients] = useState("");
  const [personalRecipeInstructions, setPersonalRecipeInstructions] = useState("");
  const [personalRecipeCooklistId, setPersonalRecipeCooklistId] = useState<number | null>(null);
  const [expandedRecipeCardId, setExpandedRecipeCardId] = useState<string | null>(null);
  const [cooklistDialogRecipe, setCooklistDialogRecipe] = useState<CooklistMembership | null>(null);
  const [selectedCooklistIds, setSelectedCooklistIds] = useState<number[]>([]);
  const [cooklistPickerLoading, setCooklistPickerLoading] = useState(false);
  const [savingCooklistSelection, setSavingCooklistSelection] = useState(false);
  const [pickerNewCooklistName, setPickerNewCooklistName] = useState("");
  const [cookbookSearch, setCookbookSearch] = useState("");
  const [cookbookRecommendations, setCookbookRecommendations] = useState<CookbookRecommendation[]>([]);
  const [cookbookRecommendationUserId, setCookbookRecommendationUserId] = useState<string | null>(null);
  const [cookbookRestrictionState, setCookbookRestrictionState] = useState<{
    userId: string;
    restrictions: HardRestriction[];
  } | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [personalPreviewRecipe, setPersonalPreviewRecipe] = useState<CooklistMembership | null>(null);
  const [editingCooklist, setEditingCooklist] = useState<Cooklist | null>(null);
  const [editingCooklistName, setEditingCooklistName] = useState("");
  const [savingCooklistEdit, setSavingCooklistEdit] = useState(false);
  const [deletingCooklist, setDeletingCooklist] = useState(false);
  const [draggedRecipe, setDraggedRecipe] = useState<DraggedCooklistRecipe | null>(null);
  const [dragOverCooklistId, setDragOverCooklistId] = useState<number | null>(null);
  const personalRecipeFromImageInputRef = useRef<HTMLInputElement>(null);
  const cookbookRecommendationRequestRef = useRef(0);

  const getPersonalRecipeDetails = (item: CooklistMembership): RecipeItem => ({
    id: 0,
    title: item.recipe_title,
    image: item.image_url || "/images/empty_plate.png",
    match: "Personal",
    time: "Saved",
    ingredients: item.ingredients
      ?.split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean),
    steps: item.instructions
      ?.split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean),
  });

  const buildLocalCookbookRecommendations = (
    groupedRecipes: Record<number, CooklistMembership[]>,
    catalogRecipes: Record<string, RecipeItem>,
  ): CookbookRecommendation[] => {
    const groupedByRecipe = new Map<
      string,
      { membership: CooklistMembership; count: number; latestTime: number }
    >();

    Object.values(groupedRecipes)
      .flat()
      .forEach((membership) => {
        const recipeId = String(membership.recipe_id);
        const savedAt = new Date(membership.created_at).getTime() || 0;
        const existing = groupedByRecipe.get(recipeId);

        if (!existing) {
          groupedByRecipe.set(recipeId, { membership, count: 1, latestTime: savedAt });
          return;
        }

        existing.count += 1;
        if (savedAt > existing.latestTime) {
          existing.membership = membership;
          existing.latestTime = savedAt;
        }
      });

    const now = Date.now();
    const scored = [...groupedByRecipe.entries()].map(([recipeId, item]) => {
      const source =
        item.membership.recipe_source === "personal" || recipeId.startsWith("personal-") ? "personal" : "catalog";
      const ageDays = Math.max(0, (now - item.latestTime) / 86400000);
      const recency = Math.max(0, 1 - ageDays / 45);
      const frequency = Math.min(1, item.count / 3);
      const score = 0.78 + 0.2 * (0.72 * recency + 0.28 * frequency);

      return {
        recommendation: {
          recipeId,
          source,
          score,
          reason: item.count > 1 ? "Saved in multiple cooklists" : source === "personal" ? "Personal recipe" : "Saved recipe",
          membership: item.membership,
          recipe: source === "personal" ? getPersonalRecipeDetails(item.membership) : catalogRecipes[recipeId] || getRecipeById(recipeId),
        } satisfies CookbookRecommendation,
        sortScore: score,
        latestTime: item.latestTime,
      };
    });

    return scored
      .sort((a, b) => b.sortScore - a.sortScore || b.latestTime - a.latestTime)
      .slice(0, 5)
      .map((item) => item.recommendation);
  };

  const keepCookbookRecommendationsSafe = (
    recommendations: CookbookRecommendation[],
    restrictions: HardRestriction[],
  ): CookbookRecommendation[] =>
    recommendations.filter((recommendation) =>
      isRecipeAllowedByHardRestrictions(recommendation.recipe, restrictions),
    );

  const keepCookbookRecommendationsSafeForCurrentUser = (
    recommendations: CookbookRecommendation[],
  ): CookbookRecommendation[] => {
    if (!user || cookbookRestrictionState?.userId !== user.id) return [];
    return keepCookbookRecommendationsSafe(
      recommendations,
      cookbookRestrictionState.restrictions,
    );
  };

  const loadCookbookRecommendations = async (
    groupedRecipes: Record<number, CooklistMembership[]>,
    catalogRecipes: Record<string, RecipeItem>,
    requestId: number,
  ) => {
    const isCurrentRequest = () =>
      cookbookRecommendationRequestRef.current === requestId;
    if (!isCurrentRequest()) return;

    if (!user || !supabase) {
      setCookbookRecommendations([]);
      setCookbookRecommendationUserId(null);
      setCookbookRestrictionState(null);
      return;
    }

    setRecommendationsLoading(true);
    setCookbookRecommendations([]);
    setCookbookRecommendationUserId(null);
    setCookbookRestrictionState(null);

    let hardRestrictions: Awaited<ReturnType<typeof fetchActiveHardRestrictions>> = [];
    try {
      hardRestrictions = await fetchActiveHardRestrictions(user.id);
      if (!isCurrentRequest()) return;
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error(
        "Failed to load hard restrictions; hiding cookbook recommendations:",
        error,
      );
      setRecommendationsLoading(false);
      return;
    }
    setCookbookRecommendationUserId(user.id);
    setCookbookRestrictionState({ userId: user.id, restrictions: hardRestrictions });

    const keepSafeRecommendations = (
      recommendations: CookbookRecommendation[],
    ): CookbookRecommendation[] =>
      keepCookbookRecommendationsSafe(recommendations, hardRestrictions);
    const fallbackRecommendations = keepSafeRecommendations(
      buildLocalCookbookRecommendations(groupedRecipes, catalogRecipes),
    );
    setCookbookRecommendations(fallbackRecommendations);

    const renderCookbookRecommendations = async (
      recData: StoredCookbookRecommendations,
    ) => {
      if (!isCurrentRequest()) return;
      const memberships = Object.values(groupedRecipes).flat();
      const ids = (recData?.cookbook_recipe_ids || []) as string[];
      const sources = (recData?.cookbook_recipe_sources || []) as string[];
      const scores = (recData?.cookbook_match_scores || []) as number[];
      const reasons = (recData?.cookbook_reasons || []) as string[];

      const storedRecommendations = ids
        .map((recipeId, index): CookbookRecommendation | null => {
          const source = sources[index] === "personal" || String(recipeId).startsWith("personal-") ? "personal" : "catalog";
          const membership = memberships.find((item) => String(item.recipe_id) === String(recipeId));
          if (!membership) return null;

          return {
            recipeId: String(recipeId),
            source,
            score: scores[index],
            reason: reasons[index],
            membership,
            recipe: source === "personal" ? getPersonalRecipeDetails(membership) : catalogRecipes[String(recipeId)] || getRecipeById(recipeId),
          };
        })
        .filter((item): item is CookbookRecommendation => Boolean(item));

      const safeStoredRecommendations = keepSafeRecommendations(storedRecommendations);
      if (!isCurrentRequest()) return;
      setCookbookRecommendations(
        safeStoredRecommendations.length > 0
          ? safeStoredRecommendations.slice(0, 5)
          : fallbackRecommendations,
      );
    };

    try {
      // 1. Fetch cached cookbook recommendations from Supabase first
      const { data, error } = await supabase
        .from("user_recommendations")
        .select("cookbook_recipe_ids,cookbook_recipe_sources,cookbook_match_scores,cookbook_reasons")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!isCurrentRequest()) return;

      if (error) {
        if (isMissingCookbookRecommendationColumns(error)) {
          console.info(
            "CookBook stored recommendations are unavailable because the cookbook recommendation columns are missing. Apply supabase/migrations/20260707000000_add_cookbook_recommendation_columns.sql."
          );
          setCookbookRecommendations(fallbackRecommendations);
          setRecommendationsLoading(false);
          return;
        }
        throw error;
      }

      if (data && data.cookbook_recipe_ids && data.cookbook_recipe_ids.length > 0) {
        await renderCookbookRecommendations(data);
        if (!isCurrentRequest()) return;
      }
      setRecommendationsLoading(false);

      // 2. Trigger the refresh in the background (non-blocking)
      if (session?.access_token) {
        fetch("/api/refresh-recommendations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ user_id: user.id }),
        })
          .then(async (refreshResponse) => {
            if (!isCurrentRequest()) return;
            if (!refreshResponse.ok) {
              console.error("Cookbook recommendation refresh failed:", refreshResponse.status, await refreshResponse.text());
            } else {
              // Re-fetch and update recommendations silently
              const { data: updatedData } = await supabase
                .from("user_recommendations")
                .select("cookbook_recipe_ids,cookbook_recipe_sources,cookbook_match_scores,cookbook_reasons")
                .eq("user_id", user.id)
                .maybeSingle();

              if (isCurrentRequest() && updatedData) {
                await renderCookbookRecommendations(updatedData);
              }
            }
          })
          .catch((err) => {
            if (isCurrentRequest()) {
              console.error("Background cookbook recommendation refresh failed:", err);
            }
          });
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (!isMissingCookbookRecommendationColumns(error)) {
        console.error("Failed to load cookbook recommendations:", error);
      }
      setCookbookRecommendations(fallbackRecommendations);
      setRecommendationsLoading(false);
    }
  };

  useEffect(() => {
    const requestId = ++cookbookRecommendationRequestRef.current;
    const isCurrentRequest = () =>
      cookbookRecommendationRequestRef.current === requestId;

    const loadCooklists = async () => {
      if (!user) {
        if (!isCurrentRequest()) return;
        setCooklists([]);
        setCooklistRecipesById({});
        setRecipesMap({});
        setPersonalRecipeCooklistId(null);
        setCookbookRecommendations([]);
        setCookbookRecommendationUserId(null);
        setCookbookRestrictionState(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await ensureDefaultCooklist(user.id);
        if (!isCurrentRequest()) return;
        const lists = await fetchCooklists(user.id);
        if (!isCurrentRequest()) return;
        setCooklists(lists);
        setPersonalRecipeCooklistId((current) =>
          current && lists.some((cooklist) => cooklist.id === current) ? current : lists[0]?.id || null
        );

        const membershipEntries = await Promise.all(
          lists.map(async (cooklist) => [cooklist.id, await fetchCooklistMemberships(user.id, cooklist.id)] as const)
        );
        if (!isCurrentRequest()) return;

        const groupedRecipes: Record<number, CooklistMembership[]> = {};
        const catalogRecipeIds = new Set<string>();
        membershipEntries.forEach(([cooklistId, memberships]) => {
          groupedRecipes[cooklistId] = memberships;
          memberships
            .filter((item) => item.recipe_source !== "personal" && !String(item.recipe_id).startsWith("personal-"))
            .forEach((item) => catalogRecipeIds.add(item.recipe_id));
        });

        setCooklistRecipesById(groupedRecipes);

        const catalogMap: Record<string, RecipeItem> = {};
        if (catalogRecipeIds.size > 0) {
          const recipes = await fetchRecipesByIds([...catalogRecipeIds]);
          if (!isCurrentRequest()) return;
          recipes.forEach((recipe) => {
            if (recipe) catalogMap[String(recipe.id)] = recipe;
          });
          setRecipesMap(catalogMap);
        } else {
          setRecipesMap({});
        }

        await loadCookbookRecommendations(
          groupedRecipes,
          catalogMap,
          requestId,
        );
      } catch (error) {
        if (isCurrentRequest()) {
          toast.error("Failed to load cooklists.");
        }
      } finally {
        if (isCurrentRequest()) {
          setLoading(false);
        }
      }
    };

    if (!authLoading) {
      loadCooklists();
    }
    return () => {
      if (cookbookRecommendationRequestRef.current === requestId) {
        cookbookRecommendationRequestRef.current += 1;
      }
    };
  }, [user, session?.access_token, authLoading]);

  const handleRecipeUse = async (recipe: RecipeItem) => {
    if (user) {
      await recordRecipeInteraction({
        userId: user.id,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        interactionType: "started",
      });
    }
    navigate(`/recipes/${recipe.id}`);
  };

  const handleRecipeDetails = (recipeId: string | number) => {
    if (String(recipeId).startsWith("personal-")) return;
    navigate(`/recipes/${recipeId}`);
  };

  const handleCreateCooklist = async () => {
    if (!user || !newCooklistName.trim()) return;

    setCreatingList(true);
    try {
      const created = await findOrCreateCooklist(user.id, newCooklistName);
      if (!created) return;
      setCooklists((current) => {
        if (current.some((cooklist) => cooklist.id === created.id)) return current;
        return [...current, created];
      });
      setCooklistRecipesById((current) => ({ ...current, [created.id]: current[created.id] || [] }));
      setPersonalRecipeCooklistId(created.id);
      setNewCooklistName("");
      setShowNewCooklistForm(false);
      toast.success(`"${created.name}" created.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create cooklist."));
    } finally {
      setCreatingList(false);
    }
  };

  const handleOpenCooklistEdit = (cooklist: Cooklist) => {
    setEditingCooklist(cooklist);
    setEditingCooklistName(cooklist.name);
  };

  const handleSaveCooklistEdit = async () => {
    if (!user || !editingCooklist || editingCooklist.is_default) return;

    const nextName = editingCooklistName.trim();
    if (!nextName) {
      toast.error("Cooklist name is required.");
      return;
    }

    setSavingCooklistEdit(true);
    try {
      const renamed = await renameCooklist({
        userId: user.id,
        cooklistId: editingCooklist.id,
        name: nextName,
      });

      if (renamed) {
        setCooklists((current) =>
          current.map((cooklist) => (cooklist.id === renamed.id ? renamed : cooklist))
        );
      }

      setEditingCooklist(null);
      setEditingCooklistName("");
      toast.success("Cooklist renamed.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to rename cooklist."));
    } finally {
      setSavingCooklistEdit(false);
    }
  };

  const handleDeleteCooklist = async () => {
    if (!user || !editingCooklist || editingCooklist.is_default) return;

    const deletedCooklist = editingCooklist;
    const deletedMemberships = cooklistRecipesById[deletedCooklist.id] || [];
    const remainingRecipeIds = new Set(
      Object.entries(cooklistRecipesById)
        .filter(([cooklistId]) => Number(cooklistId) !== deletedCooklist.id)
        .flatMap(([, memberships]) => memberships.map((membership) => String(membership.recipe_id)))
    );
    const unsavedRecipeIds = deletedMemberships
      .filter((membership) => membership.recipe_source !== "personal" && !String(membership.recipe_id).startsWith("personal-"))
      .map((membership) => String(membership.recipe_id))
      .filter((recipeId) => !remainingRecipeIds.has(recipeId));

    setDeletingCooklist(true);
    try {
      await deleteCooklist({
        userId: user.id,
        cooklistId: deletedCooklist.id,
        unsavedRecipeIds,
      });

      setCooklists((current) => current.filter((cooklist) => cooklist.id !== deletedCooklist.id));
      setCooklistRecipesById((current) => {
        const { [deletedCooklist.id]: _removed, ...next } = current;
        return next;
      });
      setCookbookRecommendations((current) =>
        current.filter((recommendation) => recommendation.membership?.cooklist_id !== deletedCooklist.id)
      );
      setPersonalRecipeCooklistId((current) => {
        if (current !== deletedCooklist.id) return current;
        return cooklists.find((cooklist) => cooklist.id !== deletedCooklist.id)?.id || null;
      });
      setEditingCooklist(null);
      setEditingCooklistName("");
      toast.success(`"${deletedCooklist.name}" deleted.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete cooklist."));
    } finally {
      setDeletingCooklist(false);
    }
  };

  const handleOpenCooklistPicker = async (event: React.MouseEvent, item: CooklistMembership) => {
    event.stopPropagation();
    if (!user) return;

    if (item.recipe_source === "personal" || String(item.recipe_id).startsWith("personal-")) {
      toast.info("Personal recipe cooklist editing is coming next.");
      return;
    }

    setCooklistDialogRecipe(item);
    setCooklistPickerLoading(true);
    try {
      const [lists, recipeListIds] = await Promise.all([
        fetchCooklists(user.id),
        fetchRecipeCooklistIds(user.id, item.recipe_id),
      ]);
      setCooklists(lists);
      setSelectedCooklistIds(recipeListIds);
    } catch (error) {
      toast.error("Failed to load cooklists.");
    } finally {
      setCooklistPickerLoading(false);
    }
  };

  const handleCooklistCheckedChange = (cooklistId: number, checked: boolean) => {
    setSelectedCooklistIds((current) =>
      checked ? [...new Set([...current, cooklistId])] : current.filter((id) => id !== cooklistId)
    );
  };

  const handleCreatePickerCooklist = async () => {
    if (!user || !pickerNewCooklistName.trim()) return;

    try {
      const created = await findOrCreateCooklist(user.id, pickerNewCooklistName);
      if (!created) return;
      setCooklists((current) => {
        if (current.some((cooklist) => cooklist.id === created.id)) return current;
        return [...current, created];
      });
      setCooklistRecipesById((current) => ({ ...current, [created.id]: current[created.id] || [] }));
      setSelectedCooklistIds((current) => [...new Set([...current, created.id])]);
      setPickerNewCooklistName("");
      toast.success(`"${created.name}" created.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create cooklist."));
    }
  };

  const handleSaveCooklistSelection = async () => {
    if (!user || !cooklistDialogRecipe) return;

    setSavingCooklistSelection(true);
    try {
      await setRecipeCooklists({
        userId: user.id,
        recipeId: cooklistDialogRecipe.recipe_id,
        recipeTitle: cooklistDialogRecipe.recipe_title,
        cooklistIds: selectedCooklistIds,
      });

      setCooklistRecipesById((current) => {
        const next: Record<number, CooklistMembership[]> = {};
        cooklists.forEach((cooklist) => {
          next[cooklist.id] = (current[cooklist.id] || []).filter(
            (item) => item.recipe_id !== cooklistDialogRecipe.recipe_id
          );
        });

        selectedCooklistIds.forEach((cooklistId) => {
          next[cooklistId] = [
            {
              ...cooklistDialogRecipe,
              cooklist_id: cooklistId,
            },
            ...(next[cooklistId] || []),
          ];
        });

        return next;
      });

      setCooklistDialogRecipe(null);
      toast.success(selectedCooklistIds.length > 0 ? "Cooklists updated." : `"${cooklistDialogRecipe.recipe_title}" removed from your CookBook.`);
    } catch (error) {
      toast.error("Failed to update cooklists.");
    } finally {
      setSavingCooklistSelection(false);
    }
  };

  const handleRecipeDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    item: CooklistMembership,
    sourceCooklistId: number,
  ) => {
    setDraggedRecipe({ item, sourceCooklistId });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(item.id));
  };

  const handleCooklistDragOver = (event: React.DragEvent<HTMLElement>, cooklistId: number) => {
    if (!draggedRecipe || draggedRecipe.sourceCooklistId === cooklistId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverCooklistId(cooklistId);
  };

  const handleCooklistDrop = async (event: React.DragEvent<HTMLElement>, targetCooklist: Cooklist) => {
    event.preventDefault();
    if (!user || !draggedRecipe) return;

    const { item, sourceCooklistId } = draggedRecipe;
    setDraggedRecipe(null);
    setDragOverCooklistId(null);

    if (sourceCooklistId === targetCooklist.id) return;

    try {
      const isPersonalRecipe = item.recipe_source === "personal" || String(item.recipe_id).startsWith("personal-");

      if (isPersonalRecipe) {
        const moved = await moveCooklistRecipeMembership({
          userId: user.id,
          membershipId: item.id,
          targetCooklistId: targetCooklist.id,
        });

        setCooklistRecipesById((current) => {
          const next = {
            ...current,
            [sourceCooklistId]: (current[sourceCooklistId] || []).filter((recipe) => recipe.id !== item.id),
            [targetCooklist.id]: [moved || { ...item, cooklist_id: targetCooklist.id }, ...(current[targetCooklist.id] || [])],
          };
          setCookbookRecommendations(
            keepCookbookRecommendationsSafeForCurrentUser(
              buildLocalCookbookRecommendations(next, recipesMap),
            ),
          );
          return next;
        });
      } else {
        const existingCooklistIds = await fetchRecipeCooklistIds(user.id, item.recipe_id);
        const nextCooklistIds = [
          ...new Set([...existingCooklistIds.filter((id) => id !== sourceCooklistId), targetCooklist.id]),
        ];

        await setRecipeCooklists({
          userId: user.id,
          recipeId: item.recipe_id,
          recipeTitle: item.recipe_title,
          cooklistIds: nextCooklistIds,
        });

        setCooklistRecipesById((current) => {
          const movedItem = { ...item, cooklist_id: targetCooklist.id };
          const targetHasRecipe = (current[targetCooklist.id] || []).some(
            (recipe) => recipe.recipe_id === item.recipe_id
          );

          const next = {
            ...current,
            [sourceCooklistId]: (current[sourceCooklistId] || []).filter(
              (recipe) => recipe.recipe_id !== item.recipe_id
            ),
            [targetCooklist.id]: targetHasRecipe
              ? current[targetCooklist.id] || []
              : [movedItem, ...(current[targetCooklist.id] || [])],
          };
          setCookbookRecommendations(
            keepCookbookRecommendationsSafeForCurrentUser(
              buildLocalCookbookRecommendations(next, recipesMap),
            ),
          );
          return next;
        });
      }

      toast.success(`Moved "${item.recipe_title}" to ${targetCooklist.name}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to move recipe."));
    }
  };

  const handleAddPersonalRecipe = async () => {
    if (!user || !personalRecipeTitle.trim()) return;

    setSavingPersonalRecipe(true);
    try {
      const targetCooklist = personalRecipeCooklistId
        ? cooklists.find((cooklist) => cooklist.id === personalRecipeCooklistId) || null
        : await ensureDefaultCooklist(user.id);

      if (!targetCooklist) throw new Error("Could not find a cooklist for this recipe.");

      const created = await addPersonalRecipeToCooklist({
        userId: user.id,
        cooklistId: targetCooklist.id,
        title: personalRecipeTitle,
        imageUrl: personalRecipeImageUrl,
        ingredients: personalRecipeIngredients,
        instructions: personalRecipeInstructions,
      });

      if (created) {
        setCooklistRecipesById((current) => ({
          ...current,
          [targetCooklist.id]: [created, ...(current[targetCooklist.id] || [])],
        }));
      }
      setPersonalRecipeTitle("");
      setPersonalRecipeImageUrl("");
      setPersonalRecipePhotoAnalysis(null);
      setPersonalRecipeIngredients("");
      setPersonalRecipeInstructions("");
      setShowPersonalRecipeForm(false);
      toast.success("Personal recipe added.");
    } catch (error) {
      toast.error("Failed to add personal recipe.");
    } finally {
      setSavingPersonalRecipe(false);
    }
  };

  const applyPersonalRecipePhotoAnalysis = (analysis: FoodImageAnalysis, replace = false) => {
    if (!analysis.is_food || !analysis.food_name) return;

    const ingredients = buildRecipeIngredientsFromPhoto(analysis);
    if (replace || !personalRecipeTitle.trim()) {
      setPersonalRecipeTitle(analysis.food_name);
    }
    if (ingredients && (replace || !personalRecipeIngredients.trim())) {
      setPersonalRecipeIngredients(ingredients);
    }
  };

  const handlePersonalRecipeImageUrlChange = (imageUrl: string) => {
    setPersonalRecipeImageUrl(imageUrl);
    setPersonalRecipePhotoAnalysis(null);
  };

  const handlePersonalRecipeFromImageFileSelected = async (file: File | null | undefined) => {
    if (!user || !file) return;
    if (!openImageUploadPrompt()) {
      if (personalRecipeFromImageInputRef.current) personalRecipeFromImageInputRef.current.value = "";
      return;
    }

    setPersonalRecipePhotoAnalysis(null);
    setAnalyzingPersonalRecipeImage(true);
    try {
      const imageUrl = await uploadUserImage({ userId: user.id, file, folder: "personal-recipes" });
      setPersonalRecipeImageUrl(imageUrl);
      const analysis = await analyzeFoodImage({ imageUrl, context: "personal_recipe" });
      setPersonalRecipePhotoAnalysis(analysis);
      if (analysis.is_food && analysis.food_name) {
        applyPersonalRecipePhotoAnalysis(analysis);
        toast.success("Recipe photo analyzed.");
      } else {
        toast.info("Image attached. Tamar could not confidently name the recipe.");
      }
    } catch (error) {
      console.error("CookBook recipe image analysis error:", error);
      toast.error(error instanceof Error ? error.message : "Could not analyze that recipe photo.");
    } finally {
      setAnalyzingPersonalRecipeImage(false);
      if (personalRecipeFromImageInputRef.current) personalRecipeFromImageInputRef.current.value = "";
    }
  };

  const allCooklistRecipes = cooklists.flatMap((cooklist) => cooklistRecipesById[cooklist.id] || []);
  const searchQuery = normalizeSearch(cookbookSearch);
  const formatMatchScore = (score?: number | null) => `${Math.round((score || 0.9) * 100)}%`;
  const visibleCookbookRecommendations =
    user &&
    cookbookRecommendationUserId === user.id &&
    cookbookRestrictionState?.userId === user.id
      ? keepCookbookRecommendationsSafe(
          cookbookRecommendations,
          cookbookRestrictionState.restrictions,
        )
      : [];

  const handleRecommendationClick = (recommendation: CookbookRecommendation) => {
    if (recommendation.source === "personal" && recommendation.membership) {
      setPersonalPreviewRecipe(recommendation.membership);
      return;
    }
    navigate(`/recipes/${recommendation.recipeId}`);
  };

  const handleRecommendationUse = async (event: React.MouseEvent, recommendation: CookbookRecommendation) => {
    event.stopPropagation();
    if (recommendation.source === "personal") {
      if (recommendation.membership) setPersonalPreviewRecipe(recommendation.membership);
      return;
    }

    const recipe = recommendation.recipe;
    if (!recipe || !user) return;
    await recordRecipeInteraction({
      userId: user.id,
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      interactionType: "started",
    });
    navigate(`/recipes/${recipe.id}`);
  };

  const renderCookbookRecommendationPanel = () => (
    <aside className="order-first xl:order-last xl:sticky xl:top-24 xl:self-start">
      <section className="rounded-lg border border-primary/15 bg-white/90 p-4 shadow-md shadow-primary/10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-[#1f3d2b]">CookBook Picks</h3>
          </div>
          {recommendationsLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {recommendationsLoading && visibleCookbookRecommendations.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 rounded-lg bg-secondary animate-pulse" />
            ))}
          </div>
        ) : visibleCookbookRecommendations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-primary/20 bg-primary/5 p-4 text-sm text-[#667864]">
            Add recipes to your CookBook to get your picks.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {visibleCookbookRecommendations.map((recommendation) => {
              const recipe = recommendation.recipe;
              const title = recipe?.title || recommendation.membership?.recipe_title || recommendation.recipeId;
              const image = recipe?.image || recommendation.membership?.image_url || "/images/empty_plate.png";

              return (
                <div
                  key={`${recommendation.source}-${recommendation.recipeId}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRecommendationClick(recommendation)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleRecommendationClick(recommendation);
                    }
                  }}
                  className="group flex min-h-24 w-full gap-3 rounded-lg border border-primary/10 bg-white p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-primary/10">
                    <ImageWithSkeleton
                      src={image}
                      alt={title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      skeletonClassName="bg-secondary"
                    />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-primary shadow-sm">
                      {formatMatchScore(recommendation.score)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <p className="line-clamp-2 text-sm font-bold leading-snug text-[#1f3d2b]">{title}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-[#667864]">
                        {recommendation.reason || (recommendation.source === "personal" ? "Personal recipe" : "Saved recipe")}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-primary">
                      {recommendation.source === "personal" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/8 px-2 py-0.5">
                          <Leaf className="h-3 w-3" />
                          personal
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Start ${title}`}
                        onClick={(event) => handleRecommendationUse(event, recommendation)}
                        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 bg-white text-primary hover:bg-primary/10"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );

  return (
    <div className="wellness-canvas min-h-screen text-foreground font-sans overflow-x-hidden flex flex-col">
      <Navbar forceSolid />

      <main className="flex-1 pt-28 pb-20 px-4 md:px-12 max-w-7xl mx-auto w-full flex flex-col">
        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
              <BookOpen className="w-9 h-9 text-primary" />
              My CookBook
            </h2>
            <p className="text-[#667864] mt-2 text-base">
              Save recipes into cooklists for weeknights, comfort meals, experiments, and everything worth revisiting.
            </p>
          </div>

          {user && (
            showNewCooklistForm ? (
              <div className="flex w-full gap-2 md:w-auto">
                <input
                  autoFocus
                  value={newCooklistName}
                  onChange={(event) => setNewCooklistName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleCreateCooklist();
                    if (event.key === "Escape") {
                      setShowNewCooklistForm(false);
                      setNewCooklistName("");
                    }
                  }}
                  placeholder="Cooklist name"
                  className="min-h-11 flex-1 rounded-lg border border-primary/15 bg-white px-3 text-sm outline-none focus:border-primary md:w-56"
                />
                <Button type="button" onClick={handleCreateCooklist} disabled={creatingList || !newCooklistName.trim()} aria-label="Create cooklist">
                  {creatingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowNewCooklistForm(false);
                    setNewCooklistName("");
                  }}
                  aria-label="Cancel cooklist creation"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
                <Button
                  type="button"
                  onClick={() => {
                    setShowNewCooklistForm(false);
                    setShowPersonalRecipeForm((current) => !current);
                  }}
                  variant="outline"
                  className="w-full whitespace-nowrap md:w-auto"
                >
                  <NotebookPen className="h-4 w-4" />
                  Add personal recipe
                </Button>
                <Button type="button" onClick={() => setShowNewCooklistForm(true)} className="w-full md:w-auto">
                  <Plus className="h-4 w-4" />
                  New cooklist
                </Button>
              </div>
            )
          )}
        </div>

        {user && (
          <label className="relative mb-6 block max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667864]" />
            <input
              value={cookbookSearch}
              onChange={(event) => setCookbookSearch(event.target.value)}
              placeholder="Search your cookbook"
              className="min-h-11 w-full rounded-lg border border-primary/15 bg-white/90 pl-10 pr-3 text-sm outline-none transition focus:border-primary"
            />
          </label>
        )}

        {authLoading || loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-[#667864] mt-4 animate-pulse">Gathering your recipes...</p>
          </div>
        ) : !user ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 bg-white/80 border border-primary/15 rounded-xl p-8 backdrop-blur-md shadow-xl shadow-primary/10 max-w-xl mx-auto my-12">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6 border border-primary/15 text-primary">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold mb-3">Save Your Cooking Inspiration</h3>
            <p className="text-[#667864] max-w-md mb-8 leading-relaxed">
              Create a free account to start saving recipes, tracking your cooking history, and receiving personalized recommendations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
              <Button onClick={() => setAuthOpen(true)} className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-6 text-base rounded-lg">
                Sign In / Sign Up
              </Button>
              <Button variant="outline" onClick={() => navigate("/")} className="border-primary/20 text-primary hover:bg-primary/10 font-semibold px-8 py-6 text-base rounded-lg">
                Explore Recipes
              </Button>
            </div>
          </div>
        ) : (
          <>
            {showPersonalRecipeForm && (
              <section className="mb-6 rounded-lg border border-primary/15 bg-white/90 p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#24352a]">Add personal recipe</h2>
                    <p className="mt-1 text-xs text-[#667864]">Use the button to draft from a photo, or fill the fields yourself.</p>
                  </div>
                  <input
                    ref={personalRecipeFromImageInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => handlePersonalRecipeFromImageFileSelected(event.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!openImageUploadPrompt()) return;
                      personalRecipeFromImageInputRef.current?.click();
                    }}
                    disabled={analyzingPersonalRecipeImage || savingPersonalRecipe}
                    className="h-9 gap-2 rounded-lg border-primary/20 text-primary"
                  >
                    {analyzingPersonalRecipeImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    Add recipe from image
                  </Button>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold text-[#667864]">Recipe name</span>
                    <input
                      value={personalRecipeTitle}
                      onChange={(event) => setPersonalRecipeTitle(event.target.value)}
                      placeholder="My ginger rice bowl"
                      className="min-h-11 rounded-lg border border-primary/15 bg-white px-3 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold text-[#667864]">Cooklist</span>
                    <select
                      value={personalRecipeCooklistId || ""}
                      onChange={(event) => setPersonalRecipeCooklistId(Number(event.target.value) || null)}
                      className="min-h-11 rounded-lg border border-primary/15 bg-white px-3 text-sm outline-none focus:border-primary"
                    >
                      {cooklists.map((cooklist) => (
                        <option key={cooklist.id} value={cooklist.id}>
                          {cooklist.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ImageUploadDropzone
                    userId={user.id}
                    folder="personal-recipes"
                    imageUrl={personalRecipeImageUrl}
                    onImageUrlChange={handlePersonalRecipeImageUrlChange}
                    label="Recipe image"
                    capture="environment"
                    primaryText="Drop a recipe image here or browse"
                    helperText="Attach a photo to this saved recipe"
                    onBeforeUpload={openImageUploadPrompt}
                  />
                  <div className="grid gap-2 rounded-lg border border-primary/15 bg-primary/[0.035] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#667864]">Photo suggestion</p>
                        <p className="mt-1 truncate text-sm font-semibold text-[#24352a]">
                          {analyzingPersonalRecipeImage
                            ? "Reading recipe photo"
                            : personalRecipePhotoAnalysis?.is_food && personalRecipePhotoAnalysis.food_name
                              ? personalRecipePhotoAnalysis.food_name
                              : "No photo suggestion yet"}
                        </p>
                      </div>
                      {analyzingPersonalRecipeImage ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : personalRecipePhotoAnalysis?.is_food && personalRecipePhotoAnalysis.food_name ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => applyPersonalRecipePhotoAnalysis(personalRecipePhotoAnalysis, true)}
                          className="h-8 shrink-0 gap-1.5 rounded-lg border-primary/20 px-3 text-xs"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Use
                        </Button>
                      ) : (
                        <Camera className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </div>
                    {personalRecipePhotoAnalysis?.visible_ingredients.length ? (
                      <p className="text-xs leading-relaxed text-[#667864]">
                        Visible: {personalRecipePhotoAnalysis.visible_ingredients.join(", ")}
                      </p>
                    ) : null}
                    {personalRecipePhotoAnalysis?.questions.length ? (
                      <p className="text-xs leading-relaxed text-[#667864]">
                        {personalRecipePhotoAnalysis.questions[0]}
                      </p>
                    ) : null}
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold text-[#667864]">Ingredients</span>
                    <textarea
                      value={personalRecipeIngredients}
                      onChange={(event) => setPersonalRecipeIngredients(event.target.value)}
                      rows={3}
                      placeholder="Rice, ginger, tofu, cucumber"
                      className="resize-none rounded-lg border border-primary/15 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold text-[#667864]">Steps</span>
                    <textarea
                      value={personalRecipeInstructions}
                      onChange={(event) => setPersonalRecipeInstructions(event.target.value)}
                      rows={3}
                      placeholder="Cook rice, sear tofu, assemble bowl"
                      className="resize-none rounded-lg border border-primary/15 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPersonalRecipeForm(false)}
                    className="sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAddPersonalRecipe}
                    disabled={savingPersonalRecipe || analyzingPersonalRecipeImage || !personalRecipeTitle.trim()}
                    className="sm:w-auto"
                  >
                    {savingPersonalRecipe ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add recipe
                  </Button>
                </div>
              </section>
            )}

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                {allCooklistRecipes.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-16 bg-white/80 border border-primary/15 rounded-xl p-8 backdrop-blur-md shadow-xl shadow-primary/10 max-w-xl mx-auto my-12">
                    <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mb-6 text-primary">
                      <BookOpen className="w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">Your CookBook is Empty</h3>
                    <p className="text-[#667864] max-w-md mb-8 leading-relaxed">
                      Browse recipes, add a personal recipe, or ask Tamar in chat to save one for later.
                    </p>
                    <Button onClick={() => navigate("/")} className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-6 text-base rounded-lg">
                      Discover Recipes
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-12 animate-in fade-in duration-500">
                {cooklists.map((cooklist) => {
                  const cooklistRecipes = (cooklistRecipesById[cooklist.id] || []).filter((item) => {
                    if (!searchQuery) return true;
                    return normalizeSearch(`${item.recipe_title} ${item.ingredients || ""} ${item.description || ""}`).includes(searchQuery);
                  });

                      return (
                        <section
                          key={cooklist.id}
                          className={`scroll-mt-28 rounded-xl p-3 transition-colors md:p-4 ${
                            dragOverCooklistId === cooklist.id ? "bg-primary/8 ring-2 ring-primary/25" : ""
                          }`}
                          onDragOver={(event) => handleCooklistDragOver(event, cooklist.id)}
                          onDragLeave={() => {
                            if (dragOverCooklistId === cooklist.id) setDragOverCooklistId(null);
                          }}
                          onDrop={(event) => handleCooklistDrop(event, cooklist)}
                        >
                          <div className="mb-4 flex items-end justify-between gap-4 border-b border-primary/15 pb-3">
                            <div className="min-w-0">
                              <div className="group/title flex min-w-0 items-center gap-2">
                                <h3 className="min-w-0 truncate text-2xl font-extrabold tracking-tight text-[#1f3d2b]">
                                  {cooklist.name}
                                </h3>
                                {!cooklist.is_default && (
                                  <button
                                    type="button"
                                    aria-label={`Edit ${cooklist.name}`}
                                    onClick={() => handleOpenCooklistEdit(cooklist)}
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-white/80 text-primary opacity-100 shadow-sm transition hover:border-primary/30 hover:bg-primary/10 md:opacity-0 md:group-hover/title:opacity-100 md:focus:opacity-100"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-[#667864]">
                                {cooklistRecipes.length} {cooklistRecipes.length === 1 ? "recipe" : "recipes"}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setPersonalRecipeCooklistId(cooklist.id);
                                setShowPersonalRecipeForm(true);
                              }}
                              className="shrink-0"
                            >
                              <Plus className="h-4 w-4" />
                              Add here
                            </Button>
                          </div>

                      {cooklistRecipes.length === 0 ? (
                        <div
                          className={`rounded-lg border border-dashed px-5 py-8 text-sm transition-colors ${
                            dragOverCooklistId === cooklist.id
                              ? "border-primary/45 bg-primary/10 text-primary"
                              : "border-primary/20 bg-white/60 text-[#667864]"
                          }`}
                        >
                          {dragOverCooklistId === cooklist.id
                            ? `Drop here to move to ${cooklist.name}.`
                            : searchQuery
                              ? "No matching recipes in this cooklist."
                              : "No recipes saved here yet."}
                        </div>
                      ) : (
                            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                              {cooklistRecipes.map((item) => {
                                const isPersonalRecipe =
                                  item.recipe_source === "personal" || String(item.recipe_id).startsWith("personal-");
                                const recipeDetails = isPersonalRecipe
                                  ? getPersonalRecipeDetails(item)
                                  : recipesMap[String(item.recipe_id)] || getRecipeById(item.recipe_id);
                                const cardKey = `${cooklist.id}-${item.id}`;
                                const isExpanded = expandedRecipeCardId === cardKey;
                                const visibleIngredients = (recipeDetails.ingredients || [])
                                  .map((ingredient) => ingredient.trim())
                                  .filter(Boolean)
                                  .slice(0, 5);

                                return (
                                  <div
                                    key={cardKey}
                                    draggable
                                    onDragStart={(event) => handleRecipeDragStart(event, item, cooklist.id)}
                                    onDragEnd={() => {
                                      setDraggedRecipe(null);
                                      setDragOverCooklistId(null);
                                    }}
                                    className={`group relative aspect-[4/3] cursor-grab overflow-hidden rounded-lg border border-primary/10 bg-white shadow-md shadow-primary/10 transition-all duration-300 active:cursor-grabbing hover:-translate-y-1 hover:z-30 hover:shadow-xl hover:shadow-primary/15 ${
                                      draggedRecipe?.item.id === item.id && draggedRecipe.sourceCooklistId === cooklist.id
                                        ? "opacity-55 ring-2 ring-primary/25"
                                        : ""
                                    }`}
                                    onClick={() => handleRecipeDetails(item.recipe_id)}
                                  >
                                    <ImageWithSkeleton
                                      src={recipeDetails.image}
                                      alt={item.recipe_title}
                                      className="absolute inset-x-0 top-0 h-[66%] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                      skeletonClassName="bg-secondary"
                                    />
                                    {(recipeDetails.image === "/images/empty_plate.png" || !recipeDetails.image) && (
                                      <div className="absolute inset-x-0 top-0 flex h-[66%] items-center justify-center bg-primary/10 pointer-events-none">
                                        <span className="text-4xl font-extrabold text-primary bg-white/80 px-4 py-2 rounded-xl border border-primary/20 shadow-lg tracking-wider">
                                          #{recipeDetails.id}
                                        </span>
                                      </div>
                                    )}

                                    <div className="absolute left-3 right-3 top-[calc(66%-1rem)] z-10 flex items-center gap-2 opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                                      <button
                                        type="button"
                                        aria-label={`Start ${item.recipe_title}`}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          if (!isPersonalRecipe) handleRecipeUse(recipeDetails as RecipeItem);
                                          else setPersonalPreviewRecipe(item);
                                        }}
                                        className="w-8 h-8 rounded-full border-2 border-primary/70 bg-white/95 text-primary flex items-center justify-center hover:bg-primary/10 transition-colors shadow-md shadow-primary/15 backdrop-blur"
                                      >
                                        <Play className="fill-current w-4 h-4 ml-0.5" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`Choose cooklists for ${item.recipe_title}`}
                                        onClick={(event) => handleOpenCooklistPicker(event, item)}
                                        className="w-8 h-8 rounded-full border-2 border-primary bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors shadow-md shadow-primary/15 backdrop-blur"
                                      >
                                        <Check className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={isExpanded ? `Hide details for ${item.recipe_title}` : `Show ingredients and prep time for ${item.recipe_title}`}
                                        aria-expanded={isExpanded}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setExpandedRecipeCardId((current) => (current === cardKey ? null : cardKey));
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

                                    {isExpanded && (
                                      <div className="absolute left-3 right-3 top-[calc(66%-4.25rem)] z-10 rounded-lg border border-primary/15 bg-white/90 p-2 text-[10px] text-[#536451] shadow-lg shadow-primary/15 backdrop-blur md:text-xs">
                                        <div className="flex items-center justify-between gap-2 font-bold text-[#1f3d2b]">
                                          <span>Prep time</span>
                                          <span>{recipeDetails.time || "15m"}</span>
                                        </div>
                                        <p className="mt-1 text-[#667864] line-clamp-2">
                                          {visibleIngredients.length > 0
                                            ? visibleIngredients.join(", ")
                                            : "Ingredients available on the recipe page"}
                                        </p>
                                      </div>
                                    )}

                                    <div className="absolute inset-x-0 bottom-0 top-[66%] bg-white/96 px-3 pb-2 pt-2 text-[#1f3d2b] transition-all duration-300">
                                      <p className="line-clamp-2 [overflow-wrap:anywhere] font-bold text-xs leading-tight">
                                        {item.recipe_title}
                                      </p>
                                      <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[9px] font-bold md:text-[10px]">
                                        <span className="shrink-0 text-primary">{recipeDetails.match || "95%"} Match</span>
                                        <span className="inline-flex min-w-0 shrink items-center gap-1 rounded-full border border-primary/15 bg-primary/8 px-1.5 py-0.5 text-[#536451]">
                                          <Leaf className="h-2.5 w-2.5 shrink-0 text-primary" />
                                          {isPersonalRecipe ? "personal" : "gentle"}
                                        </span>
                                        <span className="min-w-0 truncate text-[#667864]">{recipeDetails.time || formatSavedDate(item.created_at)}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>

              {renderCookbookRecommendationPanel()}
            </div>
          </>
        )}
      </main>

      <footer className="px-4 md:px-12 py-10 bg-[#efe5d3] border-t border-primary/10 text-[#667864] text-sm mt-auto">
        <p className="text-center text-xs">(c) 2026-2027 Tamar Food, Inc. All rights reserved.</p>
      </footer>

      <Dialog
        open={Boolean(cooklistDialogRecipe)}
        onOpenChange={(open) => {
          if (!open) {
            setCooklistDialogRecipe(null);
            setPickerNewCooklistName("");
          }
        }}
      >
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
                value={pickerNewCooklistName}
                onChange={(event) => setPickerNewCooklistName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleCreatePickerCooklist();
                }}
                placeholder="New cooklist"
                className="min-h-10 flex-1 rounded-lg border border-primary/15 px-3 text-sm outline-none focus:border-primary"
              />
              <Button type="button" variant="outline" onClick={handleCreatePickerCooklist}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={handleSaveCooklistSelection}
              disabled={cooklistPickerLoading || savingCooklistSelection}
            >
              {savingCooklistSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save cooklists
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingCooklist)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCooklist(null);
            setEditingCooklistName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit cooklist</DialogTitle>
            <DialogDescription>
              Rename this cooklist or delete it from your CookBook.
            </DialogDescription>
          </DialogHeader>
          {editingCooklist && (
            <div className="space-y-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold text-[#667864]">Cooklist name</span>
                <input
                  autoFocus
                  value={editingCooklistName}
                  onChange={(event) => setEditingCooklistName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSaveCooklistEdit();
                  }}
                  disabled={editingCooklist.is_default || savingCooklistEdit || deletingCooklist}
                  className="min-h-11 rounded-lg border border-primary/15 bg-white px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-secondary/50"
                />
              </label>

              {editingCooklist.is_default ? (
                <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-sm text-[#667864]">
                  The default Liked cooklist stays in place so saved recipe behavior remains consistent.
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  Deleting this cooklist also removes its saved entries from this list.
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDeleteCooklist}
                  disabled={editingCooklist.is_default || deletingCooklist || savingCooklistEdit}
                  className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 sm:w-auto"
                >
                  {deletingCooklist ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </Button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingCooklist(null);
                      setEditingCooklistName("");
                    }}
                    disabled={savingCooklistEdit || deletingCooklist}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveCooklistEdit}
                    disabled={
                      editingCooklist.is_default ||
                      savingCooklistEdit ||
                      deletingCooklist ||
                      !editingCooklistName.trim() ||
                      editingCooklistName.trim() === editingCooklist.name
                    }
                  >
                    {savingCooklistEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(personalPreviewRecipe)} onOpenChange={(open) => !open && setPersonalPreviewRecipe(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{personalPreviewRecipe?.recipe_title || "Personal recipe"}</DialogTitle>
            <DialogDescription className="sr-only">
              Review this personal recipe's saved image, ingredients, and steps.
            </DialogDescription>
          </DialogHeader>
          {personalPreviewRecipe && (
            <div className="space-y-4">
              {personalPreviewRecipe.image_url && (
                <div className="aspect-video overflow-hidden rounded-lg border border-primary/10">
                  <ImageWithSkeleton
                    src={personalPreviewRecipe.image_url}
                    alt={personalPreviewRecipe.recipe_title}
                    className="h-full w-full object-cover"
                    skeletonClassName="bg-secondary"
                  />
                </div>
              )}
              {personalPreviewRecipe.ingredients && (
                <div>
                  <h4 className="text-sm font-bold text-[#1f3d2b]">Ingredients</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#667864]">{personalPreviewRecipe.ingredients}</p>
                </div>
              )}
              {personalPreviewRecipe.instructions && (
                <div>
                  <h4 className="text-sm font-bold text-[#1f3d2b]">Steps</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#667864]">{personalPreviewRecipe.instructions}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      {canopyDialog}
    </div>
  );
};

export default CookBook;

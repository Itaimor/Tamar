import { Camera, Mic, Send, Loader2, X } from "lucide-react";
import tamarLogo from "@/assets/tamar-logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { useChatSession } from "@/components/ChatSessionProvider";
import type { IbsTranscriptMessage, RecipeFeedbackRecipe } from "@/components/ChatSessionProvider";
import { useCanopyAccess } from "@/hooks/useCanopyAccess";
import { classifyChatFoodEntry, isCancelChatFlowIntent } from "@/lib/chatFoodLogging";
import { createHealthReport, createMealLog } from "@/lib/diary";
import {
  FoodImageAnalysis,
  analyzeFoodImage,
  buildFoodImageSuggestionNotes,
} from "@/lib/foodImageAnalysis";
import { uploadUserImage } from "@/lib/imageUploads";
import {
  addPersonalRecipeToCooklist,
  fetchCookbookRecipeTitleExists,
  fetchRecipeCooklistIds,
  findOrCreateCooklist,
  recordRecipeInteraction,
  setRecipeCooklists,
} from "@/lib/recipeInteractions";
import { fetchDefaultRecipes, fetchRecipesByIds, type RecipeItem } from "@/lib/recipes";
import { supabase } from "@/lib/supabase";
import {
  applyIbsCheckInToProfile,
  summarizeIbsCheckIn,
} from "@/lib/ibsProfile";
import { validateIbsCheckInResult } from "@/lib/ibsRisk";

const chips = ["Recommend Me", "Log Food", "Add Recipe", "How I Feel", "Analyze my Lunch"];
const MAX_MODEL_HISTORY_MESSAGES = 24;

type RecipeFeedbackRequest = {
  key: number;
  recipe: RecipeFeedbackRecipe;
};

type ChatScreenProps = {
  docked?: boolean;
  foodLogRequestKey?: number;
  recipeFeedbackRequest?: RecipeFeedbackRequest | null;
  onClose?: () => void;
};

const isYes = (text: string) => /\b(yes|yeah|yep|sure|ok|okay|log it|i did|ate it)\b/i.test(text);
const isNo = (text: string) => /\b(no|nope|not yet|didn'?t|do not|don't)\b/i.test(text);
const isPositive = (text: string) => /\b(liked|like|love|loved|good|great|tasty|delicious|yes)\b/i.test(text);
const isNegative = (text: string) => /\b(disliked|didn'?t like|bad|not good|no|meh|bland|awful)\b/i.test(text);
const soundsOkay = (text: string) => /\b(good|fine|okay|ok|great|normal|no symptoms|no pain|all good|well)\b/i.test(text);
const soundsRough = (text: string) => /\b(pain|bloat|bloated|diarrhea|constipation|nausea|cramp|cramps|bad|rough|uncomfortable|sick)\b/i.test(text);
const isRecommendationRequest = (text: string) =>
  /\b(recommend|recommendation|suggest|curated for you|what should i (eat|cook|make)|give me (a )?recipe)\b/i.test(text);

const formatPhotoSuggestionMessage = (analysis: FoodImageAnalysis) => {
  if (!analysis.is_food || !analysis.food_name) {
    return "I could not confidently identify food from that photo. Tell me what to call it and I will log it with the image attached.";
  }

  const visible = analysis.visible_ingredients.length
    ? ` I can see ${analysis.visible_ingredients.slice(0, 5).join(", ")}.`
    : "";
  const question = analysis.questions[0] ? ` ${analysis.questions[0]}` : "";
  return `I think this is "${analysis.food_name}".${visible}${question} Reply yes to log that, or type a different meal name.`;
};

const extractLabeledValue = (text: string, label: string) => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\n)\\s*${escapedLabel}\\s*:\\s*([^\\n]+)`, "i");
  return text.match(pattern)?.[1]?.trim() || "";
};

type PendingCookbookAdd = {
  stage: "confirm" | "cooklist";
  recipeId?: string | number | null;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
  afterRecipeFeedback?: RecipeFeedbackRecipe | null;
};

const stripLabeledLines = (text: string) =>
  text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(title|recipe|cooklist|list|image|ingredients|steps|instructions|notes)\s*:/i.test(line))
    .join("\n")
    .trim();

const parsePersonalRecipeMessage = (text: string) => {
  const title =
    extractLabeledValue(text, "title") ||
    extractLabeledValue(text, "recipe") ||
    stripLabeledLines(text).split(/\r?\n/)[0]?.trim() ||
    text.trim();

  return {
    title,
    cooklistName: extractLabeledValue(text, "cooklist") || extractLabeledValue(text, "list"),
    imageUrl: extractLabeledValue(text, "image"),
    ingredients: extractLabeledValue(text, "ingredients"),
    instructions: extractLabeledValue(text, "steps") || extractLabeledValue(text, "instructions"),
    description: extractLabeledValue(text, "notes"),
  };
};

const withMatchScores = (
  recipes: RecipeItem[],
  scores: number[] | null | undefined,
): RecipeItem[] =>
  recipes.map((recipe, index) => {
    const score = scores && scores[index] !== undefined ? scores[index] : undefined;
    return score ? { ...recipe, match: `${Math.round(score * 100)}%` } : recipe;
  });

const formatRecommendationMessage = (recipes: RecipeItem[], personalized: boolean) => {
  if (recipes.length === 0) {
    return "I could not find recipe recommendations yet. Try the Home page first so Tamar can load recipes, then ask me again.";
  }

  const intro = personalized
    ? "Here are a few from your Curated for You recommendations:"
    : "I do not have personalized Curated for You results yet, so here are a few general picks to start with:";

  const lines = recipes.slice(0, 5).map((recipe, index) => {
    const details = [recipe.match ? `${recipe.match} match` : null, recipe.time].filter(Boolean).join(", ");
    return `${index + 1}. ${recipe.title}${details ? ` (${details})` : ""}`;
  });

  return `${intro}\n\n${lines.join("\n")}\n\nIf you pick one, use the play button on its recipe card so I can help log feedback after you eat it.`;
};

const ChatScreen = ({ docked = false, foodLogRequestKey = 0, recipeFeedbackRequest = null, onClose }: ChatScreenProps) => {
  const { user, session } = useAuth();
  const { canopyDialog, openImageUploadPrompt } = useCanopyAccess(user);
  const {
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    ibsTranscript,
    setIbsTranscript,
    isAwaitingFoodLog,
    setIsAwaitingFoodLog,
    recipeFeedback,
    setRecipeFeedback,
  } = useChatSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAnalyzingFoodImage, setIsAnalyzingFoodImage] = useState(false);
  const [pendingFoodImageAnalysis, setPendingFoodImageAnalysis] = useState<FoodImageAnalysis | null>(null);
  const [isAwaitingPersonalRecipe, setIsAwaitingPersonalRecipe] = useState(false);
  const [pendingCookbookAdd, setPendingCookbookAdd] = useState<PendingCookbookAdd | null>(null);
  const handledIntentRef = useRef<string | null>(null);
  const handledFoodLogRequestRef = useRef(0);
  const handledRecipeFeedbackRequestRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const canAttachImage = isAwaitingFoodLog || recipeFeedback?.step === "confirm" || isAwaitingPersonalRecipe;
  const hasActiveGuidedFlow =
    isAwaitingFoodLog ||
    isAwaitingPersonalRecipe ||
    Boolean(pendingCookbookAdd) ||
    Boolean(recipeFeedback) ||
    Boolean(ibsTranscript);
  const visibleChips = hasActiveGuidedFlow ? ["Cancel"] : chips;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const stopActiveGuidedFlow = (userText: string, assistantText = "Okay, I stopped the current flow. I will not save anything else from it.") => {
    setIbsTranscript(null);
    setIsAwaitingFoodLog(false);
    setIsAwaitingPersonalRecipe(false);
    setPendingCookbookAdd(null);
    setRecipeFeedback(null);
    setPendingImageUrl("");
    setPendingFoodImageAnalysis(null);
    setInputValue("");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userText.trim() },
      { role: "ai", text: assistantText },
    ]);
  };

  const startFoodLogFlow = useCallback(() => {
    if (!user) {
      toast.info("Please sign in so Tamar can save your meal.");
      return;
    }

    if (isLoading) return;

    setIbsTranscript(null);
    setIsAwaitingPersonalRecipe(false);
    setPendingCookbookAdd(null);
    setRecipeFeedback(null);
    setIsAwaitingFoodLog(true);
    setPendingImageUrl("");
    setPendingFoodImageAnalysis(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "Log Food" },
      {
        role: "ai",
        text: "Tell me what you ate. You can keep it simple, like \"rice bowl with chicken\". Use the camera button if you want to attach an image, or say cancel to stop.",
      },
    ]);
  }, [isLoading, setIbsTranscript, setIsAwaitingFoodLog, setMessages, setRecipeFeedback, user]);

  const startRecipeFeedbackFlow = useCallback((recipe: RecipeFeedbackRecipe) => {
    if (!user) {
      toast.info("Please sign in so Tamar can save your meal feedback.");
      return;
    }

    if (isLoading) return;

    setIbsTranscript(null);
    setIsAwaitingPersonalRecipe(false);
    setIsAwaitingFoodLog(false);
    setPendingCookbookAdd(null);
    setPendingImageUrl("");
    setRecipeFeedback({ recipe, step: "confirm" });
    setPendingFoodImageAnalysis(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: `I want to start ${recipe.title}` },
      {
        role: "ai",
        text: `Did you eat "${recipe.title}" and want me to log it as a meal?`,
      },
    ]);
  }, [isLoading, setIbsTranscript, setIsAwaitingFoodLog, setMessages, setRecipeFeedback, user]);

  const startPersonalRecipeFlow = useCallback(() => {
    if (!user) {
      toast.info("Please sign in so Tamar can save your recipe.");
      return;
    }

    if (isLoading) return;

    setIbsTranscript(null);
    setIsAwaitingFoodLog(false);
    setRecipeFeedback(null);
    setPendingCookbookAdd(null);
    setPendingImageUrl("");
    setPendingFoodImageAnalysis(null);
    setIsAwaitingPersonalRecipe(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "Add Recipe" },
      {
        role: "ai",
        text: "Send your recipe name. You can also add lines like cooklist: Weeknights, ingredients: rice, tofu, ginger, steps: cook and assemble. Use the camera button if you want to attach an image.",
      },
    ]);
  }, [isLoading, setIbsTranscript, setIsAwaitingFoodLog, setMessages, setRecipeFeedback, user]);

  const handleRecommendationRequest = async (text = "Recommend Me") => {
    if (isLoading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInputValue("");
    setIbsTranscript(null);
    setIsAwaitingPersonalRecipe(false);
    setIsAwaitingFoodLog(false);
    setRecipeFeedback(null);
    setPendingCookbookAdd(null);
    setPendingImageUrl("");
    setPendingFoodImageAnalysis(null);
    setIsLoading(true);

    try {
      if (user && session?.access_token) {
        await fetch("/api/refresh-recommendations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ user_id: user.id }),
        }).catch((error) => {
          console.info("Chat recommendation refresh skipped:", error);
        });
      }

      if (user && supabase) {
        const { data, error } = await supabase
          .from("user_recommendations")
          .select("recommended_recipe_ids, match_scores")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!error && data?.recommended_recipe_ids?.length > 0) {
          const recipes = await fetchRecipesByIds(data.recommended_recipe_ids as string[]);
          setMessages((prev) => [
            ...prev,
            { role: "ai", text: formatRecommendationMessage(withMatchScores(recipes, data.match_scores), true) },
          ]);
          return;
        }
      }

      const fallbackRecipes = await fetchDefaultRecipes(5);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: formatRecommendationMessage(fallbackRecipes, false) },
      ]);
    } catch (error) {
      console.error("Chat recommendation error:", error);
      toast.error("I could not load recommendations right now.");
    } finally {
      setIsLoading(false);
    }
  };

  const askCookbookAddIfMissing = async ({
    recipeId,
    title,
    imageUrl,
    description,
    afterRecipeFeedback,
  }: Omit<PendingCookbookAdd, "stage">) => {
    if (!user) return false;

    try {
      const alreadyInCookbook = recipeId
        ? (await fetchRecipeCooklistIds(user.id, recipeId)).length > 0
        : await fetchCookbookRecipeTitleExists(user.id, title);

      if (alreadyInCookbook) return false;
    } catch (error) {
      console.warn("Could not check cookbook membership before prompting:", error);
    }

    setPendingCookbookAdd({
      stage: "confirm",
      recipeId,
      title,
      imageUrl,
      description,
      afterRecipeFeedback: afterRecipeFeedback || null,
    });
    setMessages((prev) => [
      ...prev,
      { role: "ai", text: `Do you want to add "${title}" to your CookBook?` },
    ]);
    return true;
  };

  const continueAfterCookbookPrompt = (pending: PendingCookbookAdd) => {
    if (pending.afterRecipeFeedback) {
      setRecipeFeedback({ recipe: pending.afterRecipeFeedback, step: "liked" });
      setMessages((prev) => [...prev, { role: "ai", text: "Did you like the recipe?" }]);
    }
  };

  const handleCookbookAddMessage = async (text: string) => {
    if (!user || !pendingCookbookAdd) return;

    const pending = pendingCookbookAdd;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInputValue("");

    if (pending.stage === "confirm") {
      if (isNo(text)) {
        setPendingCookbookAdd(null);
        setMessages((prev) => [...prev, { role: "ai", text: "No problem. I will leave your CookBook unchanged." }]);
        continueAfterCookbookPrompt(pending);
        return;
      }

      if (!isYes(text)) {
        setMessages((prev) => [...prev, { role: "ai", text: "Should I add it to your CookBook? You can answer yes or no." }]);
        return;
      }

      setPendingCookbookAdd({ ...pending, stage: "cooklist" });
      setMessages((prev) => [...prev, { role: "ai", text: "Which cooklist should I save it to? If it does not exist yet, I will create it." }]);
      return;
    }

    const cooklistName = text.trim();
    if (!cooklistName) {
      setMessages((prev) => [...prev, { role: "ai", text: "Tell me the cooklist name, like Liked or Weeknights." }]);
      return;
    }

    setIsLoading(true);
    try {
      const cooklist = await findOrCreateCooklist(user.id, cooklistName);
      if (!cooklist) throw new Error("Could not find or create a cooklist.");

      if (pending.recipeId) {
        const existingIds = await fetchRecipeCooklistIds(user.id, pending.recipeId);
        await setRecipeCooklists({
          userId: user.id,
          recipeId: pending.recipeId,
          recipeTitle: pending.title,
          cooklistIds: [...new Set([...existingIds, cooklist.id])],
        });
      } else {
        await addPersonalRecipeToCooklist({
          userId: user.id,
          cooklistId: cooklist.id,
          title: pending.title,
          imageUrl: pending.imageUrl,
          description: pending.description,
        });
      }

      setPendingCookbookAdd(null);
      setMessages((prev) => [...prev, { role: "ai", text: `Saved "${pending.title}" to ${cooklist.name}.` }]);
      toast.success("Recipe saved to your CookBook.");
      continueAfterCookbookPrompt(pending);
    } catch (error) {
      console.error("Chat cookbook add error:", error);
      toast.error("I could not save that recipe to your CookBook.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const intent = searchParams.get("intent");
    if (intent !== "log-food" || handledIntentRef.current === intent) return;

    handledIntentRef.current = intent;
    startFoodLogFlow();
    setSearchParams({ tab: "chat" }, { replace: true });
  }, [searchParams, setSearchParams, startFoodLogFlow]);

  useEffect(() => {
    if (foodLogRequestKey <= 0 || handledFoodLogRequestRef.current === foodLogRequestKey) return;
    handledFoodLogRequestRef.current = foodLogRequestKey;
    startFoodLogFlow();
  }, [foodLogRequestKey, startFoodLogFlow]);

  useEffect(() => {
    if (!recipeFeedbackRequest || handledRecipeFeedbackRequestRef.current === recipeFeedbackRequest.key) return;
    handledRecipeFeedbackRequestRef.current = recipeFeedbackRequest.key;
    startRecipeFeedbackFlow(recipeFeedbackRequest.recipe);
  }, [recipeFeedbackRequest, startRecipeFeedbackFlow]);

  const runIbsCheckIn = async (nextTranscript: IbsTranscriptMessage[]) => {
    const response = await fetch("/api/ibs-check-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: nextTranscript }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to run IBS check-in");
    }

    return response.json();
  };

  const startIbsCheckIn = async () => {
    if (!user) {
      toast.info("Please sign in so Tamar can save your IBS profile.");
      return;
    }

    if (isLoading) return;

    const startMessage = "How I Feel";
    const nextTranscript: IbsTranscriptMessage[] = [
      { role: "user", text: "Start a structured IBS How I Feel check-in." },
    ];

    setMessages((prev) => [...prev, { role: "user", text: startMessage }]);
    setIbsTranscript(nextTranscript);
    setIsAwaitingPersonalRecipe(false);
    setIsAwaitingFoodLog(false);
    setIsLoading(true);

    try {
      const data = await runIbsCheckIn(nextTranscript);
      const assistantText =
        typeof data.assistant_message === "string" && data.assistant_message.trim()
          ? data.assistant_message.trim()
          : "How has your digestion felt today?";

      setIbsTranscript([...nextTranscript, { role: "assistant", text: assistantText }]);
      setMessages((prev) => [...prev, { role: "ai", text: assistantText }]);
    } catch (error) {
      console.error("IBS check-in start error:", error);
      setIbsTranscript(null);
      toast.error("Could not start the IBS check-in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleIbsCheckInMessage = async (text: string) => {
    if (!user || !ibsTranscript) return;

    const nextTranscript = [...ibsTranscript, { role: "user" as const, text }];
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInputValue("");
    setIbsTranscript(nextTranscript);
    setIsLoading(true);

    try {
      const data = await runIbsCheckIn(nextTranscript);
      const assistantText =
        typeof data.assistant_message === "string" && data.assistant_message.trim()
          ? data.assistant_message.trim()
          : "Thanks. I need one more detail to complete this check-in.";

      const validatedResult = validateIbsCheckInResult(data.result);

      setMessages((prev) => [...prev, { role: "ai", text: assistantText }]);

      if (validatedResult?.complete) {
        const updateSummary = await applyIbsCheckInToProfile(user.id, validatedResult);
        const savedText =
          updateSummary.updatedCount > 0
            ? summarizeIbsCheckIn(validatedResult, updateSummary.topIngredients)
            : "I collected the check-in, but I did not find IBS-table ingredients to update this time. Your existing IBS ingredient table was left unchanged.";

        setMessages((prev) => [...prev, { role: "ai", text: savedText }]);
        setIbsTranscript(null);
      } else {
        setIbsTranscript([...nextTranscript, { role: "assistant", text: assistantText }]);
      }
    } catch (error) {
      console.error("IBS check-in error:", error);
      toast.error("This IBS check-in was not saved. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFoodLogMessage = async (text: string) => {
    if (!user) return;

    const trimmedText = text.trim();
    const confirmedPhotoSuggestion = Boolean(
      pendingFoodImageAnalysis?.is_food &&
      pendingFoodImageAnalysis.food_name &&
      isYes(trimmedText),
    );
    const entryKind = confirmedPhotoSuggestion ? "food" : classifyChatFoodEntry(trimmedText);

    if (entryKind === "cancel") {
      stopActiveGuidedFlow(trimmedText, "Food logging canceled. Nothing was added to your Diary.");
      return;
    }

    if (entryKind === "not_food") {
      stopActiveGuidedFlow(
        trimmedText,
        "I could not identify a food or drink in that message, so I stopped food logging and did not add anything to your Diary. Choose Log Food when you want to try again.",
      );
      return;
    }

    if (pendingFoodImageAnalysis) {
      if (isYes(trimmedText) && !pendingFoodImageAnalysis.food_name) {
        setMessages((prev) => [
          ...prev,
          { role: "user", text: trimmedText },
          { role: "ai", text: "I need a meal name before I can save it. What should I call this?" },
        ]);
        setInputValue("");
        setPendingFoodImageAnalysis(null);
        return;
      }
    }

    const foodName = confirmedPhotoSuggestion ? pendingFoodImageAnalysis!.food_name : trimmedText;
    const photoNotes = pendingFoodImageAnalysis?.is_food
      ? buildFoodImageSuggestionNotes(pendingFoodImageAnalysis)
      : "";

    setMessages((prev) => [...prev, { role: "user", text: trimmedText }]);
    setInputValue("");
    setIsLoading(true);

    try {
      const savedMeal = await createMealLog({
        userId: user.id,
        foodName,
        loggedAt: new Date().toISOString(),
        imageUrl: pendingImageUrl,
        notes: [photoNotes, "Logged through Tamar chat."].filter(Boolean).join(" "),
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "Saved that to your Diary. Tamar will use it as part of your meal history when looking for patterns.",
        },
      ]);
      setIsAwaitingFoodLog(false);
      setPendingImageUrl("");
      setPendingFoodImageAnalysis(null);
      toast.success("Food logged to your Diary.");
      await askCookbookAddIfMissing({
        recipeId: savedMeal.recipe_id || null,
        title: savedMeal.food_name,
        imageUrl: savedMeal.image_url || pendingImageUrl || null,
        description: savedMeal.notes || "Logged through Tamar chat.",
      });
    } catch (error) {
      console.error("Chat food log error:", error);
      toast.error("That meal was not saved. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePersonalRecipeMessage = async (text: string) => {
    if (!user) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInputValue("");
    setIsLoading(true);

    try {
      const parsed = parsePersonalRecipeMessage(text);
      if (!parsed.title.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "I need a recipe name before I can save it." },
        ]);
        return;
      }

      const cooklist = await findOrCreateCooklist(user.id, parsed.cooklistName);
      if (!cooklist) throw new Error("Could not find or create a cooklist.");

      await addPersonalRecipeToCooklist({
        userId: user.id,
        cooklistId: cooklist.id,
        title: parsed.title,
        imageUrl: pendingImageUrl || parsed.imageUrl,
        description: parsed.description,
        ingredients: parsed.ingredients,
        instructions: parsed.instructions,
      });

      setIsAwaitingPersonalRecipe(false);
      setPendingImageUrl("");
      setPendingFoodImageAnalysis(null);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `Saved "${parsed.title}" to ${cooklist.name}.` },
      ]);
      toast.success("Personal recipe saved to your CookBook.");
    } catch (error) {
      console.error("Chat personal recipe error:", error);
      toast.error("That recipe was not saved. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecipeFeedbackMessage = async (text: string) => {
    if (!user || !recipeFeedback) return;

    const { recipe, step } = recipeFeedback;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInputValue("");

    if (step === "confirm") {
      if (isNo(text)) {
        setRecipeFeedback(null);
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "No problem. I will not log it as eaten." },
        ]);
        return;
      }

      if (!isYes(text)) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "Just to be clear, should I log this recipe as eaten? You can answer yes or no." },
        ]);
        return;
      }

      setIsLoading(true);
      try {
        const savedMeal = await createMealLog({
          userId: user.id,
          recipeId: recipe.id,
          foodName: recipe.title,
          loggedAt: new Date().toISOString(),
          imageUrl: pendingImageUrl,
          notes: "Logged through recipe feedback chat.",
        });

        await recordRecipeInteraction({
          userId: user.id,
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          interactionType: "completed",
        });

        const promptedCookbook = await askCookbookAddIfMissing({
          recipeId: recipe.id,
          title: recipe.title,
          imageUrl: savedMeal.image_url || pendingImageUrl || null,
          description: "Logged through recipe feedback chat.",
          afterRecipeFeedback: recipe,
        });
        setPendingImageUrl("");
        setPendingFoodImageAnalysis(null);
        if (!promptedCookbook) {
          setRecipeFeedback({ recipe, step: "liked" });
          setMessages((prev) => [
            ...prev,
            { role: "ai", text: "Logged it. Did you like the recipe?" },
          ]);
        }
      } catch (error) {
        console.error("Recipe feedback meal log error:", error);
        toast.error("That meal was not saved. Please try again.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (step === "liked") {
      setIsLoading(true);
      try {
        if (isPositive(text) || isNegative(text)) {
          await recordRecipeInteraction({
            userId: user.id,
            recipeId: recipe.id,
            recipeTitle: recipe.title,
            interactionType: isPositive(text) ? "liked" : "dismissed",
          });
        }

        setRecipeFeedback({ recipe, step: "feeling" });
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "Thanks. How are you feeling in general now? Feeling good, a little off, or any digestive symptoms?" },
        ]);
      } catch (error) {
        console.error("Recipe preference feedback error:", error);
        toast.error("I could not save that preference feedback.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const noSymptoms = soundsOkay(text) && !soundsRough(text);
      const severity = noSymptoms ? 0 : soundsRough(text) ? 0.65 : 0.25;

      await createHealthReport({
        userId: user.id,
        symptomType: noSymptoms ? "none" : "digestive_discomfort",
        severity,
        reportedAt: new Date().toISOString(),
        noSymptoms,
        notes: `Recipe feedback for "${recipe.title}": ${text}`,
      });

      setRecipeFeedback(null);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Saved. I added the meal and your general feeling to your Diary so Tamar can learn from the pattern." },
      ]);
      toast.success("Recipe meal feedback saved.");
    } catch (error) {
      console.error("Recipe feeling feedback error:", error);
      toast.error("I could not save how you are feeling.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent | string) => {
    const text = typeof e === "string" ? e : inputValue;
    if (!text.trim() || isLoading) return;

    if (hasActiveGuidedFlow && isCancelChatFlowIntent(text)) {
      stopActiveGuidedFlow(
        text,
        isAwaitingFoodLog
          ? "Food logging canceled. Nothing was added to your Diary."
          : "Okay, I stopped the current flow. I will not save anything else from it.",
      );
      return;
    }

    if (text === "Recommend Me" || (!isAwaitingFoodLog && !isAwaitingPersonalRecipe && !recipeFeedback && !ibsTranscript && isRecommendationRequest(text))) {
      await handleRecommendationRequest(text);
      return;
    }

    if (text === "Log Food") {
      startFoodLogFlow();
      return;
    }

    if (text === "Add Recipe") {
      startPersonalRecipeFlow();
      return;
    }

    if (text === "How I Feel") {
      await startIbsCheckIn();
      return;
    }

    if (isAwaitingFoodLog) {
      await handleFoodLogMessage(text);
      return;
    }

    if (isAwaitingPersonalRecipe) {
      await handlePersonalRecipeMessage(text);
      return;
    }

    if (pendingCookbookAdd) {
      await handleCookbookAddMessage(text);
      return;
    }

    if (recipeFeedback) {
      await handleRecipeFeedbackMessage(text);
      return;
    }

    if (ibsTranscript) {
      await handleIbsCheckInMessage(text);
      return;
    }

    const userMessage = { role: "user" as const, text };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // The Gemini API requires history to start with a 'user' message.
      // We find the first user message and take everything from there.
      const history = messages
        .slice(-MAX_MODEL_HISTORY_MESSAGES)
        .map(m => ({
          role: m.role === "user" ? "user" as const : "model" as const,
          parts: [{ text: m.text }],
        }));

      const firstUserIndex = history.findIndex(m => m.role === "user");
      const validHistory = firstUserIndex !== -1 ? history.slice(firstUserIndex) : [];
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: text,
          history: validHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch response from Tamar backend");
      }

      const data = await response.json();
      const responseText = data.text;

      setMessages((prev) => [...prev, { role: "ai" as const, text: responseText }]);
    } catch (error) {
      console.error("Gemini Error:", error);
      toast.error("Failed to get response from Tamar. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageFileSelected = async (file: File | null | undefined) => {
    if (!user || !file || !canAttachImage) return;
    if (!openImageUploadPrompt()) {
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }

    setIsUploadingImage(true);
    try {
      const folder = isAwaitingPersonalRecipe ? "personal-recipes" : "meal-logs";
      const imageUrl = await uploadUserImage({ userId: user.id, file, folder });
      setPendingImageUrl(imageUrl);
      setPendingFoodImageAnalysis(null);
      toast.success("Image attached.");
      if (isAwaitingFoodLog) {
        setIsAnalyzingFoodImage(true);
        try {
          const analysis = await analyzeFoodImage({ imageUrl, context: "meal_log" });
          setPendingFoodImageAnalysis(analysis);
          if (analysis.is_food && analysis.food_name) {
            setInputValue(analysis.food_name);
          }
          setMessages((prev) => [
            ...prev,
            { role: "ai", text: formatPhotoSuggestionMessage(analysis) },
          ]);
        } catch (error) {
          console.error("Chat food image analysis error:", error);
          toast.error(error instanceof Error ? error.message : "Could not analyze that photo.");
          setMessages((prev) => [
            ...prev,
            { role: "ai", text: "Image attached. Tell me what you ate and I will log it with the photo." },
          ]);
        } finally {
          setIsAnalyzingFoodImage(false);
        }
      } else if (isAwaitingPersonalRecipe) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "Image attached as the recipe photo. Send the recipe name when you are ready." },
        ]);
      }
    } catch (error) {
      console.error("Chat image upload error:", error);
      toast.error(error instanceof Error ? error.message : "Could not upload that image.");
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-background md:bg-card md:border md:rounded-3xl md:shadow-lg md:overflow-hidden ${
        docked ? "rounded-2xl md:mb-0" : "md:mb-4"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={tamarLogo} alt="Tamar" className="h-10 w-10 md:h-12 md:w-12 rounded-full border bg-white p-1" />
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-safe border-2 border-background"></div>
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Tamar</h2>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${isLoading ? "bg-warning animate-bounce" : "bg-safe animate-pulse"}`}></span>
              {isLoading ? "Tamar is thinking..." : "AI Health Assistant"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-full transition-colors"
              aria-label="Close Tamar chat"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6">
        <AnimatePresence mode="popLayout">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`${msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"} shadow-sm ${docked ? "max-w-[88%]" : "md:max-w-[70%] lg:max-w-[65%]"}`}>
                <p className="text-sm md:text-[15px] leading-relaxed whitespace-pre-wrap">
                  {msg.text.split(/(\*\*.*?\*\*)/g).map((part, j) =>
                    part.startsWith("**") && part.endsWith("**") ? (
                      <strong key={j} className="font-bold">{part.slice(2, -2)}</strong>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </p>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="chat-bubble-ai flex items-center gap-2 py-3 px-4">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Tamar is typing...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Footer Area */}
      <div className={`bg-background/80 backdrop-blur-md border-t ${docked ? "p-3 md:p-4" : "p-4 md:p-6"}`}>
        {/* Chips */}
        <div className="pb-4 flex gap-2 overflow-x-auto no-scrollbar">
          {visibleChips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleSendMessage(chip)}
              disabled={isLoading}
              className="tamar-chip whitespace-nowrap text-[11px] md:text-xs disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input bar */}
        {pendingImageUrl && canAttachImage && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary/15 bg-muted p-2">
            <img src={pendingImageUrl} alt="" className="h-14 w-20 rounded-lg object-cover" />
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Image attached</p>
            <button
              type="button"
              onClick={() => setPendingImageUrl("")}
              className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background"
            >
              Remove
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          className="relative flex min-w-0 items-center gap-2 group"
        >
          <div className={`flex min-w-0 flex-1 items-center bg-muted hover:bg-muted/80 focus-within:bg-muted/60 transition-all rounded-2xl border border-transparent focus-within:border-primary/20 ${
            docked ? "gap-2 px-3 py-3" : "gap-3 px-4 py-3 md:py-4"
          }`}>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => handleImageFileSelected(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => {
                if (!openImageUploadPrompt()) return;
                imageInputRef.current?.click();
              }}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isLoading || isUploadingImage || isAnalyzingFoodImage || !canAttachImage}
              aria-label="Attach image"
            >
              {isUploadingImage || isAnalyzingFoodImage ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} strokeWidth={1.5} />}
            </button>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message Tamar..."
              className="min-w-0 flex-1 bg-transparent text-sm md:text-base outline-none placeholder:text-muted-foreground"
              disabled={isLoading}
            />
            <Mic size={20} className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer transition-colors" strokeWidth={1.5} />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || isAnalyzingFoodImage}
            className={`bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl flex items-center justify-center transition-all shadow-md active:scale-95 shrink-0 disabled:opacity-50 disabled:grayscale ${
              docked ? "h-11 w-11" : "h-11 w-11 md:h-14 md:w-14"
            }`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </form>
      </div>
      {canopyDialog}
    </div>
  );
};

export default ChatScreen;

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, HeartPulse, Loader2, MessageCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { recordRecipeInteraction } from "@/lib/recipeInteractions";
import { fetchRecipeById, RecipeItem } from "@/lib/recipes";
import { toast } from "sonner";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";

const normalizeList = (items?: string[]) =>
  (Array.isArray(items) ? items : [])
    .map((item) => String(item).trim())
    .filter(Boolean);

const capitalizeFirstWord = (value: string) =>
  value.replace(/^(\s*)([a-z])/, (_, leadingWhitespace, firstLetter) => (
    `${leadingWhitespace}${firstLetter.toUpperCase()}`
  ));

const RecipeDetail = () => {
  const navigate = useNavigate();
  const { recipeId } = useParams();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<RecipeItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecipe = async () => {
      if (!recipeId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const loaded = await fetchRecipeById(recipeId);
        setRecipe(loaded);

        if (user) {
          await recordRecipeInteraction({
            userId: user.id,
            recipeId: loaded.id,
            recipeTitle: loaded.title,
            interactionType: "viewed",
          });
        }
      } catch (error) {
        console.error("Failed to load recipe:", error);
        toast.error("Could not load this recipe.");
      } finally {
        setLoading(false);
      }
    };

    loadRecipe();
  }, [recipeId, user]);

  const ingredients = useMemo(() => normalizeList(recipe?.ingredients), [recipe]);
  const steps = useMemo(() => normalizeList(recipe?.steps), [recipe]);

  const handleRecipeFeedbackChat = () => {
    if (!recipe) return;

    if (!user) {
      toast.info("Please sign in so Tamar can save your meal feedback.");
      return;
    }

    window.dispatchEvent(new CustomEvent("tamar:open-recipe-feedback-chat", {
      detail: { id: recipe.id, title: recipe.title },
    }));
  };

  return (
    <div className="wellness-canvas min-h-screen text-foreground font-sans">
      <Navbar forceSolid />

      {loading ? (
        <main className="min-h-screen flex flex-col items-center justify-center px-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="mt-4 text-[#667864]">Preparing the recipe...</p>
        </main>
      ) : !recipe ? (
        <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <h2 className="text-3xl font-extrabold mb-3">Recipe not found</h2>
          <Button onClick={() => navigate("/")} className="bg-primary hover:bg-primary/90">
            Back to recipes
          </Button>
        </main>
      ) : (
        <main className="pt-24 pb-20">
          <section className="relative min-h-[52vh] flex items-end">
            <ImageWithSkeleton
              src={recipe.image}
              alt={recipe.title}
              className="absolute inset-0 w-full h-full object-cover"
              skeletonClassName="bg-secondary rounded-none animate-pulse"
            />
            {(recipe.image === "/images/empty_plate.png" || !recipe.image) && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/10">
                <span className="text-6xl font-extrabold text-primary bg-white/80 px-6 py-3 rounded-xl border border-primary/20 shadow-2xl tracking-wider">
                  #{recipe.id}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#fbf7ec] via-[#fbf7ec]/78 to-[#fbf7ec]/18" />
            <div className="relative z-10 w-full px-4 md:px-12 pb-10 max-w-5xl">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#536451] hover:text-primary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight mb-4 text-[#1f3d2b]">
                {recipe.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-[#536451] mb-7">
                <span className="inline-flex items-center gap-2 rounded-md border border-primary/15 bg-white/70 px-3 py-2">
                  <Clock className="w-4 h-4 text-primary" />
                  {recipe.time || "15m"}
                </span>
                {recipe.is_ibs_friendly && (
                  <span className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-primary">
                    <HeartPulse className="w-4 h-4" />
                    IBS-friendly
                  </span>
                )}
              </div>
              <Button
                type="button"
                onClick={handleRecipeFeedbackChat}
                className="bg-primary hover:bg-primary/90 text-white font-bold gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Log through chat
              </Button>
            </div>
          </section>

          <section className="px-4 md:px-12 max-w-6xl mt-8 grid grid-cols-1 lg:grid-cols-[minmax(240px,360px)_1fr] gap-8">
            <aside className="lg:sticky lg:top-28 self-start rounded-lg border border-primary/15 bg-white/82 p-6 shadow-sm">
              <h3 className="text-xl font-extrabold mb-4">Ingredients</h3>
              {ingredients.length > 0 ? (
                <ul className="space-y-3 text-[#536451]">
                  {ingredients.map((ingredient, index) => (
                    <li key={`${ingredient}-${index}`} className="flex gap-3 leading-relaxed">
                      <span className="mt-2 h-2 w-2 flex-none rounded-full bg-primary" />
                      <span>{capitalizeFirstWord(ingredient)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[#667864] leading-relaxed">
                  Ingredients are not available for this recipe yet.
                </p>
              )}
            </aside>

            <article className="rounded-lg border border-primary/15 bg-white/82 p-6 md:p-8 shadow-sm">
              <h3 className="text-2xl font-extrabold mb-6">Directions</h3>
              {steps.length > 0 ? (
                <ol className="space-y-6">
                  {steps.map((step, index) => (
                    <li key={`${step}-${index}`} className="grid grid-cols-[2.5rem_1fr] gap-4">
                      <span className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-extrabold">
                        {index + 1}
                      </span>
                      <p className="text-[#3e4f3d] leading-relaxed pt-1.5">{capitalizeFirstWord(step)}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[#667864] leading-relaxed">
                  Directions are not available for this recipe yet.
                </p>
              )}
            </article>
          </section>
        </main>
      )}
    </div>
  );
};

export default RecipeDetail;

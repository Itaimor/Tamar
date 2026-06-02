import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, HeartPulse, Loader2 } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans">
      <Navbar forceSolid />

      {loading ? (
        <main className="min-h-screen flex flex-col items-center justify-center px-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="mt-4 text-gray-400">Preparing the recipe...</p>
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
              skeletonClassName="bg-zinc-900 rounded-none animate-pulse"
            />
            {(recipe.image === "/images/empty_plate.png" || !recipe.image) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-6xl font-extrabold text-white bg-black/75 px-6 py-3 rounded-xl border border-white/20 shadow-2xl tracking-wider">
                  #{recipe.id}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/55 to-black/20" />
            <div className="relative z-10 w-full px-4 md:px-12 pb-10 max-w-5xl">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight mb-4">
                {recipe.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300 mb-7">
                <span className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2">
                  <Clock className="w-4 h-4 text-primary" />
                  {recipe.time || "15m"}
                </span>
                {recipe.is_ibs_friendly && (
                  <span className="inline-flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/10 px-3 py-2 text-green-300">
                    <HeartPulse className="w-4 h-4" />
                    IBS-friendly
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="px-4 md:px-12 max-w-6xl mt-8 grid grid-cols-1 lg:grid-cols-[minmax(240px,360px)_1fr] gap-8">
            <aside className="lg:sticky lg:top-28 self-start rounded-lg border border-white/10 bg-[#181818] p-6">
              <h3 className="text-xl font-extrabold mb-4">Ingredients</h3>
              {ingredients.length > 0 ? (
                <ul className="space-y-3 text-gray-200">
                  {ingredients.map((ingredient, index) => (
                    <li key={`${ingredient}-${index}`} className="flex gap-3 leading-relaxed">
                      <span className="mt-2 h-2 w-2 flex-none rounded-full bg-primary" />
                      <span>{capitalizeFirstWord(ingredient)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 leading-relaxed">
                  Ingredients are not available for this recipe yet.
                </p>
              )}
            </aside>

            <article className="rounded-lg border border-white/10 bg-[#181818] p-6 md:p-8">
              <h3 className="text-2xl font-extrabold mb-6">Directions</h3>
              {steps.length > 0 ? (
                <ol className="space-y-6">
                  {steps.map((step, index) => (
                    <li key={`${step}-${index}`} className="grid grid-cols-[2.5rem_1fr] gap-4">
                      <span className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-extrabold">
                        {index + 1}
                      </span>
                      <p className="text-gray-100 leading-relaxed pt-1.5">{capitalizeFirstWord(step)}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-gray-400 leading-relaxed">
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

import { useState, useEffect } from "react";
import { Play, Check, BookOpen, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { fetchSavedRecipes, toggleSaveRecipe, recordRecipeInteraction } from "@/lib/recipeInteractions";
import { getRecipeById } from "@/lib/recipes";
import AuthDialog from "@/components/AuthDialog";

const CookBook = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [savedRecipes, setSavedRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const loadRecipes = async () => {
      if (user) {
        setLoading(true);
        try {
          const data = await fetchSavedRecipes(user.id);
          setSavedRecipes(data);
        } catch (error) {
          toast.error("Failed to load saved recipes.");
        } finally {
          setLoading(false);
        }
      } else {
        setSavedRecipes([]);
        setLoading(false);
      }
    };

    if (!authLoading) {
      loadRecipes();
    }
  }, [user, authLoading]);

  const handleRecipeUse = async (recipe: any) => {
    if (user) {
      await recordRecipeInteraction({
        userId: user.id,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        interactionType: "started",
      });
    }
    navigate("/app");
  };

  const handleRecipeDetails = (recipeId: string | number) => {
    navigate(`/recipes/${recipeId}`);
  };

  const handleRemoveSave = async (event: React.MouseEvent, item: any) => {
    event.stopPropagation();
    if (!user) return;

    try {
      await toggleSaveRecipe({
        userId: user.id,
        recipeId: item.recipe_id,
        recipeTitle: item.recipe_title,
        isCurrentlySaved: true,
      });

      setSavedRecipes((prev) => prev.filter((r) => r.recipe_id !== item.recipe_id));
      toast.success(`"${item.recipe_title}" removed from your CookBook.`);
    } catch (error) {
      toast.error("Failed to remove recipe.");
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans overflow-x-hidden flex flex-col">
      <Navbar forceSolid />

      <main className="flex-1 pt-28 pb-20 px-4 md:px-12 max-w-7xl mx-auto w-full flex flex-col">
        {/* Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
              <BookOpen className="w-9 h-9 text-primary" />
              My CookBook
            </h2>
            <p className="text-gray-400 mt-2 text-base">
              A curated collection of your saved recipes and culinary adventures.
            </p>
          </div>
        </div>

        {/* Content States */}
        {authLoading || loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-gray-400 mt-4 animate-pulse">Gathering your recipes...</p>
          </div>
        ) : !user ? (
          /* Unauthenticated State */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 bg-[#181818]/60 border border-white/5 rounded-2xl p-8 backdrop-blur-md shadow-2xl max-w-xl mx-auto my-12">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10 text-primary">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold mb-3">Save Your Cooking Inspiration</h3>
            <p className="text-gray-400 max-w-md mb-8 leading-relaxed">
              Create a free account to start saving recipes, tracking your cooking history, and receiving personalized recommendations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
              <Button
                onClick={() => setAuthOpen(true)}
                className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-6 text-base rounded-lg transition-transform hover:scale-105 active:scale-95"
              >
                Sign In / Sign Up
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/")}
                className="border-white/20 text-white hover:bg-white/5 font-semibold px-8 py-6 text-base rounded-lg"
              >
                Explore Recipes
              </Button>
            </div>
          </div>
        ) : savedRecipes.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 bg-[#181818]/40 border border-white/5 rounded-2xl p-8 backdrop-blur-md shadow-2xl max-w-xl mx-auto my-12">
            <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mb-6 text-primary">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold mb-3">Your CookBook is Empty</h3>
            <p className="text-gray-400 max-w-md mb-8 leading-relaxed">
              You haven't saved any recipes yet. Browse our selection and click the "+" icon to start building your personal cookbook!
            </p>
            <Button
              onClick={() => navigate("/")}
              className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-6 text-base rounded-lg transition-transform hover:scale-105 active:scale-95"
            >
              Discover Recipes
            </Button>
          </div>
        ) : (
          /* Saved Recipes Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">
            {savedRecipes.map((item) => {
              const recipeDetails = getRecipeById(item.recipe_id);
              return (
                <div
                  key={item.id}
                  className="bg-[#181818] rounded-xl border border-white/5 overflow-hidden relative group cursor-pointer transition-all duration-300 hover:scale-105 hover:z-20 hover:shadow-[0_0_30px_rgba(229,9,20,0.15)] flex flex-col"
                  onClick={() => handleRecipeDetails(item.recipe_id)}
                >
                  <div className="aspect-video w-full relative overflow-hidden">
                    <img
                      src={recipeDetails.image}
                      alt={item.recipe_title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    {(recipeDetails.image === "/images/empty_plate.png" || !recipeDetails.image) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                        <span className="text-3xl font-extrabold text-white bg-black/75 px-4 py-2 rounded-xl border border-white/20 shadow-2xl tracking-wider">
                          #{recipeDetails.id}
                        </span>
                      </div>
                    )}
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          aria-label={`Start ${item.recipe_title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRecipeUse(recipeDetails);
                          }}
                          className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <Play className="fill-black text-black w-4 h-4 ml-0.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${item.recipe_title} from CookBook`}
                          onClick={(event) => handleRemoveSave(event, item)}
                          className="w-8 h-8 bg-green-500 border border-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors"
                        >
                          <Check className="text-white w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        <span className="text-green-500">{recipeDetails.match || "95% Match"}</span>
                        <span className="border border-gray-500 px-1 rounded-sm text-gray-400">HD</span>
                        <span className="text-gray-400">{recipeDetails.time || "15m"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-base line-clamp-1 mb-1 group-hover:text-primary transition-colors">
                        {item.recipe_title}
                      </h4>
                      <p className="text-xs text-gray-500">
                        Saved {new Date(item.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-4 md:px-12 py-10 bg-[#141414] border-t border-white/5 text-gray-500 text-sm mt-auto">
        <p className="text-center text-xs">© 2026-2027 Tamar Food, Inc. All rights reserved.</p>
      </footer>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
};

export default CookBook;

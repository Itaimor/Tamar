import { motion } from "framer-motion";
import { Droplets, Moon, Brain, Clock } from "lucide-react";
import foodSalmon from "@/assets/food-salmon.jpg";
import foodRiceBowl from "@/assets/food-rice-bowl.jpg";
import foodOatmeal from "@/assets/food-oatmeal.jpg";
import foodChicken from "@/assets/food-chicken.jpg";
import foodSalad from "@/assets/food-salad.jpg";
import foodBananaToast from "@/assets/food-banana-toast.jpg";

const bristolTypes = [
  { type: 1, label: "Separate hard lumps", desc: "Hard to pass" },
  { type: 2, label: "Lumpy, sausage-shaped", desc: "Slightly constipated" },
  { type: 3, label: "Sausage with cracks", desc: "Normal" },
  { type: 4, label: "Smooth, soft sausage", desc: "Ideal" },
  { type: 5, label: "Soft blobs", desc: "Lacking fiber" },
  { type: 6, label: "Fluffy, mushy pieces", desc: "Mild diarrhea" },
  { type: 7, label: "Entirely liquid", desc: "Severe diarrhea" },
];

const selectedBristol = 4;

const safeRecipes = [
  { name: "Herb Grilled Salmon", time: "25 min", image: foodSalmon },
  { name: "Veggie Rice Bowl", time: "20 min", image: foodRiceBowl },
  { name: "Banana Oat Bowl", time: "10 min", image: foodOatmeal },
  { name: "Lemon Herb Chicken", time: "30 min", image: foodChicken },
  { name: "Garden Quinoa Salad", time: "15 min", image: foodSalad },
  { name: "PB Banana Toast", time: "5 min", image: foodBananaToast },
];

const InsightsScreen = () => {
  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">Environment & safe foods</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        {/* Daily Wellness Sliders */}
        <div className="tamar-card space-y-6 h-full">
          <h3 className="text-sm font-semibold text-foreground">Daily Wellness</h3>
          
          {/* Stress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain size={18} className="text-destructive" strokeWidth={1.5} />
                <span className="text-sm font-medium text-foreground">Stress</span>
              </div>
              <span className="text-xs font-semibold text-destructive">High (78%)</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-destructive" style={{ width: "78%" }} />
            </div>
          </div>

          {/* Sleep */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon size={18} className="text-primary" strokeWidth={1.5} />
                <span className="text-sm font-medium text-foreground">Sleep</span>
              </div>
              <span className="text-xs font-semibold text-primary">7h 30m</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: "75%" }} />
            </div>
          </div>

          {/* Hydration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets size={18} className="text-primary" strokeWidth={1.5} />
                <span className="text-sm font-medium text-foreground">Hydration</span>
              </div>
              <span className="text-xs font-semibold text-primary">2.0 / 3.0 L</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: "67%" }} />
            </div>
          </div>
        </div>

        {/* Bristol Stool Tracker */}
        <div className="tamar-card h-full flex flex-col">
          <h3 className="text-sm font-semibold text-foreground mb-4">Stool Tracker (Bristol Scale)</h3>
          <div className="grid grid-cols-7 gap-2 flex-1">
            {bristolTypes.map((b) => (
              <button
                key={b.type}
                className={`flex flex-col items-center justify-center p-2 rounded-xl text-center transition-all ${
                  selectedBristol === b.type
                    ? "bg-primary/15 ring-2 ring-primary"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                <span className={`text-xl font-bold ${selectedBristol === b.type ? "text-primary" : "text-muted-foreground"}`}>
                  {b.type}
                </span>
                <span className="text-[8px] text-muted-foreground font-medium mt-1 hidden lg:block">
                  {b.desc}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg">
            Today's log: <span className="font-semibold text-primary">Type {selectedBristol}</span> — {bristolTypes[selectedBristol - 1].desc}
          </p>
        </div>
      </div>

      {/* Safe Recipes */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Safe For You</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {safeRecipes.map((recipe, i) => (
            <motion.div
              key={recipe.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="tamar-card p-0 overflow-hidden hover:shadow-md transition-shadow"
            >
              <img
                src={recipe.image}
                alt={recipe.name}
                className="w-full h-32 object-cover"
                loading="lazy"
                width={256}
                height={128}
              />
              <div className="p-4">
                <p className="text-sm font-semibold text-foreground truncate">{recipe.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock size={12} strokeWidth={1.5} />
                    {recipe.time}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-safe/15 text-safe">
                    Low Trigger
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default InsightsScreen;

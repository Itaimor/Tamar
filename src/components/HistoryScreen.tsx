import { motion } from "framer-motion";
import foodAvocado from "@/assets/food-avocado-toast.jpg";
import foodSalmon from "@/assets/food-salmon.jpg";
import foodGingerTea from "@/assets/food-ginger-tea.jpg";
import foodOatmeal from "@/assets/food-oatmeal.jpg";
import foodChicken from "@/assets/food-chicken.jpg";
import foodSalad from "@/assets/food-salad.jpg";
import foodPasta from "@/assets/food-pasta.jpg";
import foodSmoothie from "@/assets/food-smoothie.jpg";
import foodRiceBowl from "@/assets/food-rice-bowl.jpg";
import foodBananaToast from "@/assets/food-banana-toast.jpg";

type MoodType = "great" | "good" | "bloated" | "cramping" | "neutral";

const moodConfig: Record<MoodType, { label: string; emoji: string; className: string }> = {
  great: { label: "Feeling Great", emoji: "😊", className: "bg-safe/15 text-safe" },
  good: { label: "Feeling Good", emoji: "🙂", className: "bg-primary/15 text-primary" },
  bloated: { label: "Bloated", emoji: "😣", className: "bg-warning/15 text-warning" },
  cramping: { label: "Cramping", emoji: "😖", className: "bg-destructive/15 text-destructive" },
  neutral: { label: "Neutral", emoji: "😐", className: "bg-muted text-muted-foreground" },
};

interface MealEntry {
  time: string;
  name: string;
  image: string;
  mood: MoodType;
  calories: number;
  protein: number;
}

interface DayLog {
  date: string;
  totalCalories: number;
  totalProtein: number;
  meals: MealEntry[];
}

const diaryData: DayLog[] = [
  {
    date: "Monday, April 6th",
    totalCalories: 1820,
    totalProtein: 78,
    meals: [
      { time: "8:15 AM", name: "Avocado Toast", image: foodAvocado, mood: "great", calories: 320, protein: 12 },
      { time: "12:30 PM", name: "Grilled Salmon & Veggies", image: foodSalmon, mood: "good", calories: 540, protein: 38 },
      { time: "3:00 PM", name: "Ginger Lemon Tea", image: foodGingerTea, mood: "great", calories: 10, protein: 0 },
      { time: "7:00 PM", name: "Quinoa Salad Bowl", image: foodSalad, mood: "good", calories: 450, protein: 18 },
    ],
  },
  {
    date: "Sunday, April 5th",
    totalCalories: 2010,
    totalProtein: 82,
    meals: [
      { time: "9:00 AM", name: "Oatmeal with Berries", image: foodOatmeal, mood: "great", calories: 290, protein: 10 },
      { time: "1:00 PM", name: "Garlic Pasta", image: foodPasta, mood: "bloated", calories: 620, protein: 18 },
      { time: "7:30 PM", name: "Grilled Chicken", image: foodChicken, mood: "good", calories: 480, protein: 42 },
    ],
  },
  {
    date: "Saturday, April 4th",
    totalCalories: 1740,
    totalProtein: 65,
    meals: [
      { time: "8:30 AM", name: "Berry Smoothie Bowl", image: foodSmoothie, mood: "great", calories: 310, protein: 8 },
      { time: "12:00 PM", name: "Rice & Tofu Bowl", image: foodRiceBowl, mood: "great", calories: 420, protein: 22 },
      { time: "6:30 PM", name: "Banana PB Toast", image: foodBananaToast, mood: "neutral", calories: 380, protein: 14 },
    ],
  },
  {
    date: "Friday, April 3rd",
    totalCalories: 1950,
    totalProtein: 88,
    meals: [
      { time: "7:45 AM", name: "Avocado Toast", image: foodAvocado, mood: "good", calories: 320, protein: 12 },
      { time: "12:15 PM", name: "Grilled Chicken Salad", image: foodChicken, mood: "great", calories: 490, protein: 40 },
      { time: "7:00 PM", name: "Salmon with Rice", image: foodSalmon, mood: "cramping", calories: 560, protein: 36 },
    ],
  },
  {
    date: "Thursday, April 2nd",
    totalCalories: 1680,
    totalProtein: 58,
    meals: [
      { time: "8:00 AM", name: "Oatmeal & Banana", image: foodOatmeal, mood: "great", calories: 300, protein: 10 },
      { time: "1:00 PM", name: "Quinoa Veggie Bowl", image: foodSalad, mood: "good", calories: 440, protein: 16 },
      { time: "3:30 PM", name: "Ginger Tea", image: foodGingerTea, mood: "neutral", calories: 10, protein: 0 },
      { time: "7:00 PM", name: "Rice Bowl", image: foodRiceBowl, mood: "good", calories: 420, protein: 20 },
    ],
  },
];

const HistoryScreen = () => {
  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Diary</h1>
        <p className="text-sm text-muted-foreground mt-1">Your meal history & mood log</p>
      </div>

      {diaryData.map((day, di) => (
        <motion.div
          key={day.date}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: di * 0.08 }}
        >
          {/* Day header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">{day.date}</h3>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>{day.totalCalories} kcal</span>
              <span>{day.totalProtein}g protein</span>
            </div>
          </div>

          {/* Meals */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {day.meals.map((meal, mi) => {
              const mood = moodConfig[meal.mood];
              return (
                <div key={mi} className="tamar-card flex items-center gap-3 p-4">
                  <img
                    src={meal.image}
                    alt={meal.name}
                    className="w-16 h-16 rounded-xl object-cover"
                    loading="lazy"
                    width={64}
                    height={64}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground">{meal.name}</p>
                    <p className="text-xs text-muted-foreground">{meal.time} · {meal.calories} kcal</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${mood.className}`}>
                    {mood.emoji} {mood.label}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default HistoryScreen;

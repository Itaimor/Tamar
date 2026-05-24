import { supabase } from "./supabase";

export interface RecipeItem {
  id: number;
  title: string;
  image: string;
  match?: string;
  time?: string;
}

export interface RecipeSection {
  title: string;
  items: RecipeItem[];
}

export const recipeSections: RecipeSection[] = [
  {
    title: "Curated for You",
    items: [
      { id: 1, title: "Gourmet Mediterranean Bowl", image: "/images/hero.png", match: "98%", time: "15m" },
      { id: 2, title: "Zesty Quinoa Salad", image: "/images/salad.png", match: "95%", time: "10m" },
      { id: 3, title: "Artisan Wood-Fired Pizza", image: "/images/pizza.png", match: "92%", time: "20m" },
      { id: 4, title: "Avocado Toast Deluxe", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=800&auto=format&fit=crop", match: "96%", time: "8m" },
      { id: 5, title: "Fresh Berry Smoothie", image: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?q=80&w=800&auto=format&fit=crop", match: "94%", time: "5m" },
      { id: 6, title: "Grilled Salmon with Asparagus", image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=800&auto=format&fit=crop", match: "97%", time: "25m" },
    ]
  },
  {
    title: "Trending in Your Area",
    items: [
      { id: 7, title: "Classic Margherita Pizza", image: "/images/pizza.png", match: "93%", time: "15m" },
      { id: 8, title: "Rainbow Poke Bowl", image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop", match: "95%", time: "12m" },
      { id: 9, title: "Truffle Mushroom Pasta", image: "https://images.unsplash.com/photo-1473093226795-af9932fe5856?q=80&w=800&auto=format&fit=crop", match: "91%", time: "18m" },
      { id: 10, title: "Spicy Tuna Roll", image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=800&auto=format&fit=crop", match: "94%", time: "20m" },
      { id: 11, title: "Greek Goddess Salad", image: "/images/salad.png", match: "96%", time: "10m" },
      { id: 12, title: "Wagyu Beef Burger", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=800&auto=format&fit=crop", match: "98%", time: "15m" },
    ]
  },
  {
    title: "Bursting with Flavor",
    items: [
      { id: 13, title: "Spicy Thai Red Curry", image: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?q=80&w=800&auto=format&fit=crop", match: "94%", time: "22m" },
      { id: 14, title: "Sizzling Garlic Shrimp", image: "https://images.unsplash.com/photo-1559742811-822873691df8?q=80&w=800&auto=format&fit=crop", match: "96%", time: "12m" },
      { id: 15, title: "Moroccan Spiced Lamb", image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=800&auto=format&fit=crop", match: "95%", time: "30m" },
      { id: 16, title: "Loaded Nachos Supreme", image: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?q=80&w=800&auto=format&fit=crop", match: "93%", time: "15m" },
      { id: 17, title: "Buffalo Cauliflower Wings", image: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?q=80&w=800&auto=format&fit=crop", match: "92%", time: "20m" },
      { id: 18, title: "Chipotle Chicken Tacos", image: "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?q=80&w=800&auto=format&fit=crop", match: "97%", time: "15m" },
    ]
  },
  {
    title: "Healthy & Mindful",
    items: [
      { id: 19, title: "Detox Green Bowl", image: "/images/salad.png", match: "98%", time: "10m" },
      { id: 20, title: "Roasted Sweet Potato Bowl", image: "https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?q=80&w=800&auto=format&fit=crop", match: "96%", time: "15m" },
      { id: 21, title: "Lentil & Kale Soup", image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?q=80&w=800&auto=format&fit=crop", match: "94%", time: "25m" },
      { id: 22, title: "Chia Seed Pudding", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop", match: "95%", time: "5m" },
      { id: 23, title: "Steamed Sea Bass", image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?q=80&w=800&auto=format&fit=crop", match: "93%", time: "20m" },
      { id: 24, title: "Zucchini Noodles with Pesto", image: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?q=80&w=800&auto=format&fit=crop", match: "91%", time: "12m" },
    ]
  },
  {
    title: "Quick & Satisfying",
    items: [
      { id: 25, title: "15-Minute Carbonara", image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?q=80&w=800&auto=format&fit=crop", match: "94%", time: "15m" },
      { id: 26, title: "Sheet Pan Fajitas", image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?q=80&w=800&auto=format&fit=crop", match: "96%", time: "18m" },
      { id: 27, title: "Caprese Sandwich", image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?q=80&w=800&auto=format&fit=crop", match: "95%", time: "8m" },
      { id: 28, title: "Quick Egg Fried Rice", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?q=80&w=800&auto=format&fit=crop", match: "93%", time: "12m" },
      { id: 29, title: "Hummus Veggie Wrap", image: "https://images.unsplash.com/photo-1540713434306-58505cf1b6fc?q=80&w=800&auto=format&fit=crop", match: "92%", time: "7m" },
      { id: 30, title: "Honey Garlic Chicken", image: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?q=80&w=800&auto=format&fit=crop", match: "95%", time: "15m" },
    ]
  }
];

export const getRecipeById = (recipeId: string | number): RecipeItem => {
  const numericId = typeof recipeId === "number" ? recipeId : Number(recipeId);
  for (const section of recipeSections) {
    const item = section.items.find((r) => r.id === numericId);
    if (item) return item;
  }
  
  // Fallback if recipe not found
  return {
    id: numericId,
    title: "Unknown Recipe",
    image: "/images/hero.png",
    match: "95%",
    time: "15m"
  };
};

export const fetchRecipeById = async (recipeId: string | number): Promise<RecipeItem> => {
  const numericId = typeof recipeId === "number" ? recipeId : Number(recipeId);
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", numericId)
        .maybeSingle();

      if (data && !error) {
        return {
          id: Number(data.id),
          title: data.name,
          image: data.image_url || "/images/hero.png",
          time: data.minutes ? `${data.minutes}m` : "15m",
          ingredients: data.ingredients,
          steps: data.steps,
          description: data.description,
          is_ibs_friendly: data.is_ibs_friendly,
        };
      }
    } catch (err) {
      console.error("Failed to fetch recipe from Supabase:", err);
    }
  }

  // Fallback to local hardcoded recipes
  return getRecipeById(numericId);
};

export const fetchRecipesByIds = async (recipeIds: (string | number)[]): Promise<RecipeItem[]> => {
  const numericIds = recipeIds.map(id => typeof id === "number" ? id : Number(id));
  
  if (supabase && numericIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .in("id", numericIds);

      if (data && !error) {
        const mapped = data.map((item: any) => ({
          id: Number(item.id),
          title: item.name,
          image: item.image_url || "/images/hero.png",
          time: item.minutes ? `${item.minutes}m` : "15m",
          ingredients: item.ingredients,
          steps: item.steps,
          description: item.description,
          is_ibs_friendly: item.is_ibs_friendly,
        }));
        
        // Sort according to input recipeIds order
        return numericIds
          .map(id => mapped.find(m => m.id === id))
          .filter((item): item is RecipeItem => !!item);
      }
    } catch (err) {
      console.error("Failed to fetch recipes from Supabase:", err);
    }
  }

  // Fallback
  return numericIds.map(id => getRecipeById(id));
};

export const fetchDefaultRecipes = async (limit: number = 12): Promise<RecipeItem[]> => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .limit(limit);

      if (data && !error) {
        return data.map((item: any) => ({
          id: Number(item.id),
          title: item.name,
          image: item.image_url || "/images/hero.png",
          time: item.minutes ? `${item.minutes}m` : "15m",
          ingredients: item.ingredients,
          steps: item.steps,
          description: item.description,
          is_ibs_friendly: item.is_ibs_friendly,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch default recipes from Supabase:", err);
    }
  }

  // Fallback to all local recipes
  const allLocal = recipeSections.flatMap(sec => sec.items);
  return allLocal.slice(0, limit);
};

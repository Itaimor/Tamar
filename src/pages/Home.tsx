import { Play, Plus, Info, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { recordRecipeInteraction } from "@/lib/recipeInteractions";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const sections = [
    {
      title: "Curated for You",
      items: [
        { id: 1, title: "Gourmet Mediterranean Bowl", image: "/images/hero.png" },
        { id: 2, title: "Zesty Quinoa Salad", image: "/images/salad.png" },
        { id: 3, title: "Artisan Wood-Fired Pizza", image: "/images/pizza.png" },
        { id: 4, title: "Avocado Toast Deluxe", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=800&auto=format&fit=crop" },
        { id: 5, title: "Fresh Berry Smoothie", image: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?q=80&w=800&auto=format&fit=crop" },
        { id: 6, title: "Grilled Salmon with Asparagus", image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=800&auto=format&fit=crop" },
      ]
    },
    {
      title: "Trending in Your Area",
      items: [
        { id: 7, title: "Classic Margherita Pizza", image: "/images/pizza.png" },
        { id: 8, title: "Rainbow Poke Bowl", image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop" },
        { id: 9, title: "Truffle Mushroom Pasta", image: "https://images.unsplash.com/photo-1473093226795-af9932fe5856?q=80&w=800&auto=format&fit=crop" },
        { id: 10, title: "Spicy Tuna Roll", image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=800&auto=format&fit=crop" },
        { id: 11, title: "Greek Goddess Salad", image: "/images/salad.png" },
        { id: 12, title: "Wagyu Beef Burger", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=800&auto=format&fit=crop" },
      ]
    },
    {
      title: "Bursting with Flavor",
      items: [
        { id: 13, title: "Spicy Thai Red Curry", image: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?q=80&w=800&auto=format&fit=crop" },
        { id: 14, title: "Sizzling Garlic Shrimp", image: "https://images.unsplash.com/photo-1559742811-822873691df8?q=80&w=800&auto=format&fit=crop" },
        { id: 15, title: "Moroccan Spiced Lamb", image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=800&auto=format&fit=crop" },
        { id: 16, title: "Loaded Nachos Supreme", image: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?q=80&w=800&auto=format&fit=crop" },
        { id: 17, title: "Buffalo Cauliflower Wings", image: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?q=80&w=800&auto=format&fit=crop" },
        { id: 18, title: "Chipotle Chicken Tacos", image: "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?q=80&w=800&auto=format&fit=crop" },
      ]
    },
    {
      title: "Healthy & Mindful",
      items: [
        { id: 19, title: "Detox Green Bowl", image: "/images/salad.png" },
        { id: 20, title: "Roasted Sweet Potato Bowl", image: "https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?q=80&w=800&auto=format&fit=crop" },
        { id: 21, title: "Lentil & Kale Soup", image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?q=80&w=800&auto=format&fit=crop" },
        { id: 22, title: "Chia Seed Pudding", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop" },
        { id: 23, title: "Steamed Sea Bass", image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?q=80&w=800&auto=format&fit=crop" },
        { id: 24, title: "Zucchini Noodles with Pesto", image: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?q=80&w=800&auto=format&fit=crop" },
      ]
    },
    {
      title: "Quick & Satisfying",
      items: [
        { id: 25, title: "15-Minute Carbonara", image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?q=80&w=800&auto=format&fit=crop" },
        { id: 26, title: "Sheet Pan Fajitas", image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?q=80&w=800&auto=format&fit=crop" },
        { id: 27, title: "Caprese Sandwich", image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?q=80&w=800&auto=format&fit=crop" },
        { id: 28, title: "Quick Egg Fried Rice", image: "https://images.unsplash.com/photo-1512058560366-cd2427ff06d0?q=80&w=800&auto=format&fit=crop" },
        { id: 29, title: "Hummus Veggie Wrap", image: "https://images.unsplash.com/photo-1540713434306-58505cf1b6fc?q=80&w=800&auto=format&fit=crop" },
        { id: 30, title: "Honey Garlic Chicken", image: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?q=80&w=800&auto=format&fit=crop" },
      ]
    }
  ];

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
        
        <div className="absolute bottom-[15%] left-4 md:left-12 max-w-2xl animate-in fade-in slide-in-from-left-8 duration-1000">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-primary/20 text-primary border border-primary/50 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Featured</span>
            <span className="text-gray-300 text-xs font-semibold tracking-widest uppercase">Recipe of the Day</span>
          </div>
          <h2 className="text-5xl md:text-7xl font-black mb-6 tracking-tight leading-tight">
            Mediterranean <br /> Harvest Bowl
          </h2>
          <p className="text-lg md:text-xl text-gray-200 mb-8 line-clamp-3 font-medium max-w-lg leading-relaxed">
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
              className="bg-white text-black hover:bg-white/90 gap-3 px-8 py-7 text-xl font-bold transition-all hover:scale-105 active:scale-95"
            >
              <Play className="fill-current w-6 h-6" /> Start Cooking
            </Button>
            <Button 
              variant="secondary" 
              className="bg-gray-500/40 text-white hover:bg-gray-500/60 gap-3 px-8 py-7 text-xl font-bold backdrop-blur-xl border border-white/10 transition-all hover:scale-105 active:scale-95"
            >
              <Info className="w-6 h-6" /> More Info
            </Button>
          </div>
        </div>
      </div>

      {/* Content Rows */}
      <div className="pb-24 -mt-32 md:-mt-48 relative z-10 space-y-12">
        {sections.map((section, idx) => (
          <div key={idx} className="pl-4 md:pl-12 group/row">
            <div className="flex items-center justify-between pr-4 md:pr-12 mb-3">
              <h3 className="text-xl md:text-2xl font-bold text-white/90 group-hover/row:text-white transition-colors flex items-center gap-2">
                {section.title}
                <ChevronRight className="w-5 h-5 opacity-0 group-hover/row:opacity-100 transition-all -ml-2 group-hover/row:ml-0" />
              </h3>
            </div>
            
            <div className="relative">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-6 pr-12 scroll-smooth">
                {section.items.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex-none w-[220px] md:w-[320px] aspect-video relative group cursor-pointer rounded-sm overflow-hidden transition-all duration-300 hover:scale-110 hover:z-30 shadow-2xl"
                  >
                    <img 
                      src={item.image} 
                      alt={item.title} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                    />
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
                        <div className="w-8 h-8 border-2 border-gray-400 rounded-full flex items-center justify-center hover:border-white transition-colors">
                          <Plus className="text-white w-4 h-4" />
                        </div>
                        <div className="ml-auto w-8 h-8 border-2 border-gray-400 rounded-full flex items-center justify-center hover:border-white transition-colors">
                          <ChevronRight className="text-white w-4 h-4 rotate-90" />
                        </div>
                      </div>
                      <p className="font-bold text-sm md:text-base mb-1">{item.title}</p>
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        <span className="text-green-500">98% Match</span>
                        <span className="border border-gray-500 px-1 rounded-sm text-gray-400">HD</span>
                        <span className="text-gray-400">15m</span>
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

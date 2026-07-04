import { useEffect, useState } from "react";
import { ArrowRight, HeartPulse, Leaf, Sparkles, UserPlus } from "lucide-react";
import { useLocation } from "react-router-dom";
import AuthDialog from "@/components/AuthDialog";
import { Button } from "@/components/ui/button";

const Landing = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const location = useLocation();

  useEffect(() => {
    if (location.state?.openSignIn) {
      openAuth("signin");
      // Clear location state to avoid reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const openAuth = (mode: "signup" | "signin") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="wellness-canvas min-h-screen text-foreground font-sans w-full max-w-full overflow-x-hidden">
      <header className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-primary/10 bg-[#fbf7ec]/85 px-4 py-3 shadow-sm shadow-primary/5 backdrop-blur-xl sm:px-6 md:px-12 lg:px-16 xl:px-24">
        <div className="flex items-center gap-2">
          <img src="/favicon.ico" alt="Tamar Logo" className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg border border-primary/20 shadow-sm" />
          <span className="text-xl sm:text-2xl font-black italic tracking-tighter text-primary">TAMAR</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => openAuth("signin")}
            className="text-foreground hover:bg-primary/10 hover:text-primary h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
          >
            Sign in
          </Button>
          <Button
            type="button"
            onClick={() => openAuth("signup")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 text-xs shadow-sm shadow-primary/20 sm:h-10 sm:px-4 sm:text-sm"
          >
            <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Sign up
          </Button>
        </div>
      </header>

      <main className="relative flex min-h-[92dvh] flex-col justify-between px-4 pb-8 pt-24 sm:px-6 md:px-12 lg:px-16 xl:px-24 max-w-full overflow-x-hidden">
        <img src="/images/hero.png" alt="Fresh Mediterranean bowl with herbs and vegetables" className="absolute right-8 top-28 hidden h-[430px] max-h-[58vh] w-[38%] rounded-[2rem] bg-white/45 object-contain p-3 opacity-95 shadow-2xl shadow-primary/10 md:block xl:w-[36%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#fbf7ec] via-[#fbf7ec] md:via-[#fbf7ec] md:to-[#fbf7ec]/62" />
        <section className="relative z-10 flex flex-1 items-center py-8 sm:py-12 md:py-14 lg:py-18">
          <div className="w-full max-w-full md:max-w-[46%] xl:max-w-[50%]">
            <div className="mb-4 sm:mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-white/70 px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-primary shadow-sm">
              <HeartPulse className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Gut-friendly wellness
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight w-full break-words text-[#1f3d2b]">
              Food that feels good<br />for your body<br />and your gut.
            </h1>
            <p className="mt-4 sm:mt-6 max-w-xl text-sm sm:text-base md:text-lg lg:text-xl font-medium leading-relaxed text-[#4d624e]">
              Tamar learns your taste, digestion patterns, and IBS preferences to recommend recipes that feel nourishing, calm, and realistic for everyday cooking.
            </p>
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Button
                type="button"
                onClick={() => openAuth("signup")}
                className="h-12 sm:h-14 bg-primary px-5 sm:px-7 text-sm sm:text-base font-bold text-primary-foreground hover:bg-primary/90 w-full sm:w-auto flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                Create account
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => openAuth("signin")}
                className="h-12 sm:h-14 border border-primary/20 bg-white/70 px-5 sm:px-7 text-sm sm:text-base font-bold text-primary backdrop-blur-xl hover:bg-white w-full sm:w-auto whitespace-normal sm:whitespace-nowrap text-center flex items-center justify-center"
              >
                I already have an account
              </Button>
            </div>
          </div>
        </section>

        <section className="relative z-10 w-full mt-12 lg:mt-auto">
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:gap-6 xl:gap-8 max-w-full">
            {[
              ["Digestive context", "Log meals and symptoms so patterns become visible."],
              ["Gentle guidance", "Recipes are shaped around IBS-aware preferences."],
              ["Taste still matters", "Healthier recommendations stay appetizing and personal."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-lg border border-primary/15 bg-white/75 p-4 shadow-sm backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2 text-xs sm:text-sm sm:text-base font-bold text-[#1f3d2b]">
                  {title === "Digestive context" ? (
                    <HeartPulse className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  ) : title === "Gentle guidance" ? (
                    <Leaf className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent" />
                  )}
                  {title}
                </div>
                <p className="text-[11px] sm:text-xs sm:text-sm leading-relaxed text-[#5e6f5d]">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} />
    </div>
  );
};

export default Landing;

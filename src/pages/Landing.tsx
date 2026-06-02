import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, Sparkles, UserPlus } from "lucide-react";
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
    <div className="min-h-screen bg-[#141414] text-white font-sans w-full max-w-full overflow-x-hidden">
      <header className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between px-4 py-3 sm:px-6 md:px-12 lg:px-16 xl:px-24">
        <div className="flex items-center gap-2">
          <img src="/favicon.ico" alt="Tamar Logo" className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg border border-primary/20 shadow-lg" />
          <span className="text-xl sm:text-2xl font-black italic tracking-tighter">TAMAR</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => openAuth("signin")}
            className="text-white hover:bg-white/10 hover:text-white h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
          >
            Sign in
          </Button>
          <Button
            type="button"
            onClick={() => openAuth("signup")}
            className="bg-white text-black hover:bg-white/90 h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
          >
            <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Sign up
          </Button>
        </div>
      </header>

      <main className="relative flex min-h-[100dvh] flex-col justify-between px-4 pb-8 pt-24 sm:px-6 md:px-12 lg:px-16 xl:px-24 max-w-full overflow-x-hidden">
        <img src="/images/hero.png" alt="Mediterranean harvest bowl" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-black/30" />

        <section className="relative z-10 flex flex-1 items-center py-8 sm:py-12 md:py-20 lg:py-24">
          <div className="w-full max-w-full lg:max-w-6xl xl:max-w-7xl">
            <div className="mb-4 sm:mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-primary">
              <LockKeyhole className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Members only
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.05] sm:leading-[0.95] tracking-tight sm:tracking-normal w-full max-w-none break-words">
              Personalized IBS recipes<br />unlocked by your taste.
            </h1>
            <p className="mt-4 sm:mt-6 max-w-xl md:max-w-2xl lg:max-w-4xl text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-medium leading-relaxed text-gray-200">
              Tamar learns from what you view, save, and cook, then curates recipes from the Food.com collaborative-filtering model for your own homepage.
            </p>
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Button
                type="button"
                onClick={() => openAuth("signup")}
                className="h-12 sm:h-14 bg-white px-5 sm:px-7 text-sm sm:text-base font-bold text-black hover:bg-white/90 w-full sm:w-auto flex items-center justify-center gap-2"
              >
                Create account
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => openAuth("signin")}
                className="h-12 sm:h-14 border border-white/10 bg-white/15 px-5 sm:px-7 text-sm sm:text-base font-bold text-white backdrop-blur-xl hover:bg-white/25 w-full sm:w-auto whitespace-normal sm:whitespace-nowrap text-center flex items-center justify-center"
              >
                I already have an account
              </Button>
            </div>
          </div>
        </section>

        <section className="relative z-10 w-full mt-12 lg:mt-auto">
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:gap-6 xl:gap-8 max-w-full">
            {[
              ["Private cookbook", "Saved recipes stay tied to your account."],
              ["Live recommendations", "Your homepage updates from recent activity."],
              ["Food.com CF model", "Suggestions come from the trained artifact."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-md border border-white/10 bg-black/35 p-4 backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2 text-xs sm:text-sm sm:text-base font-bold text-white">
                  <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400" />
                  {title}
                </div>
                <p className="text-[11px] sm:text-xs sm:text-sm leading-relaxed text-gray-300">{description}</p>
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

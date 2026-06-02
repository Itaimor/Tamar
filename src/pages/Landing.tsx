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
    <div className="min-h-screen bg-[#141414] text-white font-sans">
      <header className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between px-5 py-4 md:px-12">
        <div className="flex items-center gap-2">
          <img src="/favicon.ico" alt="Tamar Logo" className="h-9 w-9 rounded-lg border border-primary/20 shadow-lg" />
          <span className="text-2xl font-black italic tracking-tighter">TAMAR</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => openAuth("signin")}
            className="text-white hover:bg-white/10 hover:text-white"
          >
            Sign in
          </Button>
          <Button
            type="button"
            onClick={() => openAuth("signup")}
            className="bg-white text-black hover:bg-white/90"
          >
            <UserPlus className="h-4 w-4" />
            Sign up
          </Button>
        </div>
      </header>

      <main className="relative flex min-h-screen flex-col justify-between px-5 pb-12 pt-28 md:px-12">
        <img src="/images/hero.png" alt="Mediterranean harvest bowl" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-black/30" />

        <section className="relative z-10 flex flex-1 items-center py-12 md:py-20">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
              <LockKeyhole className="h-3.5 w-3.5" />
              Members only
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-normal md:text-7xl">
              Personalized IBS-friendly recipes, unlocked by your taste.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-medium leading-relaxed text-gray-200 md:text-xl">
              Tamar learns from what you view, save, and cook, then curates recipes from the Food.com collaborative-filtering model for your own homepage.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={() => openAuth("signup")}
                className="h-14 bg-white px-7 text-base font-bold text-black hover:bg-white/90"
              >
                Create account
                <ArrowRight className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => openAuth("signin")}
                className="h-14 border border-white/10 bg-white/15 px-7 text-base font-bold text-white backdrop-blur-xl hover:bg-white/25"
              >
                I already have an account
              </Button>
            </div>
          </div>
        </section>

        <section className="relative z-10 w-full mt-auto">
          <div className="grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-3">
            {[
              ["Private cookbook", "Saved recipes stay tied to your account."],
              ["Live recommendations", "Your homepage updates from recent activity."],
              ["Food.com CF model", "Suggestions come from the trained artifact."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-md border border-white/10 bg-black/35 p-4 backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                  <Sparkles className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {title}
                </div>
                <p className="text-sm leading-relaxed text-gray-300">{description}</p>
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

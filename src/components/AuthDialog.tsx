import { FormEvent, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/AuthProvider";

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "signup" | "signin";
};

const getFriendlyAuthError = (error: unknown) => {
  if (!(error instanceof Error)) return "Authentication failed.";

  const message = error.message || "";
  if (message.toLowerCase().includes("failed to fetch")) {
    return "Tamar could not reach Supabase. Check VITE_SUPABASE_URL in .env.local, then restart the dev server.";
  }

  return message;
};

const AuthDialog = ({ open, onOpenChange, initialMode = "signup" }: AuthDialogProps) => {
  const { configured, signIn, signOut, signUp, signInWithProvider, user } = useAuth();
  const [mode, setMode] = useState<"signup" | "signin">(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
    }
  }, [initialMode, open]);

  const handlePasswordAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);

    try {
      if (mode === "signup") {
        const result = await signUp({ email, password, fullName });
        if (result.needsEmailConfirmation) {
          toast.success("Account created. You can sign in now.");
          setMode("signin");
        } else {
          toast.success("Account created.");
          onOpenChange(false);
        }
      } else {
        await signIn({ email, password });
        toast.success("Welcome back.");
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(getFriendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleProvider = async () => {
    setBusy(true);

    try {
      await signInWithProvider("google");
    } catch (error) {
      toast.error(getFriendlyAuthError(error));
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);

    try {
      await signOut();
      toast.success("Signed out.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/15 bg-[#fbf7ec] text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {user ? "Your Tamar Account" : mode === "signup" ? "Create your account" : "Sign in"}
          </DialogTitle>
          <DialogDescription className="text-[#667864]">
            {user
              ? "Your recipe activity will be saved for future recommendations."
              : "Save your preferences and recipe history for personalized IBS-friendly recommendations."}
          </DialogDescription>
        </DialogHeader>

        {!configured && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Supabase is not configured yet. Add your Vite environment variables before real signups can be saved.
          </div>
        )}

        {user ? (
          <div className="space-y-4">
            <div className="rounded-md border border-primary/10 bg-white/65 p-4">
              <p className="text-sm text-[#667864]">Signed in as</p>
              <p className="font-semibold">{user.email}</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full bg-secondary text-foreground hover:bg-secondary/80"
              onClick={handleSignOut}
              disabled={busy}
            >
              {busy && <Loader2 className="animate-spin" />}
              Sign out
            </Button>
          </div>
      ) : (
        <div className="space-y-5">
          <div>
            <Button
              type="button"
              variant="secondary"
              className="w-full bg-white text-foreground hover:bg-secondary"
              onClick={handleProvider}
              disabled={busy || !configured}
            >
              <Mail />
              Continue with Google
            </Button>
          </div>

          <div className="flex items-center gap-3 text-xs uppercase text-[#667864]">
            <div className="h-px flex-1 bg-primary/10" />
            <span>Email</span>
            <div className="h-px flex-1 bg-primary/10" />
          </div>

            <form className="space-y-4" onSubmit={handlePasswordAuth}>
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your name"
                    required
                    className="border-primary/15 bg-white/70"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  className="border-primary/15 bg-white/70"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                  className="border-primary/15 bg-white/70"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !configured}>
                {busy && <Loader2 className="animate-spin" />}
                {mode === "signup" ? "Sign up" : "Sign in"}
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-[#536451] hover:bg-primary/10 hover:text-primary"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;

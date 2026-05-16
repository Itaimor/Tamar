import { FormEvent, useState } from "react";
import { CheckCircle2, Facebook, Loader2, Mail } from "lucide-react";
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
};

const AuthDialog = ({ open, onOpenChange }: AuthDialogProps) => {
  const { configured, signIn, signOut, signUp, signInWithProvider, user } = useAuth();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

  const handlePasswordAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);

    try {
      if (mode === "signup") {
        const result = await signUp({ email, password, fullName });
        if (result.needsEmailConfirmation) {
          setConfirmationEmail(email);
          toast.success("Check your email to confirm your account.");
          return;
        }
        toast.success("Account created.");
      } else {
        await signIn({ email, password });
        toast.success("Welcome back.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleProvider = async (provider: "google" | "facebook") => {
    setBusy(true);

    try {
      await signInWithProvider(provider);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start social login.");
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
      <DialogContent className="border-white/10 bg-[#181818] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {user ? "Your Tamar Account" : mode === "signup" ? "Create your account" : "Sign in"}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
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
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-400">Signed in as</p>
              <p className="font-semibold">{user.email}</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full bg-white/10 text-white hover:bg-white/15"
              onClick={handleSignOut}
              disabled={busy}
            >
              {busy && <Loader2 className="animate-spin" />}
              Sign out
            </Button>
          </div>
      ) : (
        <div className="space-y-5">
          {confirmationEmail && (
            <div className="rounded-md border border-primary/40 bg-primary/10 p-4 text-sm text-gray-200">
              <div className="mb-2 flex items-center gap-2 font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Confirm your email to finish signing up
              </div>
              <p>
                We sent a confirmation link to <span className="font-semibold text-white">{confirmationEmail}</span>.
                Open that email and confirm your account before signing in.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="secondary"
                className="bg-white text-black hover:bg-white/90"
                onClick={() => handleProvider("google")}
                disabled={busy || !configured}
              >
                <Mail />
                Google
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="bg-[#1877f2] text-white hover:bg-[#166fe5]"
                onClick={() => handleProvider("facebook")}
                disabled={busy || !configured}
              >
                <Facebook />
                Facebook
              </Button>
            </div>

            <div className="flex items-center gap-3 text-xs uppercase text-gray-500">
              <div className="h-px flex-1 bg-white/10" />
              <span>Email</span>
              <div className="h-px flex-1 bg-white/10" />
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
                    className="border-white/10 bg-black/20"
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
                  className="border-white/10 bg-black/20"
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
                  className="border-white/10 bg-black/20"
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
              className="w-full text-gray-300 hover:bg-white/5 hover:text-white"
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

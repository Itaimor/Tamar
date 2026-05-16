import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signUp: (details: { email: string; password: string; fullName: string }) => Promise<{ needsEmailConfirmation: boolean }>;
  signIn: (details: { email: string; password: string }) => Promise<void>;
  signInWithProvider: (provider: "google" | "facebook") => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        saveProfile(data.session.user);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        saveProfile(nextSession.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const saveProfile = async (user: User, fullName?: string) => {
    if (!supabase) return;

    const name =
      fullName ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Tamar user";

    await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name: name,
      avatar_url: user.user_metadata?.avatar_url || null,
      updated_at: new Date().toISOString(),
    });
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured: isSupabaseConfigured,
      signUp: async ({ email, password, fullName }) => {
        if (!supabase) throw new Error("Supabase is not configured yet.");

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;
        if (data.user) await saveProfile(data.user, fullName);
        return { needsEmailConfirmation: !data.session };
      },
      signIn: async ({ email, password }) => {
        if (!supabase) throw new Error("Supabase is not configured yet.");

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await saveProfile(data.user);
      },
      signInWithProvider: async (provider) => {
        if (!supabase) throw new Error("Supabase is not configured yet.");

        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: window.location.origin,
          },
        });

        if (error) throw error;
      },
      signOut: async () => {
        if (!supabase) return;

        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};

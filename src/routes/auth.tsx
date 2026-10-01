import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";

function safePath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/shelf";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({ redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined }),
  head: () => ({
    meta: [
      { title: "Sign in — Tucked Away" },
      { name: "description", content: "Sign in to open your journal shelf and journals shared with you." },
      { property: "og:title", content: "Sign in — Tucked Away" },
      { property: "og:description", content: "Open your journal shelf and journals shared with you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const target = safePath(redirect);
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const go = () => void navigate({ to: target, replace: true });
    void supabase.auth.getUser().then(({ data }) => { if (data.user) go(); });
    const { data } = supabase.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_IN" && session) go(); });
    return () => data.subscription.unsubscribe();
  }, [navigate, target]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${target}` } });
      setMessage(error ? error.message : "Almost there — check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setMessage(error ? error.message : "If that email has an account, a reset link is on its way.");
    }
    setBusy(false);
  };

  const google = async () => {
    window.sessionStorage.setItem("tucked-away-after-login", target);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth?redirect=${encodeURIComponent(target)}` });
    if (result.error) setMessage(result.error.message);
  };

  return (
    <main className="auth-desk">
      <section className="auth-card">
        <div className="brand-lockup"><Sparkles size={17} /><span>Tucked Away</span></div>
        <h1>{mode === "signup" ? "Start your shelf" : mode === "forgot" ? "Forgot your password?" : "Welcome back"}</h1>
        <form onSubmit={(event) => void submit(event)}>
          <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          {mode !== "forgot" && <label>Password<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>}
          <Button type="submit" disabled={busy}>{mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</Button>
        </form>
        {mode !== "forgot" && <><div className="auth-or">or</div><Button type="button" variant="outline" onClick={() => void google()}>Continue with Google</Button></>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <div className="auth-switch">
          {mode === "signin" ? <><button type="button" onClick={() => setMode("signup")}>New here? Create an account</button><button type="button" onClick={() => setMode("forgot")}>Forgot password?</button></> : <button type="button" onClick={() => setMode("signin")}>Back to sign in</button>}
        </div>
      </section>
    </main>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Tucked Away" },
      { name: "description", content: "Choose a new password for your Tucked Away account." },
      { property: "og:title", content: "Reset password — Tucked Away" },
      { property: "og:description", content: "Choose a new password for your journal account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  return (
    <main className="auth-desk">
      <section className="auth-card">
        <h1>Choose a new password</h1>
        <form onSubmit={(event) => { event.preventDefault(); void supabase.auth.updateUser({ password }).then(({ error }) => { if (error) setMessage(error.message); else void navigate({ to: "/shelf" }); }); }}>
          <label>New password<input type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
          <Button type="submit">Save password</Button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
      </section>
    </main>
  );
}

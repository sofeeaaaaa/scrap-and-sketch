import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tucked Away — Junk Journal Studio" },
      { name: "description", content: "A tactile, freeform digital junk journal for collecting photos, scraps, notes, and little memories — alone or with friends." },
      { property: "og:title", content: "Tucked Away — Junk Journal Studio" },
      { property: "og:description", content: "Make cozy, layered junk journals with photos, tape, stickers, and your own handwriting. Share them with friends." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))); }, []);
  return (
    <main className="landing-desk">
      <div className="landing-book cover-rust"><span className="cover-label">Tucked Away</span></div>
      <section className="landing-copy">
        <div className="brand-lockup"><Sparkles size={17} /><span>Tucked Away</span><small>junk journal</small></div>
        <h1>Little things worth keeping.</h1>
        <p>Layer photos, tape, tickets and notes on textured paper — in your own handwriting. Keep journals private, or invite a friend to make pages with you.</p>
        <Link to="/shelf" className="paper-button primary-paper-button">{signedIn ? "Open my shelf" : "Sign in to start"}</Link>
      </section>
    </main>
  );
}

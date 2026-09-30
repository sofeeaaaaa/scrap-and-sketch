import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import BookViewer, { type SharedJournal } from "@/components/journal/BookViewer";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "A shared journal — Tucked Away" },
      { name: "description", content: "Flip through a junk journal someone shared with you." },
      { property: "og:title", content: "A shared journal — Tucked Away" },
      { property: "og:description", content: "Flip through a handmade digital junk journal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedJournalPage,
});

function SharedJournalPage() {
  const { token } = Route.useParams();
  const [journal, setJournal] = useState<SharedJournal | null | undefined>(undefined);
  useEffect(() => {
    void supabase.rpc("get_shared_journal", { _token: token }).then(({ data }) => setJournal((data as SharedJournal | null) ?? null));
  }, [token]);
  if (journal === undefined) return <main className="studio-loading" aria-label="Opening journal" />;
  if (journal === null) return <main className="studio-loading"><div className="studio-missing"><p>This link isn't open anymore. Ask the owner for a new one.</p></div></main>;
  return <BookViewer journal={journal} />;
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { COVERS } from "@/components/journal/types";
import { type JournalMeta, createJournal, deleteJournal, ensureProfile, listJournals } from "@/lib/journalCloud";
import { migrateLocalData } from "@/lib/migrateLocal";

export const Route = createFileRoute("/_authenticated/shelf")({
  head: () => ({
    meta: [
      { title: "Your shelf — Tucked Away" },
      { name: "description", content: "All your junk journals, plus the ones friends have shared with you." },
      { property: "og:title", content: "Your shelf — Tucked Away" },
      { property: "og:description", content: "Your junk journals and journals shared with you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Shelf,
});

function Book({ journal, owner, onDelete }: { journal: JournalMeta; owner?: string; onDelete?: () => void }) {
  return (
    <div className="shelf-book-wrap">
      <Link to="/journal/$journalId" params={{ journalId: journal.id }} className={`shelf-book cover-${journal.cover}`}>
        <span className="cover-label">{journal.title}</span>
        {owner && <small className="cover-owner">from {owner}</small>}
      </Link>
      {onDelete && <button type="button" className="book-delete" aria-label={`Delete ${journal.title}`} title="Delete journal" onClick={onDelete}><Trash2 size={13} /></button>}
    </div>
  );
}

function Shelf() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [journals, setJournals] = useState<JournalMeta[] | null>(null);
  const [owners, setOwners] = useState<Array<{ id: string; email: string; display_name: string | null }>>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("New journal");
  const [cover, setCover] = useState("moss");
  const [note, setNote] = useState("");

  const refresh = async () => { const result = await listJournals(); setJournals(result.journals); setOwners(result.owners); };

  useEffect(() => {
    void (async () => {
      await ensureProfile(user);
      if (await migrateLocalData(user.id)) setNote("Your journal and handwriting from this browser are now saved to your account.");
      await refresh();
    })();
  }, [user]);

  const mine = journals?.filter((journal) => journal.owner_id === user.id) ?? [];
  const shared = journals?.filter((journal) => journal.owner_id !== user.id) ?? [];
  const ownerName = (id: string) => { const owner = owners.find((entry) => entry.id === id); return owner?.display_name ?? owner?.email ?? "a friend"; };

  const signOut = async () => {
    await queryClient.cancelQueries(); queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  };

  return (
    <main className="shelf-room">
      <header className="studio-header">
        <div className="brand-lockup"><Sparkles size={17} /><span>Tucked Away</span><small>your shelf</small></div>
        <div className="header-actions"><span className="shelf-email">{user.email}</span><button type="button" className="paper-button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button></div>
      </header>
      {note && <p className="shelf-note" role="status">{note}</p>}
      <section className="shelf-section">
        <div className="shelf-heading"><h2>My journals</h2><Button type="button" size="sm" onClick={() => setCreating((value) => !value)}><Plus /> New journal</Button></div>
        {creating && <form className="new-journal" onSubmit={(event) => { event.preventDefault(); void createJournal(title.trim() || "New journal", cover).then((id) => navigate({ to: "/journal/$journalId", params: { journalId: id } })); }}>
          <label>Title<input value={title} maxLength={48} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="cover-picker" role="radiogroup" aria-label="Cover">{Object.entries(COVERS).map(([key, label]) => <button type="button" role="radio" aria-checked={cover === key} key={key} title={label} className={`cover-swatch cover-${key} ${cover === key ? "active" : ""}`} onClick={() => setCover(key)} />)}</div>
          <Button type="submit">Make it</Button>
        </form>}
        <div className="shelf-row">
          {journals === null ? <p className="shelf-empty">Dusting off the shelf…</p> : mine.length === 0 ? <p className="shelf-empty">No journals yet — start one above.</p> : mine.map((journal) => <Book key={journal.id} journal={journal} onDelete={() => { if (window.confirm(`Delete “${journal.title}” for everyone?`)) void deleteJournal(journal.id).then(refresh); }} />)}
        </div>
      </section>
      <section className="shelf-section">
        <div className="shelf-heading"><h2>Shared with me</h2></div>
        <div className="shelf-row">
          {journals !== null && shared.length === 0 ? <p className="shelf-empty">When someone invites {user.email}, their journal will appear here.</p> : shared.map((journal) => <Book key={journal.id} journal={journal} owner={ownerName(journal.owner_id)} />)}
        </div>
      </section>
    </main>
  );
}

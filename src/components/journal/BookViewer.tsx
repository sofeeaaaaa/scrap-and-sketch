import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { ItemContent } from "./JournalStudio";
import type { HandwritingProfile } from "./handwriting";
import type { JournalPage } from "./types";

export type SharedJournal = { title: string; cover: string; pages: JournalPage[]; profiles: HandwritingProfile[] };

function ReadOnlyPage({ page, number, side, profiles }: { page: JournalPage | undefined; number: number; side: "left" | "right"; profiles: HandwritingProfile[] }) {
  if (!page) return <article className={`journal-page blank-companion ${side}-page`}><p>the end</p></article>;
  return (
    <article className={`journal-page paper-${page.paper} ${side}-page`}>
      <span className="page-corner-mark">{String(number).padStart(2, "0")}</span>
      {[...page.items].sort((a, b) => a.z - b.z).map((item) => (
        <div key={item.id} className="journal-item" style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height: `${item.height}%`, transform: `rotate(${item.rotation}deg)`, zIndex: 1, cursor: "default" }}>
          <ItemContent item={item} profiles={profiles} />
        </div>
      ))}
    </article>
  );
}

export default function BookViewer({ journal }: { journal: SharedJournal }) {
  // spread -1 is the closed cover; spread n shows pages 2n and 2n+1.
  const [spread, setSpread] = useState(-1);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const lastSpread = Math.max(0, Math.ceil(journal.pages.length / 2) - 1);

  const go = (direction: 1 | -1) => {
    const next = Math.max(-1, Math.min(lastSpread, spread + direction));
    if (next === spread || turning) return;
    setTurning(direction === 1 ? "next" : "prev");
    window.setTimeout(() => { setSpread(next); setTurning(null); }, 380);
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "ArrowRight") go(1); if (event.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return (
    <main className="viewer-desk">
      <header className="viewer-header"><Sparkles size={16} /><span>{journal.title}</span><small>view only</small></header>
      <section className="viewer-stage">
        <button type="button" aria-label="Previous page" className="page-arrow page-arrow-left" disabled={spread === -1} onClick={() => go(-1)}><ChevronLeft /></button>
        {spread === -1 ? (
          <button type="button" className={`book-cover cover-${journal.cover} ${turning === "next" ? "cover-opening" : ""}`} onClick={() => go(1)} aria-label="Open the journal">
            <span className="cover-label">{journal.title}</span>
            <small>tap to open</small>
          </button>
        ) : (
          <div className={`journal-spread ${turning ? `viewer-turn-${turning}` : ""}`}>
            <ReadOnlyPage page={journal.pages[spread * 2]} number={spread * 2 + 1} side="left" profiles={journal.profiles} />
            <ReadOnlyPage page={journal.pages[spread * 2 + 1]} number={spread * 2 + 2} side="right" profiles={journal.profiles} />
            <div className="book-seam" />
          </div>
        )}
        <button type="button" aria-label="Next page" className="page-arrow page-arrow-right" disabled={spread === lastSpread} onClick={() => go(1)}><ChevronRight /></button>
      </section>
      <footer className="viewer-footer">{spread === -1 ? "cover" : `pages ${spread * 2 + 1}–${Math.min(journal.pages.length, spread * 2 + 2)} of ${journal.pages.length}`}</footer>
    </main>
  );
}

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Download,
  FileImage,
  ImagePlus,
  NotebookPen,
  Palette,
  Layers,
  Plus,
  RotateCw,
  Scissors,
  SendToBack,
  Share2,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "@tanstack/react-router";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import HandwritingStudio from "./HandwritingStudio";
import { HandwritingText } from "./HandwritingText";
import SharePanel from "./SharePanel";
import type { HandwritingProfile } from "./handwriting";
import { deleteProfile, loadProfiles, loadProfilesByIds, saveProfile } from "./handwritingStorage";
import { type Frame, type JournalItem, type JournalPage, type JournalState, type Kind, type Paper, makeId, personColor } from "./types";
import {
  type JournalMeta,
  type Person,
  currentUser,
  downscaleImage,
  ensureProfile,
  itemKey,
  loadJournal,
  loadPeople,
  pageKey,
  pushChanges,
  rowToItem,
  snapshotOf,
} from "@/lib/journalCloud";

export const LOCAL_STORAGE_KEY = "tucked-away-journal-v1";
const PAPER_NAMES: Record<Paper, string> = {
  vintage: "Vintage",
  lined: "Lined",
  graph: "Graph",
  kraft: "Kraft",
  torn: "Notebook",
};

const craftItems: Array<{ kind: Kind; content: string; label: string }> = [
  { kind: "sticker", content: "🌼", label: "Pressed daisy" },
  { kind: "sticker", content: "🍄", label: "Mushroom" },
  { kind: "sticker", content: "🦋", label: "Butterfly" },
  { kind: "tape", content: "botanical", label: "Botanical tape" },
  { kind: "tape", content: "gingham", label: "Gingham tape" },
  { kind: "scrap", content: "A little note\nfor a lovely day", label: "Paper note" },
  { kind: "ticket", content: "ADMIT ONE\nNo. 0427", label: "Ticket" },
  { kind: "stamp", content: "POST", label: "Postmark" },
  { kind: "doodle", content: "✦ 〰 ✦", label: "Doodle" },
];

function ToolButton({ label, onClick, active, children }: { label: string; onClick?: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`tool-button ${active ? "tool-button-active" : ""}`}>
      {children}
    </button>
  );
}

export function ItemContent({ item, profiles = [] }: { item: JournalItem; profiles?: HandwritingProfile[] }) {
  if (item.kind === "image") {
    return (
      <div className={`image-frame frame-${item.frame ?? "none"}`}>
        <img src={item.content} alt="Journal clipping" draggable={false} style={{ objectPosition: `${item.cropX ?? 50}% ${item.cropY ?? 50}%` }} />
      </div>
    );
  }
  if (item.kind === "text") return <div className="journal-writing"><HandwritingText itemId={item.id} text={item.content} profile={profiles.find((profile) => profile.id === item.profileId)} color={item.inkColor ?? "#3b302a"} size={item.fontSize ?? 28} /></div>;
  if (item.kind === "sticker") return <div className="sticker-art">{item.content}</div>;
  if (item.kind === "tape") return <div className={`tape-strip tape-${item.content}`} />;
  if (item.kind === "ticket") return <div className="ticket-art">{item.content}</div>;
  if (item.kind === "stamp") return <div className="stamp-art">{item.content}</div>;
  if (item.kind === "doodle") return <div className="doodle-art">{item.content}</div>;
  return <div className="paper-scrap">{item.content}</div>;
}

function EditableItem({ item, selected, profiles, tag, onSelect, onChange, onDelete }: {
  item: JournalItem;
  selected: boolean;
  profiles: HandwritingProfile[];
  tag?: { label: string; name: string; color: string } | undefined;
  onSelect: () => void;
  onChange: (patch: Partial<JournalItem>) => void;
  onDelete: () => void;
}) {
  const startDrag = (event: ReactPointerEvent) => {
    if ((event.target as HTMLElement).closest("[data-handle]")) return;
    event.stopPropagation();
    onSelect();
    const target = event.currentTarget as HTMLElement;
    const parent = target.parentElement;
    if (!parent) return;
    const bounds = parent.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = item.x;
    const originY = item.y;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => onChange({
      x: Math.max(-5, Math.min(95, originX + ((moveEvent.clientX - startX) / bounds.width) * 100)),
      y: Math.max(-5, Math.min(95, originY + ((moveEvent.clientY - startY) / bounds.height) * 100)),
    });
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const startResize = (event: ReactPointerEvent) => {
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const parent = handle.parentElement?.parentElement;
    if (!parent) return;
    const bounds = parent.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const width = item.width;
    const height = item.height;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => onChange({
      width: Math.max(8, Math.min(90, width + ((moveEvent.clientX - startX) / bounds.width) * 100)),
      height: Math.max(6, Math.min(90, height + ((moveEvent.clientY - startY) / bounds.height) * 100)),
    });
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  return (
    <div
      className={`journal-item ${selected ? "journal-item-selected" : ""}`}
      style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height: `${item.height}%`, transform: `rotate(${item.rotation}deg)`, zIndex: item.z }}
      onPointerDown={startDrag}
      onDoubleClick={() => item.kind === "text" && onSelect()}
      role="button"
      tabIndex={0}
      aria-label={`${item.kind} element`}
      onKeyDown={(event) => event.key === "Delete" && onDelete()}
    >
      <ItemContent item={item} profiles={profiles} />
      {tag && <span className="maker-tag" title={`Added by ${tag.name}`} style={{ background: tag.color }}>{tag.label}</span>}
      {selected && <button type="button" data-handle="resize" aria-label="Resize item" className="resize-handle" onPointerDown={startResize} />}
    </div>
  );
}

type ItemRow = { id: string; page_id: string; data: never; created_by: string | null };
type PageRow = { id: string; title: string; paper: string; position: number };

export default function JournalStudio({ journalId }: { journalId: string }) {
  const [journal, setJournal] = useState<JournalState>({ pages: [], active: 0 });
  const [meta, setMeta] = useState<JournalMeta | null>(null);
  const [userId, setUserId] = useState<string>();
  const [userEmail, setUserEmail] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [goTo, setGoTo] = useState<{ key: string; nonce: number }>();
  const [tab, setTab] = useState<"supplies" | "paper">("supplies");
  const [profiles, setProfiles] = useState<HandwritingProfile[]>([]);
  const [foreignProfiles, setForeignProfiles] = useState<HandwritingProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>();
  const [handwritingOpen, setHandwritingOpen] = useState(false);
  const spreadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);
  const snapshot = useRef(new Map<string, string>());
  const sentKeys = useRef(new Map<string, string>());
  const requestedProfiles = useRef(new Set<string>());

  const refreshPeople = useCallback(async () => {
    if (meta) setPeople(await loadPeople(journalId, meta.owner_id));
  }, [journalId, meta]);

  useEffect(() => {
    let cancelled = false;
    hydrated.current = false;
    void (async () => {
      const user = await currentUser();
      if (user) { setUserId(user.id); setUserEmail(user.email?.toLowerCase() ?? ""); await ensureProfile(user); }
      const loaded = await loadJournal(journalId);
      if (cancelled) return;
      if (!loaded) { setLoadError("This journal isn't on your shelf, or its owner stopped sharing it."); return; }
      snapshot.current = snapshotOf(loaded.pages);
      setMeta(loaded.meta);
      setJournal({ pages: loaded.pages.length ? loaded.pages : [{ id: makeId(), title: "Page 1", paper: "vintage", items: [] }], active: 0 });
      hydrated.current = true;
      setPeople(await loadPeople(journalId, loaded.meta.owner_id));
    })().catch(() => !cancelled && setLoadError("This journal couldn't be opened. Please try again."));
    return () => { cancelled = true; };
  }, [journalId]);

  useEffect(() => {
    void loadProfiles().then((stored) => {
      setProfiles(stored);
      setActiveProfileId((current) => current ?? stored[0]?.id);
    });
  }, []);

  // Fetch handwriting belonging to other people so their text renders correctly.
  useEffect(() => {
    const known = new Set([...profiles, ...foreignProfiles].map((profile) => profile.id));
    const missing = [...new Set(journal.pages.flatMap((page) => page.items.map((item) => item.profileId).filter((id): id is string => Boolean(id))))].filter((id) => !known.has(id) && !requestedProfiles.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => requestedProfiles.current.add(id));
    void loadProfilesByIds(missing).then((found) => setForeignProfiles((current) => [...current, ...found]));
  }, [journal.pages, profiles, foreignProfiles]);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      const pages = journal.pages;
      const previous = snapshot.current;
      const next = snapshotOf(pages);
      let changed = previous.size !== next.size;
      next.forEach((value, key) => { if (previous.get(key) !== value) { changed = true; sentKeys.current.set(key, value); } });
      if (!changed) return;
      snapshot.current = next;
      void pushChanges(journalId, previous, pages)
        .then(() => { setSyncError(false); setSaved(true); window.setTimeout(() => setSaved(false), 1400); })
        .catch(() => { snapshot.current = previous; setSyncError(true); });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [journal.pages, journalId]);

  // Live updates from collaborators.
  useEffect(() => {
    if (!meta) return;
    const removeItem = (id: string) => {
      snapshot.current.delete(`i:${id}`);
      setJournal((current) => ({ ...current, pages: current.pages.map((page) => page.items.some((item) => item.id === id) ? { ...page, items: page.items.filter((item) => item.id !== id) } : page) }));
    };
    const upsertItem = (row: ItemRow) => {
      if (!row?.data) return;
      const item = rowToItem(row);
      const key = itemKey(item, row.page_id);
      if (sentKeys.current.get(`i:${item.id}`) === key) { sentKeys.current.delete(`i:${item.id}`); return; }
      snapshot.current.set(`i:${item.id}`, key);
      setJournal((current) => ({ ...current, pages: current.pages.map((page) => {
        const without = page.items.filter((entry) => entry.id !== item.id);
        if (page.id === row.page_id) return { ...page, items: [...without, item] };
        return without.length === page.items.length ? page : { ...page, items: without };
      }) }));
    };
    const upsertPage = (row: PageRow) => {
      const page: JournalPage = { id: row.id, title: row.title, paper: row.paper as Paper, items: [] };
      const key = pageKey(page, row.position);
      if (sentKeys.current.get(`p:${row.id}`) === key) { sentKeys.current.delete(`p:${row.id}`); return; }
      snapshot.current.set(`p:${row.id}`, key);
      setJournal((current) => {
        const existing = current.pages.find((entry) => entry.id === row.id);
        const others = current.pages.filter((entry) => entry.id !== row.id);
        const merged = existing ? { ...existing, title: row.title, paper: page.paper } : page;
        const pages = [...others];
        pages.splice(Math.max(0, Math.min(pages.length, row.position)), 0, merged);
        return { ...current, pages };
      });
    };
    const removePage = (id: string) => {
      snapshot.current.delete(`p:${id}`);
      setJournal((current) => {
        if (!current.pages.some((page) => page.id === id)) return current;
        const pages = current.pages.filter((page) => page.id !== id);
        return { pages, active: Math.min(current.active, Math.max(0, pages.length - 1)) };
      });
    };
    const filter = `journal_id=eq.${journalId}`;
    const channel = supabase
      .channel(`journal-${journalId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "journal_items", filter }, (payload) => upsertItem(payload.new as ItemRow))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "journal_items", filter }, (payload) => upsertItem(payload.new as ItemRow))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "journal_items" }, (payload) => { const id = (payload.old as { id?: string }).id; if (id) removeItem(id); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "journal_pages", filter }, (payload) => upsertPage(payload.new as PageRow))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "journal_pages", filter }, (payload) => upsertPage(payload.new as PageRow))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "journal_pages" }, (payload) => { const id = (payload.old as { id?: string }).id; if (id) removePage(id); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [meta, journalId]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((entry) => entry.type.startsWith("image/"));
      if (file) addImage(file);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  const selectedItem = journal.pages.flatMap((page) => page.items).find((item) => item.id === selected);
  const allProfiles = useMemo(() => [...profiles, ...foreignProfiles.filter((profile) => !profiles.some((own) => own.id === profile.id))], [profiles, foreignProfiles]);
  const isOwner = Boolean(meta && userId && meta.owner_id === userId);
  const tagFor = (item: JournalItem) => {
    if (people.length < 2 || !item.createdBy) return undefined;
    const person = people.find((entry) => entry.userId === item.createdBy);
    const name = person?.name ?? "Someone";
    return { label: name.charAt(0).toUpperCase(), name: item.createdBy === userId ? "you" : name, color: personColor(item.createdBy) };
  };

  if (loadError) return <main className="studio-loading" role="alert"><div className="studio-missing"><p>{loadError}</p><Link to="/shelf" className="paper-button">Back to the shelf</Link></div></main>;
  if (journal.pages.length === 0) return <main className="studio-loading" aria-label="Opening journal"><Sparkles size={22} /></main>;

  const updatePage = (pageId: string, updater: (page: JournalPage) => JournalPage) => {
    setJournal((current) => ({ ...current, pages: current.pages.map((page) => page.id === pageId ? updater(page) : page) }));
  };

  const addItem = (kind: Kind, content: string, pageId = journal.pages[journal.active]?.id) => {
    if (!pageId) return;
    const sizes: Record<Kind, [number, number]> = { text: [42, 15], image: [42, 34], sticker: [18, 18], tape: [34, 8], scrap: [42, 24], ticket: [28, 15], stamp: [18, 13], doodle: [28, 10] };
    const [width, height] = sizes[kind];
    const item: JournalItem = { id: makeId(), kind, content, x: 25, y: 28, width, height, rotation: kind === "text" ? -1 : 2, z: Date.now(), createdBy: userId ?? null, ...(kind === "image" ? { frame: "polaroid" as const } : {}), ...(kind === "text" ? { ...(activeProfileId ? { profileId: activeProfileId } : {}), inkColor: "#3b302a", fontSize: 28 } : {}) };
    updatePage(pageId, (page) => ({ ...page, items: [...page.items, item] }));
    setSelected(item.id);
  };

  const addImage = (file: File, pageId?: string) => {
    if (!file.type.startsWith("image/")) return;
    void downscaleImage(file).then((data) => addItem("image", data, pageId));
  };

  const patchItem = (pageId: string, id: string, patch: Partial<JournalItem>) => updatePage(pageId, (page) => ({
    ...page,
    items: page.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));

  const removeItem = (pageId: string, id: string) => {
    updatePage(pageId, (page) => ({ ...page, items: page.items.filter((item) => item.id !== id) }));
    setSelected(null);
  };

  const selectedAction = (action: "forward" | "back" | "duplicate" | "delete") => {
    const page = journal.pages.find((candidate) => candidate.items.some((item) => item.id === selected));
    const item = page?.items.find((candidate) => candidate.id === selected);
    if (!page || !item) return;
    if (action === "delete") return removeItem(page.id, item.id);
    if (action === "duplicate") {
      const copy = { ...item, id: makeId(), x: item.x + 4, y: item.y + 4, z: Date.now(), createdBy: userId ?? null };
      updatePage(page.id, (current) => ({ ...current, items: [...current.items, copy] }));
      return setSelected(copy.id);
    }
    patchItem(page.id, item.id, { z: action === "forward" ? Math.max(...page.items.map((entry) => entry.z), 0) + 1 : Math.min(...page.items.map((entry) => entry.z), 0) - 1 });
  };

  const addPage = () => {
    const page: JournalPage = { id: makeId(), title: `Page ${journal.pages.length + 1}`, paper: "vintage", items: [] };
    setJournal((current) => ({ ...current, pages: [...current.pages, page], active: current.pages.length }));
    setGoTo({ key: page.id, nonce: Date.now() });
  };
  const deletePage = () => setJournal((current) => {
    if (current.pages.length === 1) return current;
    const pages = current.pages.filter((_, index) => index !== current.active);
    return { pages, active: Math.min(current.active, pages.length - 1) };
  });

  const exportPng = async () => {
    if (!spreadRef.current) return;
    setSelected(null);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    const data = await toPng(spreadRef.current, { pixelRatio: 2, cacheBust: true });
    const link = document.createElement("a");
    link.download = "my-journal-spread.png";
    link.href = data;
    link.click();
  };

  const exportPdf = () => {
    setSelected(null);
    window.setTimeout(() => {
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".journal-page"));
      void Promise.all(pages.map((page) => toPng(page, { pixelRatio: 2 }))).then((images) => {
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        images.forEach((image, index) => { if (index) pdf.addPage(); pdf.addImage(image, "PNG", 15, 15, 180, 267, undefined, "FAST"); });
        pdf.save("my-junk-journal.pdf");
      });
    }, 60);
  };

  const persistProfile = (profile: HandwritingProfile) => {
    void saveProfile(profile).then(() => {
      setProfiles((current) => [...current.filter((entry) => entry.id !== profile.id), profile]);
      setActiveProfileId(profile.id);
    });
  };

  const removeProfile = (id: string) => {
    void deleteProfile(id).then(() => {
      setProfiles((current) => current.filter((profile) => profile.id !== id));
      setActiveProfileId((current) => current === id ? undefined : current);
    });
  };

  return (
    <main className="studio-shell" onClick={() => setSelected(null)}>
      <header className="studio-header">
        <div className="brand-lockup"><Link to="/shelf" className="shelf-back" aria-label="Back to the shelf" title="Back to the shelf"><ArrowLeft size={16} /></Link><span>{meta?.title ?? "Tucked Away"}</span><small>{isOwner ? "your journal" : "shared with you"}</small></div>
        <div className={`save-note ${saved || syncError ? "save-note-visible" : ""}`}>{syncError ? "couldn't save yet — keep going, we'll retry" : "tucked safely away ✓"}</div>
        <div className="header-actions">
          {people.length > 1 && <div className="people-dots" aria-label="People in this journal">{people.map((person) => <span key={person.key} title={`${person.name}${person.role === "owner" ? " (owner)" : ""}`} style={{ background: personColor(person.key) }}>{person.name.charAt(0).toUpperCase()}</span>)}</div>}
          <button type="button" className="paper-button" onClick={(event) => { event.stopPropagation(); setShareOpen(true); }}><Share2 size={16} /> Share</button>
          <button type="button" className="paper-button" onClick={exportPng}><FileImage size={16} /> Save image</button>
          <button type="button" className="paper-button primary-paper-button" onClick={exportPdf}><Download size={16} /> Export PDF</button>
        </div>
      </header>

      <section className="studio-body">
        <aside className="supply-drawer" onClick={(event) => event.stopPropagation()}>
          <div className="drawer-tabs">
            <button type="button" onClick={() => setTab("supplies")} className={tab === "supplies" ? "active" : ""}><Scissors size={16} /> Supplies</button>
            <button type="button" onClick={() => setTab("paper")} className={tab === "paper" ? "active" : ""}><Layers size={16} /> Paper</button>
          </div>
          {tab === "supplies" ? (
            <div className="supply-content">
              <div className="quick-add">
                <button type="button" onClick={() => addItem("text", "Write something...")}><Type size={20} /><span>Text</span></button>
                <button type="button" onClick={() => fileRef.current?.click()}><Upload size={20} /><span>Photo</span></button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files?.[0] && addImage(event.target.files[0])} />
              </div>
              <button type="button" className="handwriting-launch" onClick={() => setHandwritingOpen(true)}><NotebookPen size={19} /><span><strong>My Handwriting</strong><small>{profiles.length ? `${profiles.length} saved profile${profiles.length === 1 ? "" : "s"}` : "Turn your writing into type"}</small></span></button>
              <p className="drawer-label">Bits & pieces</p>
              <div className="supply-grid">
                {craftItems.map((supply, index) => (
                  <button type="button" key={`${supply.label}-${index}`} className={`supply-piece supply-${supply.kind}`} title={supply.label} onClick={() => addItem(supply.kind, supply.content)}>
                    <ItemContent item={{ id: "preview", x: 0, y: 0, width: 100, height: 100, rotation: 0, z: 0, ...supply }} profiles={profiles} />
                  </button>
                ))}
              </div>
              <div className="paste-note"><ImagePlus size={17} /><span>Drop a photo anywhere<br />or paste with ⌘/Ctrl + V</span></div>
            </div>
          ) : (
            <div className="paper-picker">
              <p className="drawer-label">Page texture</p>
              {(Object.keys(PAPER_NAMES) as Paper[]).map((paper) => (
                <button type="button" key={paper} className={journal.pages[journal.active]?.paper === paper ? "active" : ""} onClick={() => {
                  const page = journal.pages[journal.active];
                  if (page) updatePage(page.id, (current) => ({ ...current, paper }));
                }}>
                  <span className={`paper-swatch paper-${paper}`} />{PAPER_NAMES[paper]}
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="desk-stage">
          {selectedItem && (
            <div className="floating-tools" onClick={(event) => event.stopPropagation()}>
              <ToolButton label="Rotate left" onClick={() => {
                const page = journal.pages.find((candidate) => candidate.items.some((item) => item.id === selectedItem.id));
                if (page) patchItem(page.id, selectedItem.id, { rotation: selectedItem.rotation - 8 });
              }}><RotateCw className="rotate-left-icon" size={16} /></ToolButton>
              <span className="rotation-readout">{selectedItem.rotation}°</span>
              <ToolButton label="Rotate right" onClick={() => {
                const page = journal.pages.find((candidate) => candidate.items.some((item) => item.id === selectedItem.id));
                if (page) patchItem(page.id, selectedItem.id, { rotation: selectedItem.rotation + 8 });
              }}><RotateCw size={16} /></ToolButton>
              <i />
              <ToolButton label="Bring forward" onClick={() => selectedAction("forward")}><Layers size={16} /></ToolButton>
              <ToolButton label="Send backward" onClick={() => selectedAction("back")}><SendToBack size={16} /></ToolButton>
              <ToolButton label="Duplicate" onClick={() => selectedAction("duplicate")}><Copy size={16} /></ToolButton>
              {selectedItem.kind === "image" && <ToolButton label="Cycle image frame" onClick={() => {
                const page = journal.pages.find((candidate) => candidate.items.some((item) => item.id === selectedItem.id));
                const next: Record<Frame, Frame> = { none: "polaroid", polaroid: "torn", torn: "none" };
                if (page) patchItem(page.id, selectedItem.id, { frame: next[selectedItem.frame ?? "none"] });
              }}><Crop size={16} /></ToolButton>}
              <ToolButton label="Delete" onClick={() => selectedAction("delete")}><Trash2 size={16} /></ToolButton>
              {selectedItem.kind === "text" && <><i /><label className="ink-control" title="Ink color"><Palette size={15} /><input aria-label="Ink color" type="color" value={selectedItem.inkColor ?? "#3b302a"} onChange={(event) => {
                const page = journal.pages.find((candidate) => candidate.items.some((item) => item.id === selectedItem.id));
                if (page) patchItem(page.id, selectedItem.id, { inkColor: event.target.value });
              }} /></label><label className="size-control">Size <input aria-label="Text size" type="range" min="14" max="58" value={selectedItem.fontSize ?? 28} onChange={(event) => {
                const page = journal.pages.find((candidate) => candidate.items.some((item) => item.id === selectedItem.id));
                if (page) patchItem(page.id, selectedItem.id, { fontSize: Number(event.target.value) });
              }} /></label><select aria-label="Handwriting profile" value={selectedItem.profileId ?? ""} onChange={(event) => {
                const page = journal.pages.find((candidate) => candidate.items.some((item) => item.id === selectedItem.id));
                if (page) patchItem(page.id, selectedItem.id, event.target.value ? { profileId: event.target.value } : { profileId: "" });
              }}><option value="">Default pen</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}{selectedItem.profileId && !profiles.some((profile) => profile.id === selectedItem.profileId) && <option value={selectedItem.profileId}>{foreignProfiles.find((profile) => profile.id === selectedItem.profileId)?.name ?? "Their handwriting"}</option>}</select></>}
            </div>
          )}

          {selectedItem?.kind === "text" && <div className="text-editor-panel" onClick={(event) => event.stopPropagation()}><textarea aria-label="Edit journal text" autoFocus value={selectedItem.content} onChange={(event) => {
            const page = journal.pages.find((candidate) => candidate.items.some((item) => item.id === selectedItem.id));
            if (page) patchItem(page.id, selectedItem.id, { content: event.target.value });
          }} /></div>}

          <FlipBook
            bookRef={spreadRef}
            goTo={goTo}
            onFlipStart={() => setSelected(null)}
            onVisibleChange={(keys) => {
              const index = journal.pages.findIndex((page) => keys.includes(page.id));
              if (index >= 0 && index !== journal.active) setJournal((current) => ({ ...current, active: index }));
            }}
            faces={bookFaces(journal.pages, meta?.title ?? "", meta?.cover ?? "rust", (page, interactive, side) => {
              const number = journal.pages.indexOf(page) + 1;
              if (!interactive) return <StaticPage page={page} number={number} side={side} profiles={allProfiles} tagFor={tagFor} />;
              return (
                <article
                  className={`journal-page paper-${page.paper} ${side === "left" ? "left-page" : "right-page"}`}
                  onClick={(event) => event.stopPropagation()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) addImage(file, page.id); }}
                >
                  <span className="page-corner-mark">{String(number).padStart(2, "0")}</span>
                  {page.items.map((item) => (
                    <EditableItem key={item.id} item={item} profiles={allProfiles} tag={tagFor(item)} selected={selected === item.id} onSelect={() => setSelected(item.id)} onChange={(patch) => patchItem(page.id, item.id, patch)} onDelete={() => removeItem(page.id, item.id)} />
                  ))}
                  {page.items.length === 0 && <div className="empty-page"><span>✦</span><p>make a little mess</p><small>drop, paste, or choose something from the drawer</small></div>}
                </article>
              );
            })}
          />
        </section>
      </section>

      <footer className="page-dock" onClick={(event) => event.stopPropagation()}>
        <div className="dock-pages">
          {journal.pages.map((page, index) => (
            <button
              type="button"
              draggable
              key={page.id}
              className={`page-thumbnail ${index === journal.active ? "active" : ""}`}
              onClick={() => { setJournal((current) => ({ ...current, active: index })); setGoTo({ key: page.id, nonce: Date.now() }); }}
              onDragStart={(event) => event.dataTransfer.setData("text/page-index", String(index))}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const from = Number(event.dataTransfer.getData("text/page-index"));
                if (!Number.isInteger(from) || from === index) return;
                setJournal((current) => {
                  const pages = [...current.pages]; const [moved] = pages.splice(from, 1); if (!moved) return current; pages.splice(index, 0, moved);
                  return { pages, active: index };
                });
              }}
            >
              <span className={`mini-paper paper-${page.paper}`}><small>{index + 1}</small></span>
              <em>{page.title}</em>
            </button>
          ))}
          <button type="button" className="add-page-button" onClick={addPage}><Plus size={18} /><span>Add page</span></button>
        </div>
        <div className="dock-actions">
          <button type="button" onClick={deletePage} title="Delete current page"><Trash2 size={16} /></button>
          <span>{journal.active + 1} / {journal.pages.length}</span>
        </div>
      </footer>
      {handwritingOpen && <HandwritingStudio profiles={profiles} activeId={activeProfileId} onSave={persistProfile} onDelete={removeProfile} onSelect={setActiveProfileId} onClose={() => setHandwritingOpen(false)} />}
      {shareOpen && meta && <SharePanel journalId={journalId} title={meta.title} isOwner={isOwner} userEmail={userEmail} people={people} onChanged={() => void refreshPeople()} onClose={() => setShareOpen(false)} />}
    </main>
  );
}
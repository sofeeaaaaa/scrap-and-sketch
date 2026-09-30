import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Download,
  FileImage,
  FilePlus2,
  ImagePlus,
  Layers,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCw,
  Scissors,
  SendToBack,
  Sparkles,
  Stamp,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

type Paper = "vintage" | "lined" | "graph" | "kraft" | "torn";
type Kind = "text" | "image" | "sticker" | "tape" | "scrap" | "ticket" | "stamp" | "doodle";
type Frame = "none" | "polaroid" | "torn";

type JournalItem = {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  content: string;
  frame?: Frame;
  cropX?: number;
  cropY?: number;
};

type JournalPage = { id: string; title: string; paper: Paper; items: JournalItem[] };
type JournalState = { pages: JournalPage[]; active: number };

const STORAGE_KEY = "tucked-away-journal-v1";
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

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function starterState(): JournalState {
  return {
    active: 0,
    pages: [
      {
        id: makeId(),
        title: "Found things",
        paper: "vintage",
        items: [
          { id: makeId(), kind: "text", x: 9, y: 9, width: 45, height: 14, rotation: -2, z: 2, content: "little things worth keeping" },
          { id: makeId(), kind: "ticket", x: 62, y: 13, width: 28, height: 15, rotation: 5, z: 3, content: "ADMIT ONE\nNo. 0427" },
          { id: makeId(), kind: "scrap", x: 12, y: 50, width: 40, height: 24, rotation: 3, z: 1, content: "September notes\n\nslow mornings, old songs,\nand the smell of rain" },
          { id: makeId(), kind: "sticker", x: 68, y: 56, width: 18, height: 18, rotation: -9, z: 4, content: "🌼" },
          { id: makeId(), kind: "tape", x: 30, y: 44, width: 31, height: 8, rotation: -5, z: 5, content: "botanical" },
        ],
      },
      {
        id: makeId(),
        title: "Daydreams",
        paper: "lined",
        items: [
          { id: makeId(), kind: "text", x: 12, y: 12, width: 48, height: 13, rotation: 1, z: 2, content: "notes from nowhere" },
          { id: makeId(), kind: "doodle", x: 60, y: 28, width: 28, height: 10, rotation: 8, z: 1, content: "✦ 〰 ✦" },
          { id: makeId(), kind: "scrap", x: 16, y: 48, width: 55, height: 23, rotation: -2, z: 3, content: "Collect moments,\nnot things." },
        ],
      },
      { id: makeId(), title: "Oddments", paper: "kraft", items: [] },
    ],
  };
}

function ToolButton({ label, onClick, active, children }: { label: string; onClick?: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`tool-button ${active ? "tool-button-active" : ""}`}>
      {children}
    </button>
  );
}

function ItemContent({ item }: { item: JournalItem }) {
  if (item.kind === "image") {
    return (
      <div className={`image-frame frame-${item.frame ?? "none"}`}>
        <img src={item.content} alt="Journal clipping" draggable={false} style={{ objectPosition: `${item.cropX ?? 50}% ${item.cropY ?? 50}%` }} />
      </div>
    );
  }
  if (item.kind === "text") return <div className="journal-writing">{item.content}</div>;
  if (item.kind === "sticker") return <div className="sticker-art">{item.content}</div>;
  if (item.kind === "tape") return <div className={`tape-strip tape-${item.content}`} />;
  if (item.kind === "ticket") return <div className="ticket-art">{item.content}</div>;
  if (item.kind === "stamp") return <div className="stamp-art">{item.content}</div>;
  if (item.kind === "doodle") return <div className="doodle-art">{item.content}</div>;
  return <div className="paper-scrap">{item.content}</div>;
}

function EditableItem({ item, selected, onSelect, onChange, onDelete }: {
  item: JournalItem;
  selected: boolean;
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
      onDoubleClick={() => item.kind === "text" && onChange({ content: window.prompt("Edit your note", item.content) ?? item.content })}
      role="button"
      tabIndex={0}
      aria-label={`${item.kind} element`}
      onKeyDown={(event) => event.key === "Delete" && onDelete()}
    >
      <ItemContent item={item} />
      {selected && <button type="button" data-handle="resize" aria-label="Resize item" className="resize-handle" onPointerDown={startResize} />}
    </div>
  );
}

export default function JournalStudio() {
  const [journal, setJournal] = useState<JournalState>(starterState);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [turning, setTurning] = useState(false);
  const [tab, setTab] = useState<"supplies" | "paper">("supplies");
  const spreadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setJournal(JSON.parse(stored) as JournalState); } catch { window.localStorage.removeItem(STORAGE_KEY); }
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [journal]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((entry) => entry.type.startsWith("image/"));
      if (file) addImage(file);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  const visiblePages = useMemo(
    () => [journal.pages[journal.active], journal.pages[journal.active + 1]].filter((page): page is JournalPage => page !== undefined),
    [journal],
  );
  const selectedItem = journal.pages.flatMap((page) => page.items).find((item) => item.id === selected);

  const updatePage = (pageId: string, updater: (page: JournalPage) => JournalPage) => {
    setJournal((current) => ({ ...current, pages: current.pages.map((page) => page.id === pageId ? updater(page) : page) }));
  };

  const addItem = (kind: Kind, content: string, pageId = journal.pages[journal.active]?.id) => {
    if (!pageId) return;
    const sizes: Record<Kind, [number, number]> = { text: [42, 15], image: [42, 34], sticker: [18, 18], tape: [34, 8], scrap: [42, 24], ticket: [28, 15], stamp: [18, 13], doodle: [28, 10] };
    const [width, height] = sizes[kind];
    const item: JournalItem = { id: makeId(), kind, content, x: 25, y: 28, width, height, rotation: kind === "text" ? -1 : 2, z: Date.now(), ...(kind === "image" ? { frame: "polaroid" as const } : {}) };
    updatePage(pageId, (page) => ({ ...page, items: [...page.items, item] }));
    setSelected(item.id);
  };

  const addImage = (file: File, pageId?: string) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && addItem("image", reader.result, pageId);
    reader.readAsDataURL(file);
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
      const copy = { ...item, id: makeId(), x: item.x + 4, y: item.y + 4, z: Date.now() };
      updatePage(page.id, (current) => ({ ...current, items: [...current.items, copy] }));
      return setSelected(copy.id);
    }
    patchItem(page.id, item.id, { z: action === "forward" ? Math.max(...page.items.map((entry) => entry.z), 0) + 1 : Math.min(...page.items.map((entry) => entry.z), 0) - 1 });
  };

  const turn = (direction: number) => {
    const next = Math.max(0, Math.min(journal.pages.length - 1, journal.active + direction));
    if (next === journal.active) return;
    setTurning(true);
    window.setTimeout(() => { setJournal((current) => ({ ...current, active: next })); setSelected(null); setTurning(false); }, 180);
  };

  const addPage = () => setJournal((current) => ({ ...current, pages: [...current.pages, { id: makeId(), title: `Page ${current.pages.length + 1}`, paper: "vintage", items: [] }], active: current.pages.length }));
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

  return (
    <main className="studio-shell" onClick={() => setSelected(null)}>
      <header className="studio-header">
        <div className="brand-lockup"><Sparkles size={17} /><span>Tucked Away</span><small>junk journal</small></div>
        <div className={`save-note ${saved ? "save-note-visible" : ""}`}>tucked safely away ✓</div>
        <div className="header-actions">
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
              <p className="drawer-label">Bits & pieces</p>
              <div className="supply-grid">
                {craftItems.map((supply, index) => (
                  <button type="button" key={`${supply.label}-${index}`} className={`supply-piece supply-${supply.kind}`} title={supply.label} onClick={() => addItem(supply.kind, supply.content)}>
                    <ItemContent item={{ id: "preview", x: 0, y: 0, width: 100, height: 100, rotation: 0, z: 0, ...supply }} />
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
            </div>
          )}

          <button type="button" aria-label="Previous page" className="page-arrow page-arrow-left" onClick={() => turn(-1)}><ChevronLeft /></button>
          <div ref={spreadRef} className={`journal-spread ${turning ? "page-turning" : ""}`}>
            {visiblePages.map((page, spreadIndex) => (
              <article
                key={page.id}
                className={`journal-page paper-${page.paper} ${spreadIndex === 0 ? "left-page" : "right-page"}`}
                onClick={(event) => event.stopPropagation()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) addImage(file, page.id); }}
              >
                <span className="page-corner-mark">{String(journal.pages.indexOf(page) + 1).padStart(2, "0")}</span>
                {page.items.map((item) => (
                  <EditableItem key={item.id} item={item} selected={selected === item.id} onSelect={() => setSelected(item.id)} onChange={(patch) => patchItem(page.id, item.id, patch)} onDelete={() => removeItem(page.id, item.id)} />
                ))}
                {page.items.length === 0 && <div className="empty-page"><span>✦</span><p>make a little mess</p><small>drop, paste, or choose something from the drawer</small></div>}
              </article>
            ))}
            {visiblePages.length === 1 && <article className="journal-page blank-companion"><p>the rest is unwritten</p></article>}
            <div className="book-seam" />
          </div>
          <button type="button" aria-label="Next page" className="page-arrow page-arrow-right" onClick={() => turn(1)}><ChevronRight /></button>
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
              onClick={() => setJournal((current) => ({ ...current, active: index }))}
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
    </main>
  );
}
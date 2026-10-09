import { Download, Eraser, Pencil, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { emptyGlyphs, imageFileToCanvas, processDrawnCell, renderTemplate, sliceTemplate, templatePages, type GlyphMap, type HandwritingProfile } from "./handwriting";

function id() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function DrawingCell({ value, label, onChange }: { value: string | null; label: string; onChange: (value: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [eraser, setEraser] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    let cancelled = false;
    const image = new Image(); image.onload = () => {
      if (cancelled || drawing.current) return;
      context.globalCompositeOperation = "source-over";
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
      context.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale);
    }; image.src = value;
    return () => { cancelled = true; };
  }, [value]);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (!canvas || !context) return;
    event.preventDefault();
    drawing.current = true; canvas.setPointerCapture(event.pointerId); const p = point(event);
    context.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    context.fillStyle = "#181512";
    context.beginPath(); context.arc(p.x, p.y, eraser ? 7 : 2.5, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.moveTo(p.x, p.y);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return; const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (!canvas || !context) return;
    const p = point(event); context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = eraser ? 14 : 5; context.globalCompositeOperation = eraser ? "destination-out" : "source-over"; context.strokeStyle = "#181512"; context.lineTo(p.x, p.y); context.stroke();
  };
  const end = () => { if (!drawing.current) return; drawing.current = false; const canvas = canvasRef.current; if (canvas) onChange(processDrawnCell(canvas)); };
  return <div className="drawing-cell"><span>{label}</span><canvas ref={canvasRef} width={120} height={76} aria-label={`Draw variation ${label}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} /><button type="button" title={eraser ? "Use pen" : "Use eraser"} aria-label={eraser ? "Use pen" : "Use eraser"} onClick={() => setEraser((current) => !current)}>{eraser ? <Pencil size={13} /> : <Eraser size={13} />}</button><button type="button" title="Clear variation" aria-label="Clear variation" onClick={() => onChange(null)}><RotateCcw size={13} /></button></div>;
}

export default function HandwritingStudio({ profiles, activeId, onSave, onDelete, onSelect, onClose }: { profiles: HandwritingProfile[]; activeId: string | undefined; onSave: (profile: HandwritingProfile) => Promise<void>; onDelete: (id: string) => void; onSelect: (id: string | undefined) => void; onClose: () => void }) {
  const initialProfile = profiles.find((profile) => profile.id === activeId);
  const [draftId, setDraftId] = useState(initialProfile?.id);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"start" | "draw" | "review">("start");
  const [page, setPage] = useState(0);
  const [name, setName] = useState(initialProfile?.name ?? "My handwriting");
  const [glyphs, setGlyphs] = useState<GlyphMap>(() => initialProfile?.glyphs ?? emptyGlyphs());
  const [message, setMessage] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const pages = templatePages();
  const selectedProfile = profiles.find((profile) => profile.id === draftId);
  const filled = Object.values(glyphs).flat().filter(Boolean).length;

  const mergeGlyphs = (incoming: GlyphMap) => setGlyphs((current) => {
    const next = { ...current };
    Object.entries(incoming).forEach(([character, variations]) => { next[character] = variations; });
    return next;
  });
  const updateGlyph = (character: string, variant: number, value: string | null) => setGlyphs((current) => ({ ...current, [character]: (current[character] ?? [null, null, null, null]).map((entry, index) => index === variant ? value : entry) }));
  const downloadTemplate = () => {
    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [1240, 1754], hotfixes: ["px_scaling"] });
    pages.forEach((_, index) => { const canvas = document.createElement("canvas"); renderTemplate(index, canvas); if (index) pdf.addPage([1240, 1754], "portrait"); pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 1240, 1754); });
    pdf.save("my-handwriting-template.pdf");
  };
  const upload = async (file: File) => {
    try { const canvas = await imageFileToCanvas(file); mergeGlyphs(sliceTemplate(canvas, page)); setStep("review"); setMessage(`Sheet ${page + 1} added. Check each box, then add the next sheet.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "That sheet could not be read."); }
  };
  const loadProfile = (profile: HandwritingProfile) => { setDraftId(profile.id); setGlyphs(profile.glyphs); setName(profile.name); setMessage(""); setStep("review"); };
  const save = async () => {
    if (saving) return;
    if (!filled) { setMessage("Write at least one character before saving."); return; }
    const profileId = draftId ?? id();
    setSaving(true); setMessage("");
    try {
      await onSave({ id: profileId, name: name.trim() || "My handwriting", glyphs, createdAt: selectedProfile?.createdAt ?? Date.now() });
      setDraftId(profileId); setMessage("Handwriting saved to your account.");
    } catch { setMessage("Your handwriting couldn't be saved. Your letters are still here — please try again."); }
    finally { setSaving(false); }
  };

  return <div className="handwriting-overlay" role="dialog" aria-modal="true" aria-label="My Handwriting" onClick={onClose}>
    <section className="handwriting-studio" onClick={(event) => event.stopPropagation()}>
      <header><div><small>Letter workshop</small><h2>My Handwriting</h2></div><Button type="button" variant="ghost" size="icon" aria-label="Close handwriting studio" onClick={onClose}><X /></Button></header>
      <div className="handwriting-layout">
        <aside>
          <p className="drawer-label">Saved profiles</p>
          {profiles.length === 0 && <span className="no-profiles">No handwriting saved yet</span>}
          {profiles.map((profile) => <div className={`profile-row ${activeId === profile.id ? "active" : ""}`} key={profile.id}><button type="button" onClick={() => { onSelect(profile.id); loadProfile(profile); }}>{profile.name}</button><button type="button" title="Delete profile" aria-label={`Delete ${profile.name}`} onClick={() => onDelete(profile.id)}><Trash2 size={14} /></button></div>)}
          <Button type="button" variant="outline" onClick={() => { onSelect(undefined); setDraftId(undefined); setGlyphs(emptyGlyphs()); setName("My handwriting"); setMessage(""); setStep("start"); }}>New profile</Button>
        </aside>
        <div className="handwriting-workspace">
          <nav className="setup-steps"><button className={step === "start" ? "active" : ""} onClick={() => setStep("start")}>1 · Choose</button><button className={step === "draw" ? "active" : ""} onClick={() => setStep("draw")}>2 · Write</button><button className={step === "review" ? "active" : ""} onClick={() => setStep("review")}>3 · Review</button></nav>
          {step === "start" && <div className="setup-choice"><div className="template-preview"><div className="template-grid-mini">{Array.from({ length: 20 }, (_, index) => <i key={index} />)}</div><span>a · a · a · a</span></div><h3>Make letters that feel like you</h3><p>Use a black pen on the printed sheets, or write directly here with a mouse, stylus, or finger.</p><div className="choice-actions"><Button type="button" onClick={downloadTemplate}><Download /> Download printable sheets</Button><Button type="button" variant="outline" onClick={() => setStep("draw")}><Pencil /> Write on this device</Button><Button type="button" variant="outline" onClick={() => uploadRef.current?.click()}><Upload /> Upload sheet {page + 1}</Button></div><input ref={uploadRef} hidden type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /><label className="sheet-page-label">Sheet to upload <select value={page} onChange={(event) => setPage(Number(event.target.value))}>{pages.map((_, index) => <option key={index} value={index}>Sheet {index + 1}</option>)}</select></label></div>}
          {(step === "draw" || step === "review") && <><div className="sheet-toolbar"><label>Profile name <input value={name} maxLength={36} onChange={(event) => setName(event.target.value)} /></label><div className="sheet-pagination"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>Sheet {page + 1} / {pages.length}</span><Button type="button" variant="outline" size="sm" disabled={page === pages.length - 1} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div><div className="character-grid">{(pages[page] ?? []).map((character) => <section className="character-card" key={character}><strong>{character}</strong><div>{[0,1,2,3].map((variant) => <DrawingCell key={variant} label={String(variant + 1)} value={glyphs[character]?.[variant] ?? null} onChange={(value) => updateGlyph(character, variant, value)} />)}</div></section>)}</div><footer className="handwriting-save"><span>{filled} of {Object.keys(glyphs).length * 4} boxes filled</span><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save handwriting profile"}</Button></footer></>}
          {message && <div className="handwriting-message" role="status">{message}</div>}
        </div>
      </div>
    </section>
  </div>;
}

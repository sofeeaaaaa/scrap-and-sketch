import { ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type FaceSide = "left" | "right" | "single";
export type BookFace = {
  key: string;
  /** cover/endpaper/blank faces are skipped in single-page mode except covers. */
  kind: "cover" | "endpaper" | "page" | "blank";
  render: (interactive: boolean, side: FaceSide) => ReactNode;
};

type Transition = { base: number; dir: 1 | -1 };

const SOUND_KEY = "tucked-away-flip-muted";
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let audio: AudioContext | null = null;
function rustle() {
  try {
    audio ??= new AudioContext();
    const duration = 0.45;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      const envelope = Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t) * (0.6 + 0.4 * Math.sin(t * 40));
      data[i] = (Math.random() * 2 - 1) * envelope * 0.35;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 2600; filter.Q.value = 0.7;
    source.connect(filter).connect(audio.destination);
    source.start();
  } catch { /* sound is optional */ }
}

function useSingleMode() {
  const [single, setSingle] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 800px)");
    const update = () => setSingle(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return single;
}

export default function FlipBook({ faces, goTo, onVisibleChange, onFlipStart, dragAnywhere = false, bookRef, className = "" }: {
  faces: BookFace[];
  goTo?: { key: string; nonce: number } | undefined;
  onVisibleChange?: (keys: string[]) => void;
  onFlipStart?: () => void;
  dragAnywhere?: boolean;
  bookRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  const single = useSingleMode();
  const list = useMemo(() => (single ? faces.filter((face) => face.kind === "cover" || face.kind === "page") : faces), [faces, single]);
  // Double mode: position k shows list[2k-1] | list[2k]. Single mode: position i shows list[i].
  const maxPos = single ? list.length - 1 : Math.ceil(list.length / 2);
  const [pos, setPos] = useState(0);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [muted, setMuted] = useState(true);
  const anchorKey = useRef<string | undefined>(undefined);
  const leafRef = useRef<HTMLDivElement>(null);
  const castRightRef = useRef<HTMLDivElement>(null);
  const castLeftRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const frame = useRef(0);
  const drag = useRef<{ startX: number; startY: number; moved: boolean; spineX: number; width: number } | null>(null);

  useEffect(() => { setMuted(window.localStorage.getItem(SOUND_KEY) !== "0"); }, []);
  const toggleMute = () => setMuted((current) => { window.localStorage.setItem(SOUND_KEY, current ? "0" : "1"); return !current; });

  const face = (index: number) => (index >= 0 && index < list.length ? list[index] : undefined);
  const visible = (position: number) => (single ? [face(position)] : [face(2 * position - 1), face(2 * position)]).filter((entry): entry is BookFace => Boolean(entry));

  // Keep position stable across mode switches and face list edits.
  useLayoutEffect(() => {
    const key = anchorKey.current;
    if (!key) return;
    const index = list.findIndex((entry) => entry.key === key);
    if (index < 0) { setPos((current) => Math.min(current, maxPos)); return; }
    setPos(single ? index : Math.ceil(index / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single, list.length]);

  useEffect(() => {
    const keys = visible(pos).map((entry) => entry.key);
    anchorKey.current = keys.find((key) => list.find((entry) => entry.key === key)?.kind === "page") ?? keys[keys.length - 1];
    onVisibleChange?.(keys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, list]);

  useEffect(() => {
    if (!goTo) return;
    const index = list.findIndex((entry) => entry.key === goTo.key);
    if (index >= 0) setPos(single ? index : Math.ceil(index / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo?.nonce]);

  const paint = useCallback((p: number) => {
    progress.current = p;
    const angle = -180 * p;
    const cos = Math.cos((angle * Math.PI) / 180);
    const lift = Math.sin(Math.PI * p);
    const leaf = leafRef.current;
    if (leaf) {
      // A little extra bow mid-turn sells the paper bending as it lifts.
      leaf.style.transform = `rotateY(${angle}deg) translateZ(${lift * 6}px) skewY(${lift * (drag.current ? -1.2 : -0.6)}deg)`;
      leaf.style.setProperty("--lift", String(lift));
      leaf.style.setProperty("--front-shade", String(Math.min(1, p * 1.8) * 0.55));
      leaf.style.setProperty("--back-shade", String(Math.min(1, (1 - p) * 1.8) * 0.55));
    }
    if (castRightRef.current) { castRightRef.current.style.transform = `scaleX(${Math.max(cos, 0.0001)})`; castRightRef.current.style.opacity = String(lift); }
    if (castLeftRef.current) { castLeftRef.current.style.transform = `scaleX(${Math.max(-cos, 0.0001)})`; castLeftRef.current.style.opacity = String(lift); }
  }, []);

  const finish = useCallback((completed: boolean, current: Transition) => {
    cancelAnimationFrame(frame.current);
    drag.current = null;
    setTransition(null);
    if (completed) setPos(current.dir > 0 ? current.base + 1 : current.base);
    else setPos(current.dir > 0 ? current.base : current.base + 1);
  }, []);

  const animateTo = useCallback((target: number, current: Transition) => {
    cancelAnimationFrame(frame.current);
    const from = progress.current;
    const distance = Math.abs(target - from);
    const duration = Math.max(260, 860 * distance);
    const completes = current.dir > 0 ? target === 1 : target === 0;
    if (completes && !muted) rustle();
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      paint(from + (target - from) * easeInOut(t));
      if (t < 1) frame.current = requestAnimationFrame(step);
      else finish(completes, current);
    };
    frame.current = requestAnimationFrame(step);
  }, [finish, muted, paint]);

  const begin = (dir: 1 | -1) => {
    if (transition) return null;
    if (dir > 0 && pos >= maxPos) return null;
    if (dir < 0 && pos <= 0) return null;
    const next: Transition = { base: dir > 0 ? pos : pos - 1, dir };
    progress.current = dir > 0 ? 0 : 1;
    onFlipStart?.();
    setTransition(next);
    return next;
  };

  const pendingAuto = useRef(false);
  const flip = (dir: 1 | -1) => { if (begin(dir)) pendingAuto.current = true; };

  // Paint the first frame before the browser shows the leaf, then start any automatic flip.
  useLayoutEffect(() => {
    if (!transition) return;
    paint(progress.current);
    if (pendingAuto.current) { pendingAuto.current = false; animateTo(transition.dir > 0 ? 1 : 0, transition); }
  }, [transition, paint, animateTo]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable='true']"))) return;
      if (event.key === "ArrowRight") { event.preventDefault(); flip(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); flip(-1); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const startDrag = (dir: 1 | -1) => (event: ReactPointerEvent<HTMLElement>) => {
    const stage = stageRef.current;
    if (!stage || transition) return;
    const rect = stage.getBoundingClientRect();
    const width = single ? rect.width : rect.width / 2;
    const spineX = single ? rect.left : rect.left + rect.width / 2;
    const started = begin(dir);
    if (!started) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = { startX: event.clientX, startY: event.clientY, moved: false, spineX, width };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      if (Math.abs(moveEvent.clientX - state.startX) > 6) state.moved = true;
      if (!state.moved) return;
      if (single) { paint(Math.max(0, Math.min(1, (dir > 0 ? 0 : 1) - (moveEvent.clientX - state.startX) / state.width))); return; }
      const cos = Math.max(-1, Math.min(1, (moveEvent.clientX - state.spineX) / state.width));
      paint(Math.acos(cos) / Math.PI);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      const state = drag.current;
      if (!state) return;
      if (!state.moved) { animateTo(dir > 0 ? 1 : 0, started); return; }
      const p = progress.current;
      const complete = dir > 0 ? p > 0.3 : p < 0.7;
      animateTo(complete === (dir > 0) ? 1 : 0, started);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  // What sits under / beside the turning leaf.
  let staticLeft: BookFace | undefined;
  let staticRight: BookFace | undefined;
  let leafFront: BookFace | undefined;
  let leafBack: BookFace | undefined;
  if (transition) {
    const a = transition.base;
    if (single) { staticRight = face(a + 1); leafFront = face(a); }
    else { staticLeft = face(2 * a - 1); staticRight = face(2 * a + 2); leafFront = face(2 * a); leafBack = face(2 * a + 1); }
  } else if (single) staticRight = face(pos);
  else { staticLeft = face(2 * pos - 1); staticRight = face(2 * pos); }

  const target = transition ? (transition.dir > 0 ? transition.base + 1 : transition.base) : pos;
  const shift = single ? "" : target === 0 ? "book-closed-front" : target === maxPos ? "book-closed-back" : "";
  const interactive = !transition;
  const sideFor = (side: FaceSide): FaceSide => (single ? "single" : side);

  return (
    <div className={`flip-shell ${className}`}>
      <button type="button" aria-label="Previous page" className="page-arrow page-arrow-left" disabled={pos <= 0} onClick={(event) => { event.stopPropagation(); flip(-1); }}><ChevronLeft /></button>
      <div className={`flip-book ${single ? "flip-single" : "flip-double"} ${shift} ${transition ? "is-flipping" : ""}`}>
        <div ref={(node) => { stageRef.current = node; if (typeof bookRef === "function") bookRef(node); else if (bookRef) (bookRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }} className="flip-stage">
          {!single && <div className="flip-slot flip-slot-left">{staticLeft?.render(interactive, "left")}<div ref={castLeftRef} className="flip-cast flip-cast-left" /></div>}
          <div className="flip-slot flip-slot-right">{staticRight?.render(interactive, sideFor("right"))}<div ref={castRightRef} className="flip-cast flip-cast-right" /></div>
          {!single && staticLeft && staticRight && <div className="book-seam" />}
          {transition && (
            <div ref={leafRef} className="flip-leaf" aria-hidden="true">
              <div className="leaf-face leaf-front">{leafFront?.render(false, sideFor("right"))}<div className="leaf-shade leaf-shade-front" /></div>
              <div className="leaf-face leaf-back">{single ? <div className="leaf-paper-back" /> : leafBack?.render(false, "left")}<div className="leaf-shade leaf-shade-back" /></div>
            </div>
          )}
          {!transition && pos < maxPos && <div className={`flip-edge flip-edge-right ${dragAnywhere ? "flip-edge-wide" : ""}`} onPointerDown={startDrag(1)} aria-hidden="true"><span className="flip-corner" /></div>}
          {!transition && pos > 0 && <div className={`flip-edge flip-edge-left ${dragAnywhere ? "flip-edge-wide" : ""}`} onPointerDown={startDrag(-1)} aria-hidden="true"><span className="flip-corner" /></div>}
        </div>
      </div>
      <button type="button" aria-label="Next page" className="page-arrow page-arrow-right" disabled={pos >= maxPos} onClick={(event) => { event.stopPropagation(); flip(1); }}><ChevronRight /></button>
      <button type="button" className="flip-sound" aria-label={muted ? "Turn page sound on" : "Mute page sound"} title={muted ? "Page sound off" : "Page sound on"} onClick={(event) => { event.stopPropagation(); toggleMute(); }}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
    </div>
  );
}

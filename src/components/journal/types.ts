export type Paper = "vintage" | "lined" | "graph" | "kraft" | "torn";
export type Kind = "text" | "image" | "sticker" | "tape" | "scrap" | "ticket" | "stamp" | "doodle";
export type Frame = "none" | "polaroid" | "torn";

export type JournalItem = {
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
  profileId?: string;
  inkColor?: string;
  fontSize?: number;
  /** Set from the database row; never stored inside item data. */
  createdBy?: string | null;
};

export type JournalPage = { id: string; title: string; paper: Paper; items: JournalItem[] };
export type JournalState = { pages: JournalPage[]; active: number };

export const COVERS: Record<string, string> = {
  rust: "Rust linen",
  moss: "Moss cloth",
  indigo: "Indigo denim",
  kraft: "Kraft board",
  rose: "Faded rose",
};

export function personColor(key: string) {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `oklch(0.62 0.14 ${hash % 360})`;
}

export function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

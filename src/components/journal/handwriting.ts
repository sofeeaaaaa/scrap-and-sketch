export const HANDWRITING_CHARACTERS = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ...Array.from(".,!?;:'\"-–—()[]{}@#$%&*+/=_")
];

export const VARIATIONS = 4;
export const TEMPLATE_COLS = 4;
export const TEMPLATE_ROWS = 7;
export const CHARS_PER_TEMPLATE_PAGE = TEMPLATE_COLS * TEMPLATE_ROWS;

export type GlyphMap = Record<string, Array<string | null>>;
export type HandwritingProfile = { id: string; name: string; glyphs: GlyphMap; createdAt: number };

export function templatePages() {
  const pages: string[][] = [];
  for (let i = 0; i < HANDWRITING_CHARACTERS.length; i += CHARS_PER_TEMPLATE_PAGE) {
    pages.push(HANDWRITING_CHARACTERS.slice(i, i + CHARS_PER_TEMPLATE_PAGE));
  }
  return pages;
}

export function emptyGlyphs(): GlyphMap {
  return Object.fromEntries(HANDWRITING_CHARACTERS.map((character) => [character, [null, null, null, null]]));
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function glyphStyle(itemId: string, index: number) {
  const seed = hash(`${itemId}:${index}`);
  return {
    variation: seed % VARIATIONS,
    rotation: ((seed >>> 4) % 25 - 12) / 10,
    baseline: ((seed >>> 9) % 7) - 3,
    spacing: ((seed >>> 13) % 5) - 2,
  };
}

export function renderTemplate(pageIndex: number, target: HTMLCanvasElement) {
  const pages = templatePages();
  const chars = pages[pageIndex] ?? [];
  const width = 1240;
  const height = 1754;
  target.width = width;
  target.height = height;
  const context = target.getContext("2d");
  if (!context) return;
  context.fillStyle = "#fffdf7";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#352d27";
  context.font = "700 34px sans-serif";
  context.fillText("MY HANDWRITING · TUCKED AWAY", 70, 70);
  context.font = "20px sans-serif";
  context.fillText(`Sheet ${pageIndex + 1} of ${pages.length} · Write each character four times in dark ink`, 70, 108);
  context.strokeStyle = "#27211d";
  context.lineWidth = 4;
  [[28, 28], [width - 28, 28], [28, height - 28], [width - 28, height - 28]].forEach(([x, y]) => {
    context.beginPath(); context.moveTo(x - 12, y); context.lineTo(x + 12, y); context.moveTo(x, y - 12); context.lineTo(x, y + 12); context.stroke();
  });
  const marginX = 70;
  const top = 145;
  const rowHeight = 218;
  const groupWidth = (width - marginX * 2) / TEMPLATE_COLS;
  chars.forEach((character, index) => {
    const col = index % TEMPLATE_COLS;
    const row = Math.floor(index / TEMPLATE_COLS);
    const x = marginX + col * groupWidth;
    const y = top + row * rowHeight;
    context.fillStyle = "#352d27";
    context.font = "700 25px sans-serif";
    context.fillText(character === " " ? "space" : character, x + 3, y + 26);
    for (let variant = 0; variant < VARIATIONS; variant += 1) {
      const boxX = x + 3 + (variant % 2) * 132;
      const boxY = y + 42 + Math.floor(variant / 2) * 80;
      context.strokeStyle = "#9a8e7e";
      context.lineWidth = 2;
      context.strokeRect(boxX, boxY, 118, 68);
      context.strokeStyle = "#d2c7b8";
      context.setLineDash([6, 5]);
      context.beginPath(); context.moveTo(boxX + 8, boxY + 52); context.lineTo(boxX + 110, boxY + 52); context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#8a7c6d";
      context.font = "13px sans-serif";
      context.fillText(String(variant + 1), boxX + 5, boxY + 15);
    }
  });
}

function trimmedGlyph(source: HTMLCanvasElement): string | null {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const image = context.getImageData(0, 0, source.width, source.height);
  let left = source.width, right = -1, top = source.height, bottom = -1, inkCount = 0;
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    const offset = (y * source.width + x) * 4;
    const alpha = image.data[offset + 3] ?? 0;
    const red = image.data[offset] ?? 255;
    const green = image.data[offset + 1] ?? 255;
    const blue = image.data[offset + 2] ?? 255;
    const darkness = 255 - (red * .299 + green * .587 + blue * .114);
    if (alpha > 20 && darkness > 62) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); inkCount += 1;
    }
  }
  if (inkCount < 18 || right < left || bottom < top) return null;
  const pad = 5;
  const output = document.createElement("canvas");
  output.width = Math.max(12, right - left + 1 + pad * 2);
  output.height = Math.max(12, bottom - top + 1 + pad * 2);
  const out = output.getContext("2d");
  if (!out) return null;
  const cropped = context.getImageData(left, top, right - left + 1, bottom - top + 1);
  for (let offset = 0; offset < cropped.data.length; offset += 4) {
    const red = cropped.data[offset] ?? 255;
    const green = cropped.data[offset + 1] ?? 255;
    const blue = cropped.data[offset + 2] ?? 255;
    const darkness = Math.max(0, 255 - (red * .299 + green * .587 + blue * .114));
    const alpha = darkness < 45 ? 0 : Math.min(255, (darkness - 35) * 2.7);
    cropped.data[offset] = 25; cropped.data[offset + 1] = 22; cropped.data[offset + 2] = 20; cropped.data[offset + 3] = alpha;
  }
  out.putImageData(cropped, pad, pad);
  return output.toDataURL("image/png");
}

export function sliceTemplate(source: HTMLCanvasElement, pageIndex: number): GlyphMap {
  const characters = templatePages()[pageIndex] ?? [];
  const result: GlyphMap = {};
  const scaleX = source.width / 1240;
  const scaleY = source.height / 1754;
  const marginX = 70;
  const top = 145;
  const groupWidth = (1240 - marginX * 2) / TEMPLATE_COLS;
  characters.forEach((character, index) => {
    const col = index % TEMPLATE_COLS;
    const row = Math.floor(index / TEMPLATE_COLS);
    result[character] = Array.from({ length: VARIATIONS }, (_, variant) => {
      const x = marginX + col * groupWidth + 3 + (variant % 2) * 132;
      const y = top + row * 218 + 42 + Math.floor(variant / 2) * 80;
      const cell = document.createElement("canvas");
      cell.width = Math.round(118 * scaleX);
      cell.height = Math.round(68 * scaleY);
      cell.getContext("2d")?.drawImage(source, x * scaleX, y * scaleY, 118 * scaleX, 68 * scaleY, 0, 0, cell.width, cell.height);
      return trimmedGlyph(cell);
    });
  });
  return result;
}

export function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      URL.revokeObjectURL(image.src); resolve(canvas);
    };
    image.onerror = () => reject(new Error("That image could not be read."));
    image.src = URL.createObjectURL(file);
  });
}

export function processDrawnCell(source: HTMLCanvasElement) { return trimmedGlyph(source); }

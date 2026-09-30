import type { CSSProperties } from "react";
import type { HandwritingProfile } from "./handwriting";
import { glyphStyle } from "./handwriting";

export function HandwritingText({ itemId, text, profile, color, size }: { itemId: string; text: string; profile?: HandwritingProfile; color: string; size: number }) {
  return (
    <div className="handwriting-line" style={{ "--handwriting-color": color, "--handwriting-size": `${size}px` } as CSSProperties}>
      {Array.from(text).map((character, index) => {
        if (character === "\n") return <br key={`${itemId}-${index}`} />;
        if (character === " ") return <span key={`${itemId}-${index}`} className="handwriting-space"> </span>;
        const style = glyphStyle(itemId, index);
        const variants = profile?.glyphs[character];
        const available = variants?.filter((glyph): glyph is string => Boolean(glyph)) ?? [];
        const glyph = available.length ? available[style.variation % available.length] : undefined;
        if (!glyph) return <span key={`${itemId}-${index}`} className="fallback-glyph" style={{ transform: `translateY(${style.baseline}px) rotate(${style.rotation}deg)`, marginRight: `${style.spacing}px` }}>{character}</span>;
        return <span key={`${itemId}-${index}`} aria-label={character} className="image-glyph" style={{ WebkitMaskImage: `url(${glyph})`, maskImage: `url(${glyph})`, transform: `translateY(${style.baseline}px) rotate(${style.rotation}deg)`, marginRight: `${style.spacing}px` }} />;
      })}
    </div>
  );
}

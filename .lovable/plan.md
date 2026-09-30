# My Handwriting

## Goal
Add a browser-local handwriting studio where people can create several handwriting profiles from a printable sheet, an uploaded scan/photo, or direct drawing, then use those profiles in journal text.

## What will be built
- Add a **My Handwriting** entry beside the existing text/photo tools and a setup studio that matches the tactile craft-drawer style.
- Provide a printable/downloadable, paginated template covering `a-z`, `A-Z`, `0-9`, and common punctuation, with four labeled writing boxes per character and alignment markers for reliable slicing.
- Mirror that template as an on-device drawing grid with pen, eraser, clear, undo, and page navigation controls.
- Accept a template scan/photo, locate the filled grid area, split it by the known template layout, remove light paper pixels, trim each mark, and save transparent glyph images.
- Show every extracted character and its four variations, flag likely-empty boxes, and allow any single variation to be redrawn or cleared before saving.
- Support creating, renaming, selecting, and deleting multiple handwriting profiles, all stored only in the browser.
- Upgrade text notes with an inline editor for profile, ink color, and text size. Each typed character will retain a randomly selected variation plus subtle rotation, baseline, and spacing differences; spaces, line breaks, deletion, and fallback handwriting remain supported.
- Keep handwritten text compatible with dragging, resizing, rotation, autosave, PNG export, and PDF export.

## Technical details
- Store image-heavy handwriting profiles in IndexedDB to avoid localStorage size limits; journal pages keep only profile IDs and compact per-character styling data.
- Keep variation choices and imperfections stable after typing so letters do not visually change on every render or export.
- Use Canvas APIs for template rendering, pen input, threshold-based paper removal, trimming, scan alignment, and transparent PNG generation; no cloud upload is needed.
- Split the large feature into focused local modules for profile storage, image processing/template definitions, handwriting rendering, and the setup dialog, while preserving the current page-based editor model.
- Add accessible labels, keyboard editing behavior, responsive dialog layouts, and reduced-motion-safe transitions.

## Verification
- Create a profile by drawing, save it, type repeated letters, and confirm variation, color, sizing, spaces, line breaks, and backspace.
- Upload a generated test template image and confirm automatic slicing/background removal plus single-glyph redo.
- Reload and confirm both profiles and handwritten journal text persist.
- Confirm handwritten text appears in PNG/PDF capture and verify the main flow at desktop and mobile sizes.

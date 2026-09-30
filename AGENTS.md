<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep journal data browser-local and model the editor as pages containing independently transformed elements; this preserves offline autosave and freeform composition without backend complexity.
- Handwriting profiles and image glyph data live in IndexedDB; journal text stores only profile references and display settings to keep autosave small.
- Per-character visual variation is deterministic from the text item and character position so the handwritten result remains stable across rendering and export.

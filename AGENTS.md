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

- Journals live in Lovable Cloud as journals → journal_pages → journal_items (one row per element) so collaborators edit concurrently without overwriting each other; the editor diffs local state against a stable-serialized snapshot and syncs changed rows, with realtime for live updates.
- Access is private by default: owner or invited email (journal_members) via has_journal_access(); view-only links go through the get_shared_journal(token) security-definer RPC so anonymous viewers never get table access.
- Handwriting profiles live in the handwriting_profiles table (readable by people who share a journal with the owner) so shared text renders in the owner's handwriting; journal text stores only profile references. Legacy browser data is moved into the account once on first sign-in.
- Per-character visual variation is deterministic from the text item and character position so the handwritten result remains stable across rendering and export.

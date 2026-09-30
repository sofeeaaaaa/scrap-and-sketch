import { Check, Copy, Link2, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { type Person, disableShareLink, enableShareLink, getShareLink, inviteMember, removeMember } from "@/lib/journalCloud";
import { personColor } from "./types";

export default function SharePanel({ journalId, title, isOwner, userEmail, people, onChanged, onClose }: {
  journalId: string; title: string; isOwner: boolean; userEmail: string; people: Person[]; onChanged: () => void; onClose: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { if (isOwner) void getShareLink(journalId).then(setToken); }, [journalId, isOwner]);
  const link = token ? `${window.location.origin}/share/${token}` : "";

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong."); }
    setBusy(false);
  };

  return (
    <div className="handwriting-overlay" role="dialog" aria-modal="true" aria-label="Share journal" onClick={onClose}>
      <section className="share-panel" onClick={(event) => event.stopPropagation()}>
        <header><div><small>Share</small><h2>{title}</h2></div><Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button></header>

        {isOwner && <div className="share-block">
          <h3><Link2 size={15} /> View-only link</h3>
          <p>Anyone with the link can flip through this journal. They can't change anything.</p>
          {token ? <>
            <div className="share-link-row"><input readOnly value={link} aria-label="Share link" onFocus={(event) => event.target.select()} /><Button type="button" size="sm" onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button></div>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await disableShareLink(journalId); setToken(null); })}>Turn off link</Button>
          </> : <Button type="button" size="sm" disabled={busy} onClick={() => void run(async () => setToken(await enableShareLink(journalId)))}>Create link</Button>}
        </div>}

        <div className="share-block">
          <h3><UserPlus size={15} /> Collaborators</h3>
          {isOwner && <>
            <p>Invite someone by email. Once they sign in with that email, it shows up under “Shared with me” and they can add and edit pages.</p>
            <form className="share-link-row" onSubmit={(event) => { event.preventDefault(); void run(async () => { await inviteMember(journalId, email); setEmail(""); onChanged(); }); }}>
              <input type="email" placeholder="friend@example.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Collaborator email" required />
              <Button type="submit" size="sm" disabled={busy}>Invite</Button>
            </form>
          </>}
          <ul className="people-list">
            {people.map((person) => (
              <li key={person.key}>
                <span className="person-dot" style={{ background: personColor(person.key) }}>{person.name.charAt(0).toUpperCase()}</span>
                <span className="person-name"><strong>{person.name}</strong><small>{person.role === "owner" ? "Owner" : person.userId ? "Can edit" : "Invited · hasn't signed in yet"}{person.email === userEmail ? " · you" : ""}</small></span>
                {person.memberId && (isOwner || person.email === userEmail) && <button type="button" className="person-remove" aria-label={isOwner ? `Remove ${person.name}` : "Leave journal"} title={isOwner ? "Remove access" : "Leave journal"} onClick={() => void run(async () => {
                  await removeMember(person.memberId!);
                  if (!isOwner) { void navigate({ to: "/shelf" }); return; }
                  onChanged();
                })}><Trash2 size={14} /></button>}
              </li>
            ))}
          </ul>
        </div>
        {message && <div className="handwriting-message" role="status">{message}</div>}
      </section>
    </div>
  );
}

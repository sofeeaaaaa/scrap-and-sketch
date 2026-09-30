import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { JournalItem, JournalPage, Paper } from "@/components/journal/types";

export type JournalMeta = { id: string; title: string; cover: string; owner_id: string; updated_at: string };
export type Person = { key: string; userId: string | null; email: string; name: string; role: "owner" | "collaborator"; memberId?: string };

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function ensureProfile(user: User) {
  if (!user.email) return;
  const name = (user.user_metadata?.["full_name"] as string | undefined) ?? user.email.split("@")[0];
  await supabase.from("profiles").upsert({ id: user.id, email: user.email.toLowerCase(), display_name: name }, { onConflict: "id" });
}

export async function listJournals() {
  const { data, error } = await supabase.from("journals").select("id, title, cover, owner_id, updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  const journals = (data ?? []) as JournalMeta[];
  const ownerIds = [...new Set(journals.map((journal) => journal.owner_id))];
  const { data: owners } = ownerIds.length ? await supabase.from("profiles").select("id, email, display_name").in("id", ownerIds) : { data: [] };
  return { journals, owners: owners ?? [] };
}

function itemData(item: JournalItem): Json {
  const { createdBy: _createdBy, ...rest } = item;
  return rest as unknown as Json;
}

export async function createJournal(title: string, cover: string, pages: JournalPage[] = []) {
  const user = await currentUser();
  if (!user) throw new Error("Please sign in first.");
  const { data, error } = await supabase.from("journals").insert({ title, cover, owner_id: user.id }).select("id").single();
  if (error) throw error;
  const journalId = data.id;
  const starter: JournalPage[] = pages.length ? pages : [{ id: `${Date.now()}-p1`, title: "Page 1", paper: "vintage", items: [] }, { id: `${Date.now()}-p2`, title: "Page 2", paper: "lined", items: [] }];
  const suffix = Math.random().toString(36).slice(2, 7);
  const renamed = starter.map((page) => ({ ...page, id: `${page.id}-${suffix}`, items: page.items.map((item) => ({ ...item, id: `${item.id}-${suffix}` })) }));
  await pushChanges(journalId, new Map(), renamed);
  return journalId;
}

export async function updateJournal(id: string, patch: { title?: string; cover?: string }) {
  const { error } = await supabase.from("journals").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function deleteJournal(id: string) {
  const { error } = await supabase.from("journals").delete().eq("id", id);
  if (error) throw error;
}

export function rowToItem(row: { id: string; data: Json; created_by: string | null }): JournalItem {
  return { ...(row.data as unknown as JournalItem), id: row.id, createdBy: row.created_by };
}

export async function loadJournal(id: string) {
  const [{ data: meta, error }, { data: pages }, { data: items }] = await Promise.all([
    supabase.from("journals").select("id, title, cover, owner_id, updated_at").eq("id", id).maybeSingle(),
    supabase.from("journal_pages").select("*").eq("journal_id", id).order("position"),
    supabase.from("journal_items").select("id, page_id, data, created_by").eq("journal_id", id),
  ]);
  if (error) throw error;
  if (!meta) return null;
  const result: JournalPage[] = (pages ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    paper: page.paper as Paper,
    items: (items ?? []).filter((item) => item.page_id === page.id).map(rowToItem),
  }));
  return { meta: meta as JournalMeta, pages: result };
}

/** Snapshot keys: "p:<pageId>" and "i:<itemId>" mapped to the serialized row payload. */
export function pageKey(page: JournalPage, position: number) {
  return JSON.stringify({ position, title: page.title, paper: page.paper });
}
export function itemKey(item: JournalItem, pageId: string) {
  return JSON.stringify({ pageId, data: itemData(item) });
}

export function snapshotOf(pages: JournalPage[]) {
  const snapshot = new Map<string, string>();
  pages.forEach((page, position) => {
    snapshot.set(`p:${page.id}`, pageKey(page, position));
    page.items.forEach((item) => snapshot.set(`i:${item.id}`, itemKey(item, page.id)));
  });
  return snapshot;
}

export async function pushChanges(journalId: string, previous: Map<string, string>, pages: JournalPage[]) {
  const next = snapshotOf(pages);
  const pageRows = pages.flatMap((page, position) => next.get(`p:${page.id}`) === previous.get(`p:${page.id}`) ? [] : [{ id: page.id, journal_id: journalId, position, title: page.title, paper: page.paper, updated_at: new Date().toISOString() }]);
  const itemRows = pages.flatMap((page) => page.items.flatMap((item) => next.get(`i:${item.id}`) === previous.get(`i:${item.id}`) ? [] : [{ id: item.id, journal_id: journalId, page_id: page.id, data: itemData(item), updated_at: new Date().toISOString() }]));
  const removedItems = [...previous.keys()].filter((key) => key.startsWith("i:") && !next.has(key)).map((key) => key.slice(2));
  const removedPages = [...previous.keys()].filter((key) => key.startsWith("p:") && !next.has(key)).map((key) => key.slice(2));
  if (pageRows.length) { const { error } = await supabase.from("journal_pages").upsert(pageRows); if (error) throw error; }
  if (itemRows.length) { const { error } = await supabase.from("journal_items").upsert(itemRows); if (error) throw error; }
  if (removedItems.length) { const { error } = await supabase.from("journal_items").delete().in("id", removedItems); if (error) throw error; }
  if (removedPages.length) { const { error } = await supabase.from("journal_pages").delete().in("id", removedPages); if (error) throw error; }
  return next;
}

export async function loadPeople(journalId: string, ownerId: string): Promise<Person[]> {
  const { data: members } = await supabase.from("journal_members").select("id, email").eq("journal_id", journalId).order("created_at");
  const emails = (members ?? []).map((member) => member.email);
  const { data: profiles } = await supabase.from("profiles").select("id, email, display_name").or([`id.eq.${ownerId}`, ...(emails.length ? [`email.in.(${emails.map((email) => `"${email}"`).join(",")})`] : [])].join(","));
  const owner = profiles?.find((profile) => profile.id === ownerId);
  const people: Person[] = [{ key: ownerId, userId: ownerId, email: owner?.email ?? "owner", name: owner?.display_name ?? owner?.email ?? "Owner", role: "owner" }];
  (members ?? []).forEach((member) => {
    const profile = profiles?.find((entry) => entry.email.toLowerCase() === member.email);
    people.push({ key: profile?.id ?? member.email, userId: profile?.id ?? null, email: member.email, name: profile?.display_name ?? member.email, role: "collaborator", memberId: member.id });
  });
  return people;
}

export async function inviteMember(journalId: string, email: string) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("That email doesn't look right.");
  const { error } = await supabase.from("journal_members").insert({ journal_id: journalId, email: clean });
  if (error) throw new Error(error.code === "23505" ? "They already have access." : error.message);
}

export async function removeMember(memberId: string) {
  const { error } = await supabase.from("journal_members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function getShareLink(journalId: string) {
  const { data } = await supabase.from("journal_share_links").select("token").eq("journal_id", journalId).maybeSingle();
  return data?.token ?? null;
}

export async function enableShareLink(journalId: string) {
  const { data, error } = await supabase.from("journal_share_links").insert({ journal_id: journalId }).select("token").single();
  if (error) throw error;
  return data.token;
}

export async function disableShareLink(journalId: string) {
  const { error } = await supabase.from("journal_share_links").delete().eq("journal_id", journalId);
  if (error) throw error;
}

export async function downscaleImage(file: File, max = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = url; });
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.84);
  } finally { URL.revokeObjectURL(url); }
}

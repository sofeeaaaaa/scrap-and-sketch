import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { GlyphMap, HandwritingProfile } from "./handwriting";

const DATABASE = "tucked-away-handwriting";
const STORE = "profiles";

type Row = { id: string; name: string; glyphs: Json; created_at: number };
const toProfile = (row: Row): HandwritingProfile => ({ id: row.id, name: row.name, glyphs: row.glyphs as unknown as GlyphMap, createdAt: row.created_at });

/** Profiles the signed-in person owns. */
export async function loadProfiles(): Promise<HandwritingProfile[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data } = await supabase.from("handwriting_profiles").select("id, name, glyphs, created_at").eq("owner_id", auth.user.id).order("created_at");
  return (data ?? []).map(toProfile);
}

/** Profiles referenced by shared journal text (readable when you share a journal with their owner). */
export async function loadProfilesByIds(ids: string[]): Promise<HandwritingProfile[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from("handwriting_profiles").select("id, name, glyphs, created_at").in("id", ids);
  return (data ?? []).map(toProfile);
}

export async function saveProfile(profile: HandwritingProfile) {
  const { error } = await supabase.from("handwriting_profiles").upsert({ id: profile.id, name: profile.name, glyphs: profile.glyphs as unknown as Json, created_at: profile.createdAt });
  if (error) throw error;
}

export async function deleteProfile(id: string) {
  const { error } = await supabase.from("handwriting_profiles").delete().eq("id", id);
  if (error) throw error;
}

/** Legacy browser-only profiles, read once to move them into the account. */
export async function loadLocalProfiles(): Promise<HandwritingProfile[]> {
  if (typeof indexedDB === "undefined") return [];
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" }); };
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const read = request.result.transaction(STORE, "readonly").objectStore(STORE).getAll();
      read.onsuccess = () => resolve(read.result as HandwritingProfile[]);
      read.onerror = () => resolve([]);
    };
  });
}

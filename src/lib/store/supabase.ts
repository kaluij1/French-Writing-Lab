import type { SupabaseClient } from "@supabase/supabase-js";
import { countWords, type DataStore, type Draft, type DraftAnalysis, type VocabItem } from "./types";

/**
 * Supabase-backed store. Runs in the browser with the signed-in user's session;
 * Row Level Security guarantees each user only ever reads or writes their own rows.
 */
export class SupabaseStore implements DataStore {
  readonly mode = "supabase" as const;

  constructor(private readonly db: SupabaseClient) {}

  private async userId(): Promise<string> {
    const { data, error } = await this.db.auth.getUser();
    if (error || !data.user) throw new Error("You are signed out. Please sign in again.");
    return data.user.id;
  }

  async listDrafts() {
    const { data, error } = await this.db.from("drafts").select("*").order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as Draft[];
  }

  async getDraft(id: string) {
    const { data, error } = await this.db.from("drafts").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Draft | null;
  }

  async createDraft(content = "") {
    const { data, error } = await this.db
      .from("drafts")
      .insert({ user_id: await this.userId(), content, word_count: countWords(content) })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Draft;
  }

  async updateDraftContent(id: string, content: string) {
    const { data, error } = await this.db
      .from("drafts")
      .update({ content, word_count: countWords(content) })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Draft;
  }

  async submitDraft(id: string, text: string) {
    // original_text is set once by the database (see the drafts_preserve_original trigger).
    const { data, error } = await this.db
      .from("drafts")
      .update({
        content: text,
        word_count: countWords(text),
        submitted_text: text,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Draft;
  }

  async deleteDraft(id: string) {
    const { error } = await this.db.from("drafts").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listAnalyses(draftId: string) {
    const { data, error } = await this.db
      .from("draft_analyses")
      .select("*")
      .eq("draft_id", draftId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as DraftAnalysis[];
  }

  async saveAnalysis(a: Omit<DraftAnalysis, "id" | "created_at">) {
    const { data, error } = await this.db
      .from("draft_analyses")
      .insert({ ...a, user_id: await this.userId() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as DraftAnalysis;
  }

  async listVocab() {
    const { data, error } = await this.db.from("vocabulary_items").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as VocabItem[];
  }

  async addVocab(item: Omit<VocabItem, "id" | "created_at" | "reviewed">) {
    const { data, error } = await this.db
      .from("vocabulary_items")
      .insert({ ...item, user_id: await this.userId() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as VocabItem;
  }

  async updateVocab(id: string, patch: Partial<VocabItem>) {
    const { data, error } = await this.db.from("vocabulary_items").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data as VocabItem;
  }

  async deleteVocab(id: string) {
    const { error } = await this.db.from("vocabulary_items").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}

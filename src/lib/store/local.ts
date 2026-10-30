import { countWords, type DataStore, type Draft, type DraftAnalysis, type VocabItem } from "./types";

/**
 * Demo-mode store: everything lives in this browser's localStorage.
 * Used automatically when Supabase is not configured.
 */

const KEYS = {
  drafts: "fwl.drafts.v1",
  analyses: "fwl.analyses.v1",
  vocab: "fwl.vocab.v1",
} as const;

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, rows: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch (e) {
    throw new Error("This browser could not save your work (storage may be full or blocked).", { cause: e });
  }
}

const now = () => new Date().toISOString();
const byNewest = <T extends { updated_at?: string; created_at: string }>(a: T, b: T) =>
  (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at);

export class LocalStore implements DataStore {
  readonly mode = "local" as const;

  async listDrafts() {
    return read<Draft>(KEYS.drafts).sort(byNewest);
  }

  async getDraft(id: string) {
    return read<Draft>(KEYS.drafts).find((d) => d.id === id) ?? null;
  }

  async createDraft(content = "") {
    const t = now();
    const draft: Draft = {
      id: crypto.randomUUID(),
      content,
      original_text: null,
      submitted_text: null,
      status: "writing",
      word_count: countWords(content),
      created_at: t,
      updated_at: t,
      submitted_at: null,
    };
    write(KEYS.drafts, [draft, ...read<Draft>(KEYS.drafts)]);
    return draft;
  }

  private patchDraft(id: string, patch: (d: Draft) => Partial<Draft>): Draft {
    const drafts = read<Draft>(KEYS.drafts);
    const i = drafts.findIndex((d) => d.id === id);
    if (i < 0) throw new Error("Draft not found.");
    drafts[i] = { ...drafts[i], ...patch(drafts[i]), updated_at: now() };
    write(KEYS.drafts, drafts);
    return drafts[i];
  }

  async updateDraftContent(id: string, content: string) {
    return this.patchDraft(id, () => ({ content, word_count: countWords(content) }));
  }

  async submitDraft(id: string, text: string) {
    return this.patchDraft(id, (d) => ({
      content: text,
      word_count: countWords(text),
      submitted_text: text,
      original_text: d.original_text ?? text,
      status: "submitted",
      submitted_at: now(),
    }));
  }

  async deleteDraft(id: string) {
    write(KEYS.drafts, read<Draft>(KEYS.drafts).filter((d) => d.id !== id));
    write(KEYS.analyses, read<DraftAnalysis>(KEYS.analyses).filter((a) => a.draft_id !== id));
  }

  async listAnalyses(draftId: string) {
    return read<DraftAnalysis>(KEYS.analyses)
      .filter((a) => a.draft_id === draftId)
      .sort(byNewest);
  }

  async saveAnalysis(a: Omit<DraftAnalysis, "id" | "created_at">) {
    const row = { ...a, id: crypto.randomUUID(), created_at: now() } as DraftAnalysis;
    write(KEYS.analyses, [row, ...read<DraftAnalysis>(KEYS.analyses)]);
    return row;
  }

  async listVocab() {
    return read<VocabItem>(KEYS.vocab).sort(byNewest);
  }

  async addVocab(item: Omit<VocabItem, "id" | "created_at" | "reviewed">) {
    const row: VocabItem = { ...item, id: crypto.randomUUID(), created_at: now(), reviewed: false };
    write(KEYS.vocab, [row, ...read<VocabItem>(KEYS.vocab)]);
    return row;
  }

  async updateVocab(id: string, patch: Partial<VocabItem>) {
    const rows = read<VocabItem>(KEYS.vocab);
    const i = rows.findIndex((v) => v.id === id);
    if (i < 0) throw new Error("Vocabulary item not found.");
    rows[i] = { ...rows[i], ...patch };
    write(KEYS.vocab, rows);
    return rows[i];
  }

  async deleteVocab(id: string) {
    write(KEYS.vocab, read<VocabItem>(KEYS.vocab).filter((v) => v.id !== id));
  }
}

import type { Lens, LensResult } from "@/lib/analysis/schemas";

export type DraftStatus = "writing" | "submitted";

export type Draft = {
  id: string;
  /** The working text. Keeps changing while the learner writes or revises. */
  content: string;
  /** Exact text at first submission. Never modified afterwards. */
  original_text: string | null;
  /** Exact text of the most recent submission, which the analyses refer to. */
  submitted_text: string | null;
  status: DraftStatus;
  word_count: number;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};

export type DraftAnalysis<L extends Lens = Lens> = {
  id: string;
  draft_id: string;
  lens: L;
  /** The exact text that was analysed. */
  source_text: string;
  result: LensResult[L];
  demo: boolean;
  model: string | null;
  created_at: string;
};

export type VocabItem = {
  id: string;
  french: string;
  english: string;
  explanation: string;
  source_sentence: string;
  draft_id: string | null;
  source_lens: Lens | "manual";
  reviewed: boolean;
  created_at: string;
};

export type NewVocabItem = Omit<VocabItem, "id" | "created_at" | "reviewed">;

export interface DataStore {
  readonly mode: "local" | "supabase";
  listDrafts(): Promise<Draft[]>;
  getDraft(id: string): Promise<Draft | null>;
  createDraft(content?: string): Promise<Draft>;
  updateDraftContent(id: string, content: string): Promise<Draft>;
  /** Snapshot the current text as the submitted version. Sets original_text only the first time. */
  submitDraft(id: string, text: string): Promise<Draft>;
  deleteDraft(id: string): Promise<void>;

  listAnalyses(draftId: string): Promise<DraftAnalysis[]>;
  saveAnalysis(a: Omit<DraftAnalysis, "id" | "created_at">): Promise<DraftAnalysis>;

  listVocab(): Promise<VocabItem[]>;
  addVocab(item: NewVocabItem): Promise<VocabItem>;
  updateVocab(id: string, patch: Partial<Pick<VocabItem, "reviewed" | "french" | "english" | "explanation">>): Promise<VocabItem>;
  deleteVocab(id: string): Promise<void>;
}

export function countWords(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

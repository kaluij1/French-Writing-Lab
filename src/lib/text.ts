/** Split text into sentences, keeping each sentence's text verbatim (trimmed). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…\n]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

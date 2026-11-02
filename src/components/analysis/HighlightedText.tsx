"use client";

import { Fragment } from "react";
import type { Lens, Span } from "@/lib/analysis/schemas";

/**
 * Renders the analysed text with a mark for each located item. Spans come from
 * `resolveLocations`, which has already validated them against this exact text.
 * Where two items cover overlapping text, the first keeps the mark.
 */
export function HighlightedText({
  text,
  spans,
  lens,
  activeIndex,
  softIndices,
  onSelect,
}: {
  text: string;
  spans: (Span | null)[];
  lens: Lens | null;
  activeIndex: number | null;
  /** items drawn with a lighter mark (optional suggestions rather than errors) */
  softIndices?: Set<number>;
  onSelect: (index: number) => void;
}) {
  const marks: (Span & { index: number })[] = [];
  if (lens) {
    spans.forEach((s, index) => {
      if (!s || s.end > text.length || s.start >= s.end) return;
      if (marks.some((m) => s.start < m.end && m.start < s.end)) return;
      marks.push({ ...s, index });
    });
    marks.sort((a, b) => a.start - b.start);
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start > cursor) parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, m.start)}</Fragment>);
    parts.push(
      <mark
        key={`m${m.start}`}
        id={`mark-${m.index}`}
        className={`hl hl-${lens}${softIndices?.has(m.index) ? " hl-soft" : ""}`}
        data-active={activeIndex === m.index}
        data-index={m.index}
        onClick={() => onSelect(m.index)}
        title="Show explanation"
      >
        {text.slice(m.start, m.end)}
      </mark>,
    );
    cursor = m.end;
  }
  if (cursor < text.length) parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>);

  return <div className="prose-fr whitespace-pre-wrap break-words">{parts}</div>;
}

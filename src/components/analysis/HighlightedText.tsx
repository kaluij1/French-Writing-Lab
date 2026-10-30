"use client";

import { Fragment, useMemo } from "react";
import type { Lens } from "@/lib/analysis/schemas";
import { findRanges } from "@/lib/highlight";

export function HighlightedText({
  text,
  excerpts,
  lens,
  activeIndex,
  onSelect,
}: {
  text: string;
  excerpts: string[];
  lens: Lens | null;
  activeIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const ranges = useMemo(() => (lens ? findRanges(text, excerpts) : []), [text, excerpts, lens]);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, r.start)}</Fragment>);
    parts.push(
      <mark
        key={`m${r.start}`}
        id={`mark-${r.index}`}
        className={`hl hl-${lens}`}
        data-active={activeIndex === r.index}
        onClick={() => onSelect(r.index)}
        title="Show explanation"
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < text.length) parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>);

  return <div className="prose-fr whitespace-pre-wrap break-words">{parts}</div>;
}

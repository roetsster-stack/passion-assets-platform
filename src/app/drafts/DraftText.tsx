"use client";

import { useState } from "react";
import type { Sentence, Source } from "@/lib/drafting/types";
import { readOn, safeLink, segments, sourceLabel } from "@/lib/gallery/texts";

/**
 * M2-01 · A draft's text on the owner's phone: each sentence with its small numbers; a tap on them
 * shows the passages it rests on and the pages they came from, under the text. A second tap folds
 * them away. Nothing here decides anything.
 */
export function DraftText({ sentences, sources, createdAt }: { sentences: Sentence[]; sources: Source[]; createdAt: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const cited = open === null ? [] : (sentences[open]?.sources ?? []).map((n) => sources.find((s) => s.n === n)).filter((s): s is Source => !!s);
  return (
    <div>
      <p className="text-pretty text-[17px] leading-relaxed text-ink">
        {sentences.map((s, i) => (
          <span key={i}>
            {segments(s.text).map((seg, j) => (seg.italic ? <i key={j}>{seg.text}</i> : <span key={j}>{seg.text}</span>))}
            {s.sources.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                aria-label={`Sources of sentence ${i + 1}: ${s.sources.join(", ")}`}
                className={`ml-0.5 align-super font-sans text-[10px] tracking-wider transition-colors ${open === i ? "text-ink" : "text-ink-muted hover:text-ink"}`}
              >
                {s.sources.join(" ")}
              </button>
            )}{" "}
          </span>
        ))}
      </p>
      {open !== null && (
        <ul className="mt-4 space-y-4 border-l border-ink-faint pl-4 font-sans text-[13px] leading-relaxed text-ink-muted" aria-live="polite">
          {cited.length === 0 && <li>This sentence rests on no source.</li>}
          {cited.map((s) => (
            <li key={s.n}>
              <p className="text-ink">
                <span className="mr-2 text-ink-faint">{s.n}</span>
                {safeLink(s.link) ? (
                  <a href={safeLink(s.link)!} target="_blank" rel="noopener noreferrer" className="underline decoration-ink-faint underline-offset-4 hover:decoration-ink">
                    {sourceLabel(s)}
                  </a>
                ) : (
                  sourceLabel(s)
                )}
                {readOn(s, createdAt) && <span className="text-ink-faint">, {readOn(s, createdAt)}</span>}
              </p>
              <blockquote className="mt-1 font-serif text-[15px] italic text-ink-muted">“{s.passage}”</blockquote>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

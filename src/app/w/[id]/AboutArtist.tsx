import type { Source } from "@/lib/drafting/types";
import { combine, readOn, segments, sourceLabel, type ApprovedText, type Shown } from "@/lib/gallery/texts";

/**
 * M2-01 · Beside the work: beneath the tombstone, quieter, the artist's "why they matter"; and
 * "About the artist", which opens the biography — who and where, how they work, what they return
 * to, where they sit — with the artist's own words standing in it as quotations, and under it a
 * short Sources line in the manner of a catalogue's *Literature*: each page named once, linked, and
 * dated with the day the desk read it. Approved texts only, read through the viewer's own session.
 * An artist with no approved text renders nothing: no gap, no placeholder.
 */

export function AboutArtist({ artist, whyTheyMatter, biography }: { artist: string | null; whyTheyMatter: ApprovedText | null; biography: ApprovedText | null }) {
  if (!whyTheyMatter && !biography) return null;
  const { sources, shown } = combine([whyTheyMatter, biography].filter((t): t is ApprovedText => !!t));
  const why = shown.find((s) => s.field === "why_they_matter") ?? null;
  const bio = shown.find((s) => s.field === "biography") ?? null;
  return (
    <>
      {why && (
        <p className="mt-6 max-w-md text-pretty text-[15px] leading-relaxed text-ink-muted">
          <Text shown={why} />
        </p>
      )}
      {bio ? (
        <details className="group mt-6 w-full max-w-md">
          <summary className="cursor-pointer list-none font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-muted">
            <span className="group-open:hidden">About the artist</span>
            <span className="hidden group-open:inline">{artist ?? "About the artist"}</span>
          </summary>
          <div className="mt-5 text-pretty text-left text-[15px] leading-relaxed text-ink-muted">
            <Text shown={bio} />
          </div>
          <Sources sources={sources} />
        </details>
      ) : (
        <Sources sources={sources} />
      )}
    </>
  );
}

function Text({ shown }: { shown: Shown }) {
  return (
    <>
      {shown.sentences.map((s, i) => (
        <span key={i}>
          {segments(s.text).map((seg, j) => (seg.italic ? <i key={j}>{seg.text}</i> : <span key={j}>{seg.text}</span>))}
          {s.sources.length > 0 && (
            <sup className="ml-0.5 font-sans text-[9px] tracking-wider text-ink-faint">
              {s.sources.map((n, k) => (
                <span key={n}>
                  {k > 0 && " "}
                  <a href={`#source-${n}`} className="transition-colors hover:text-ink-muted">
                    {n}
                  </a>
                </span>
              ))}
            </sup>
          )}{" "}
        </span>
      ))}
    </>
  );
}

/** The Sources line: short, exact, never louder than the text. */
function Sources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <p className="mt-6 max-w-md text-pretty text-left font-sans text-[11px] leading-relaxed tracking-wide text-ink-faint">
      <span className="uppercase tracking-[0.2em]">Sources</span>{" "}
      {sources.map((s, i) => (
        <span key={s.n} id={`source-${s.n}`}>
          {i > 0 && " · "}
          <span className="text-ink-muted">{s.n}</span>{" "}
          {s.link ? (
            <a href={s.link} target="_blank" rel="noopener noreferrer" className="underline decoration-ink-faint underline-offset-4 transition-colors hover:text-ink-muted">
              {sourceLabel(s)}
            </a>
          ) : (
            sourceLabel(s)
          )}
          {s.readAt && readOn(s, s.readAt) ? ` (${readOn(s, s.readAt)})` : ""}
        </span>
      ))}
    </p>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { pending } from "@/lib/drafting/pending";
import { NOT_ENOUGH, type Field, type Removal } from "@/lib/drafting/types";
import { loadDrafts, myRole, type DraftFull } from "@/lib/drafts/load";
import { dayOf } from "@/lib/gallery/texts";
import { isImageId } from "@/lib/images/door";
import { decide } from "../actions";
import { DraftText } from "../DraftText";
import { Quiet } from "../Quiet";
import { sentenceFor } from "../said";

/**
 * M2-01 · One artist's drafts, on the owner's phone: why they matter, then the biography — each the
 * newest draft of its field that still waits. Each sentence carries its small numbers; a tap shows
 * the passage it rests on and the page it came from. Under it, folded away, what the desk removed
 * and why. Three choices for each text: Approve; Not this, with a note; Later. Approving takes a
 * second: the database stamps the owner's name and the time, and the text is on every work by the
 * artist the next time a page is opened. A rejection's note goes back to the desk for the next
 * draft. Nothing here is free to edit: a sentence changed by hand would lose its source. A field that
 * is only the list's own sentence — "Not enough is known yet." — is not offered for approval: approved,
 * it would sit under every work by the artist as a placeholder (the review of PR #14); the database
 * refuses it too.
 */

export const dynamic = "force-dynamic";

const LABEL: Record<Field, string> = { why_they_matter: "Why they matter", biography: "Biography" };
const ORDER: Field[] = ["why_they_matter", "biography"];
const reason = (r: Removal) => (typeof r.rule === "number" ? `rule ${r.rule}` : r.rule === "uncited" ? "no source" : r.rule === "reading" ? "the second reading" : r.rule === "length" ? "the length" : "shortened");
const quiet = "font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-muted";

export default async function DraftsForArtist({ params, searchParams }: { params: Promise<{ artist: string }>; searchParams: Promise<{ said?: string }> }) {
  const [{ artist }, { said: code }] = await Promise.all([params, searchParams]);
  const said = sentenceFor(code);
  if (!isImageId(artist)) notFound();
  const [role, read] = await Promise.all([myRole(), loadDrafts()]);
  if (role !== "owner" || !read) notFound();
  const name = read.artists.find((a) => a.id === artist)?.display_name;
  if (!name) notFound();

  const waiting = pending(
    read.rows,
    read.artists.map((a) => a.id),
  );
  const at = waiting.findIndex((p) => p.artistId === artist);
  const here = at >= 0 ? waiting[at] : null;
  const next = at >= 0 ? (waiting[at + 1] ?? null) : (waiting[0] ?? null);
  const nextName = next ? read.artists.find((a) => a.id === next.artistId)?.display_name : null;
  const byId = new Map(read.rows.map((r) => [r.id, r]));

  if (!here) {
    return (
      <Quiet title={`Nothing waits for ${name}.`} line={next && nextName ? undefined : "Every draft has been decided."}>
        {next && nextName && (
          <Link href={`/drafts/${next.artistId}`} className={`mt-6 ${quiet}`}>
            next: {nextName} →
          </Link>
        )}
      </Quiet>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 pb-32 pt-16">
      <header className="flex items-baseline justify-between gap-6">
        <h1 className="text-2xl text-ink">{name}</h1>
        <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          {at + 1} of {waiting.length}
        </p>
      </header>
      {said && (
        <p role="status" className="mt-6 border-l border-ink-muted pl-4 font-sans text-[13px] leading-relaxed text-ink-muted">
          {said}
        </p>
      )}

      {ORDER.map((field) => {
        const d = here.fields[field];
        return d ? <FieldBlock key={field} field={field} draft={d} artist={artist} answered={d.answers ? (byId.get(d.answers) ?? null) : null} /> : null;
      })}

      <footer className="mt-20 flex items-center justify-between">
        <Link href="/" className={quiet}>
          the wall
        </Link>
        {next && nextName ? (
          <Link href={`/drafts/${next.artistId}`} className={quiet}>
            later · {nextName} →
          </Link>
        ) : (
          <span className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">the last one</span>
        )}
      </footer>
    </main>
  );
}

/** The list's own answer, and nothing else: "Not enough is known yet." is not a text to approve. */
const isPlaceholder = (d: DraftFull) => d.text.trim() === NOT_ENOUGH;

function FieldBlock({ field, draft, artist, answered }: { field: Field; draft: DraftFull; artist: string; answered: DraftFull | null }) {
  const removed = draft.removed ?? [];
  const flagged = draft.flagged ?? [];
  const day = dayOf(draft.created_at);
  const placeholder = isPlaceholder(draft);
  return (
    <section aria-labelledby={`${field}-label`} className="mt-14">
      <h2 id={`${field}-label`} className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
        {LABEL[field]}
      </h2>
      {answered?.note && (
        <p className="mt-3 font-sans text-[13px] leading-relaxed text-ink-muted">
          Written to answer your note: <span className="text-ink">“{answered.note}”</span>
        </p>
      )}
      <div className="mt-4">
        <DraftText sentences={draft.sentences ?? []} sources={draft.sources ?? []} createdAt={draft.created_at} />
      </div>
      <p className="mt-4 font-sans text-[11px] tracking-wider text-ink-faint">
        draft{day ? ` of ${day}` : ""} · {draft.model} · list {draft.list_version.slice(0, 12)}
      </p>

      {(removed.length > 0 || flagged.length > 0) && (
        <details className="group mt-5">
          <summary className={`cursor-pointer list-none ${quiet}`}>
            <span className="group-open:hidden">what the desk removed, and why</span>
            <span className="hidden group-open:inline">fold away</span>
          </summary>
          <ul className="mt-4 space-y-4 border-l border-ink-faint pl-4 font-sans text-[13px] leading-relaxed text-ink-muted">
            {removed.map((r, i) => (
              <li key={`r${i}`}>
                <p className="text-ink-faint">{reason(r)}</p>
                <p className="font-serif text-[15px] text-ink-muted">“{r.text}”</p>
                <p>{r.why}</p>
              </li>
            ))}
            {flagged.map((f, i) => (
              <li key={`f${i}`}>
                <p className="text-ink-faint">doubted by the second reading, kept</p>
                <p className="font-serif text-[15px] text-ink-muted">“{f.text}”</p>
                <p>{f.why}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
        {placeholder ? (
          <p className="w-full font-sans text-[13px] leading-relaxed text-ink-muted">The desk found no source it could use. Send it back with a note, or leave it for later; there is nothing here to approve.</p>
        ) : (
          <form action={decide}>
            <input type="hidden" name="draft" value={draft.id} />
            <input type="hidden" name="artist" value={artist} />
            <input type="hidden" name="decision" value="approved" />
            <button type="submit" className="border border-ink-muted px-5 py-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink">
              Approve
            </button>
          </form>
        )}
        <details className="group">
          <summary className={`cursor-pointer list-none ${quiet}`}>Not this, with a note</summary>
          <form action={decide} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="draft" value={draft.id} />
            <input type="hidden" name="artist" value={artist} />
            <input type="hidden" name="decision" value="rejected" />
            <label htmlFor={`${field}-note`} className="font-sans text-[13px] text-ink-muted">
              What should the next draft do differently?
            </label>
            <textarea
              id={`${field}-note`}
              name="note"
              required
              rows={3}
              maxLength={1000}
              placeholder="too much about the films; say more about the prints"
              className="w-full border border-ink-faint bg-gallery-raised px-3 py-2 font-sans text-[15px] text-ink placeholder:text-ink-faint focus:border-ink-muted focus:outline-none"
            />
            <button type="submit" className="self-start border border-ink-faint px-5 py-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-muted transition-colors hover:border-ink-muted hover:text-ink">
              Send back to the desk
            </button>
          </form>
        </details>
      </div>
    </section>
  );
}

/**
 * `npm run draft -- --artist "Halter"` — the drafting desk (M2-04). Run on Workshop.
 *
 *   npm run draft -- --artist "Halter" --artist "Kentridge"   drafts for the artists named (surname or name, any case)
 *   npm run draft -- --artists 5                               the first five artists, in the register's order
 *   npm run draft -- --all                                     every field with no draft or one sent back; waiting and approved fields are left (M2-01)
 *   npm run draft -- --artist "Halter" --report ~/Desktop/Drafts.md   where the readable report lands
 *   npm run draft -- --artist "Halter" --no-db                 the report only; nothing written to the table
 *
 * For each artist: a short biography and one sentence on why they matter, every sentence tied to
 * sources a person can check — Michael's supplied texts first, then the passages filed from his books
 * (context/library/, M2-04c), then the model's search of the allowlisted sites — checked by rule and read a second time against the prohibition list. The
 * desk refuses to run without the list. Drafts go to the `drafts` table (owner-only) and to a report.
 * Where the owner rejected the previous draft of a field with a note, the next draft is written to
 * answer it, and records which draft it answers (M2-01).
 *
 * Needs, in ~/curator/.env: ANTHROPIC_API_KEY, DATABASE_URL (and DATABASE_SSL_CA), CURATOR_CONTEXT_DIR
 * (the project folder's context/, where artists/<Surname>_<Given>.md and library/<book>/ live). Optional:
 * CURATOR_DRAFT_MODEL, CURATOR_DRAFTS_DIR, CURATOR_COLLECTION_NAME.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { sslFor } from "../src/lib/db";
import { loadAllowlist, resolving } from "../src/lib/drafting/allowlist";
import { anthropicModel } from "../src/lib/drafting/anthropic";
import { draftArtist } from "../src/lib/drafting/desk";
import { answersFor, fieldsToDraft, latestPerField, onlyFields, wantsDraft, type DraftRow } from "../src/lib/drafting/pending";
import { ARTIST_COLUMNS, toArtistInput, WORK_COLUMNS, type ArtistRow, type WorkRow } from "../src/lib/drafting/input";
import { loadList } from "../src/lib/drafting/list";
import { renderReport, type RunMeta } from "../src/lib/drafting/report";
import { librarySources } from "../src/lib/drafting/library";
import { suppliedSources } from "../src/lib/drafting/sources";
import { fold } from "../src/lib/drafting/sources";
import type { Draft } from "../src/lib/drafting/types";
import { loadEnvFile, required } from "../src/lib/env";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const values = (name: string) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const expand = (p: string) => path.resolve(p.replace(/^~(?=$|\/)/, homedir()));

const repo = path.resolve(__dirname, "..");
const LIST_PATH = path.join(repo, "docs", "drafting", "prohibition-list.md");
const ALLOWLIST_PATH = path.join(repo, "docs", "drafting", "sources-allowlist.md");

async function main() {
  const names = values("--artist");
  const count = Number(values("--artists")[0] ?? 0);
  const every = flag("--all");
  if (names.length === 0 && !(count > 0) && !every) {
    console.error('Usage: npm run draft -- --artist "Halter" [--artist "Kentridge"] | --artists 5 | --all   [--report <file>] [--no-db]');
    process.exit(2);
  }
  const envFile = loadEnvFile();
  if (envFile) console.log(`env: ${envFile}`);

  // The live model runs only with the key; nothing else is tried before this.
  required("ANTHROPIC_API_KEY");
  const list = loadList(LIST_PATH);
  console.log(`the prohibition list: ${list.rules.length} rules, version ${list.version}`);
  const contextDir = process.env.CURATOR_CONTEXT_DIR ? expand(process.env.CURATOR_CONTEXT_DIR) : null;
  if (!contextDir) throw new Error("Missing CURATOR_CONTEXT_DIR: the project folder's context/, where the supplied texts live. Set it in ~/curator/.env.");
  const { ok: sites, failed } = await resolving(loadAllowlist(ALLOWLIST_PATH));
  console.log(`allowlisted sites: ${sites.length} resolve${failed.length ? `; ${failed.length} do not (${failed.map((s) => s.domain).join(", ")})` : ""}`);

  const model = anthropicModel();
  const collectionName = process.env.CURATOR_COLLECTION_NAME ?? "Michael Roets Collection";
  const url = required("DATABASE_URL");
  const db = new Client({ connectionString: url, ssl: sslFor(url) });
  await db.connect();
  const drafts: Draft[] = [];
  const failures: RunMeta["failures"] = [];
  let table: RunMeta["table"] = flag("--no-db") ? "skipped" : "written";
  try {
    await db.query("select set_config('app.actor', 'draft', false)");
    const col = await db.query<{ id: string }>("select id from collections where name = $1", [collectionName]);
    if (!col.rows[0]) throw new Error(`No collection named "${collectionName}". Run npm run ingest first.`);
    const cid = col.rows[0].id;
    // The owner's name, from the collection's: never in a draft (rule 5). "Michael Roets Collection" → "Michael Roets", "Roets".
    const ownerName = collectionName.replace(/\s+collection$/i, "").trim();
    const neverName = ownerName && ownerName !== collectionName ? [ownerName, ownerName.split(/\s+/).slice(-1)[0]] : [];

    // The minimal input: these columns and no others (rule 5).
    const all = (await db.query<ArtistRow>(`select ${ARTIST_COLUMNS.join(", ")} from artists where collection_id = $1 order by surname, given_name`, [cid])).rows;
    // --all: by field, only where there is no draft yet or the newest draft was sent back — a waiting draft is left
    // for the owner to read, an approved one stands (M2-01, the review of PR #14 and its check of round two). An artist
    // is drafted when some field of theirs is; the desk writes both texts, and only the wanted fields are kept.
    // The drafts' statuses never reach the model.
    const latest = every
      ? latestPerField((await db.query<DraftRow>("select id, artist_id, field, status, created_at, decided_at, note from drafts where collection_id = $1 and subject = 'artist'", [cid])).rows)
      : null;
    const chosen = names.length
      ? names.map((name) => {
          const key = fold(name);
          const matches = all.filter((a) => fold(a.surname) === key || fold(a.display_name) === key || fold(a.display_name).includes(key));
          if (matches.length === 0) throw new Error(`No artist matches "${name}".`);
          if (matches.length > 1) throw new Error(`"${name}" matches ${matches.map((a) => a.display_name).join(", ")} — say which.`);
          return matches[0];
        })
      : latest
        ? all.filter((a) => wantsDraft(latest.get(a.id)))
        : all.slice(0, count);
    if (every) console.log(`--all: ${chosen.length} of ${all.length} artist(s) have a field with no draft or one sent back; the rest wait or stand approved`);
    const works = (
      await db.query<WorkRow>(`select ${WORK_COLUMNS.join(", ")} from items where collection_id = $1 and source_removed_at is null and artist_id = any($2::uuid[]) order by year nulls last, title`, [
        cid,
        chosen.map((a) => a.id),
      ])
    ).rows;

    for (const row of chosen) {
      const artist = toArtistInput(
        row,
        works.filter((w) => w.artist_id === row.id),
      );
      console.log(`\n${artist.displayName} — ${artist.works.length} work(s) here`);
      try {
        // the owner's note on a rejected previous draft, by field: the next draft answers it (M2-01)
        const earlier = (await db.query<DraftRow>("select id, artist_id, field, status, created_at, decided_at, note from drafts where artist_id = $1 and subject = 'artist'", [artist.id])).rows;
        const answers = answersFor(earlier);
        for (const [field, a] of Object.entries(answers)) if (a) console.log(`  answering the note on the previous ${field === "biography" ? "biography" : "why they matter"}: “${a.note}”`);
        const written = await draftArtist(artist, { model, list, sites, supplied: (a) => [...suppliedSources(contextDir, a), ...librarySources(contextDir, a)], neverName }, { answers });
        // under --all, a field that waits or stands approved is not drafted over: only the wanted fields are kept
        const draft = latest ? onlyFields(written, fieldsToDraft(latest.get(artist.id))) : written;
        drafts.push(draft);
        for (const f of draft.fields) console.log(`  ${f.field}: ${f.sentences.length} sentence(s) kept, ${f.removed.length} removed, ${f.flagged.length} flagged`);
        if (table === "written") {
          try {
            for (const f of draft.fields) {
              await db.query(
                `insert into drafts (collection_id, subject, artist_id, field, text, sentences, sources, removed, flagged, list_version, model, answers)
                 values ($1, 'artist', $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11)`,
                [cid, artist.id, f.field, f.text, JSON.stringify(f.sentences), JSON.stringify(draft.sources), JSON.stringify(f.removed), JSON.stringify(f.flagged), draft.listVersion, draft.model, draft.answers?.[f.field]?.draftId ?? null],
              );
            }
          } catch (err) {
            if ((err as { code?: string }).code === "42P01") {
              table = "missing";
              console.log("  the drafts table is not there yet (the migration awaits a yes); the report holds the drafts");
            } else {
              // the draft stands in the report; only the table missed it — never listed as drafted and not drafted both (M2-04b)
              const message = err instanceof Error ? err.message : String(err);
              draft.notes.push(`not written to the drafts table: ${message}`);
              console.error(`  not written to the drafts table: ${message}`);
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ artist: artist.displayName, error: message });
        console.error(`  not drafted: ${message}`);
      }
    }
  } finally {
    await db.end();
  }

  const date = new Date();
  const reportPath = values("--report")[0]
    ? expand(values("--report")[0])
    : path.join(expand(process.env.CURATOR_DRAFTS_DIR ?? "~/curator/drafts"), `Drafts_${date.toISOString().slice(0, 10)}.md`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    renderReport(drafts, { date, listPath: path.relative(repo, LIST_PATH), listVersion: list.version, model: model.name, allowlistPath: path.relative(repo, ALLOWLIST_PATH), sites, unresolved: failed, contextDir, table, failures }),
  );
  console.log(`\n${drafts.length} draft(s) written to the report: ${reportPath}${failures.length ? `; ${failures.length} not drafted` : ""}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

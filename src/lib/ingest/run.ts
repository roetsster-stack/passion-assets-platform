/**
 * The ingest runner: Airtable → the platform's record of truth. Idempotent — a second run with the
 * same source changes nothing, and a single edit in Airtable changes exactly one row.
 *
 * Three phases:
 *   A. read and map (no writes)
 *   B. one transaction: artists, items, ownership, provenance
 *   C. attachments, one at a time, each committed as it lands — so an interrupted run resumes
 *      where it stopped and never leaves a half-written picture.
 */
import { createHash } from "node:crypto";
import type { Client } from "pg";
import type { AirtableAttachment, AirtableRecord, AirtableSource } from "./airtable";
import { COLLECTION_TABLE, PROVENANCE_TABLE } from "./fields";
import { artistFromRecord, mapItem, mapProvenance, rawForStorage, type ArtistRow, type ItemRow, type ProvenanceRow } from "./map";
import type { ObjectStore } from "./storage";

export type Counts = { created: number; updated: number; unchanged: number; removed: number };
const zero = (): Counts => ({ created: 0, updated: 0, unchanged: 0, removed: 0 });

export type IngestReport = {
  runId: string;
  collectionId: string;
  artists: Counts;
  items: Counts;
  ownership: Counts;
  provenance: Counts;
  images: Counts;
  documents: Counts;
  flagged: number;
  attachmentErrors: { itemRecordId: string; attachmentId: string; error: string }[];
  durationMs: number;
};

export type IngestDeps = {
  db: Client;
  source: AirtableSource;
  store: ObjectStore;
  fetchImpl?: (url: string) => Promise<Response>;
  collectionName: string;
  mastersBucket: string;
  actor?: string;
  skipAttachments?: boolean;
  log?: (msg: string) => void;
};

const SEED_OWNERS: { name: string; kind: "person" | "joint" | "company" }[] = [
  { name: "Michael", kind: "person" },
  { name: "Catherina", kind: "person" },
  { name: "Joint", kind: "joint" },
  { name: "Terracura", kind: "company" },
];

const ITEM_COLUMNS = [
  "artist_id",
  "title",
  "year_text",
  "year",
  "medium",
  "materials",
  "dimensions_framed",
  "dimensions_unframed",
  "edition",
  "acquired_on",
  "purchase_price",
  "purchase_currency",
  "purchase_price_zar",
  "acquired_from",
  "credit_gallery",
  "current_value",
  "current_value_currency",
  "status",
  "sold_year",
  "location",
  "location_tags",
  "condition_note",
  "admin_notes",
  "comments_raw",
  "notes_raw",
  "links",
  "has_high_res",
  "has_low_res",
  "has_invoice",
  "has_coa",
  "high_res_note",
  "airtable_modified_at",
  "airtable_raw",
  "content_hash",
] as const;

function itemValues(row: ItemRow, artistId: string | null, raw: Record<string, unknown>): unknown[] {
  return [
    artistId,
    row.title,
    row.year_text,
    row.year,
    row.medium,
    row.materials,
    row.dimensions_framed,
    row.dimensions_unframed,
    row.edition,
    row.acquired_on,
    row.purchase_price,
    row.purchase_currency,
    row.purchase_price_zar,
    row.acquired_from,
    row.credit_gallery,
    row.current_value,
    row.current_value_currency,
    row.status,
    row.sold_year,
    row.location,
    row.location_tags,
    row.condition_note,
    row.admin_notes,
    row.comments_raw,
    row.notes_raw,
    row.links,
    row.has_high_res,
    row.has_low_res,
    row.has_invoice,
    row.has_coa,
    row.high_res_note,
    row.airtable_modified_at,
    JSON.stringify(raw),
    row.content_hash,
  ];
}

function safeName(filename: string): string {
  const base = filename.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "file").slice(0, 80);
}

function extOf(a: AirtableAttachment): string {
  const m = a.filename.match(/\.([A-Za-z0-9]{1,5})$/);
  if (m) return m[1].toLowerCase();
  const byType: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/tiff": "tif", "application/pdf": "pdf" };
  return (a.type && byType[a.type]) || "bin";
}

export async function runIngest(deps: IngestDeps): Promise<IngestReport> {
  const { db, source, store } = deps;
  const log = deps.log ?? (() => {});
  const fetchImpl = deps.fetchImpl ?? ((url: string) => fetch(url));
  const actor = deps.actor ?? "ingest:airtable";
  const started = Date.now();

  await db.query("select set_config('app.actor', $1, false)", [actor]);

  // -- the collection and the run row ---------------------------------------------------------
  const collectionId = await ensureCollection(db, deps.collectionName);
  const runRes = await db.query<{ id: string }>(
    "insert into ingest_runs (collection_id, source, run_by) values ($1, 'airtable', $2) returning id",
    [collectionId, actor],
  );
  const runId = runRes.rows[0].id;

  const report: IngestReport = {
    runId,
    collectionId,
    artists: zero(),
    items: zero(),
    ownership: zero(),
    provenance: zero(),
    images: zero(),
    documents: zero(),
    flagged: 0,
    attachmentErrors: [],
    durationMs: 0,
  };

  try {
    // -- phase A: read and map ----------------------------------------------------------------
    log("Reading the base…");
    const [itemRecords, provRecords] = await Promise.all([source.listAll(COLLECTION_TABLE), source.listAll(PROVENANCE_TABLE)]);
    const items = itemRecords.map((r) => ({ record: r, row: mapItem(r) }));
    const provenance = provRecords.map(mapProvenance).filter((p): p is ProvenanceRow => p !== null);
    const artists = new Map<string, ArtistRow>();
    for (const r of itemRecords) {
      const a = artistFromRecord(r);
      if (a && !artists.has(a.normalized_key)) artists.set(a.normalized_key, a);
    }
    report.flagged = items.filter((i) => i.row.admin_notes).length;
    log(`${items.length} works, ${artists.size} artists, ${provenance.length} provenance lines.`);

    // -- phase B: one transaction -------------------------------------------------------------
    await db.query("begin");
    try {
      const ownerIds = await ensureOwners(db, collectionId);
      const artistIds = await syncArtists(db, collectionId, artists, report.artists);
      const itemIds = await syncItems(db, collectionId, items, artistIds, report.items);
      await removeOrphanArtists(db, collectionId, artists, report.artists);
      await syncOwnership(db, collectionId, items, itemIds, ownerIds, report.ownership);
      await syncProvenance(db, collectionId, provenance, itemIds, report.provenance);
      await db.query("commit");
    } catch (err) {
      await db.query("rollback");
      throw err;
    }

    // -- phase C: attachments -----------------------------------------------------------------
    if (!deps.skipAttachments) {
      const itemIds = await loadItemIds(db, collectionId);
      await syncAttachments(db, store, fetchImpl, deps.mastersBucket, collectionId, items, provenance, itemIds, report, log);
    }

    report.durationMs = Date.now() - started;
    await db.query("update ingest_runs set finished_at = now(), status = 'succeeded', counts = $2 where id = $1", [
      runId,
      JSON.stringify(summarise(report)),
    ]);
    return report;
  } catch (err) {
    report.durationMs = Date.now() - started;
    await db.query("update ingest_runs set finished_at = now(), status = 'failed', counts = $2, error = $3 where id = $1", [
      runId,
      JSON.stringify(summarise(report)),
      err instanceof Error ? err.message : String(err),
    ]);
    throw err;
  }
}

function summarise(r: IngestReport) {
  return {
    artists: r.artists,
    items: r.items,
    ownership: r.ownership,
    provenance: r.provenance,
    images: r.images,
    documents: r.documents,
    flagged: r.flagged,
    attachmentErrors: r.attachmentErrors.length,
    durationMs: r.durationMs,
  };
}

// ---------------------------------------------------------------------------------------------

async function ensureCollection(db: Client, name: string): Promise<string> {
  const existing = await db.query<{ id: string }>("select id from collections where name = $1", [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await db.query<{ id: string }>("insert into collections (name) values ($1) returning id", [name]);
  return created.rows[0].id;
}

async function ensureOwners(db: Client, collectionId: string): Promise<Map<string, string>> {
  for (const o of SEED_OWNERS) {
    await db.query(
      "insert into owners (collection_id, name, kind) values ($1, $2, $3) on conflict (collection_id, name) do nothing",
      [collectionId, o.name, o.kind],
    );
  }
  const res = await db.query<{ id: string; name: string }>("select id, name from owners where collection_id = $1", [collectionId]);
  return new Map(res.rows.map((r) => [r.name.toLowerCase(), r.id]));
}

async function syncArtists(db: Client, collectionId: string, wanted: Map<string, ArtistRow>, counts: Counts): Promise<Map<string, string>> {
  const existing = await db.query<{ id: string; normalized_key: string; surname: string; given_name: string | null; display_name: string; nationality: string[] }>(
    "select id, normalized_key, surname, given_name, display_name, nationality from artists where collection_id = $1",
    [collectionId],
  );
  const byKey = new Map(existing.rows.map((r) => [r.normalized_key, r]));
  const ids = new Map<string, string>();

  for (const [key, a] of wanted) {
    const cur = byKey.get(key);
    if (!cur) {
      const ins = await db.query<{ id: string }>(
        "insert into artists (collection_id, surname, given_name, display_name, normalized_key, nationality) values ($1,$2,$3,$4,$5,$6) returning id",
        [collectionId, a.surname, a.given_name, a.display_name, a.normalized_key, a.nationality],
      );
      ids.set(key, ins.rows[0].id);
      counts.created++;
    } else {
      ids.set(key, cur.id);
      const same =
        cur.surname === a.surname &&
        (cur.given_name ?? null) === a.given_name &&
        cur.display_name === a.display_name &&
        JSON.stringify(cur.nationality) === JSON.stringify(a.nationality);
      if (same) counts.unchanged++;
      else {
        await db.query("update artists set surname=$2, given_name=$3, display_name=$4, nationality=$5 where id=$1", [
          cur.id,
          a.surname,
          a.given_name,
          a.display_name,
          a.nationality,
        ]);
        counts.updated++;
      }
    }
  }

  return ids;
}

/** Artists no longer referenced by any work — a renamed artist leaves one behind. Runs after items. */
async function removeOrphanArtists(db: Client, collectionId: string, wanted: Map<string, ArtistRow>, counts: Counts) {
  const orphaned = await db.query<{ id: string }>(
    "delete from artists a where a.collection_id = $1 and not exists (select 1 from items i where i.artist_id = a.id) and a.normalized_key <> all($2::text[]) returning id",
    [collectionId, [...wanted.keys()]],
  );
  counts.removed += orphaned.rowCount ?? 0;
}

async function syncItems(
  db: Client,
  collectionId: string,
  items: { record: AirtableRecord; row: ItemRow }[],
  artistIds: Map<string, string>,
  counts: Counts,
): Promise<Map<string, string>> {
  const existing = await db.query<{ id: string; airtable_record_id: string; content_hash: string | null; artist_id: string | null }>(
    "select id, airtable_record_id, content_hash, artist_id from items where collection_id = $1 and airtable_record_id is not null",
    [collectionId],
  );
  const byRec = new Map(existing.rows.map((r) => [r.airtable_record_id, r]));
  const ids = new Map<string, string>();
  const seen = new Set<string>();

  const setClause = ITEM_COLUMNS.map((c, i) => `${c} = $${i + 2}`).join(", ");
  const insertCols = ["collection_id", "airtable_record_id", ...ITEM_COLUMNS].join(", ");
  const insertParams = ["collection_id", "airtable_record_id", ...ITEM_COLUMNS].map((_, i) => `$${i + 1}`).join(", ");

  for (const { record, row } of items) {
    seen.add(row.airtable_record_id);
    const artistId = row.artist_key ? (artistIds.get(row.artist_key) ?? null) : null;
    const cur = byRec.get(row.airtable_record_id);
    if (cur && cur.content_hash === row.content_hash && cur.artist_id === artistId) {
      ids.set(row.airtable_record_id, cur.id);
      counts.unchanged++;
      continue;
    }
    const values = itemValues(row, artistId, rawForStorage(record));
    if (cur) {
      await db.query(`update items set ${setClause} where id = $1`, [cur.id, ...values]);
      ids.set(row.airtable_record_id, cur.id);
      counts.updated++;
    } else {
      const ins = await db.query<{ id: string }>(`insert into items (${insertCols}) values (${insertParams}) returning id`, [
        collectionId,
        row.airtable_record_id,
        ...values,
      ]);
      ids.set(row.airtable_record_id, ins.rows[0].id);
      counts.created++;
    }
  }

  // Records gone from Airtable are gone here too — Airtable is the register until M2. The audit
  // log keeps the full old row. (A sold work is a status in Airtable, never a deleted record.)
  const gone = existing.rows.filter((r) => !seen.has(r.airtable_record_id));
  if (gone.length) {
    const del = await db.query("delete from items where id = any($1::uuid[])", [gone.map((g) => g.id)]);
    counts.removed += del.rowCount ?? 0;
  }
  return ids;
}

async function syncOwnership(
  db: Client,
  collectionId: string,
  items: { record: AirtableRecord; row: ItemRow }[],
  itemIds: Map<string, string>,
  ownerIds: Map<string, string>,
  counts: Counts,
) {
  const existing = await db.query<{ item_id: string; owner_id: string }>("select item_id, owner_id from item_owners where collection_id = $1", [collectionId]);
  const have = new Set(existing.rows.map((r) => `${r.item_id}|${r.owner_id}`));
  const want = new Set<string>();

  for (const { row } of items) {
    const itemId = itemIds.get(row.airtable_record_id);
    if (!itemId) continue;
    for (const name of row.owner_names) {
      let ownerId = ownerIds.get(name.toLowerCase());
      if (!ownerId) {
        const ins = await db.query<{ id: string }>("insert into owners (collection_id, name, kind) values ($1, $2, 'person') returning id", [
          collectionId,
          name,
        ]);
        ownerId = ins.rows[0].id;
        ownerIds.set(name.toLowerCase(), ownerId);
      }
      const key = `${itemId}|${ownerId}`;
      want.add(key);
      if (have.has(key)) counts.unchanged++;
      else {
        await db.query("insert into item_owners (collection_id, item_id, owner_id) values ($1, $2, $3)", [collectionId, itemId, ownerId]);
        counts.created++;
      }
    }
  }
  for (const r of existing.rows) {
    const key = `${r.item_id}|${r.owner_id}`;
    if (!want.has(key)) {
      await db.query("delete from item_owners where item_id = $1 and owner_id = $2", [r.item_id, r.owner_id]);
      counts.removed++;
    }
  }
}

async function syncProvenance(db: Client, collectionId: string, provenance: ProvenanceRow[], itemIds: Map<string, string>, counts: Counts) {
  const existing = await db.query<{ id: string; airtable_record_id: string; item_id: string; content_hash: string | null }>(
    "select id, airtable_record_id, item_id, content_hash from provenance_events where collection_id = $1 and airtable_record_id is not null",
    [collectionId],
  );
  const byKey = new Map(existing.rows.map((r) => [`${r.airtable_record_id}|${r.item_id}`, r]));
  const want = new Set<string>();

  for (const p of provenance) {
    for (const [i, itemRec] of p.item_record_ids.entries()) {
      const itemId = itemIds.get(itemRec);
      if (!itemId) continue; // a link to a record that is not in the Collection table
      const key = `${p.airtable_record_id}|${itemId}`;
      want.add(key);
      const cur = byKey.get(key);
      if (cur && cur.content_hash === p.content_hash) {
        counts.unchanged++;
        continue;
      }
      if (cur) {
        await db.query(
          "update provenance_events set label=$2, details_url=$3, reviews=$4, added_info=$5, sort_order=$6, content_hash=$7 where id=$1",
          [cur.id, p.label, p.details_url, p.reviews, p.added_info, i, p.content_hash],
        );
        counts.updated++;
      } else {
        await db.query(
          "insert into provenance_events (collection_id, item_id, label, details_url, reviews, added_info, sort_order, airtable_record_id, content_hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [collectionId, itemId, p.label, p.details_url, p.reviews, p.added_info, i, p.airtable_record_id, p.content_hash],
        );
        counts.created++;
      }
    }
  }
  for (const r of existing.rows) {
    if (!want.has(`${r.airtable_record_id}|${r.item_id}`)) {
      await db.query("delete from provenance_events where id = $1", [r.id]);
      counts.removed++;
    }
  }
}

async function loadItemIds(db: Client, collectionId: string): Promise<Map<string, string>> {
  const res = await db.query<{ id: string; airtable_record_id: string }>(
    "select id, airtable_record_id from items where collection_id = $1 and airtable_record_id is not null",
    [collectionId],
  );
  return new Map(res.rows.map((r) => [r.airtable_record_id, r.id]));
}

type PendingAttachment = {
  itemRecordId: string;
  itemId: string;
  attachment: AirtableAttachment;
  target: "images" | "documents";
  kind: "lowres_airtable" | "invoice" | "coa" | "other";
  sortOrder: number;
};

async function syncAttachments(
  db: Client,
  store: ObjectStore,
  fetchImpl: (url: string) => Promise<Response>,
  bucket: string,
  collectionId: string,
  items: { record: AirtableRecord; row: ItemRow }[],
  provenance: ProvenanceRow[],
  itemIds: Map<string, string>,
  report: IngestReport,
  log: (m: string) => void,
) {
  const pending: PendingAttachment[] = [];
  for (const { row } of items) {
    const itemId = itemIds.get(row.airtable_record_id);
    if (!itemId) continue;
    for (const a of row.attachments) {
      pending.push({
        itemRecordId: row.airtable_record_id,
        itemId,
        attachment: a.attachment,
        target: a.group === "image" ? "images" : "documents",
        kind: a.group === "image" ? "lowres_airtable" : a.group,
        sortOrder: a.sort_order,
      });
    }
  }
  for (const p of provenance) {
    for (const itemRec of p.item_record_ids) {
      const itemId = itemIds.get(itemRec);
      if (!itemId) continue;
      p.attachments.forEach((att, i) =>
        pending.push({ itemRecordId: itemRec, itemId, attachment: att, target: "documents", kind: "other", sortOrder: 100 + i }),
      );
    }
  }

  const haveImages = await db.query<{ source_ref: string; item_id: string }>(
    "select source_ref, item_id from images where collection_id = $1 and source = 'airtable'",
    [collectionId],
  );
  const haveDocs = await db.query<{ source_ref: string; item_id: string }>(
    "select source_ref, item_id from documents where collection_id = $1 and source = 'airtable'",
    [collectionId],
  );
  const have = {
    images: new Set(haveImages.rows.map((r) => `${r.item_id}|${r.source_ref}`)),
    documents: new Set(haveDocs.rows.map((r) => `${r.item_id}|${r.source_ref}`)),
  };
  const want = { images: new Set<string>(), documents: new Set<string>() };

  let n = 0;
  for (const p of pending) {
    const key = `${p.itemId}|${p.attachment.id}`;
    want[p.target].add(key);
    if (have[p.target].has(key)) {
      report[p.target].unchanged++;
      continue;
    }
    n++;
    try {
      const res = await fetchImpl(p.attachment.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      const sha = createHash("sha256").update(body).digest("hex");
      const contentType = p.attachment.type ?? res.headers.get("content-type") ?? "application/octet-stream";
      const storageKey =
        p.target === "images"
          ? `collections/${collectionId}/items/${p.itemId}/source/${sha}.${extOf(p.attachment)}`
          : `collections/${collectionId}/items/${p.itemId}/documents/${sha}-${safeName(p.attachment.filename)}`;
      await store.putIfAbsent(bucket, storageKey, body, contentType);

      if (p.target === "images") {
        await db.query(
          `insert into images (collection_id, item_id, kind, storage_bucket, storage_key, content_type, bytes, width, height, sha256, source, source_ref, original_filename, is_hero, sort_order)
           values ($1,$2,'lowres_airtable',$3,$4,$5,$6,$7,$8,$9,'airtable',$10,$11,$12,$13)
           on conflict (storage_bucket, storage_key) do update set source_ref = excluded.source_ref, sort_order = excluded.sort_order`,
          [collectionId, p.itemId, bucket, storageKey, contentType, body.length, p.attachment.width ?? null, p.attachment.height ?? null, sha, p.attachment.id, p.attachment.filename, p.sortOrder === 0, p.sortOrder],
        );
      } else {
        await db.query(
          `insert into documents (collection_id, item_id, kind, storage_bucket, storage_key, content_type, bytes, sha256, source, source_ref, original_filename, sort_order)
           values ($1,$2,$3,$4,$5,$6,$7,$8,'airtable',$9,$10,$11)
           on conflict (storage_bucket, storage_key) do update set source_ref = excluded.source_ref, sort_order = excluded.sort_order`,
          [collectionId, p.itemId, p.kind, bucket, storageKey, contentType, body.length, sha, p.attachment.id, p.attachment.filename, p.sortOrder],
        );
      }
      report[p.target].created++;
      if (n % 10 === 0) log(`…${n} files copied`);
    } catch (err) {
      report.attachmentErrors.push({ itemRecordId: p.itemRecordId, attachmentId: p.attachment.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Rows whose attachment no longer exists in Airtable. The object stays in the bucket (write-once).
  for (const target of ["images", "documents"] as const) {
    for (const key of have[target]) {
      if (want[target].has(key)) continue;
      const [itemId, sourceRef] = key.split("|");
      const del = await db.query(`delete from ${target} where collection_id = $1 and source = 'airtable' and item_id = $2 and source_ref = $3`, [
        collectionId,
        itemId,
        sourceRef,
      ]);
      report[target].removed += del.rowCount ?? 0;
    }
  }
}

/**
 * The ingest and the row-level security, against a real Postgres. Runs when TEST_DATABASE_URL is
 * set (CI starts one); skipped otherwise, so `npm test` still passes on a laptop with no database.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticSource } from "@/lib/ingest/airtable";
import { COLLECTION_TABLE, F } from "@/lib/ingest/fields";
import { runIngest, type IngestDeps } from "@/lib/ingest/run";
import { createMemoryStore, type ObjectStore } from "@/lib/ingest/storage";
import { ladderFor } from "@/lib/images/ladder";
import { loadMasterWorks, prepareFolders, runMasters } from "@/lib/images/masters-run";
import { pictureTally, settleHeroes } from "@/lib/images/pictures";
import { allTiles, pyramid } from "@/lib/images/pyramid";
import type { Renderer } from "@/lib/images/render";
import { RULES, collectionRecords, fakeFetch, tables } from "../ingest/fixture";

const url = process.env.TEST_DATABASE_URL;
const root = path.resolve(__dirname, "..", "..");

// In CI the database is always there; a silent skip would look like a pass. Refuse that.
if (process.env.CI && !url) throw new Error("TEST_DATABASE_URL is not set in CI — the database tests would be skipped.");

// These tests drop and recreate the public schema. Only ever on a local or explicitly-named test database.
if (url && !/@(localhost|127\.0\.0\.1)[:/]/.test(url) && !/_test\b/.test(url)) {
  throw new Error("TEST_DATABASE_URL must point at localhost or a database whose name ends in _test.");
}

describe.skipIf(!url)("M1-01 · the record arrives", () => {
  let db: Client;
  const USER_A = "11111111-1111-4111-8111-111111111111"; // a member (owner)
  const USER_B = "22222222-2222-4222-8222-222222222222"; // a stranger
  const ALL_TABLES = ["collections", "collection_members", "owners", "artists", "items", "item_private", "item_owners", "provenance_events", "provenance_private", "images", "documents", "ingest_runs", "audit_log", "drafts"];
  /** The owner-only half of a work (SEC-02): off `items`, on `item_private`, read by the owner alone. */
  const PRIVATE = ["purchase_price", "purchase_currency", "purchase_price_zar", "current_value", "current_value_currency", "valuation_date", "valuation_source", "airtable_modified_at", "location", "location_tags", "condition_note", "admin_notes", "comments_raw", "notes_raw", "airtable_raw"];
  /** Everything `items` may carry — the whole list, so a new column fails here until it is placed on purpose (SEC-02, the review's should-fix 4). */
  const ITEMS_COLUMNS = [
    "id", "collection_id", "category", "artist_id", "title", "year_text", "year", "medium", "materials", "dimensions_framed", "dimensions_unframed", "edition",
    "acquired_on", "acquired_from", "credit_gallery", "status", "sold_year", "collectors_story", "work_context", "links", "has_high_res", "has_low_res", "has_invoice",
    "has_coa", "high_res_note", "visibility", "airtable_record_id", "content_hash", "source_removed_at", "created_at", "updated_at",
  ];
  /** A provenance line's owner-only half (SEC-02, 19 Nov): the reviews column and the raw record, on `provenance_private`. */
  const PROVENANCE_PRIVATE = ["reviews", "airtable_raw"];
  /** Everything `provenance_events` may carry — the label and its order, which the single work shows, and the rest of the line. */
  const PROVENANCE_COLUMNS = ["id", "collection_id", "item_id", "label", "event_type", "event_date", "party", "details_url", "added_info", "sort_order", "airtable_record_id", "content_hash", "created_at", "updated_at"];

  function deps(overrides: Partial<IngestDeps> = {}): IngestDeps {
    return {
      db,
      source: createStaticSource(tables()),
      store: createMemoryStore(),
      rules: RULES,
      fetchImpl: fakeFetch,
      collectionName: "Test Collection",
      mastersBucket: "test-masters",
      ...overrides,
    };
  }

  // A session is a JWT; Supabase exposes its claims to SQL as `request.jwt.claims`. `aal` is the
  // assurance level: aal1 after the emailed link, aal2 after the authenticator code.
  async function asUser(userId: string | null, role: "authenticated" | "anon", sql: string, aal: "aal1" | "aal2" = "aal2") {
    await db.query("begin");
    try {
      await db.query(`set local role ${role}`);
      if (userId) {
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role, aal })]);
      }
      const res = await db.query(sql);
      return res.rows;
    } finally {
      await db.query("rollback");
    }
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;");
    await db.query(readFileSync(path.join(root, "tests", "db", "auth-shim.sql"), "utf8"));
    // A fresh Supabase project grants ALL on every table to the API roles by default, now and for
    // future tables. Reproduce that, so the migration is proven to take those privileges away.
    await db.query(
      "alter default privileges in schema public grant all on tables to anon, authenticated, service_role; alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;",
    );
    // …and lets them use the schema and execute every function. Reproduce that too, so that a refusal proves the
    // table's, the function's or the view's own grant, never the schema's (the review of PR #14, should-fix 6).
    await db.query(
      "grant usage on schema public to anon, authenticated, service_role; alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;",
    );
    // Every migration, in order — the schema as production will have it. Just before M1-02a's,
    // the register as main's ingest could have left it: a work carrying two pictures, because the
    // first photograph was marked at insert and never cleared when a newer one was added in front.
    const dir = path.join(root, "supabase", "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (file.startsWith("20261103150000")) migrationSeed = await seedTwoPictures();
      // Just before SEC-02's, a work as main's ingest wrote it: its money, place and notes on the items row itself.
      if (file.startsWith("20261118180000")) privateSeed = await seedPrivateFields(migrationSeed.collectionId);
      await db.query(readFileSync(path.join(dir, file), "utf8"));
      if (file.startsWith("20261103150000")) migrationSeed.after = await readSeed(migrationSeed.itemId);
      if (file.startsWith("20261118180000")) privateSeed.after = await readPrivateSeed(privateSeed.itemId, privateSeed.emptyId, privateSeed.lineId);
    }
    await db.query("delete from collections where id = $1", [migrationSeed.collectionId]);
    await db.query("delete from audit_log");
    await db.query("insert into auth.users (id, email) values ($1, 'a@example.test'), ($2, 'b@example.test')", [USER_A, USER_B]);
  });

  afterAll(async () => {
    await db?.end();
  });

  let migrationSeed: { collectionId: string; itemId: string; after: { storage_key: string; is_hero: boolean }[] };
  async function seedTwoPictures() {
    const c = await db.query<{ id: string }>("insert into collections (name) values ('Migration Seed') returning id");
    const i = await db.query<{ id: string }>("insert into items (collection_id, title) values ($1, 'Seed') returning id", [c.rows[0].id]);
    await db.query(
      `insert into images (collection_id, item_id, kind, storage_bucket, storage_key, is_hero, sort_order, created_at) values
         ($1, $2, 'lowres_airtable', 'b', 'the-older-photograph', true, 0, now() - interval '1 day'),
         ($1, $2, 'lowres_airtable', 'b', 'the-newer-photograph', true, 0, now())`,
      [c.rows[0].id, i.rows[0].id],
    );
    return { collectionId: c.rows[0].id, itemId: i.rows[0].id, after: [] };
  }
  async function readSeed(itemId: string) {
    return (await db.query<{ storage_key: string; is_hero: boolean }>("select storage_key, is_hero from images where item_id = $1 order by created_at", [itemId])).rows;
  }

  let privateSeed: {
    itemId: string;
    emptyId: string;
    lineId: string;
    after: { moved: Record<string, unknown> | null; empty: Record<string, unknown> | null; stillOnItems: string[]; audited: number; line: Record<string, unknown> | null; stillOnLines: string[] };
  };
  // Every one of the fifteen fields set on one work, and a second work with none of them (the review's nit 10).
  async function seedPrivateFields(collectionId: string) {
    const i = await db.query<{ id: string }>(
      `insert into items (collection_id, title, purchase_price, purchase_currency, purchase_price_zar, current_value, current_value_currency, valuation_date, valuation_source, airtable_modified_at,
                          location, location_tags, condition_note, admin_notes, comments_raw, notes_raw, airtable_raw)
       values ($1, 'Seed with a price', 1234.56, 'USD', 22000.50, 2000, 'USD', '2025-06-30', 'Airtable', '2025-06-30T10:00:00Z',
               'Hilltop House', '{"Hilltop House","Framed"}', 'A scratch', 'Flagged', 'A comment', 'A note', '{"fields": {"x": 1}}') returning id`,
      [collectionId],
    );
    const e = await db.query<{ id: string }>("insert into items (collection_id, title) values ($1, 'Seed with nothing private') returning id", [collectionId]);
    // and a provenance line the old way, its reviews and raw record on the line itself
    const l = await db.query<{ id: string }>(
      `insert into provenance_events (collection_id, item_id, label, details_url, reviews, added_info, sort_order, airtable_raw)
       values ($1, $2, 'Bought from a gallery', 'https://gallery.example/', 'Gallery_invoice_R45000.pdf', 'Added', 0, '{"fields": {"y": 2}}') returning id`,
      [collectionId, i.rows[0].id],
    );
    return { itemId: i.rows[0].id, emptyId: e.rows[0].id, lineId: l.rows[0].id, after: { moved: null, empty: null, stillOnItems: [], audited: 0, line: null, stillOnLines: [] } };
  }
  const PRIVATE_ROW = `select purchase_price::text, purchase_currency, purchase_price_zar::text, current_value::text, current_value_currency, valuation_date::text, valuation_source,
                              to_char(airtable_modified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as airtable_modified_at,
                              location, location_tags, condition_note, admin_notes, comments_raw, notes_raw, airtable_raw
                         from item_private where item_id = $1`;
  async function readPrivateSeed(itemId: string, emptyId: string, lineId: string) {
    const moved = (await db.query(PRIVATE_ROW, [itemId])).rows[0] ?? null;
    const empty = (await db.query(PRIVATE_ROW, [emptyId])).rows[0] ?? null;
    const line = (await db.query("select reviews, airtable_raw from provenance_private where provenance_event_id = $1", [lineId])).rows[0] ?? null;
    const stillOnLines = (
      await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'provenance_events' and column_name = any($1::text[])", [PROVENANCE_PRIVATE])
    ).rows.map((r) => r.column_name);
    const stillOnItems = (
      await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'items' and column_name = any($1::text[])", [PRIVATE])
    ).rows.map((r) => r.column_name);
    // the move itself is in the audit log, as the migration (the review's should-fix 3)
    const audited = Number(
      (
        await db.query<{ n: string }>(
          "select count(*) n from audit_log l join item_private p on p.id::text = l.row_id::text where l.table_name = 'item_private' and l.action = 'insert' and l.actor_label = 'migration:sec-02' and p.item_id = any($1::uuid[])",
          [[itemId, emptyId]],
        )
      ).rows[0].n,
    );
    return { moved, empty, stillOnItems, audited, line, stillOnLines };
  }

  it("M1-02a · the migration clears a work's second picture before it forbids one, so db push succeeds on main's data", () => {
    expect(migrationSeed.after).toEqual([
      { storage_key: "the-older-photograph", is_hero: true },
      { storage_key: "the-newer-photograph", is_hero: false },
    ]);
  });

  it("SEC-02 · the migration moves a work's money, valuation and its date, place and notes into the owner-only table — audited as the migration — and takes the columns off items", () => {
    expect(privateSeed.after.stillOnItems).toEqual([]);
    expect(privateSeed.after.moved).toEqual({
      purchase_price: "1234.56",
      purchase_currency: "USD",
      purchase_price_zar: "22000.50",
      current_value: "2000.00",
      current_value_currency: "USD",
      valuation_date: "2025-06-30",
      valuation_source: "Airtable",
      airtable_modified_at: "2025-06-30T10:00:00Z",
      location: "Hilltop House",
      location_tags: ["Hilltop House", "Framed"],
      condition_note: "A scratch",
      admin_notes: "Flagged",
      comments_raw: "A comment",
      notes_raw: "A note",
      airtable_raw: { fields: { x: 1 } },
    });
    // a work with nothing private still gets its row, empty
    expect(privateSeed.after.empty).toEqual({
      purchase_price: null,
      purchase_currency: null,
      purchase_price_zar: null,
      current_value: null,
      current_value_currency: null,
      valuation_date: null,
      valuation_source: null,
      airtable_modified_at: null,
      location: null,
      location_tags: [],
      condition_note: null,
      admin_notes: null,
      comments_raw: null,
      notes_raw: null,
      airtable_raw: null,
    });
    // both inserts are in the audit log, as the migration
    expect(privateSeed.after.audited).toBe(2);
    // and the provenance line's reviews and raw record moved the same way (19 Nov)
    expect(privateSeed.after.stillOnLines).toEqual([]);
    expect(privateSeed.after.line).toEqual({ reviews: "Gallery_invoice_R45000.pdf", airtable_raw: { fields: { y: 2 } } });
  });

  it("first run brings everything across; the second run changes nothing", async () => {
    const store = createMemoryStore();
    const d = deps({ store });

    const r1 = await runIngest(d);
    expect(r1.items).toEqual({ created: 3, updated: 0, unchanged: 0, removed: 0 });
    expect(r1.artists).toEqual({ created: 2, updated: 0, unchanged: 0, removed: 0 });
    expect(r1.ownership).toEqual({ created: 3, updated: 0, unchanged: 0, removed: 0 });
    expect(r1.provenance).toEqual({ created: 3, updated: 0, unchanged: 0, removed: 0 });
    expect(r1.images.created).toBe(4); // including the same file uploaded twice on the sculpture
    expect(r1.documents.created).toBe(3);
    expect(r1.attachmentErrors).toEqual([]);
    expect(r1.flagged).toBe(1);
    expect(r1.ownerDefaulted).toBe(2);
    expect(r1.provenanceDropped).toBe(1);
    expect(store.objects.size).toBe(7);
    for (const key of store.objects.keys()) expect(key).toMatch(/^test-masters\/collections\/[0-9a-f-]+\/items\/[0-9a-f-]+\/(source|documents)\/att/);

    const auditAfterFirst = await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'items'");
    expect(Number(auditAfterFirst.rows[0].n)).toBe(3);

    const r2 = await runIngest(d);
    expect(r2.items).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(r2.artists).toEqual({ created: 0, updated: 0, unchanged: 2, removed: 0 });
    expect(r2.ownership).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(r2.provenance).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(r2.images).toEqual({ created: 0, updated: 0, unchanged: 4, removed: 0 });
    expect(r2.documents).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(store.objects.size).toBe(7);

    const auditAfterSecond = await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'items'");
    expect(Number(auditAfterSecond.rows[0].n)).toBe(3);

    const runs = await db.query<{ status: string; run_by: string }>("select status, run_by from ingest_runs order by started_at");
    expect(runs.rows.map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
    expect(runs.rows[0].run_by).toBe("ingest:airtable");

    const actor = await db.query<{ actor_label: string }>("select distinct actor_label from audit_log");
    expect(actor.rows.map((r) => r.actor_label)).toEqual(["ingest:airtable"]);

    const runAudit = await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'ingest_runs'");
    expect(Number(runAudit.rows[0].n)).toBe(4); // two runs × (insert + final update)
  });

  it("the whole record travels, not only the mapped fields — on the owner-only half", async () => {
    const item = await db.query<{ airtable_raw: { fields: Record<string, unknown> } }>(
      "select p.airtable_raw from item_private p join items i on i.id = p.item_id where i.airtable_record_id = 'recAAA00000000001'",
    );
    expect(item.rows[0].airtable_raw.fields[F.title]).toBe("Study in Grey");
    expect(JSON.stringify(item.rows[0].airtable_raw)).not.toContain("cdn.example.test");
    const prov = await db.query<{ airtable_raw: { id: string } }>(
      "select p.airtable_raw from provenance_private p join provenance_events e on e.id = p.provenance_event_id where e.airtable_record_id = 'recPPP00000000001' limit 1",
    );
    expect(prov.rows[0].airtable_raw.id).toBe("recPPP00000000001");
  });

  it("a work's provenance line keeps the order of the work's own record", async () => {
    const line = await db.query<{ label: string; sort_order: number }>(
      "select p.label, p.sort_order from provenance_events p join items i on i.id = p.item_id where i.airtable_record_id = 'recAAA00000000002' order by p.sort_order",
    );
    expect(line.rows.map((r) => r.label)).toEqual(["Sold at auction, 2023", "Purchased from Gallery One (March 2024)"]);
    expect(line.rows.map((r) => r.sort_order)).toEqual([0, 1]);
  });

  it("a single edit in Airtable changes exactly one row", async () => {
    const edited = tables();
    edited[COLLECTION_TABLE][0].fields[F.title] = "Study in Grey (revised)";
    const r = await runIngest(deps({ source: createStaticSource(edited) }));
    expect(r.items).toEqual({ created: 0, updated: 1, unchanged: 2, removed: 0 });
    const title = await db.query<{ title: string }>("select title from items where airtable_record_id = 'recAAA00000000001'");
    expect(title.rows[0].title).toBe("Study in Grey (revised)");
    const audit = await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'items' and action = 'update'");
    expect(Number(audit.rows[0].n)).toBe(1);
  });

  it("sold is a status, never a deletion; the sold work is in the register with its year", async () => {
    const sold = await db.query<{ status: string; sold_year: number }>("select status, sold_year from items where airtable_record_id = 'recAAA00000000002'");
    expect(sold.rows[0]).toEqual({ status: "sold", sold_year: 2023 });
  });

  it("a record that disappears from Airtable is withdrawn, not deleted — files, line and ownership stay; it returns whole", async () => {
    const fewer = tables();
    fewer[COLLECTION_TABLE] = collectionRecords().slice(0, 2); // the sculpture is gone from the source
    const r = await runIngest(deps({ source: createStaticSource(fewer) }));
    expect(r.items.removed).toBe(1);
    expect(r.artists.removed).toBe(0); // its artist still has the withdrawn work

    const kept = await db.query<{ id: string; source_removed_at: Date | null }>(
      "select id, source_removed_at from items where airtable_record_id = 'recAAA00000000003'",
    );
    expect(kept.rows).toHaveLength(1);
    expect(kept.rows[0].source_removed_at).not.toBeNull();
    const files = await db.query<{ n: string }>("select count(*) n from images where item_id = $1", [kept.rows[0].id]);
    expect(Number(files.rows[0].n)).toBe(3);
    const owners = await db.query<{ n: string }>("select count(*) n from item_owners where item_id = $1", [kept.rows[0].id]);
    expect(Number(owners.rows[0].n)).toBe(1);
    const deletes = await db.query<{ n: string }>("select count(*) n from audit_log where action = 'delete'");
    expect(Number(deletes.rows[0].n)).toBe(0);

    // the record returns: the same row, un-withdrawn, nothing re-downloaded
    const store = createMemoryStore();
    const back = await runIngest(deps({ store }));
    expect(back.items).toEqual({ created: 0, updated: 1, unchanged: 2, removed: 0 });
    expect(back.images.created).toBe(0);
    const again = await db.query<{ id: string; source_removed_at: Date | null }>(
      "select id, source_removed_at from items where airtable_record_id = 'recAAA00000000003'",
    );
    expect(again.rows[0].id).toBe(kept.rows[0].id);
    expect(again.rows[0].source_removed_at).toBeNull();
  });

  it("row-level security: a member reads the collection, a stranger reads nothing, anonymous reads nothing", async () => {
    const col = await db.query<{ id: string }>("select id from collections where name = 'Test Collection'");
    const cid = col.rows[0].id;
    await db.query("insert into collection_members (collection_id, user_id, role) values ($1, $2, 'owner')", [cid, USER_A]);

    const member = await asUser(USER_A, "authenticated", "select count(*)::int as n from items");
    expect(member[0].n).toBe(3);
    const memberImages = await asUser(USER_A, "authenticated", "select count(*)::int as n from images");
    expect(memberImages[0].n).toBe(4);
    const memberAudit = await asUser(USER_A, "authenticated", "select count(*)::int as n from audit_log");
    expect(memberAudit[0].n).toBeGreaterThan(0);

    for (const table of ALL_TABLES) {
      const stranger = await asUser(USER_B, "authenticated", `select count(*)::int as n from ${table}`);
      expect(stranger[0].n, table).toBe(0);
    }

    const nobody = await asUser(null, "authenticated", "select count(*)::int as n from items");
    expect(nobody[0].n).toBe(0);

    // The second factor is enforced by the database: a member who has passed only the emailed
    // link (aal1) reads nothing, from any table — not a count, not an audit row.
    for (const table of ALL_TABLES) {
      const halfway = await asUser(USER_A, "authenticated", `select count(*)::int as n from ${table}`, "aal1");
      expect(halfway[0].n, `${table} at aal1`).toBe(0);
    }

    await expect(asUser(null, "anon", "select count(*) from public.items")).rejects.toThrow(/permission denied/);
  });

  it("M1-03 · the image door: a non-member reads zero image rows, even asking for one by its id", async () => {
    // The member was added in the test above. The door's own query, for a picture that exists.
    const known = await db.query<{ id: string }>("select id from images order by id limit 1");
    const id = known.rows[0].id;
    const doorQuery = `select storage_bucket, storage_key, kind, content_type from images where id = '${id}'`;

    expect(await asUser(USER_A, "authenticated", doorQuery)).toHaveLength(1);
    expect(await asUser(USER_B, "authenticated", doorQuery)).toHaveLength(0);
    expect(await asUser(USER_B, "authenticated", "select count(*)::int as n from images")).toEqual([{ n: 0 }]);
    // and the wall's own read: no works, so no pictures, for the stranger
    expect(await asUser(USER_B, "authenticated", "select i.id from items i join images m on m.item_id = i.id")).toHaveLength(0);
    // the member, half signed in, gets nothing from the door either
    expect(await asUser(USER_A, "authenticated", doorQuery, "aal1")).toHaveLength(0);
  });

  it("signed-in users cannot write, truncate or alter — even with Supabase's default grants in place", async () => {
    await expect(asUser(USER_A, "authenticated", "update items set title = 'x'")).rejects.toThrow(/permission denied/);
    for (const table of ALL_TABLES) {
      await expect(asUser(USER_A, "authenticated", `delete from ${table} where false`), `delete ${table}`).rejects.toThrow(/permission denied/);
      await expect(asUser(USER_B, "authenticated", `truncate ${table} cascade`), `truncate ${table}`).rejects.toThrow(/permission denied/);
    }
    // and a table added by a later migration inherits the same posture
    await db.query("create table public.later_table (id int)");
    try {
      await expect(asUser(USER_A, "authenticated", "insert into later_table values (1)")).rejects.toThrow(/permission denied/);
      await expect(asUser(null, "anon", "select * from public.later_table")).rejects.toThrow(/permission denied/);
    } finally {
      await db.query("drop table public.later_table");
    }
  });
  it("M2-04 · drafts: the owner reads them; a viewer, an advisor, a stranger and a half-signed-in owner read none; nobody writes from a browser; every write audited; the shape holds", async () => {
    const cid = (await db.query<{ id: string }>("select id from collections where name = 'Test Collection'")).rows[0].id;
    const USER_C = "33333333-3333-4333-8333-333333333333"; // a viewer
    const USER_D = "44444444-4444-4444-8444-444444444444"; // an advisor
    await db.query("insert into auth.users (id, email) values ($1, 'c@example.test'), ($2, 'd@example.test') on conflict do nothing", [USER_C, USER_D]);
    await db.query("insert into collection_members (collection_id, user_id, role) values ($1, $2, 'viewer'), ($1, $3, 'advisor') on conflict do nothing", [cid, USER_C, USER_D]);
    const artist = (await db.query<{ id: string }>("select id from artists where collection_id = $1 order by surname limit 1", [cid])).rows[0];
    await db.query("select set_config('app.actor', 'draft', false)");
    try {
      const inserted = await db.query<{ id: string }>(
        `insert into drafts (collection_id, subject, artist_id, field, text, sentences, sources, list_version, model)
         values ($1, 'artist', $2, 'biography', 'She paints.', '[{"text":"She paints.","sources":[1]}]', '[{"n":1,"kind":"supplied","title":"T","publisher":"P","link":null,"passage":"She paints."}]', 'abc', 'claude-test-5') returning id`,
        [cid, artist.id],
      );
      const id = inserted.rows[0].id;
      // the owner, both factors proven, reads it — and nobody else, at any level
      expect(await asUser(USER_A, "authenticated", `select text, status from drafts where id = '${id}'`)).toEqual([{ text: "She paints.", status: "draft" }]);
      expect(await asUser(USER_A, "authenticated", `select id from drafts where id = '${id}'`, "aal1")).toHaveLength(0);
      for (const u of [USER_B, USER_C, USER_D]) expect(await asUser(u, "authenticated", "select count(*)::int as n from drafts"), u).toEqual([{ n: 0 }]);
      await expect(asUser(null, "anon", "select * from public.drafts")).rejects.toThrow(/permission denied/);
      // no signed-in person writes a draft or approves one from a browser: approving is M2-01's, by its own path
      await expect(asUser(USER_A, "authenticated", `update drafts set status = 'approved', decided_by = '${USER_A}', decided_at = now() where id = '${id}'`)).rejects.toThrow(/permission denied/);
      await expect(
        asUser(USER_A, "authenticated", `insert into drafts (collection_id, subject, artist_id, field, text, sentences, sources, list_version, model) values ('${cid}', 'artist', '${artist.id}', 'biography', 'x', '[]', '[]', 'v', 'm')`),
      ).rejects.toThrow(/permission denied/);
      // the audit log has the write, with the desk as its actor
      const audit = await db.query<{ action: string; actor_label: string }>("select action, actor_label from audit_log where table_name = 'drafts' and row_id = $1", [id]);
      expect(audit.rows).toEqual([{ action: "insert", actor_label: "draft" }]);
      // the shape: one subject; a decision is dated and signed; only the two fields
      await expect(db.query("insert into drafts (collection_id, subject, field, text, sentences, sources, list_version, model) values ($1, 'artist', 'biography', 'x', '[]', '[]', 'v', 'm')", [cid])).rejects.toThrow(/drafts_one_subject/);
      await expect(db.query("update drafts set status = 'approved' where id = $1", [id])).rejects.toThrow(/drafts_decision_dated/);
      // each half of a decision on its own is refused too (M2-04b, the review's blocker 3)
      await expect(db.query("update drafts set status = 'approved', decided_at = now() where id = $1", [id])).rejects.toThrow(/drafts_decision_dated/);
      await expect(db.query("update drafts set status = 'approved', decided_by = $2 where id = $1", [id, USER_A])).rejects.toThrow(/drafts_decision_dated/);
      // an artist with a draft is not deleted under it — the table refuses, loudly (rule 9: kept)
      await expect(db.query("delete from artists where id = $1", [artist.id])).rejects.toThrow(/foreign key|drafts_artist_id_fkey/);
      await expect(db.query("insert into drafts (collection_id, subject, artist_id, field, text, sentences, sources, list_version, model) values ($1, 'artist', $2, 'tombstone', 'x', '[]', '[]', 'v', 'm')", [cid, artist.id])).rejects.toThrow(/field/);
      await db.query("update drafts set status = 'approved', decided_by = $2, decided_at = now() where id = $1", [id, USER_A]);
      expect(await asUser(USER_A, "authenticated", `select status from drafts where id = '${id}'`)).toEqual([{ status: "approved" }]);
      expect(Number((await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'drafts' and row_id = $1", [id])).rows[0].n)).toBe(2);
    } finally {
      await db.query("select set_config('app.actor', '', false)");
    }
  });

  it("SEC-02 · the viewer sees the works, not the register: the wall reads the same for owner, viewer and advisor; money, place, notes, owners and documents are the owner's alone, with both factors", async () => {
    const cid = (await db.query<{ id: string }>("select id from collections where name = 'Test Collection'")).rows[0].id;
    const USER_C = "33333333-3333-4333-8333-333333333333"; // a viewer
    const USER_D = "44444444-4444-4444-8444-444444444444"; // an advisor — a viewer until the advisor door is specced
    await db.query("insert into auth.users (id, email) values ($1, 'c@example.test'), ($2, 'd@example.test') on conflict do nothing", [USER_C, USER_D]);
    await db.query("insert into collection_members (collection_id, user_id, role) values ($1, $2, 'viewer'), ($1, $3, 'advisor') on conflict do nothing", [cid, USER_C, USER_D]);

    // What a screen reads — the wall's columns, the provenance, the pictures — is identical for the owner, the viewer and the advisor.
    const wall =
      "select i.id, i.title, i.year, i.year_text, i.medium, i.dimensions_unframed, i.dimensions_framed, i.edition, i.acquired_on::text, i.acquired_from, i.status::text, a.display_name from items i left join artists a on a.id = i.artist_id where i.source_removed_at is null order by i.id";
    const owner = await asUser(USER_A, "authenticated", wall);
    expect(owner).toHaveLength(3);
    expect(await asUser(USER_C, "authenticated", wall)).toEqual(owner);
    expect(await asUser(USER_D, "authenticated", wall)).toEqual(owner);
    const line = "select item_id, label, sort_order from provenance_events order by item_id, sort_order";
    const ownerLine = await asUser(USER_A, "authenticated", line);
    expect(ownerLine.length).toBeGreaterThan(0);
    expect(await asUser(USER_C, "authenticated", line)).toEqual(ownerLine);
    const pictures = "select item_id, width, height, placeholder from gallery_pictures order by item_id";
    expect(await asUser(USER_C, "authenticated", pictures)).toEqual(await asUser(USER_A, "authenticated", pictures));

    // What the register knows: the owner's alone, and only with both factors. A viewer, an advisor, a stranger, a half-signed-in owner: none of it.
    // The audit log — which keeps the old `items` rows with their values — and the run log are in the loop too (the review's should-fix 5).
    for (const t of ["item_private", "provenance_private", "owners", "item_owners", "documents", "audit_log", "ingest_runs"]) {
      const count = `select count(*)::int as n from ${t}`;
      expect((await asUser(USER_A, "authenticated", count))[0].n, `${t} for the owner`).toBeGreaterThan(0);
      for (const u of [USER_C, USER_D, USER_B]) expect(await asUser(u, "authenticated", count), `${t} for ${u}`).toEqual([{ n: 0 }]);
      expect(await asUser(USER_A, "authenticated", count, "aal1"), `${t} at aal1`).toEqual([{ n: 0 }]);
      await expect(asUser(null, "anon", `select * from public.${t}`), `${t} anonymous`).rejects.toThrow(/permission denied/);
    }
    // Field by field, through the same interface a browser uses: the viewer asks for every sensitive field of a work it can see, by its id.
    const item = (await asUser(USER_C, "authenticated", "select id from items order by id limit 1"))[0].id as string;
    expect(await asUser(USER_C, "authenticated", `select ${PRIVATE.join(", ")} from item_private where item_id = '${item}'`)).toEqual([]);
    expect(await asUser(USER_A, "authenticated", `select ${PRIVATE.join(", ")} from item_private where item_id = '${item}'`)).toHaveLength(1);
    expect(await asUser(USER_C, "authenticated", `select o.name, o.kind from owners o join item_owners io on io.owner_id = o.id where io.item_id = '${item}'`)).toEqual([]);
    expect(await asUser(USER_A, "authenticated", `select o.name from owners o join item_owners io on io.owner_id = o.id where io.item_id = '${item}'`)).toHaveLength(1);
    expect(await asUser(USER_C, "authenticated", `select kind, storage_key from documents where item_id = '${item}'`)).toEqual([]);
    // And the columns are not on items at all, for anyone: a screen that asked for them would get an error, not a value.
    for (const c of PRIVATE) await expect(asUser(USER_A, "authenticated", `select ${c} from items limit 1`), c).rejects.toThrow(/does not exist/);
    // What `items` carries is exactly the list above: a column added to it fails here until someone places it on purpose.
    const columns = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'items'")).rows.map((r) => r.column_name);
    expect([...columns].sort()).toEqual([...ITEMS_COLUMNS].sort());
    // The provenance line the same way: its reviews and raw record are off the line and the owner's alone; the line carries exactly its list (19 Nov).
    for (const c of PROVENANCE_PRIVATE) await expect(asUser(USER_A, "authenticated", `select ${c} from provenance_events limit 1`), c).rejects.toThrow(/does not exist/);
    const lineColumns = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'provenance_events'")).rows.map((r) => r.column_name);
    expect([...lineColumns].sort()).toEqual([...PROVENANCE_COLUMNS].sort());
    expect(await asUser(USER_C, "authenticated", `select reviews, airtable_raw from provenance_private where collection_id = '${cid}'`)).toEqual([]);
    expect((await asUser(USER_A, "authenticated", `select count(*)::int as n from provenance_private where collection_id = '${cid}'`))[0].n).toBe(ownerLine.length);

    // The ingest still changes nothing on a second run; both halves are audited as the ingest's writes.
    const before = Number((await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'item_private'")).rows[0].n);
    expect(before).toBeGreaterThan(0);
    const again = await runIngest(deps({ store: createMemoryStore() }));
    expect(again.items).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(Number((await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'item_private'")).rows[0].n)).toBe(before);
    expect((await db.query<{ l: string }>("select distinct actor_label l from audit_log where table_name = 'item_private'")).rows.map((r) => r.l)).toEqual(["ingest:airtable"]);

    // A work whose private row went missing is written again on the next run, whatever its hash (the review's nit 13).
    await db.query("delete from item_private where item_id = $1", [item]);
    const repaired = await runIngest(deps({ store: createMemoryStore() }));
    expect(repaired.items).toEqual({ created: 0, updated: 1, unchanged: 2, removed: 0 });
    expect(await asUser(USER_A, "authenticated", `select item_id from item_private where item_id = '${item}'`)).toHaveLength(1);
    expect(await asUser(USER_C, "authenticated", `select item_id from item_private where item_id = '${item}'`)).toEqual([]);
    // and the same for a provenance line's private half
    const lineId = (await db.query<{ id: string }>("select id from provenance_events where collection_id = $1 order by id limit 1", [cid])).rows[0].id;
    await db.query("delete from provenance_private where provenance_event_id = $1", [lineId]);
    const lineRepaired = await runIngest(deps({ store: createMemoryStore() }));
    expect(lineRepaired.provenance).toEqual({ created: 0, updated: 1, unchanged: 2, removed: 0 });
    expect(lineRepaired.items).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(await asUser(USER_A, "authenticated", `select provenance_event_id from provenance_private where provenance_event_id = '${lineId}'`)).toHaveLength(1);
  });

  it("M1-02a · the ladder: every picture's renditions cut once; a master becomes the picture and is never returned to a page", async () => {
    const cid = (await db.query<{ id: string }>("select id from collections where name = 'Test Collection'")).rows[0].id;
    // No encoding here (the encoder has its own tests): a renderer that knows a master by its first
    // bytes, and an object store that can read the Airtable snapshots stored by earlier runs.
    const renderer: Renderer = {
      async probe(input) {
        const head = input.subarray(0, 6).toString();
        if (head === "MASTER") return { width: 5375, height: 4000 };
        if (head === "BROKEN") return { width: 4000, height: 3000 }; // a layered TIFF: its header reads, its pixels do not
        return { width: 800, height: 600 };
      },
      async cut(input) {
        if (input.subarray(0, 6).toString() === "BROKEN") throw new Error("layers but no pixels");
        const size = await this.probe(input);
        const long = Math.max(size.width, size.height);
        return {
          ...size,
          placeholder: "data:image/jpeg;base64,AAAA",
          renditions: ladderFor(long).flatMap((l) =>
            (["jpeg", "avif"] as const).map((format) => ({ longSide: l, format, body: Buffer.from(`${l}-${format}`), width: l, height: Math.round((l * size.height) / size.width) })),
          ),
        };
      },
      async tiles(input, outDir) {
        // The pyramid as sharp lays it out, one byte per tile.
        const size = await this.probe(input);
        const filesDir = path.join(outDir, "set_files");
        for (const t of allTiles(pyramid(size.width, size.height))) {
          mkdirSync(path.join(filesDir, String(t.level)), { recursive: true });
          writeFileSync(path.join(filesDir, String(t.level), `${t.x}_${t.y}.jpeg`), "t");
        }
        return { ...size, filesDir };
      },
    };
    const mem = createMemoryStore();
    const store: ObjectStore = { ...mem, get: async (b, k) => mem.objects.get(`${b}/${k}`)?.body ?? Buffer.from(`snapshot ${k}`) };
    const ladder = { bucket: "test-renditions", renderer };

    // The ingest cuts the ladder for every Airtable photograph: 4 photographs × (480, 800) × 2 formats.
    const r1 = await runIngest(deps({ store, ladder }));
    expect(r1.renditions).toEqual({ created: 16, unchanged: 0 });
    expect(r1.renditionErrors).toEqual([]);
    expect(r1.pictures).toEqual({ withMaster: 0, onSnapshot: 2, withoutPicture: 1, withGlass: 0 });
    expect(r1.tileSets).toEqual({ counts: { created: 0, unchanged: 0 }, errors: [], cut: [] }); // nothing is 4,000 px
    const r2 = await runIngest(deps({ store, ladder }));
    expect(r2.renditions).toEqual({ created: 0, unchanged: 16 });
    expect(r2.picturesMoved).toBe(0);

    // The masters: folders prepared from the register; a file dropped twice under two names, and a zip.
    const dir = mkdtempSync(path.join(tmpdir(), "masters-db-"));
    try {
      const root = path.join(dir, "masters");
      const prepared = prepareFolders(root, await loadMasterWorks(db, cid));
      expect(prepared.created).toHaveLength(3);
      const folder = prepared.folders.find((f) => /Study-in-Grey/.test(f))!;
      writeFileSync(path.join(root, folder, "Example_Study-in-Grey_2019.tif"), "MASTER bytes of the photographer's file");
      writeFileSync(path.join(root, folder, "Example_Study-in-Grey_2019 copy.tif"), "MASTER bytes of the photographer's file");
      writeFileSync(path.join(root, folder, "from-the-gallery.zip"), "PK");
      // and on the sculpture, a master that probes but will not cut
      const sculpture = prepared.folders.find((f) => /Beispiel/.test(f))!;
      writeFileSync(path.join(root, sculpture, "Beispiel_Untitled_2010.tif"), "BROKEN layered file");
      const run = () => runMasters({ db, store, renderer, root, collectionId: cid, mastersBucket: "test-masters", renditionsBucket: "test-renditions" });

      const m1 = await run();
      expect(m1.masters).toEqual({ created: 2, unchanged: 1 }); // one master per work, however many names it has
      expect(m1.skipped.map((s) => s.file)).toEqual([path.join(folder, "from-the-gallery.zip")]);
      expect(m1.renditions).toEqual({ created: 8, unchanged: 0 }); // 480, 1080, 2160, 4320 × 2, for the master that cut
      expect(m1.renditionErrors).toHaveLength(1);
      expect(m1.renditionErrors[0].error).toMatch(/no pixels/);
      expect(m1.picturesMoved).toBe(1); // only the master with a whole ladder becomes a picture
      // The glass: the 5,375 px master that hangs gets its pyramid; the 4,000 px one that does not hang gets none.
      expect(m1.tileSets.counts).toEqual({ created: 1, unchanged: 0 });
      expect(m1.tileSets.errors).toEqual([]);
      expect(m1.tileSets.cut).toEqual([{ label: expect.stringMatching(/Study in Grey/), longSide: 5375, levels: 14 }]);
      expect(m1.pictures).toEqual({ withMaster: 1, onSnapshot: 1, withoutPicture: 1, withGlass: 1 });
      expect([...mem.objects.keys()].filter((k) => /\/tiles\//.test(k))).toHaveLength(481); // every tile of the pyramid, once
      expect([...mem.objects.keys()].filter((k) => /\/tiles\//.test(k)).every((k) => k.startsWith("test-renditions/"))).toBe(true);

      const m2 = await run();
      expect(m2.masters).toEqual({ created: 0, unchanged: 3 });
      expect(m2.renditions).toEqual({ created: 0, unchanged: 8 });
      expect(m2.renditionErrors).toHaveLength(1); // still reported, every run, until the file is replaced
      expect(m2.picturesMoved).toBe(0);
      expect(m2.tileSets.counts).toEqual({ created: 0, unchanged: 1 });
      expect(m2.tileSets.cut).toEqual([]);
      expect(m2.pictures).toEqual({ withMaster: 1, onSnapshot: 1, withoutPicture: 1, withGlass: 1 });

      // A ladder cut halfway (a Ctrl-C): the master is no picture until it is whole; the next run completes it.
      const good = (await db.query<{ id: string }>("select id from images where kind = 'master' and is_hero")).rows[0];
      await db.query("delete from images where derived_from_image_id = $1 and long_side = 4320 and format = 'avif'", [good.id]);
      await db.query("update images set placeholder = null where id = $1", [good.id]);
      expect(await settleHeroes(db, cid)).toBe(1);
      expect(await pictureTally(db, cid)).toEqual({ withMaster: 0, onSnapshot: 2, withoutPicture: 1, withGlass: 0 });
      const m3 = await run();
      expect(m3.renditions).toEqual({ created: 1, unchanged: 7 });
      expect(m3.picturesMoved).toBe(1);
      expect(m3.tileSets.counts).toEqual({ created: 0, unchanged: 1 });
      expect(m3.pictures).toEqual({ withMaster: 1, onSnapshot: 1, withoutPicture: 1, withGlass: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const masters = (await db.query<{ id: string; item_id: string; storage_key: string; is_hero: boolean; placeholder: string | null }>("select id, item_id, storage_key, is_hero, placeholder from images where kind = 'master' order by is_hero desc")).rows;
    expect(masters).toHaveLength(2);
    const [master, broken] = masters;
    expect(master.is_hero).toBe(true);
    expect(master.placeholder).toBe("data:image/jpeg;base64,AAAA");
    expect(master.storage_key).toMatch(/^collections\/[0-9a-f-]+\/items\/[0-9a-f-]+\/masters\/[0-9a-f]{64}\.tif$/);
    // The Airtable snapshot keeps its row, no longer the picture; one picture per work.
    const snap = await db.query<{ is_hero: boolean }>("select is_hero from images where item_id = $1 and kind = 'lowres_airtable'", [master.item_id]);
    expect(snap.rows.map((r) => r.is_hero)).toEqual([false]);
    const heroes = await db.query<{ n: number }>("select count(*)::int n from images where is_hero group by item_id having count(*) > 1");
    expect(heroes.rows).toEqual([]);
    // The master that would not cut: in the archive, not the picture; the sculpture still hangs its snapshot.
    expect(broken.is_hero).toBe(false);
    const sculptureHero = await db.query<{ kind: string }>("select kind from images where item_id = $1 and is_hero", [broken.item_id]);
    expect(sculptureHero.rows).toEqual([{ kind: "lowres_airtable" }]);

    // The picture query a page uses, as the member: the work's picture is the master's ladder —
    // yet no row, no column and no value it returns is the master or points at it.
    const pictures = await asUser(USER_A, "authenticated", "select item_id, width, height, placeholder, renditions, tile_set from gallery_pictures");
    expect(pictures).toHaveLength(2);
    const fromMaster = pictures.find((p) => p.item_id === master.item_id);
    expect(fromMaster).toMatchObject({ width: 5375, height: 4000, placeholder: "data:image/jpeg;base64,AAAA" });
    expect(fromMaster.renditions).toHaveLength(8);
    const fromSnapshot = pictures.find((p) => p.item_id === broken.item_id);
    expect(fromSnapshot.renditions).toHaveLength(4); // the sculpture's snapshot: 480 and 800, in both formats
    // M1-02b · the glass: the master's tile set travels with the picture — its own id and shape, nothing of the master.
    expect(fromMaster.tile_set).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), width: 5375, height: 4000, tile_size: 254, tile_overlap: 1, levels: 14 });
    expect(fromSnapshot.tile_set).toBeNull();
    const tileSetRow = await db.query<{ kind: string; derived_from_image_id: string; storage_key: string }>("select kind, derived_from_image_id, storage_key from images where id = $1", [fromMaster.tile_set.id]);
    expect(tileSetRow.rows[0]).toEqual({ kind: "tile_set", derived_from_image_id: master.id, storage_key: expect.stringMatching(/\/tiles\//) });
    const text = JSON.stringify(pictures);
    expect(text).not.toContain(master.id);
    expect(text).not.toContain(broken.id);
    expect(text).not.toContain("masters/");
    expect(text).not.toContain("test-masters");
    for (const r of fromMaster.renditions) {
      const row = await db.query<{ kind: string; derived_from_image_id: string }>("select kind, derived_from_image_id from images where id = $1", [r.id]);
      expect(row.rows[0]).toEqual({ kind: "rendition", derived_from_image_id: master.id });
    }

    // Nor any other read a signed-in member can make: the table, the door's query, a join.
    expect(await asUser(USER_A, "authenticated", "select count(*)::int n from images where kind = 'master'")).toEqual([{ n: 0 }]);
    expect(await asUser(USER_A, "authenticated", `select storage_key from images where id = '${master.id}'`)).toHaveLength(0);
    expect(await asUser(USER_A, "authenticated", `select storage_key from images where id = '${broken.id}'`)).toHaveLength(0);
    expect(await asUser(USER_A, "authenticated", "select m.id from items i join images m on m.item_id = i.id where m.kind = 'master'")).toHaveLength(0);
    // and the renditions themselves are what the door is asked for
    expect(await asUser(USER_A, "authenticated", `select kind from images where id = '${fromMaster.renditions[0].id}'`)).toEqual([{ kind: "rendition" }]);

    // A stranger, a half-signed-in member and the anonymous role see no pictures at all.
    expect(await asUser(USER_B, "authenticated", "select * from gallery_pictures")).toHaveLength(0);
    expect(await asUser(USER_A, "authenticated", "select * from gallery_pictures", "aal1")).toHaveLength(0);
    await expect(asUser(null, "anon", "select * from public.gallery_pictures")).rejects.toThrow(/permission denied/);

    // The tile door's own query: the member reads the tile set; a non-member and an aal1 member read zero tile-set rows.
    const doorQuery = `select kind, storage_bucket, storage_key, width, height, tile_size, tile_overlap, levels from images where id = '${fromMaster.tile_set.id}'`;
    expect(await asUser(USER_A, "authenticated", doorQuery)).toHaveLength(1);
    expect(await asUser(USER_B, "authenticated", doorQuery)).toHaveLength(0);
    expect(await asUser(USER_A, "authenticated", doorQuery, "aal1")).toHaveLength(0);
    expect(await asUser(USER_B, "authenticated", "select count(*)::int n from images where kind = 'tile_set'")).toEqual([{ n: 0 }]);
    expect(await asUser(USER_A, "authenticated", "select count(*)::int n from images where kind = 'tile_set'", "aal1")).toEqual([{ n: 0 }]);
    // and the master's id, asked of the tile door's query, is nothing — to the member too
    expect(await asUser(USER_A, "authenticated", doorQuery.replace(fromMaster.tile_set.id, master.id))).toHaveLength(0);
  });

  it("M2-01 · the owner approves or sends back through decide_draft alone — both factors, signed and dated, the text on the artist; a viewer, an advisor, a stranger and the half-signed-in owner are refused and read approved texts only, never a draft, a removal or a note", async () => {
    const cid = (await db.query<{ id: string }>("select id from collections where name = 'Test Collection'")).rows[0].id;
    const USER_C = "33333333-3333-4333-8333-333333333333"; // a viewer
    const USER_D = "44444444-4444-4444-8444-444444444444"; // an advisor
    await db.query("insert into auth.users (id, email) values ($1, 'c@example.test'), ($2, 'd@example.test') on conflict do nothing", [USER_C, USER_D]);
    await db.query("insert into collection_members (collection_id, user_id, role) values ($1, $2, 'viewer'), ($1, $3, 'advisor') on conflict do nothing", [cid, USER_C, USER_D]);
    // an artist with works, so the ingest keeps them
    const artist = (await db.query<{ id: string }>("select a.id from artists a where a.collection_id = $1 and exists (select 1 from items i where i.artist_id = a.id) order by a.surname limit 1", [cid])).rows[0];
    // Like asUser, but the decision stays: a committed transaction as the signed-in person.
    async function asUserCommit(userId: string, sql: string, aal: "aal1" | "aal2" = "aal2") {
      await db.query("begin");
      try {
        await db.query("set local role authenticated");
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated", aal })]);
        const res = await db.query(sql);
        await db.query("commit");
        return res.rows;
      } catch (err) {
        await db.query("rollback");
        throw err;
      }
    }
    // The desk stores one shared source list on both fields' drafts: here the text cites [1] and not [2], the other field's passage.
    const sources = JSON.stringify([
      { n: 1, kind: "web", title: "Test Painter", publisher: "Harbour Gallery", link: "https://harbour-gallery.example/p", passage: "She paints the harbour.", readAt: "2026-11-19T07:30:00.000Z" },
      { n: 2, kind: "web", title: "Test Painter: a reading", publisher: "Tate", link: "https://tate.example/p", passage: "A passage only the other field cites.", readAt: "2026-11-19T07:30:00.000Z" },
    ]);
    // The owner of another collection: USER_B owns one of their own, with an artist and a draft in it.
    const other = (await db.query<{ id: string }>("insert into collections (name) values ('Other Collection') returning id")).rows[0].id;
    await db.query("insert into collection_members (collection_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing", [other, USER_B]);
    const otherArtist = (await db.query<{ id: string }>("insert into artists (collection_id, surname, given_name, display_name, normalized_key) values ($1, 'Other', 'An', 'An Other', 'other|an') returning id", [other])).rows[0].id;
    await db.query("select set_config('app.actor', 'draft', false)");
    let bioOld: string, bio: string, why: string, notEnough: string, otherDraft: string;
    try {
      const insert = async (field: string, text: string, created: string, forArtist = artist.id, forCollection = cid) =>
        (
          await db.query<{ id: string }>(
            `insert into drafts (collection_id, subject, artist_id, field, text, sentences, sources, removed, flagged, list_version, model, created_at)
             values ($1, 'artist', $2, $3, $4, $5::jsonb, $6::jsonb, '[{"text":"Her work is a sound investment.","rule":2,"why":"a word of the market"}]', '[]', 'abc', 'claude-test-5', $7) returning id`,
            [forCollection, forArtist, field, text, JSON.stringify([{ text, sources: text === "Not enough is known yet." ? [] : [1] }]), sources, created],
          )
        ).rows[0].id;
      bioOld = await insert("biography", "She painted the harbour, once.", "2026-11-17T10:00:00Z");
      bio = await insert("biography", "She paints the harbour.", "2026-11-19T10:00:00Z");
      notEnough = await insert("why_they_matter", "Not enough is known yet.", "2026-11-18T10:00:00Z");
      why = await insert("why_they_matter", "Harbour Gallery calls the paintings “exact”.", "2026-11-19T10:00:00Z");
      otherDraft = await insert("biography", "Elsewhere, a painter.", "2026-11-19T10:00:00Z", otherArtist, other);
    } finally {
      await db.query("select set_config('app.actor', '', false)");
    }

    // Nobody but the owner, and the owner only with both factors: the function refuses, and says nothing of whether the draft exists.
    const refused = /only the collection's owner, signed in with both factors/;
    for (const u of [USER_B, USER_C, USER_D]) await expect(asUser(u, "authenticated", `select decide_draft('${bio}', 'approved')`), u).rejects.toThrow(refused);
    await expect(asUser(USER_A, "authenticated", `select decide_draft('${bio}', 'approved')`, "aal1")).rejects.toThrow(refused);
    await expect(asUser(USER_A, "authenticated", `select decide_draft('00000000-0000-4000-8000-00000000dead', 'approved')`)).rejects.toThrow(refused);
    // the owner of another collection, on this collection's draft — and this owner on theirs
    await expect(asUser(USER_B, "authenticated", `select decide_draft('${otherDraft}', 'approved')`, "aal1")).rejects.toThrow(refused);
    await expect(asUser(USER_A, "authenticated", `select decide_draft('${otherDraft}', 'approved')`)).rejects.toThrow(refused);
    // the anonymous role is stopped by the function's own grant, not by the schema (the review of PR #14, should-fix 6)
    await expect(asUser(null, "anon", `select public.decide_draft('${bio}', 'approved')`)).rejects.toThrow(/permission denied for function decide_draft/);
    // a rejection carries a note — of more than whitespace; a decision is one of two words
    await expect(asUser(USER_A, "authenticated", `select decide_draft('${why}', 'rejected')`)).rejects.toThrow(/a rejection carries a note/);
    await expect(asUser(USER_A, "authenticated", `select decide_draft('${why}', 'rejected', '  ')`)).rejects.toThrow(/a rejection carries a note/);
    await expect(asUser(USER_A, "authenticated", `select decide_draft('${why}', 'rejected', E'\\t\\n ')`)).rejects.toThrow(/a rejection carries a note/);
    await expect(asUser(USER_A, "authenticated", `select decide_draft('${why}', 'later')`)).rejects.toThrow(/'approved' or 'rejected'/);
    // the list's own sentence is an answer, not a text: it cannot be approved (should-fix 1) — it can be sent back
    await expect(asUser(USER_A, "authenticated", `select decide_draft('${notEnough}', 'approved')`)).rejects.toThrow(/not a text to approve/);
    // nothing so far changed anything
    expect((await db.query("select status from drafts where id = any($1::uuid[]) and status <> 'draft'", [[bioOld, bio, why, notEnough, otherDraft]])).rowCount).toBe(0);
    expect((await db.query<{ biography: string | null; verified_at: string | null }>("select biography, verified_at from artists where id = $1", [artist.id])).rows[0]).toEqual({ biography: null, verified_at: null });

    // The owner approves the biography: signed and dated on the draft and on the artist, the text copied, the link kept, the audit log carrying the owner.
    const decided = await asUserCommit(USER_A, `select status, decided_by, decided_at is not null as dated, note from decide_draft('${bio}', 'approved')`);
    expect(decided).toEqual([{ status: "approved", decided_by: USER_A, dated: true, note: null }]);
    const onArtist = (await db.query<{ biography: string; biography_draft_id: string; verified_by: string; verified_at: string; why_they_matter: string | null }>("select biography, biography_draft_id, verified_by, verified_at, why_they_matter from artists where id = $1", [artist.id])).rows[0];
    expect(onArtist.biography).toBe("She paints the harbour.");
    expect(onArtist.biography_draft_id).toBe(bio);
    expect(onArtist.verified_by).toBe(USER_A);
    expect(onArtist.verified_at).not.toBeNull();
    expect(onArtist.why_they_matter).toBeNull();
    const audited = (await db.query<{ table_name: string; action: string; actor: string }>("select table_name, action, actor::text from audit_log where (table_name = 'drafts' and row_id = $1) or (table_name = 'artists' and row_id = $2) order by id", [bio, artist.id])).rows;
    expect(audited).toEqual(expect.arrayContaining([{ table_name: "drafts", action: "update", actor: USER_A }, { table_name: "artists", action: "update", actor: USER_A }]));
    // the older biography draft still waits: approving one decides nothing else, and a decided draft is not decided twice
    expect((await db.query<{ status: string }>("select status from drafts where id = $1", [bioOld])).rows[0].status).toBe("draft");
    await expect(asUser(USER_A, "authenticated", `select decide_draft('${bio}', 'rejected', 'again')`)).rejects.toThrow(/already decided/);

    // The owner sends why they matter back with a note; the note is kept on the draft and nothing lands on the artist.
    const back = await asUserCommit(USER_A, `select status, decided_by, note from decide_draft('${why}', 'rejected', '  too much about the films; say more about the prints  ')`);
    expect(back).toEqual([{ status: "rejected", decided_by: USER_A, note: "too much about the films; say more about the prints" }]);
    expect((await db.query<{ w: string | null }>("select why_they_matter w from artists where id = $1", [artist.id])).rows[0].w).toBeNull();
    // and the next draft can say which one it answers
    await db.query("select set_config('app.actor', 'draft', false)");
    try {
      await db.query("insert into drafts (collection_id, subject, artist_id, field, text, sentences, sources, list_version, model, answers) values ($1, 'artist', $2, 'why_they_matter', 'x', '[]', '[]', 'abc', 'claude-test-5', $3)", [cid, artist.id, why]);
    } finally {
      await db.query("select set_config('app.actor', '', false)");
    }

    // Everyone invited reads the approved text and its sources through approved_texts — the one the artist carries now — and nothing else of a draft:
    // of the shared source list, only the passage the text itself cites (should-fix 3); the owner's own table keeps both.
    const read = "select field, text, sources, decided_at is not null as dated from approved_texts where artist_id = '" + artist.id + "' order by field";
    const seen = await asUser(USER_C, "authenticated", read);
    expect(seen).toEqual([{ field: "biography", text: "She paints the harbour.", sources: [JSON.parse(sources)[0]], dated: true }]);
    expect((await asUser(USER_A, "authenticated", `select jsonb_array_length(sources)::int as n from drafts where id = '${bio}'`))[0].n).toBe(2);
    expect(await asUser(USER_D, "authenticated", read)).toEqual(seen);
    expect(await asUser(USER_A, "authenticated", read)).toEqual(seen);
    expect(await asUser(USER_B, "authenticated", read)).toEqual([]);
    expect(await asUser(USER_A, "authenticated", read, "aal1")).toEqual([]);
    expect(await asUser(USER_C, "authenticated", read, "aal1")).toEqual([]);
    // the anonymous role is stopped by the view's own grant (should-fix 6)
    await expect(asUser(null, "anon", "select * from public.approved_texts")).rejects.toThrow(/permission denied for (view|relation) approved_texts/);
    // the other collection's owner approves their own draft and reads it alone; this collection's owner and viewer read nothing of it
    await asUserCommit(USER_B, `select decide_draft('${otherDraft}', 'approved')`);
    const elsewhere = `select text from approved_texts where collection_id = '${other}'`;
    expect(await asUser(USER_B, "authenticated", elsewhere)).toEqual([{ text: "Elsewhere, a painter." }]);
    expect(await asUser(USER_B, "authenticated", "select count(*)::int as n from approved_texts")).toEqual([{ n: 1 }]);
    expect(await asUser(USER_A, "authenticated", elsewhere)).toEqual([]);
    expect(await asUser(USER_C, "authenticated", elsewhere)).toEqual([]);
    expect(await asUser(USER_B, "authenticated", "select count(*)::int as n from drafts where collection_id = '" + cid + "'")).toEqual([{ n: 0 }]);
    // the view has no column for a removal, a flag or a note, and a viewer reads no draft at all, the approved one included
    const viewColumns = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'approved_texts'")).rows.map((r) => r.column_name).sort();
    expect(viewColumns).toEqual(["artist_id", "collection_id", "created_at", "decided_at", "field", "id", "sentences", "sources", "text"]);
    for (const u of [USER_B, USER_C, USER_D]) expect(await asUser(u, "authenticated", `select count(*)::int as n from drafts where collection_id = '${cid}'`), u).toEqual([{ n: 0 }]);
    // the artist's own row says the same to a viewer: the biography, and nothing else of the register
    expect(await asUser(USER_C, "authenticated", `select biography, why_they_matter from artists where id = '${artist.id}'`)).toEqual([{ biography: "She paints the harbour.", why_they_matter: null }]);
    // a newer approval replaces the text on the artist and the view follows; the old approved draft keeps its status but leaves the view
    await db.query("select set_config('app.actor', 'draft', false)");
    let bioNew: string;
    try {
      bioNew = (await db.query<{ id: string }>("insert into drafts (collection_id, subject, artist_id, field, text, sentences, sources, list_version, model) values ($1, 'artist', $2, 'biography', 'She paints the harbour in winter.', '[{\"text\":\"She paints the harbour in winter.\",\"sources\":[1]}]', $3::jsonb, 'abc', 'claude-test-5') returning id", [cid, artist.id, sources])).rows[0].id;
    } finally {
      await db.query("select set_config('app.actor', '', false)");
    }
    await asUserCommit(USER_A, `select decide_draft('${bioNew}', 'approved')`);
    expect((await asUser(USER_C, "authenticated", read)).map((r) => r.text)).toEqual(["She paints the harbour in winter."]);
    expect((await db.query<{ status: string }>("select status from drafts where id = $1", [bio])).rows[0].status).toBe("approved");
    // no signed-in session writes the artist's text or its stamp by hand
    await expect(asUser(USER_A, "authenticated", `update artists set biography = 'mine' where id = '${artist.id}'`)).rejects.toThrow(/permission denied/);
    await expect(asUser(USER_A, "authenticated", `update artists set verified_at = now() where id = '${artist.id}'`)).rejects.toThrow(/permission denied/);

    // The ingest leaves an approved text where it is: a re-run writes names only.
    const again = await runIngest(deps({ store: createMemoryStore() }));
    expect(again.artists.removed).toBe(0);
    const after = (await db.query<{ biography: string; verified_by: string }>("select biography, verified_by from artists where id = $1", [artist.id])).rows[0];
    expect(after).toEqual({ biography: "She paints the harbour in winter.", verified_by: USER_A });
  });

});

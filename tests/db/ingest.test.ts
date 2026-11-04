/**
 * The ingest and the row-level security, against a real Postgres. Runs when TEST_DATABASE_URL is
 * set (CI starts one); skipped otherwise, so `npm test` still passes on a laptop with no database.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  const ALL_TABLES = ["collections", "collection_members", "owners", "artists", "items", "item_owners", "provenance_events", "images", "documents", "ingest_runs", "audit_log"];

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
    // Every migration, in order — the schema as production will have it. Just before M1-02a's,
    // the register as main's ingest could have left it: a work carrying two pictures, because the
    // first photograph was marked at insert and never cleared when a newer one was added in front.
    const dir = path.join(root, "supabase", "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (file.startsWith("20261103150000")) migrationSeed = await seedTwoPictures();
      await db.query(readFileSync(path.join(dir, file), "utf8"));
      if (file.startsWith("20261103150000")) migrationSeed.after = await readSeed(migrationSeed.itemId);
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

  it("M1-02a · the migration clears a work's second picture before it forbids one, so db push succeeds on main's data", () => {
    expect(migrationSeed.after).toEqual([
      { storage_key: "the-older-photograph", is_hero: true },
      { storage_key: "the-newer-photograph", is_hero: false },
    ]);
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

  it("the whole record travels, not only the mapped fields", async () => {
    const item = await db.query<{ airtable_raw: { fields: Record<string, unknown> } }>(
      "select airtable_raw from items where airtable_record_id = 'recAAA00000000001'",
    );
    expect(item.rows[0].airtable_raw.fields[F.title]).toBe("Study in Grey");
    expect(JSON.stringify(item.rows[0].airtable_raw)).not.toContain("cdn.example.test");
    const prov = await db.query<{ airtable_raw: { id: string } }>("select airtable_raw from provenance_events where airtable_record_id = 'recPPP00000000001' limit 1");
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
    };
    const mem = createMemoryStore();
    const store: ObjectStore = { ...mem, get: async (b, k) => mem.objects.get(`${b}/${k}`)?.body ?? Buffer.from(`snapshot ${k}`) };
    const ladder = { bucket: "test-renditions", renderer };

    // The ingest cuts the ladder for every Airtable photograph: 4 photographs × (480, 800) × 2 formats.
    const r1 = await runIngest(deps({ store, ladder }));
    expect(r1.renditions).toEqual({ created: 16, unchanged: 0 });
    expect(r1.renditionErrors).toEqual([]);
    expect(r1.pictures).toEqual({ withMaster: 0, onSnapshot: 2, withoutPicture: 1 });
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
      expect(m1.pictures).toEqual({ withMaster: 1, onSnapshot: 1, withoutPicture: 1 });

      const m2 = await run();
      expect(m2.masters).toEqual({ created: 0, unchanged: 3 });
      expect(m2.renditions).toEqual({ created: 0, unchanged: 8 });
      expect(m2.renditionErrors).toHaveLength(1); // still reported, every run, until the file is replaced
      expect(m2.picturesMoved).toBe(0);
      expect(m2.pictures).toEqual({ withMaster: 1, onSnapshot: 1, withoutPicture: 1 });

      // A ladder cut halfway (a Ctrl-C): the master is no picture until it is whole; the next run completes it.
      const good = (await db.query<{ id: string }>("select id from images where kind = 'master' and is_hero")).rows[0];
      await db.query("delete from images where derived_from_image_id = $1 and long_side = 4320 and format = 'avif'", [good.id]);
      await db.query("update images set placeholder = null where id = $1", [good.id]);
      expect(await settleHeroes(db, cid)).toBe(1);
      expect(await pictureTally(db, cid)).toEqual({ withMaster: 0, onSnapshot: 2, withoutPicture: 1 });
      const m3 = await run();
      expect(m3.renditions).toEqual({ created: 1, unchanged: 7 });
      expect(m3.picturesMoved).toBe(1);
      expect(m3.pictures).toEqual({ withMaster: 1, onSnapshot: 1, withoutPicture: 1 });
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
    const pictures = await asUser(USER_A, "authenticated", "select item_id, width, height, placeholder, renditions from gallery_pictures");
    expect(pictures).toHaveLength(2);
    const fromMaster = pictures.find((p) => p.item_id === master.item_id);
    expect(fromMaster).toMatchObject({ width: 5375, height: 4000, placeholder: "data:image/jpeg;base64,AAAA" });
    expect(fromMaster.renditions).toHaveLength(8);
    const fromSnapshot = pictures.find((p) => p.item_id === broken.item_id);
    expect(fromSnapshot.renditions).toHaveLength(4); // the sculpture's snapshot: 480 and 800, in both formats
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
  });
});

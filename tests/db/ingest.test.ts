/**
 * The ingest and the row-level security, against a real Postgres. Runs when TEST_DATABASE_URL is
 * set (CI starts one); skipped otherwise, so `npm test` still passes on a laptop with no database.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticSource } from "@/lib/ingest/airtable";
import { COLLECTION_TABLE, F } from "@/lib/ingest/fields";
import { runIngest, type IngestDeps } from "@/lib/ingest/run";
import { createMemoryStore } from "@/lib/ingest/storage";
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
    // Every migration, in order — the schema as production will have it.
    const dir = path.join(root, "supabase", "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(readFileSync(path.join(dir, file), "utf8"));
    }
    await db.query("insert into auth.users (id, email) values ($1, 'a@example.test'), ($2, 'b@example.test')", [USER_A, USER_B]);
  });

  afterAll(async () => {
    await db?.end();
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
});

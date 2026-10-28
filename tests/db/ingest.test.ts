/**
 * The ingest and the row-level security, against a real Postgres. Runs when TEST_DATABASE_URL is
 * set (CI starts one); skipped otherwise, so `npm test` still passes on a laptop with no database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticSource } from "@/lib/ingest/airtable";
import { COLLECTION_TABLE, F } from "@/lib/ingest/fields";
import { runIngest, type IngestDeps } from "@/lib/ingest/run";
import { createMemoryStore } from "@/lib/ingest/storage";
import { collectionRecords, fakeFetch, tables } from "../ingest/fixture";

const url = process.env.TEST_DATABASE_URL;
const root = path.resolve(__dirname, "..", "..");

// In CI the database is always there; a silent skip would look like a pass. Refuse that.
if (process.env.CI && !url) throw new Error("TEST_DATABASE_URL is not set in CI — the database tests would be skipped.");

describe.skipIf(!url)("M1-01 · the record arrives", () => {
  let db: Client;
  const USER_A = "11111111-1111-4111-8111-111111111111"; // a member (owner)
  const USER_B = "22222222-2222-4222-8222-222222222222"; // a stranger

  function deps(overrides: Partial<IngestDeps> = {}): IngestDeps {
    return {
      db,
      source: createStaticSource(tables()),
      store: createMemoryStore(),
      fetchImpl: fakeFetch,
      collectionName: "Test Collection",
      mastersBucket: "test-masters",
      ...overrides,
    };
  }

  async function asUser(userId: string | null, role: "authenticated" | "anon", sql: string) {
    await db.query("begin");
    try {
      await db.query(`set local role ${role}`);
      if (userId) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
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
    await db.query(readFileSync(path.join(root, "supabase", "migrations", "20261028140000_core.sql"), "utf8"));
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
    expect(r1.images.created).toBe(3);
    expect(r1.documents.created).toBe(3);
    expect(r1.attachmentErrors).toEqual([]);
    expect(r1.flagged).toBe(1);
    expect(store.objects.size).toBe(6);
    for (const key of store.objects.keys()) expect(key).toMatch(/^test-masters\/collections\/[0-9a-f-]+\/items\/[0-9a-f-]+\/(source|documents)\//);

    const auditAfterFirst = await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'items'");
    expect(Number(auditAfterFirst.rows[0].n)).toBe(3);

    const r2 = await runIngest(d);
    expect(r2.items).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(r2.artists).toEqual({ created: 0, updated: 0, unchanged: 2, removed: 0 });
    expect(r2.ownership).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(r2.provenance).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(r2.images).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(r2.documents).toEqual({ created: 0, updated: 0, unchanged: 3, removed: 0 });
    expect(store.objects.size).toBe(6);

    const auditAfterSecond = await db.query<{ n: string }>("select count(*) n from audit_log where table_name = 'items'");
    expect(Number(auditAfterSecond.rows[0].n)).toBe(3);

    const runs = await db.query<{ status: string; run_by: string }>("select status, run_by from ingest_runs order by started_at");
    expect(runs.rows.map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
    expect(runs.rows[0].run_by).toBe("ingest:airtable");

    const actor = await db.query<{ actor_label: string }>("select distinct actor_label from audit_log");
    expect(actor.rows.map((r) => r.actor_label)).toEqual(["ingest:airtable"]);
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

  it("a record that disappears from Airtable disappears here, and the audit log keeps it whole", async () => {
    const fewer = tables();
    fewer[COLLECTION_TABLE] = collectionRecords().slice(0, 2); // the sculpture is gone
    const r = await runIngest(deps({ source: createStaticSource(fewer) }));
    expect(r.items.removed).toBe(1);
    expect(r.artists.removed).toBe(1); // its artist had no other work
    const gone = await db.query("select 1 from items where airtable_record_id = 'recAAA00000000003'");
    expect(gone.rowCount).toBe(0);
    const audit = await db.query<{ old_row: { title: string } }>(
      "select old_row from audit_log where table_name = 'items' and action = 'delete' and old_row ->> 'airtable_record_id' = 'recAAA00000000003'",
    );
    expect(audit.rows[0].old_row.title).toBe("Untitled");

    // and it comes back when the record returns
    const back = await runIngest(deps());
    expect(back.items.created).toBe(1);
  });

  it("row-level security: a member reads the collection, a stranger reads nothing, anonymous reads nothing", async () => {
    const col = await db.query<{ id: string }>("select id from collections where name = 'Test Collection'");
    const cid = col.rows[0].id;
    await db.query("insert into collection_members (collection_id, user_id, role) values ($1, $2, 'owner')", [cid, USER_A]);

    const member = await asUser(USER_A, "authenticated", "select count(*)::int as n from items");
    expect(member[0].n).toBe(3);
    const memberImages = await asUser(USER_A, "authenticated", "select count(*)::int as n from images");
    expect(memberImages[0].n).toBe(3);
    const memberAudit = await asUser(USER_A, "authenticated", "select count(*)::int as n from audit_log");
    expect(memberAudit[0].n).toBeGreaterThan(0);

    for (const table of ["collections", "items", "artists", "images", "documents", "provenance_events", "item_owners", "owners", "audit_log", "ingest_runs"]) {
      const stranger = await asUser(USER_B, "authenticated", `select count(*)::int as n from ${table}`);
      expect(stranger[0].n, table).toBe(0);
    }

    const nobody = await asUser(null, "authenticated", "select count(*)::int as n from items");
    expect(nobody[0].n).toBe(0);

    await expect(asUser(null, "anon", "select count(*) from public.items")).rejects.toThrow(/permission denied/);
  });

  it("a member cannot write; writes are the ingest's alone in V1", async () => {
    await expect(asUser(USER_A, "authenticated", "update items set title = 'x'")).rejects.toThrow(/permission denied/);
    await expect(asUser(USER_A, "authenticated", "delete from items")).rejects.toThrow(/permission denied/);
  });
});

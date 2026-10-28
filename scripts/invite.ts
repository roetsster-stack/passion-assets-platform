/**
 * `npm run invite -- someone@example.com [--owner|--advisor|--viewer]` — invite a person and make
 * them a member of the collection. Run on Workshop. Decision 8 (28 Oct): Michael only through M1.
 *
 *   npm run invite -- you@example.com --owner        the founder: owner of the collection
 *   npm run invite -- someone@example.com            a viewer (the default: least privilege)
 *   npm run invite -- someone@example.com            run again with no flag: re-sends nothing, changes nothing
 *   npm run invite -- someone@example.com --reset-authenticator
 *                                                    lost authenticator: removes their factors; next sign-in enrols afresh
 *
 * The invitation email lands on /auth/confirm only with Supabase's email templates set as the
 * spec says (Authentication → Email Templates); with the default template it lands on
 * /auth/session, which also works. A person must tap the invitation before asking for a magic link.
 *
 * Needs, in ~/curator/.env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
 * (and DATABASE_SSL_CA). Optional: CURATOR_COLLECTION_NAME, CURATOR_SITE_URL (where the invite
 * link should land; defaults to the Supabase project's Site URL).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, required } from "../src/lib/env";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
const roleFlag = args.includes("--owner") ? "owner" : args.includes("--advisor") ? "advisor" : args.includes("--viewer") ? "viewer" : null;
const role = roleFlag ?? "viewer";
const resetAuthenticator = args.includes("--reset-authenticator");

function sslFor(url: string) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (local) return undefined;
  const ca = process.env.DATABASE_SSL_CA;
  if (ca) return { ca: readFileSync(ca.replace(/^~(?=\/)/, homedir()), "utf8"), rejectUnauthorized: true };
  return { rejectUnauthorized: true };
}

async function main() {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage: npm run invite -- someone@example.com [--owner|--advisor|--viewer]");
    process.exit(2);
  }
  const envFile = loadEnvFile();
  if (envFile) console.log(`env: ${envFile}`);

  const admin = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find or invite the user. The invite email carries a link that lands on /auth/confirm.
  let userId: string | undefined;
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  userId = existing?.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (userId) {
    console.log(`${email} already has an account; no email sent.`);
    if (resetAuthenticator) {
      const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId });
      for (const f of factors?.factors ?? []) {
        await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
      }
      console.log(`Removed ${factors?.factors.length ?? 0} authenticator factor(s); ${email} will enrol afresh on next sign-in.`);
    }
  } else {
    if (resetAuthenticator) {
      console.error("--reset-authenticator needs an existing account.");
      process.exit(2);
    }
    const redirectTo = process.env.CURATOR_SITE_URL ? `${process.env.CURATOR_SITE_URL.replace(/\/$/, "")}/auth/confirm` : undefined;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error || !data.user) throw error ?? new Error("invite failed");
    userId = data.user.id;
    console.log(`Invited ${email}; the email is on its way.`);
  }

  // Make them a member of the collection.
  const collectionName = process.env.CURATOR_COLLECTION_NAME ?? "Michael Roets Collection";
  const databaseUrl = required("DATABASE_URL");
  const db = new Client({ connectionString: databaseUrl, ssl: sslFor(databaseUrl) });
  await db.connect();
  try {
    await db.query("select set_config('app.actor', $1, false)", ["invite"]);
    const col = await db.query<{ id: string }>("select id from collections where name = $1", [collectionName]);
    if (!col.rows[0]) throw new Error(`No collection named "${collectionName}" yet — run the ingest first.`);
    // A role changes only when a flag says so; running the command again never promotes anyone.
    const res = roleFlag
      ? await db.query(
          "insert into collection_members (collection_id, user_id, role) values ($1, $2, $3) on conflict (collection_id, user_id) do update set role = excluded.role returning role",
          [col.rows[0].id, userId, role],
        )
      : await db.query(
          "insert into collection_members (collection_id, user_id, role) values ($1, $2, $3) on conflict (collection_id, user_id) do nothing returning role",
          [col.rows[0].id, userId, role],
        );
    const current = res.rows[0]?.role ?? (await db.query<{ role: string }>("select role from collection_members where collection_id = $1 and user_id = $2", [col.rows[0].id, userId])).rows[0]?.role;
    console.log(`${email} is ${current === "owner" ? "an owner" : current === "advisor" ? "an advisor" : "a viewer"} of "${collectionName}".`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * The image door's decision, as a pure function. `/i/<id>` answers in exactly two ways: a redirect
 * to a signed address that dies in five minutes, or 404. No session, a row that row-level security
 * does not return for this person, an id that is not an id, a kind that must never be served (the
 * archival master) — all are 404, and indistinguishable, so the door says nothing about what exists.
 */

/** The kinds the door may serve. Masters are never served (CLAUDE.md); tiles arrive with M1-02. */
export const SERVABLE_KINDS = ["lowres_airtable", "rendition"] as const;

export const SIGNED_URL_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isImageId(id: string): boolean {
  return UUID.test(id);
}

export type ImageDoorRow = { storage_bucket: string; storage_key: string; kind: string; content_type: string | null };

export type ImageDoorDecision = { kind: "not-found" } | { kind: "sign"; bucket: string; key: string; contentType: string | null };

export function decideImage(s: { signedIn: boolean; row: ImageDoorRow | null }): ImageDoorDecision {
  if (!s.signedIn || !s.row) return { kind: "not-found" };
  if (!(SERVABLE_KINDS as readonly string[]).includes(s.row.kind)) return { kind: "not-found" };
  return { kind: "sign", bucket: s.row.storage_bucket, key: s.row.storage_key, contentType: s.row.content_type };
}

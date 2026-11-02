/**
 * M1-03 · the image door's decision: a signed five-minute address, or 404 — never anything that
 * tells a stranger what exists.
 */
import { describe, expect, it } from "vitest";
import { parseR2Jurisdiction, r2Endpoint } from "@/lib/ingest/storage";
import { decideImage, isImageId, SIGNED_URL_SECONDS, type ImageDoorRow } from "@/lib/images/door";
import { signImage } from "@/lib/images/sign";

const row: ImageDoorRow = { storage_bucket: "test-masters", storage_key: "collections/c/items/i/source/att1.jpg", kind: "lowres_airtable", content_type: "image/jpeg" };

describe("the image door", () => {
  it("signs for a signed-in person whose row-level security returns the row", () => {
    expect(decideImage({ signedIn: true, row })).toEqual({ kind: "sign", bucket: "test-masters", key: row.storage_key, contentType: "image/jpeg" });
  });

  it("answers 404 with no session, with no row (a non-member), and for a master", () => {
    expect(decideImage({ signedIn: false, row })).toEqual({ kind: "not-found" });
    expect(decideImage({ signedIn: true, row: null })).toEqual({ kind: "not-found" });
    expect(decideImage({ signedIn: true, row: { ...row, kind: "master" } })).toEqual({ kind: "not-found" });
    expect(decideImage({ signedIn: true, row: { ...row, kind: "tile_set" } })).toEqual({ kind: "not-found" });
  });

  it("the address lives five minutes", () => {
    expect(SIGNED_URL_SECONDS).toBe(300);
  });

  it("only an id that is an id reaches the database", () => {
    expect(isImageId("2b1c6d3e-0f4a-4b5c-9d8e-7f6a5b4c3d2e")).toBe(true);
    for (const bad of ["", "1", "../x", "2b1c6d3e-0f4a-4b5c-9d8e-7f6a5b4c3d2e;", "' or 1=1 --"]) expect(isImageId(bad)).toBe(false);
  });

  it("signs at the bucket's jurisdiction — the ingest's own rule, one definition for writer and door", () => {
    expect(r2Endpoint("acct")).toBe("https://acct.r2.cloudflarestorage.com");
    expect(r2Endpoint("acct", parseR2Jurisdiction(" eu "))).toBe("https://acct.eu.r2.cloudflarestorage.com");
    expect(parseR2Jurisdiction(undefined)).toBeUndefined();
    expect(parseR2Jurisdiction("")).toBeUndefined();
    expect(() => parseR2Jurisdiction("uk")).toThrow(/R2_JURISDICTION/);
  });

  it("the signed address: the bucket's EU host, five minutes, private, and never the secret", async () => {
    // Presigning is pure computation: no network, fake credentials. The host carries the bucket and
    // the jurisdiction; the query carries the lifetime and the cache rule the browser must obey.
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "AKIATESTKEYID";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-never-in-an-address";
    process.env.R2_JURISDICTION = "eu";
    const url = new URL(await signImage("test-masters", row.storage_key, "image/jpeg"));
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("test-masters.acct.eu.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/${row.storage_key}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(SIGNED_URL_SECONDS));
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("response-cache-control")).toBe(`private, max-age=${SIGNED_URL_SECONDS}`);
    expect(url.searchParams.get("response-content-type")).toBe("image/jpeg");
    expect(url.searchParams.get("response-content-disposition")).toBe("inline");
    expect(url.href).not.toContain("test-secret-never-in-an-address");
  });
});

/**
 * M1-03 · the image door's decision: a signed five-minute address, or 404 — never anything that
 * tells a stranger what exists.
 */
import { describe, expect, it } from "vitest";
import { decideImage, isImageId, SIGNED_URL_SECONDS, type ImageDoorRow } from "@/lib/images/door";
import { r2Endpoint } from "@/lib/images/sign";

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

  it("signs at the bucket's jurisdiction", () => {
    expect(r2Endpoint("acct")).toBe("https://acct.r2.cloudflarestorage.com");
    expect(r2Endpoint("acct", "eu")).toBe("https://acct.eu.r2.cloudflarestorage.com");
    expect(() => r2Endpoint("acct", "uk")).toThrow(/R2_JURISDICTION/);
  });
});

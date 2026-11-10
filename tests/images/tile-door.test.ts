/**
 * M1-02b · the tile door's decision: a signed thirty-minute address for one tile of one tile set,
 * or 404 — never anything that tells a stranger what exists, never a master, never a tile the
 * pyramid does not have.
 */
import { describe, expect, it } from "vitest";
import { TILE_URL_SECONDS } from "@/lib/images/pyramid";
import { signObject } from "@/lib/images/sign";
import { decideTile, type TileSetRow } from "@/lib/images/tile-door";

const row: TileSetRow = {
  kind: "tile_set",
  storage_bucket: "test-renditions",
  storage_key: "collections/c/items/i/tiles/s",
  width: 5375,
  height: 4000,
  tile_size: 254,
  tile_overlap: 1,
  levels: 14,
};

describe("the tile door", () => {
  it("signs one tile of a tile set the row-level security returned, at its place under the set's prefix", () => {
    expect(decideTile({ signedIn: true, row, tile: ["13", "21_15"] })).toEqual({ kind: "sign", bucket: "test-renditions", key: `${row.storage_key}/13/21_15.jpg` });
    expect(decideTile({ signedIn: true, row, tile: ["0", "0_0"] })).toEqual({ kind: "sign", bucket: "test-renditions", key: `${row.storage_key}/0/0_0.jpg` });
  });

  it("answers 404 with no session, with no row (a non-member), and for any row that is not a tile set — a master above all", () => {
    const tile = ["13", "0_0"];
    expect(decideTile({ signedIn: false, row, tile })).toEqual({ kind: "not-found" });
    expect(decideTile({ signedIn: true, row: null, tile })).toEqual({ kind: "not-found" });
    for (const kind of ["master", "rendition", "lowres_airtable", ""]) {
      expect(decideTile({ signedIn: true, row: { ...row, kind }, tile }), kind).toEqual({ kind: "not-found" });
    }
  });

  it("answers 404 for a tile the pyramid does not have, and for an address that is not one", () => {
    for (const tile of [["13", "22_15"], ["13", "21_16"], ["14", "0_0"], ["0", "1_0"], ["13"], ["13", "a_b"], ["13", "3_2", "x"], ["-1", "0_0"], ["13", "3_2.jpg"], []]) {
      expect(decideTile({ signedIn: true, row, tile }), tile.join("/")).toEqual({ kind: "not-found" });
    }
  });

  it("answers 404 for a row that does not describe a whole pyramid", () => {
    const tile = ["0", "0_0"];
    expect(decideTile({ signedIn: true, row: { ...row, levels: 13 }, tile })).toEqual({ kind: "not-found" }); // the rule says 14
    expect(decideTile({ signedIn: true, row: { ...row, width: null }, tile })).toEqual({ kind: "not-found" });
    expect(decideTile({ signedIn: true, row: { ...row, tile_size: null }, tile })).toEqual({ kind: "not-found" });
    expect(decideTile({ signedIn: true, row: { ...row, levels: null }, tile })).toEqual({ kind: "not-found" });
  });

  it("the signed address: the bucket's host, thirty minutes, private, and never the secret", async () => {
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "AKIATESTKEYID";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-never-in-an-address";
    process.env.R2_JURISDICTION = "eu";
    expect(TILE_URL_SECONDS).toBe(1800);
    const url = new URL(await signObject("test-renditions", `${row.storage_key}/13/21_15.jpg`, "image/jpeg", TILE_URL_SECONDS));
    expect(url.host).toBe("test-renditions.acct.eu.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/${row.storage_key}/13/21_15.jpg`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("1800");
    expect(url.searchParams.get("response-cache-control")).toBe("private, max-age=1800");
    expect(url.searchParams.get("response-content-type")).toBe("image/jpeg");
    expect(url.href).not.toContain("test-secret-never-in-an-address");
  });
});

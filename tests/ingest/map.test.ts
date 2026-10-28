import { describe, expect, it } from "vitest";
import { applyLocationRules, artistFromRecord, mapItem, mapProvenance, normalizeKey, parseYear, rawForStorage, stableHash } from "@/lib/ingest/map";
import { F } from "@/lib/ingest/fields";
import { att, collectionRecords, provenanceRecords } from "./fixture";

describe("parseYear — tolerate the base, never invent", () => {
  it.each([
    ["2024", 2024],
    ["2o24", 2024],
    ["Circa 1980's", 1980],
    ["2014/22014", 2014],
    ["2017 - 2018", 2017],
    ["circa 1965, Estate Edition printed 2020", 1965],
    ["c. 1962", 1962],
    ["Undated", null],
    ["undated", null],
    ["`", null],
    ["1985\n", 1985],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseYear(input)).toBe(expected);
  });
});

describe("artists — one entity per name, accents and case folded", () => {
  it("normalises the key", () => {
    expect(normalizeKey("Mivekannin", "Roméo")).toBe("mivekannin|romeo");
    expect(normalizeKey("  Blom ", "ZANDER")).toBe("blom|zander");
    expect(normalizeKey("Anonymous", null)).toBe("anonymous|");
  });

  it("derives the artist from a record and drops the ZAR data-entry slip from nationality", () => {
    const [first, second] = collectionRecords();
    expect(artistFromRecord(first)).toEqual({
      surname: "Example",
      given_name: "Ada",
      display_name: "Ada Example",
      normalized_key: "example|ada",
      nationality: ["Ruritania"],
    });
    expect(artistFromRecord(second)?.nationality).toEqual(["Ruritania"]);
  });
});

describe("location rules — places, states and condition notes, mapped; the rest flagged", () => {
  it("SOLD <year> is a status with a year, never a deletion", () => {
    expect(applyLocationRules(["SOLD 2023"])).toMatchObject({ status: "sold", sold_year: 2023, unmapped: [] });
  });
  it("On Loan <place> is a status and a location", () => {
    expect(applyLocationRules(["On Loan Norval"])).toMatchObject({ status: "on_loan", location: "Norval", unmapped: [] });
  });
  it("storage tags are in_storage at that place", () => {
    expect(applyLocationRules(["CT Storage"])).toMatchObject({ status: "in_storage", location: "CT Storage" });
    expect(applyLocationRules(["Storage Norwalk"])).toMatchObject({ status: "in_storage", location: "Storage Norwalk" });
  });
  it("a residence is hung there; Framed is a known state and not an error", () => {
    expect(applyLocationRules(["Franschhoek", "Framed"])).toMatchObject({ status: "hung", location: "Franschhoek", unmapped: [] });
  });
  it("a to-be-fixed note becomes a condition note", () => {
    expect(applyLocationRules(["Sea Shells (To be fixed)"])).toMatchObject({ location: "Sea Shells", condition_note: "To be fixed" });
  });
  it("the artist's studio tags are with_artist", () => {
    expect(applyLocationRules(["Conrad - rework"])).toMatchObject({ status: "with_artist", location: "Conrad Botes" });
  });
  it("anything else is kept and flagged, not lost", () => {
    const r = applyLocationRules(["Strauss", "Barbara Thumm / CrownArt Singapore"]);
    expect(r.status).toBe("unknown");
    expect(r.unmapped).toEqual(["Strauss", "Barbara Thumm / CrownArt Singapore"]);
  });
});

describe("mapItem", () => {
  it("maps every field of a full record", () => {
    const row = mapItem(collectionRecords()[0]);
    expect(row).toMatchObject({
      airtable_record_id: "recAAA00000000001",
      artist_key: "example|ada",
      title: "Study in Grey",
      year_text: "2o24",
      year: 2024,
      medium: "Painting",
      materials: "oil on linen",
      dimensions_unframed: "100 x 80 cm",
      edition: "Unique",
      acquired_on: "2024-03-01",
      purchase_price: 1000,
      purchase_currency: "USD",
      purchase_price_zar: 18000,
      acquired_from: "Gallery One",
      credit_gallery: "Gallery One, Somewhere",
      current_value: 1500,
      current_value_currency: "USD",
      status: "in_storage",
      location: "CT Storage",
      location_tags: ["CT Storage"],
      comments_raw: "A note.",
      has_high_res: false,
      has_low_res: true,
      has_invoice: true,
      has_coa: null,
      owner_names: ["Catherina"],
      provenance_record_ids: ["recPPP00000000001"],
      airtable_modified_at: "2026-05-04T13:35:43.000Z",
    });
    expect(row.admin_notes).toBeNull();
    expect(row.attachments.map((a) => [a.group, a.attachment.id])).toEqual([
      ["image", "attIMG0000000001"],
      ["invoice", "attINV0000000001"],
    ]);
  });

  it("defaults ownership to Michael when Airtable says nothing", () => {
    expect(mapItem(collectionRecords()[1]).owner_names).toEqual(["Michael"]);
  });

  it("flags what it could not map, in admin notes, and keeps the original", () => {
    const row = mapItem(collectionRecords()[2]);
    expect(row.status).toBe("on_loan");
    expect(row.location).toBe("Norval");
    expect(row.location_tags).toEqual(["On Loan Norval", "Framed", "Somewhere Odd"]);
    expect(row.admin_notes).toContain("Unmapped location tag(s): Somewhere Odd");
    expect(row.admin_notes).toContain('Currency not a code: "193,207.00"');
    expect(row.purchase_currency).toBeNull();
    expect(row.year).toBeNull();
    expect(row.admin_notes).not.toContain("Year not parseable"); // "Undated" is a legitimate value
  });

  it("content hash ignores Airtable's rotating attachment URLs but notices real change", () => {
    const a = mapItem(collectionRecords()[0]);
    const b = mapItem(collectionRecords()[0]); // fixture URLs carry a fresh random signature each call
    expect(a.attachments[0].attachment.url).not.toBe(b.attachments[0].attachment.url);
    expect(a.content_hash).toBe(b.content_hash);

    const edited = collectionRecords()[0];
    edited.fields[F.title] = "Study in Grey (revised)";
    expect(mapItem(edited).content_hash).not.toBe(a.content_hash);

    const replaced = collectionRecords()[0];
    replaced.fields[F.lowResImageFiles] = [att("attIMG0000000099", "new.jpg")];
    expect(mapItem(replaced).content_hash).not.toBe(a.content_hash);
  });

  it("stores the raw record without attachment URLs", () => {
    const raw = rawForStorage(collectionRecords()[0]);
    expect(JSON.stringify(raw)).not.toContain("cdn.example.test");
    expect(JSON.stringify(raw)).toContain("attIMG0000000001");
  });
});

describe("mapProvenance", () => {
  it("keeps the line as the line, linked to every work it names", () => {
    const rows = provenanceRecords().map(mapProvenance);
    expect(rows[0]).toMatchObject({
      airtable_record_id: "recPPP00000000001",
      item_record_ids: ["recAAA00000000001", "recAAA00000000002"],
      label: "Purchased from Gallery One (March 2024)",
      details_url: "https://example.test/exhibition",
    });
    expect(rows[2]).toBeNull(); // no linked work → nothing to attach it to
  });
});

describe("stableHash", () => {
  it("is independent of key order", () => {
    expect(stableHash({ a: 1, b: [{ c: 2, d: 3 }] })).toBe(stableHash({ b: [{ d: 3, c: 2 }], a: 1 }));
  });
});

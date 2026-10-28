import { describe, expect, it } from "vitest";
import { applyLocationRules, artistFromRecord, mapItem, mapProvenance, normalizeKey, parseYear, rawForStorage, stableHash } from "@/lib/ingest/map";
import { F } from "@/lib/ingest/fields";
import { RULES, att, collectionRecords, provenanceRecords } from "./fixture";

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
    expect(applyLocationRules(["SOLD 2023"], RULES)).toMatchObject({ status: "sold", sold_year: 2023, unmapped: [] });
  });
  it("On Loan <place> is a status and a location", () => {
    expect(applyLocationRules(["On Loan Museum"], RULES)).toMatchObject({ status: "on_loan", location: "Museum", unmapped: [] });
  });
  it("storage tags are in_storage at that place — from the vocabulary, or anything called storage", () => {
    expect(applyLocationRules(["City Storage"], RULES)).toMatchObject({ status: "in_storage", location: "City Storage" });
    expect(applyLocationRules(["Storage Elsewhere"], RULES)).toMatchObject({ status: "in_storage", location: "Storage Elsewhere" });
  });
  it("a residence is hung there; Framed is a known state and not an error", () => {
    expect(applyLocationRules(["Hilltop House", "Framed"], RULES)).toMatchObject({ status: "hung", location: "Hilltop House", unmapped: [] });
  });
  it("a framer is at_framer", () => {
    expect(applyLocationRules(["Frame & Co"], RULES)).toMatchObject({ status: "at_framer", location: "Frame & Co" });
  });
  it("a to-be-fixed note becomes a condition note", () => {
    expect(applyLocationRules(["The Cottage (To be fixed)"], RULES)).toMatchObject({ status: "hung", location: "The Cottage", condition_note: "To be fixed" });
  });
  it("the artist's studio tags are with_artist", () => {
    expect(applyLocationRules(["Painter - rework"], RULES)).toMatchObject({ status: "with_artist", location: "Pat Painter" });
    expect(applyLocationRules(["Painter - recent purchase"], RULES)).toMatchObject({ status: "with_artist", location: "Pat Painter" });
  });
  it("anything else is kept and flagged, not lost", () => {
    const r = applyLocationRules(["Auction House", "Gallery / Shipper"], RULES);
    expect(r.status).toBe("unknown");
    expect(r.unmapped).toEqual(["Auction House", "Gallery / Shipper"]);
  });
  it("the vocabulary is matched case-insensitively", () => {
    expect(applyLocationRules(["city storage"], RULES).status).toBe("in_storage");
  });
});

describe("mapItem", () => {
  it("maps every field of a full record", () => {
    const row = mapItem(collectionRecords()[0], RULES);
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
      location: "City Storage",
      location_tags: ["City Storage"],
      comments_raw: "A note.",
      has_high_res: false,
      has_low_res: true,
      has_invoice: true,
      has_coa: null,
      owner_names: ["Partner"],
      owner_defaulted: false,
      provenance_record_ids: ["recPPP00000000001"],
      airtable_modified_at: "2026-05-04T13:35:43.000Z",
      valuation_date: "2026-05-04",
    });
    expect(row.admin_notes).toBeNull();
    expect(row.attachments.map((a) => [a.group, a.attachment.id])).toEqual([
      ["image", "attIMG0000000001"],
      ["invoice", "attINV0000000001"],
    ]);
  });

  it("defaults ownership to the principal when Airtable says nothing, and says so", () => {
    const row = mapItem(collectionRecords()[1], RULES);
    expect(row.owner_names).toEqual(["Principal"]);
    expect(row.owner_defaulted).toBe(true);
  });

  it("flags a work with no location at all, but not a sold one", () => {
    const none = collectionRecords()[0];
    delete none.fields[F.location];
    expect(mapItem(none, RULES).admin_notes).toContain("No location recorded");
    expect(mapItem(collectionRecords()[1], RULES).admin_notes).toBeNull(); // sold: no location expected
  });

  it("flags what it could not map, in admin notes, and keeps the original", () => {
    const row = mapItem(collectionRecords()[2], RULES);
    expect(row.status).toBe("on_loan");
    expect(row.location).toBe("Museum");
    expect(row.location_tags).toEqual(["On Loan Museum", "Framed", "Somewhere Odd"]);
    expect(row.admin_notes).toContain("Unmapped location tag(s): Somewhere Odd");
    expect(row.admin_notes).toContain('Currency not a code: "193,207.00"');
    expect(row.purchase_currency).toBeNull();
    expect(row.year).toBeNull();
    expect(row.admin_notes).not.toContain("Year not parseable"); // "Undated" is a legitimate value
  });

  it("content hash ignores Airtable's rotating attachment URLs but notices real change", () => {
    const a = mapItem(collectionRecords()[0], RULES);
    const b = mapItem(collectionRecords()[0], RULES); // fixture URLs carry a fresh random signature each call
    expect(a.attachments[0].attachment.url).not.toBe(b.attachments[0].attachment.url);
    expect(a.content_hash).toBe(b.content_hash);

    const edited = collectionRecords()[0];
    edited.fields[F.title] = "Study in Grey (revised)";
    expect(mapItem(edited, RULES).content_hash).not.toBe(a.content_hash);

    // a field we do not map yet still counts as a change — the stored raw copy must not go stale
    const unmapped = collectionRecords()[0];
    unmapped.fields["fldNEWFIELD0000001"] = "something Brett added";
    expect(mapItem(unmapped, RULES).content_hash).not.toBe(a.content_hash);

    const replaced = collectionRecords()[0];
    replaced.fields[F.lowResImageFiles] = [att("attIMG0000000099", "new.jpg")];
    expect(mapItem(replaced, RULES).content_hash).not.toBe(a.content_hash);
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
    expect(rows[0]?.raw).toMatchObject({ id: "recPPP00000000001" });
  });
});

describe("stableHash", () => {
  it("is independent of key order", () => {
    expect(stableHash({ a: 1, b: [{ c: 2, d: 3 }] })).toBe(stableHash({ b: [{ d: 3, c: 2 }], a: 1 }));
  });
});

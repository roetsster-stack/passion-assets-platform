/**
 * M1-03 · the gallery's rules, without a browser or a database: the order of the wall, the hero,
 * how a photograph hangs, the words under it, and what a row may carry onto a page.
 * Synthetic works only — no real titles, sources or dates belong in a repository.
 */
import { describe, expect, it } from "vitest";
import { chooseHero } from "@/lib/gallery/hero";
import { hang, neighbours, walk } from "@/lib/gallery/order";
import { toPicture, toWork, type PictureRow, type WorkRow } from "@/lib/gallery/read";
import { acquisitionLine, monthYear, tombstoneDetail, tombstoneLine } from "@/lib/gallery/tombstone";
import { CONTAINED_MIN, FULL_BLEED_MIN, treatment } from "@/lib/gallery/treatment";
import type { Picture, Work } from "@/lib/gallery/types";

const pic = (width: number | null, height: number | null): Picture => ({
  width,
  height,
  placeholder: null,
  renditions: [{ id: "00000000-0000-4000-8000-000000000001", format: "jpeg", width: width ?? 480, height: height ?? 480 }],
});

function work(id: string, over: Partial<Work> = {}): Work {
  return {
    id,
    artist: "Pat Painter",
    title: `Work ${id}`,
    year: 2020,
    yearText: "2020",
    medium: null,
    dimensions: null,
    edition: null,
    acquiredOn: null,
    acquiredFrom: null,
    sold: false,
    picture: pic(2000, 1500),
    ...over,
  };
}

describe("the order of the wall", () => {
  const works = [
    work("undated-old", { year: 1990 }),
    work("dated-2016", { acquiredOn: "2016-03-01" }),
    work("sold-2019", { acquiredOn: "2019-01-01", sold: true }),
    work("undated-noyear-b", { year: null, yearText: "Undated", title: "B" }),
    work("dated-2024", { acquiredOn: "2024-05-20" }),
    work("undated-new", { year: 2022 }),
    work("undated-noyear-a", { year: null, yearText: "Circa 1980's", title: "a" }),
    work("sold-undated", { sold: true }),
  ];

  it("dated works newest first, then the undated by year then title, then the sold in the same order", () => {
    const { held, sold } = hang(works);
    expect(held.map((w) => w.id)).toEqual(["dated-2024", "dated-2016", "undated-new", "undated-old", "undated-noyear-a", "undated-noyear-b"]);
    expect(sold.map((w) => w.id)).toEqual(["sold-2019", "sold-undated"]);
  });

  it("is stable: the same works in any input order hang the same way", () => {
    const reversed = [...works].reverse();
    expect(walk(reversed).map((w) => w.id)).toEqual(walk(works).map((w) => w.id));
  });

  it("the arrows walk the held works and then the sold, and stop at either end", () => {
    const ids = walk(works).map((w) => w.id);
    expect(ids.at(-1)).toBe("sold-undated");
    expect(neighbours(works, "dated-2024")).toEqual({ previous: null, next: expect.objectContaining({ id: "dated-2016" }) });
    expect(neighbours(works, "undated-noyear-b").next?.id).toBe("sold-2019");
    expect(neighbours(works, "sold-undated").next).toBeNull();
    expect(neighbours(works, "missing")).toEqual({ previous: null, next: null });
  });
});

describe("the hero", () => {
  it("is the newest held acquisition whose photograph is at least 1,600 px on its long side", () => {
    const works = [
      work("newest-small", { acquiredOn: "2026-01-01", picture: pic(1200, 900) }),
      work("newest-none", { acquiredOn: "2025-12-01", picture: null }),
      work("good", { acquiredOn: "2025-06-01", picture: pic(1000, FULL_BLEED_MIN) }),
      work("older-good", { acquiredOn: "2020-01-01" }),
      work("sold-newer-good", { acquiredOn: "2026-06-01", sold: true }),
    ];
    expect(chooseHero(works)?.id).toBe("good");
  });

  it("changes without anyone doing anything when a newer, better-photographed work arrives", () => {
    const before = [work("old", { acquiredOn: "2020-01-01" })];
    const after = [...before, work("new", { acquiredOn: "2026-10-30" })];
    expect(chooseHero(before)?.id).toBe("old");
    expect(chooseHero(after)?.id).toBe("new");
  });

  it("is absent when nothing qualifies", () => {
    expect(chooseHero([work("x", { picture: pic(800, 600) })])).toBeNull();
    expect(chooseHero([])).toBeNull();
  });
});

describe("how a photograph hangs", () => {
  it("follows the two thresholds on the long side, portrait or landscape", () => {
    expect(treatment(pic(FULL_BLEED_MIN, 10))).toBe("full");
    expect(treatment(pic(10, FULL_BLEED_MIN))).toBe("full");
    expect(treatment(pic(FULL_BLEED_MIN - 1, 10))).toBe("contained");
    expect(treatment(pic(CONTAINED_MIN, 10))).toBe("contained");
    expect(treatment(pic(CONTAINED_MIN - 1, 10))).toBe("matted");
  });

  it("a work with no photograph hangs as its label; an unmeasured one is never stretched", () => {
    expect(treatment(null)).toBe("label");
    expect(treatment(pic(null, null))).toBe("matted");
  });
});

describe("the words", () => {
  it("one line: artist, title, year — missing parts drop out, the year as entered when it does not parse", () => {
    expect(tombstoneLine(work("a", { title: "Study in Grey", year: 2019 }))).toBe("Pat Painter, Study in Grey, 2019");
    expect(tombstoneLine(work("a", { title: "Untitled", year: null, yearText: "Circa 1980's" }))).toBe("Pat Painter, Untitled, Circa 1980's");
    expect(tombstoneLine(work("a", { artist: null, title: "Untitled", year: null, yearText: null }))).toBe("Untitled");
  });

  it("the detail: medium, dimensions, edition, empty parts dropped", () => {
    expect(tombstoneDetail(work("a", { medium: "Oil on canvas", dimensions: " 60 x 40 cm ", edition: "" }))).toEqual(["Oil on canvas", "60 x 40 cm"]);
  });

  it("the acquisition line says what it knows and nothing else", () => {
    expect(acquisitionLine({ acquiredFrom: "A Gallery", acquiredOn: "2016-03-14" })).toBe("Acquired from A Gallery, March 2016");
    expect(acquisitionLine({ acquiredFrom: "Artist", acquiredOn: "2026-07-13" })).toBe("Acquired from the artist, July 2026");
    expect(acquisitionLine({ acquiredFrom: "An Auction House", acquiredOn: null })).toBe("Acquired from An Auction House");
    expect(acquisitionLine({ acquiredFrom: null, acquiredOn: "2025-10-30" })).toBe("Acquired October 2025");
    expect(acquisitionLine({ acquiredFrom: " ", acquiredOn: null })).toBeNull();
    expect(monthYear("not a date")).toBeNull();
  });
});

describe("what a row may carry onto a page", () => {
  const row = {
    id: "w1",
    title: "Study in Grey",
    year: 2019,
    year_text: "2019",
    medium: "Oil on canvas",
    dimensions_unframed: null,
    dimensions_framed: "70 x 50 cm",
    edition: null,
    acquired_on: "2016-03-14",
    acquired_from: "A Gallery",
    status: "hung",
    artists: { display_name: "Pat Painter" },
    // What a wider row could hold. None of it may survive.
    purchase_price: 123456,
    purchase_price_zar: 123456,
    current_value: 654321,
    location: "Hilltop House, dining room",
    location_tags: ["Hilltop House"],
    admin_notes: "note",
    airtable_raw: { fields: { Price: 123456 } },
  } as unknown as WorkRow;

  const R1 = "11111111-0000-4000-8000-000000000001";
  const R2 = "11111111-0000-4000-8000-000000000002";
  // A picture row, with what a wider one could hold: none of it may survive either.
  const picRow = {
    item_id: "w1",
    width: 3000,
    height: 2000,
    placeholder: "data:image/jpeg;base64,AAAA",
    renditions: [
      { id: R1, format: "jpeg", width: 480, height: 320, long_side: 480, storage_key: "collections/c/items/w1/renditions/x/480.jpg" },
      { id: R2, format: "avif", width: 480, height: 320, long_side: 480, storage_bucket: "curator-masters" },
      { id: R1, format: "tiff", width: 480, height: 320 },
    ],
    source_id: "i-master",
    sha256: "deadbeef",
  } as unknown as PictureRow;

  it("only the gallery's fields travel; value, price, location and ownership do not", () => {
    const w = toWork(row, picRow);
    expect(Object.keys(w).sort()).toEqual(
      ["acquiredFrom", "acquiredOn", "artist", "dimensions", "edition", "id", "medium", "picture", "sold", "title", "year", "yearText"].sort(),
    );
    const text = JSON.stringify(w);
    for (const leak of ["123456", "654321", "Hilltop", "dining", "note", "Price"]) expect(text).not.toContain(leak);
    expect(w.dimensions).toBe("70 x 50 cm");
    expect(w.sold).toBe(false);
  });

  it("the picture carries renditions only: no storage address, no source id, nothing a row smuggles in", () => {
    const w = toWork(row, picRow);
    expect(w.picture).toEqual({
      width: 3000,
      height: 2000,
      placeholder: "data:image/jpeg;base64,AAAA",
      renditions: [
        { id: R1, format: "jpeg", width: 480, height: 320 },
        { id: R2, format: "avif", width: 480, height: 320 },
      ],
    });
    const text = JSON.stringify(w.picture);
    for (const leak of ["curator-masters", "collections/", "storage", "i-master", "sha"]) expect(text).not.toContain(leak);
  });

  it("a picture without a JPEG rung, with a bad id, or with a stand-in that is not an image hangs safely", () => {
    expect(toPicture(null)).toBeNull();
    expect(toPicture({ ...picRow, renditions: [] })).toBeNull();
    expect(toPicture({ ...picRow, renditions: [{ id: R2, format: "avif", width: 480, height: 320 }] })).toBeNull();
    expect(toPicture({ ...picRow, renditions: [{ id: "../i-master", format: "jpeg", width: 480, height: 320 }] })).toBeNull();
    expect(toPicture({ ...picRow, placeholder: 'x"); background:url(https://elsewhere' })?.placeholder).toBeNull();
    expect(toWork(row).picture).toBeNull();
  });

  it("sold is read from the status and nothing else of the status travels", () => {
    expect(toWork({ ...row, status: "sold" }).sold).toBe(true);
    expect(JSON.stringify(toWork({ ...row, status: "in_storage" }))).not.toContain("storage");
  });
});

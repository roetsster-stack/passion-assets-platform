/**
 * M1-03 · the gallery's rules, without a browser or a database: the order of the wall, the hero,
 * how a photograph hangs, the words under it, the looks, and what a row may carry onto a page.
 * Synthetic works only — no real titles, sources or dates belong in a repository.
 */
import { describe, expect, it } from "vitest";
import { chooseHero } from "@/lib/gallery/hero";
import { chooseLook, parseLook } from "@/lib/gallery/looks";
import { hang, neighbours, walk } from "@/lib/gallery/order";
import { firstPicture, toWork, type WorkRow } from "@/lib/gallery/read";
import { acquisitionLine, monthYear, tombstoneDetail, tombstoneLine } from "@/lib/gallery/tombstone";
import { CONTAINED_MIN, FULL_BLEED_MIN, treatment } from "@/lib/gallery/treatment";
import type { Work } from "@/lib/gallery/types";

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
    picture: { id: `img-${id}`, width: 2000, height: 1500 },
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
      work("newest-small", { acquiredOn: "2026-01-01", picture: { id: "a", width: 1200, height: 900 } }),
      work("newest-none", { acquiredOn: "2025-12-01", picture: null }),
      work("good", { acquiredOn: "2025-06-01", picture: { id: "b", width: 1000, height: FULL_BLEED_MIN } }),
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
    expect(chooseHero([work("x", { picture: { id: "p", width: 800, height: 600 } })])).toBeNull();
    expect(chooseHero([])).toBeNull();
  });
});

describe("how a photograph hangs", () => {
  it("follows the two thresholds on the long side, portrait or landscape", () => {
    expect(treatment({ id: "p", width: FULL_BLEED_MIN, height: 10 })).toBe("full");
    expect(treatment({ id: "p", width: 10, height: FULL_BLEED_MIN })).toBe("full");
    expect(treatment({ id: "p", width: FULL_BLEED_MIN - 1, height: 10 })).toBe("contained");
    expect(treatment({ id: "p", width: CONTAINED_MIN, height: 10 })).toBe("contained");
    expect(treatment({ id: "p", width: CONTAINED_MIN - 1, height: 10 })).toBe("matted");
  });

  it("a work with no photograph hangs as its label; an unmeasured one is never stretched", () => {
    expect(treatment(null)).toBe("label");
    expect(treatment({ id: "p", width: null, height: null })).toBe("matted");
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

describe("the looks", () => {
  it("the address wins, then the remembered look, then Monograph", () => {
    expect(chooseLook("2", "3")).toBe(2);
    expect(chooseLook(undefined, "3")).toBe(3);
    expect(chooseLook(undefined, undefined)).toBe(1);
    expect(chooseLook("9", "nonsense")).toBe(1);
    expect(parseLook(["3", "1"])).toBe(3);
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
    images: [
      { id: "i-master", kind: "master", width: 9000, height: 6000, is_hero: true, sort_order: 0 },
      { id: "i-2", kind: "lowres_airtable", width: 1200, height: 800, is_hero: false, sort_order: 1 },
      { id: "i-1", kind: "lowres_airtable", width: 1100, height: 800, is_hero: false, sort_order: 0 },
    ],
    // What a wider row could hold. None of it may survive.
    purchase_price: 123456,
    purchase_price_zar: 123456,
    current_value: 654321,
    location: "Hilltop House, dining room",
    location_tags: ["Hilltop House"],
    admin_notes: "note",
    airtable_raw: { fields: { Price: 123456 } },
  } as unknown as WorkRow;

  it("only the gallery's fields travel; value, price, location and ownership do not", () => {
    const w = toWork(row);
    expect(Object.keys(w).sort()).toEqual(
      ["acquiredFrom", "acquiredOn", "artist", "dimensions", "edition", "id", "medium", "picture", "sold", "title", "year", "yearText"].sort(),
    );
    const text = JSON.stringify(w);
    for (const leak of ["123456", "654321", "Hilltop", "dining", "note", "Price"]) expect(text).not.toContain(leak);
    expect(w.dimensions).toBe("70 x 50 cm");
    expect(w.sold).toBe(false);
  });

  it("the picture is the first servable photograph; a master is never chosen", () => {
    expect(toWork(row).picture).toEqual({ id: "i-1", width: 1100, height: 800 });
    expect(firstPicture([{ id: "m", kind: "master", width: 1, height: 1, is_hero: true, sort_order: 0 }])).toBeNull();
    expect(firstPicture(null)).toBeNull();
  });

  it("sold is read from the status and nothing else of the status travels", () => {
    expect(toWork({ ...row, status: "sold" }).sold).toBe(true);
    expect(JSON.stringify(toWork({ ...row, status: "in_storage" }))).not.toContain("storage");
  });
});

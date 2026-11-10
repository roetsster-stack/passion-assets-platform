/**
 * M1-02a · the ladder: the sizes cut for a source, what the encoder writes, how the page asks for
 * a picture, Save-Data, and which file is a work's picture. Synthetic images only.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fallback, isSaveData, rungsFor, sizesFor, srcSet, standInStyle } from "@/lib/gallery/picture";
import type { Picture, Rendition } from "@/lib/gallery/types";
import { ladderFor, RUNGS, SAVE_DATA_CAP } from "@/lib/images/ladder";
import { cut, probe } from "@/lib/images/render";
import { bestSource, isAlternateView, type Source } from "@/lib/images/sources";

describe("the sizes cut for a source", () => {
  it("480 · 1,080 · 2,160 · 4,320, each only if the source is that large", () => {
    expect(RUNGS).toEqual([480, 1080, 2160, 4320]);
    expect(ladderFor(4320)).toEqual([480, 1080, 2160, 4320]);
    expect(ladderFor(5375)).toEqual([480, 1080, 2160, 4320]);
    expect(ladderFor(2160)).toEqual([480, 1080, 2160]);
  });

  it("never upscaled: a 1,071 px photograph yields 480 and 1,071, nothing larger", () => {
    expect(ladderFor(1071)).toEqual([480, 1071]);
    expect(ladderFor(3000)).toEqual([480, 1080, 2160, 3000]);
    expect(ladderFor(1080)).toEqual([480, 1080]);
  });

  it("a source smaller than the first rung is its own only rung; nothing is a rung of nothing", () => {
    expect(ladderFor(300)).toEqual([300]);
    expect(ladderFor(480)).toEqual([480]);
    expect(ladderFor(0)).toEqual([]);
    expect(ladderFor(Number.NaN)).toEqual([]);
  });
});

describe("what the encoder writes", () => {
  it("JPEG progressive and AVIF at every rung, sRGB, no metadata at all, never larger than the source", async () => {
    // A wide-gamut photograph with a camera's EXIF and a GPS position, as a photographer's file may carry.
    const source = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 180, g: 90, b: 40 } } })
      .withIccProfile("p3")
      .withExif({ IFD0: { Make: "TestCam", Copyright: "someone" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "33/1 55/1 0/1" } })
      .jpeg({ quality: 95 })
      .toBuffer();
    const before = await sharp(source).metadata();
    expect(before.exif).toBeDefined();
    expect(before.icc).toBeDefined();

    const c = await cut(source);
    expect({ width: c.width, height: c.height }).toEqual({ width: 1200, height: 800 });
    expect(c.renditions.map((r) => `${r.longSide}${r.format}`)).toEqual(["480jpeg", "480avif", "1080jpeg", "1080avif", "1200jpeg", "1200avif"]);
    for (const r of c.renditions) {
      const m = await sharp(r.body).metadata();
      expect(m.format).toBe(r.format === "jpeg" ? "jpeg" : "heif");
      expect(Math.max(m.width!, m.height!)).toBe(r.longSide);
      expect({ width: r.width, height: r.height }).toEqual({ width: m.width, height: m.height });
      expect(m.exif, `${r.longSide} ${r.format} exif`).toBeUndefined();
      expect(m.icc, `${r.longSide} ${r.format} profile`).toBeUndefined();
      expect(m.space).toBe("srgb");
      if (r.format === "jpeg") expect(m.isProgressive).toBe(true);
      expect(r.body.includes(Buffer.from("TestCam"))).toBe(false);
    }
  });

  it("the stand-in is a 24 px JPEG small enough to sit in the page", async () => {
    const source = await sharp({ create: { width: 900, height: 1500, channels: 3, background: "#335577" } }).png().toBuffer();
    const c = await cut(source);
    expect(c.placeholder).toMatch(/^data:image\/jpeg;base64,/);
    const px = Buffer.from(c.placeholder.split(",")[1], "base64");
    const m = await sharp(px).metadata();
    expect(Math.max(m.width!, m.height!)).toBe(24);
    expect(px.length).toBeLessThan(1200);
  });

  it("reads a picture's size the way it is displayed — a camera's quarter turn included", async () => {
    const turned = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#888" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect(await probe(turned)).toEqual({ width: 400, height: 600 });
    await expect(probe(Buffer.from("not a picture"))).rejects.toThrow();
  });
});

describe("how the page asks for a picture", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const r = (n: number, format: Rendition["format"], width: number, height: number): Rendition => ({ id: id(n), format, width, height });
  const picture: Picture = {
    width: 5375,
    height: 3583,
    placeholder: "data:image/jpeg;base64,AAAA",
    renditions: [r(1, "jpeg", 480, 320), r(2, "jpeg", 1080, 720), r(3, "jpeg", 2160, 1440), r(4, "jpeg", 4320, 2880), r(5, "avif", 480, 320), r(6, "avif", 1080, 720), r(7, "avif", 2160, 1440), r(8, "avif", 4320, 2880)],
    tileSet: null,
  };

  it("every rung, through the image door, with its true width", () => {
    expect(srcSet(rungsFor(picture, "jpeg", false))).toBe(`/i/${id(1)} 480w, /i/${id(2)} 1080w, /i/${id(3)} 2160w, /i/${id(4)} 4320w`);
    expect(srcSet(rungsFor(picture, "avif", false))).toBe(`/i/${id(5)} 480w, /i/${id(6)} 1080w, /i/${id(7)} 2160w, /i/${id(8)} 4320w`);
  });

  it("a portrait picture is offered by its width, not its long side", () => {
    const portrait: Picture = { ...picture, width: 800, height: 1200, renditions: [r(9, "jpeg", 320, 480), r(10, "jpeg", 720, 1080)] };
    expect(srcSet(rungsFor(portrait, "jpeg", false))).toBe(`/i/${id(9)} 320w, /i/${id(10)} 720w`);
  });

  it("Save-Data caps the ladder at 1,080 — in both formats, and for the fallback", () => {
    expect(SAVE_DATA_CAP).toBe(1080);
    for (const f of ["jpeg", "avif"] as const) {
      const rungs = rungsFor(picture, f, true);
      expect(rungs.map((x) => x.width)).toEqual([480, 1080]);
    }
    expect(fallback(picture)?.id).toBe(id(2));
    expect(isSaveData("on")).toBe(true);
    expect(isSaveData(" On ")).toBe(true);
    for (const v of [null, undefined, "", "off", "1"]) expect(isSaveData(v)).toBe(false);
  });

  it("a small photograph's fallback is its largest rung under the cap, or its only one", () => {
    expect(fallback({ ...picture, renditions: [r(1, "jpeg", 480, 320), r(11, "jpeg", 1071, 714)] })?.id).toBe(id(11));
    expect(fallback({ ...picture, renditions: [r(12, "jpeg", 2000, 1300)] })?.id).toBe(id(12));
  });

  it("sizes: a cell is a column of the wall; a stage is the screen, or less when the picture is tall", () => {
    expect(sizesFor("cell", "full", picture)).toBe("(min-width: 1024px) 27vw, (min-width: 640px) 42vw, 88vw");
    expect(sizesFor("stage", "full", picture)).toBe("min(100vw, 150vh)");
    expect(sizesFor("stage", "full", { ...picture, width: 2000, height: 4000 })).toBe("min(100vw, 50vh)");
    expect(sizesFor("stage", "contained", { ...picture, width: 1200, height: 1200 })).toBe("min(70vw, 70vh)");
  });

  it("the stand-in is the picture's background; on a mat it fills the picture and not the mat", () => {
    expect(standInStyle(null, false)).toEqual({});
    expect(standInStyle("data:image/jpeg;base64,AAAA", false).backgroundImage).toBe('url("data:image/jpeg;base64,AAAA")');
    const matted = standInStyle("data:image/jpeg;base64,AAAA", true);
    expect(matted.backgroundClip).toBe("content-box, border-box");
    expect(String(matted.backgroundImage)).toContain("var(--color-gallery-raised)");
  });
});

describe("which file is a work's picture", () => {
  const s = (id: string, kind: Source["kind"], sort_order = 0, original_filename: string | null = null, cut?: boolean): Source => ({
    id,
    kind,
    sort_order,
    original_filename,
    ...(cut === undefined ? {} : { cut }),
  });

  it("a master over the Airtable snapshot — once its ladder is cut; until then, or if it will not cut, the snapshot stays", () => {
    expect(bestSource([s("a", "lowres_airtable"), s("m", "master", 5, "Work.tif")])?.id).toBe("m");
    expect(bestSource([s("a", "lowres_airtable"), s("m", "master", 0, "Work.tif", true)])?.id).toBe("m");
    expect(bestSource([s("a", "lowres_airtable"), s("m", "master", 0, "Work.tif", false)])?.id).toBe("a");
    expect(bestSource([s("m", "master", 0, "Work.tif", false)])).toBeNull();
  });

  it("among masters, the first flat capture: details, raking light and the back come after", () => {
    const masters = [
      s("d2", "master", 0, "Painter, Work (2010) (detail 2).tif"),
      s("d1", "master", 0, "Painter, Work (2010) (detail 1).tif"),
      s("rk", "master", 0, "Painter_Work_2010_raking.tif"),
      s("flat", "master", 0, "Painter, Work (2010).tif"),
    ];
    expect(bestSource(masters)?.id).toBe("flat");
    expect(bestSource(masters.filter((m) => m.id === "d1" || m.id === "d2"))?.id).toBe("d1"); // numbered by number, not by text
    expect(isAlternateView("Painter_Work_2010_insitu.jpg")).toBe(true);
    expect(isAlternateView("Painter, Inside the Room.tif")).toBe(false);
  });

  it("two plain captures: the plain name hangs before the numbered one, whatever the collation says", () => {
    expect(bestSource([s("two", "master", 0, "Work (2).tif"), s("one", "master", 0, "Work.tif")])?.id).toBe("one");
    expect(bestSource([s("two", "master", 0, "Work_2.tif"), s("one", "master", 0, "Work.tif")])?.id).toBe("one");
    expect(bestSource([s("one", "master", 0, "Work.tif"), s("two", "master", 0, "Work (2).tif")])?.id).toBe("one");
  });

  it("a title with a view word in it is not a view: the plain capture hangs, the detail of it comes after", () => {
    const title = "Side Door";
    expect(isAlternateView("Painter, Side Door, 2010.tif", title)).toBe(false);
    expect(isAlternateView("Painter, Side Door, 2010 (detail).tif", title)).toBe(true);
    const files = [s("detail", "master", 0, "Painter, Door (detail).tif"), s("plain", "master", 0, "Painter, Side Door, 2010.tif")];
    expect(bestSource(files, { title })?.id).toBe("plain");
    // Without the title, "side" would make the plain capture a view too, and the detail — the shorter name — would hang.
    expect(bestSource(files)?.id).toBe("detail");
  });

  it("among Airtable photographs, the first attachment; none at all, no picture", () => {
    expect(bestSource([s("b", "lowres_airtable", 1), s("a", "lowres_airtable", 0)])?.id).toBe("a");
    expect(bestSource([])).toBeNull();
  });
});

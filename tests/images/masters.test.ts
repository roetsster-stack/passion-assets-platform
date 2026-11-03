/**
 * M1-02a · the masters folders on Workshop: their names, matching the photographer's files to
 * works, and that preparing and sorting can run again and again without changing anything.
 * Synthetic artists and titles, in a temporary folder.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { folderName, MARKER, placeFile, planFolders, type Marker, type MasterWork } from "@/lib/images/masters";
import { prepareFolders, readMarkers, sortFrom } from "@/lib/images/masters-run";

const works: MasterWork[] = [
  { recordId: "recA1", artist: "Ada Example", surname: "Example", title: "Study in Grey", year: "2019" },
  { recordId: "recA2", artist: "Ada Example", surname: "Example", title: "Study in Blue", year: "2021" },
  { recordId: "recB1", artist: "Bjorn Beispiel", surname: "Beispiel", title: "Untitled", year: "2010" },
  { recordId: "recC1", artist: "Cleo van Zyl", surname: "van Zyl", title: "Self-portrait as a Woman, or Why Even the Moon Turns Away", year: "Circa 1980's" },
  { recordId: "recD1", artist: "Dora Ka Zenzile", surname: "Ka Zenzile", title: "Silence", year: "2016" },
];

describe("the folder names", () => {
  it("NNN-Surname-Title: the surname as one word, the title's first eight words, accents and punctuation dropped", () => {
    expect(folderName(3, "Adams", "Untitled ii (Arabic frame, purple)")).toBe("003-Adams-Untitled-ii-Arabic-frame-purple");
    expect(folderName(20, "Botes", "Self-portrait as a Woman, or why even the Moon")).toBe("020-Botes-Selfportrait-as-a-Woman-or-why-even-the");
    expect(folderName(104, "Wa Lehulere", "Burnt sunflowers")).toBe("104-WaLehulere-Burnt-sunflowers");
    expect(folderName(106, "Yiadom-Boakye", "Highriser")).toBe("106-Yiadom-Boakye-Highriser");
    expect(folderName(8, "Blom", "1/9 Untitled")).toBe("008-Blom-1-9-Untitled");
    expect(folderName(76, "Mivekannin", "Après Vallotton")).toBe("076-Mivekannin-Apres-Vallotton");
  });

  it("existing folders keep their names and numbers; a new work is numbered after the highest in use", () => {
    const existing = new Map([
      ["recA1", "001-Example-Study-in-Grey"],
      ["recB1", "007-Beispiel-Untitled"],
    ]);
    const plan = planFolders(works, existing);
    expect(plan.find((p) => p.work.recordId === "recA1")).toMatchObject({ folder: "001-Example-Study-in-Grey", isNew: false });
    expect(plan.filter((p) => p.isNew).map((p) => p.folder)).toEqual([
      "008-Example-Study-in-Blue",
      "009-KaZenzile-Silence",
      "010-vanZyl-Selfportrait-as-a-Woman-or-Why-Even-the",
    ]);
  });
});

describe("matching a file to its work", () => {
  const markers: Marker[] = planFolders(works, new Map()).map((p) => ({ ...p.work, folder: p.folder }));
  const folderOf = (rel: string) => {
    const r = placeFile(rel, markers);
    return r.status === "match" || r.status === "artist-only" ? r.work.folder : r.status;
  };

  it("the photographer's own naming, Surname_Title_Year_view", () => {
    expect(folderOf("Example_Study-in-Grey_2019_flat.tif")).toMatch(/-Example-Study-in-Grey$/);
    expect(folderOf("Example_Study_in_Blue_2021_detail.tif")).toMatch(/-Example-Study-in-Blue$/);
  });

  it("a gallery's naming, and a surname of two words", () => {
    expect(folderOf("Dora Ka Zenzile, Silence (2016), oil on canvas.jpg")).toMatch(/-KaZenzile-Silence$/);
    expect(folderOf("vanZyl Self-portrait as a Woman.jpg")).toMatch(/-vanZyl-/);
  });

  it("the artist's only work takes a file with no title in its name; the artist's folder counts as context", () => {
    expect(folderOf("Beispiel/IMG_0042.jpg")).toMatch(/-Beispiel-Untitled$/);
  });

  it("an artist with several works and no deciding title is reported, not guessed", () => {
    const r = placeFile("Example_2020_scan.tif", markers);
    expect(r.status).toBe("ambiguous");
  });

  it("no surname, no placement", () => {
    expect(placeFile("DSC_0001.tif", markers).status).toBe("no-artist");
  });
});

describe("preparing and sorting, again and again", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("--prepare makes one folder per work with its marker; a second run makes none", () => {
    dir = mkdtempSync(path.join(tmpdir(), "masters-"));
    const root = path.join(dir, "masters");
    const first = prepareFolders(root, works);
    expect(first.created).toHaveLength(5);
    const marker = JSON.parse(readFileSync(path.join(root, first.created[0], MARKER), "utf8"));
    expect(marker.airtable_record_id).toMatch(/^rec/);
    expect(readMarkers(root)).toHaveLength(5);
    expect(readFileSync(path.join(root, "_INDEX.csv"), "utf8").split("\n").filter(Boolean)).toHaveLength(6);

    const second = prepareFolders(root, works);
    expect(second.created).toEqual([]);
    expect(second.kept).toBe(5);
    expect(readdirSync(root).filter((n) => !n.startsWith(".") && !n.includes("."))).toHaveLength(5);
  });

  it("--from copies (never moves), reports what it cannot place, and a second run copies nothing", () => {
    dir = mkdtempSync(path.join(tmpdir(), "masters-"));
    const root = path.join(dir, "masters");
    prepareFolders(root, works);
    const from = path.join(dir, "Dropbox", "Art Images");
    mkdirSync(path.join(from, "Ada Example"), { recursive: true });
    writeFileSync(path.join(from, "Ada Example", "Example, Ada, Study in Grey.jpg"), "grey");
    writeFileSync(path.join(from, "Example_2020_scan.tif"), "which one?");
    writeFileSync(path.join(from, "DSC_0001.tif"), "nobody");
    writeFileSync(path.join(from, "notes.docx"), "not a picture");

    const r1 = sortFrom(root, from);
    expect(r1.copied).toHaveLength(1);
    expect(r1.copied[0].folder).toMatch(/-Example-Study-in-Grey$/);
    expect(r1.unplaced.map((u) => u.file).sort()).toEqual(["DSC_0001.tif", "Example_2020_scan.tif"]);
    // the source is untouched
    expect(existsSync(path.join(from, "Ada Example", "Example, Ada, Study in Grey.jpg"))).toBe(true);
    expect(readFileSync(path.join(root, r1.copied[0].folder, "Example, Ada, Study in Grey.jpg"), "utf8")).toBe("grey");

    const r2 = sortFrom(root, from);
    expect(r2.copied).toEqual([]);
    expect(r2.alreadyThere).toBe(1);
  });
});

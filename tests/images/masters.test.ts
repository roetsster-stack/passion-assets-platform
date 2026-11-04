/**
 * M1-02a · the masters folders on Workshop: their names, matching the photographer's files to
 * works, and that preparing and sorting can run again and again without changing anything.
 * Synthetic artists and titles only — shaped like the real ones (a particle, two words, a hyphen,
 * an accent, a slash in a title) but belonging to nobody — in a temporary folder.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { folderName, MARKER, placeFile, planFolders, type Marker, type MasterWork } from "@/lib/images/masters";
import { prepareFolders, readMarkers, sortFrom, unmarkedFolders } from "@/lib/images/masters-run";

const works: MasterWork[] = [
  { recordId: "recA1", artist: "Ada Example", surname: "Example", title: "Study in Grey", year: "2019" },
  { recordId: "recA2", artist: "Ada Example", surname: "Example", title: "Study in Blue", year: "2021" },
  { recordId: "recB1", artist: "Bjorn Beispiel", surname: "Beispiel", title: "Untitled", year: "2010" },
  { recordId: "recC1", artist: "Cleo de Exemplo", surname: "de Exemplo", title: "Portrait of a Harbour, or Why Even the Tide Turns Away", year: "Circa 1980's" },
  { recordId: "recD1", artist: "Dora Ka Mfano", surname: "Ka Mfano", title: "Quiet Hours", year: "2016" },
  { recordId: "recE1", artist: "Eve Smith-Jones", surname: "Smith-Jones", title: "Tower Block", year: "2022" },
  { recordId: "recF1", artist: "Fay Modèle", surname: "Modèle", title: "Été à Lomé", year: "2020" },
  { recordId: "recG1", artist: "Gus le Voorbeeld", surname: "le Voorbeeld", title: "Harbour", year: "2015" },
];

describe("the folder names", () => {
  it("NNN-Surname-Title: the surname as one word, the title's first eight words, accents and punctuation dropped", () => {
    expect(folderName(3, "Example", "Untitled ii (Blue frame, green)")).toBe("003-Example-Untitled-ii-Blue-frame-green");
    expect(folderName(20, "Beispiel", "Portrait of a Harbour, or Why Even the Tide Turns Away")).toBe("020-Beispiel-Portrait-of-a-Harbour-or-Why-Even-the");
    expect(folderName(104, "Ka Mfano", "Burnt matches")).toBe("104-KaMfano-Burnt-matches");
    expect(folderName(106, "Smith-Jones", "Tower Block")).toBe("106-Smith-Jones-Tower-Block");
    expect(folderName(8, "Beispiel", "3/7 Untitled")).toBe("008-Beispiel-3-7-Untitled");
    expect(folderName(76, "Modèle", "Été à Lomé")).toBe("076-Modele-Ete-a-Lome");
    expect(folderName(11, "de Exemplo", "Self-portrait")).toBe("011-deExemplo-Selfportrait");
  });

  it("existing folders keep their names and numbers; a new work is numbered after the highest in use", () => {
    const existing = new Map([
      ["recA1", "001-Example-Study-in-Grey"],
      ["recB1", "007-Beispiel-Untitled"],
    ]);
    const plan = planFolders(works, existing);
    expect(plan.find((p) => p.work.recordId === "recA1")).toMatchObject({ folder: "001-Example-Study-in-Grey", isNew: false });
    expect(plan.filter((p) => p.isNew).map((p) => p.folder)).toEqual([
      "008-deExemplo-Portrait-of-a-Harbour-or-Why-Even-the",
      "009-Example-Study-in-Blue",
      "010-KaMfano-Quiet-Hours",
      "011-leVoorbeeld-Harbour",
      "012-Modele-Ete-a-Lome",
      "013-Smith-Jones-Tower-Block",
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

  it("a gallery's naming; a surname of two words, a hyphenated one, an accented one", () => {
    expect(folderOf("Dora Ka Mfano, Quiet Hours (2016), oil on canvas.jpg")).toMatch(/-KaMfano-Quiet-Hours$/);
    expect(folderOf("KaMfano_QuietHours.jpg")).toBe("title-unknown"); // run together, the title is one unknown word — not guessed
    expect(folderOf("Smith-Jones_Tower_Block.tif")).toMatch(/-Smith-Jones-Tower-Block$/);
    expect(folderOf("SmithJones Tower Block.jpg")).toMatch(/-Smith-Jones-Tower-Block$/);
    expect(folderOf("Modele_Ete-a-Lome_2020.tif")).toMatch(/-Modele-Ete-a-Lome$/);
  });

  it("a surname with a particle — de, le — matches with or without it, and run together", () => {
    expect(folderOf("le Voorbeeld_Harbour_2015.tif")).toMatch(/-leVoorbeeld-Harbour$/);
    expect(folderOf("Voorbeeld, Harbour.tif")).toMatch(/-leVoorbeeld-Harbour$/);
    expect(folderOf("leVoorbeeld_Harbour.tif")).toMatch(/-leVoorbeeld-Harbour$/);
    expect(folderOf("de Exemplo_Portrait of a Harbour_1980.tif")).toMatch(/-deExemplo-/);
    expect(folderOf("deExemplo Portrait of a Harbour.jpg")).toMatch(/-deExemplo-/);
  });

  it("the artist's only work takes a file with nothing in its name but the surname, a year or a counter; the artist's folder counts as context", () => {
    expect(folderOf("Beispiel/IMG_0042.jpg")).toMatch(/-Beispiel-Untitled$/);
    expect(folderOf("Beispiel_2010.tif")).toMatch(/-Beispiel-Untitled$/);
    expect(placeFile("Beispiel/IMG_0042.jpg", markers).status).toBe("artist-only");
  });

  it("a file naming a title the register does not know is never placed by guess, even for an artist with one work", () => {
    const r = placeFile("Beispiel_NewWork_2024.tif", markers);
    expect(r.status).toBe("title-unknown");
    if (r.status === "title-unknown") expect(r.work.folder).toMatch(/-Beispiel-Untitled$/);
  });

  it("an artist with several works and no deciding title is reported, not guessed", () => {
    expect(placeFile("Example_2020_scan.tif", markers).status).toBe("ambiguous");
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
    expect(first.created).toHaveLength(8);
    const marker = JSON.parse(readFileSync(path.join(root, first.created[0], MARKER), "utf8"));
    expect(marker.airtable_record_id).toMatch(/^rec/);
    expect(readMarkers(root)).toHaveLength(8);
    expect(readFileSync(path.join(root, "_INDEX.csv"), "utf8").split("\n").filter(Boolean)).toHaveLength(9);

    const second = prepareFolders(root, works);
    expect(second.created).toEqual([]);
    expect(second.kept).toBe(8);
    expect(readdirSync(root).filter((n) => !n.startsWith(".") && !n.includes("."))).toHaveLength(8);
  });

  it("--prepare refuses, naming them, when a folder named like a work folder has no readable marker", () => {
    dir = mkdtempSync(path.join(tmpdir(), "masters-"));
    const root = path.join(dir, "masters");
    mkdirSync(path.join(root, "099-Nobody-Work"), { recursive: true });
    mkdirSync(path.join(root, "098-Broken-Marker"), { recursive: true });
    writeFileSync(path.join(root, "098-Broken-Marker", MARKER), "{ not json");
    mkdirSync(path.join(root, "Art Images from Dropbox"), { recursive: true }); // not a work folder: ignored
    expect(unmarkedFolders(root)).toEqual(["098-Broken-Marker", "099-Nobody-Work"]);
    expect(() => prepareFolders(root, works)).toThrow(/098-Broken-Marker[\s\S]*099-Nobody-Work/);
    expect(readdirSync(root).filter((n) => /^\d{3}-/.test(n))).toHaveLength(2); // nothing created
    expect(existsSync(path.join(root, "_INDEX.csv"))).toBe(false);
  });

  it("--from copies (never moves), reports what it cannot place, and a second run copies nothing", () => {
    dir = mkdtempSync(path.join(tmpdir(), "masters-"));
    const root = path.join(dir, "masters");
    prepareFolders(root, works);
    const from = path.join(dir, "Dropbox", "Art Images");
    mkdirSync(path.join(from, "Ada Example"), { recursive: true });
    writeFileSync(path.join(from, "Ada Example", "Example, Ada, Study in Grey.jpg"), "grey");
    writeFileSync(path.join(from, "Example_2020_scan.tif"), "which one?");
    writeFileSync(path.join(from, "Beispiel_NewWork_2024.tif"), "whose title?");
    writeFileSync(path.join(from, "DSC_0001.tif"), "nobody");
    writeFileSync(path.join(from, "notes.docx"), "not a picture");

    const r1 = sortFrom(root, from);
    expect(r1.copied).toHaveLength(1);
    expect(r1.copied[0].folder).toMatch(/-Example-Study-in-Grey$/);
    expect(r1.unplaced.map((u) => u.file).sort()).toEqual(["Beispiel_NewWork_2024.tif", "DSC_0001.tif", "Example_2020_scan.tif"]);
    expect(r1.unplaced.find((u) => u.file.startsWith("Beispiel"))?.why).toMatch(/-Beispiel-Untitled/);
    // the source is untouched
    expect(existsSync(path.join(from, "Ada Example", "Example, Ada, Study in Grey.jpg"))).toBe(true);
    expect(readFileSync(path.join(root, r1.copied[0].folder, "Example, Ada, Study in Grey.jpg"), "utf8")).toBe("grey");

    const r2 = sortFrom(root, from);
    expect(r2.copied).toEqual([]);
    expect(r2.alreadyThere).toBe(1);
  });

  it("--from with a same-named but different file keeps both, once: the third run copies nothing", () => {
    dir = mkdtempSync(path.join(tmpdir(), "masters-"));
    const root = path.join(dir, "masters");
    prepareFolders(root, works);
    const from = path.join(dir, "download");
    mkdirSync(from, { recursive: true });
    const name = "Example, Ada, Study in Grey.jpg";
    writeFileSync(path.join(from, name), "grey, first scan");
    const folder = sortFrom(root, from).copied[0].folder;

    writeFileSync(path.join(from, name), "grey, a better scan, more bytes");
    const r2 = sortFrom(root, from);
    expect(r2.copied).toHaveLength(1);
    expect(readdirSync(path.join(root, folder)).filter((n) => !n.startsWith(".")).sort()).toEqual([name, "Example, Ada, Study in Grey-2.jpg"].sort());

    const r3 = sortFrom(root, from);
    expect(r3.copied).toEqual([]);
    expect(r3.alreadyThere).toBe(1);
    expect(readdirSync(path.join(root, folder)).filter((n) => !n.startsWith("."))).toHaveLength(2);

    // the same size, different bytes: still a different file, kept once
    writeFileSync(path.join(from, name), "grey, a better scan, MORE bytes");
    expect(sortFrom(root, from).copied).toHaveLength(1);
    expect(sortFrom(root, from).copied).toEqual([]);
    expect(readdirSync(path.join(root, folder)).filter((n) => !n.startsWith("."))).toHaveLength(3);
  });
});

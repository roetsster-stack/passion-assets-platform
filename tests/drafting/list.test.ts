/**
 * M2-04 · The prohibition list: the desk's copy is the spec's section word for word, parses as ten
 * rules, and its version is the hash git itself gives the file. Without the file the desk refuses.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gitBlobHash, ListMissing, loadList, parseList, plainRules } from "@/lib/drafting/list";

const root = path.resolve(__dirname, "..", "..");
const LIST = path.join(root, "docs", "drafting", "prohibition-list.md");
const SPEC = path.join(root, "docs", "specs", "M2-04_prohibition_list.md");

describe("the list", () => {
  it("is the spec's THE LIST section, word for word", () => {
    const spec = readFileSync(SPEC, "utf8");
    const from = spec.indexOf("## THE LIST");
    const to = spec.indexOf("## GOOD LOOKS LIKE");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const section = spec.slice(from, to).trim();
    const copy = readFileSync(LIST, "utf8").replace(/<!--[\s\S]*?-->/g, "").trim();
    expect(copy).toBe(section);
  });

  it("holds rules 1 to 10, in Michael's words, and the register line", () => {
    const list = loadList(LIST);
    expect(list.rules.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(list.rules[0].text).toMatch(/^\*\*Never invent provenance\.\*\*/);
    // a rule that wraps onto a second line is one rule
    expect(list.rules[1].text).toContain('"appreciating". Enjoyment is the front door');
    expect(list.rules[5].text).toContain("unless a cited source says exactly it, and then in their own words, attributed");
    expect(list.rules[9].text).toContain('"Not enough is known yet" is an answer');
    expect(list.register).toBe("plain, warm, exact — a museum's wall text, not a gallery's press release.");
    expect(plainRules(list)).not.toContain("**");
    expect(plainRules(list)).toContain("6. No rank, no superlatives of our own.");
  });

  it("has the version git gives the file: the blob hash", () => {
    expect(gitBlobHash("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(gitBlobHash("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    expect(gitBlobHash("héllo\n")).not.toBe(gitBlobHash("hello\n"));
    let fromGit: string | null = null;
    try {
      fromGit = execFileSync("git", ["hash-object", LIST], { cwd: root, encoding: "utf8" }).trim();
    } catch {
      fromGit = null; // no git here; the known answers above carry the test
    }
    if (fromGit) expect(loadList(LIST).version).toBe(fromGit);
    // a changed word is a new version
    const changed = readFileSync(LIST, "utf8").replace("No rank", "No ranking");
    expect(gitBlobHash(changed)).not.toBe(loadList(LIST).version);
  });

  it("refuses to run without the list, or with a list that is not ten rules", () => {
    expect(() => loadList(path.join(tmpdir(), "no-such-list.md"))).toThrow(ListMissing);
    expect(() => loadList(path.join(tmpdir(), "no-such-list.md"))).toThrow(/does not run without it/);
    const dir = mkdtempSync(path.join(tmpdir(), "list-"));
    const nine = path.join(dir, "nine.md");
    writeFileSync(nine, readFileSync(LIST, "utf8").replace(/^10\. .*$/m, ""));
    expect(() => loadList(nine)).toThrow(/rules 1 to 10/);
    expect(parseList("1. One.\n2. Two.\n").rules).toHaveLength(2);
  });
});

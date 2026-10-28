import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Smoke tests for the scaffold. Real tests arrive with each feature, alongside the code.
 */
describe("scaffold", () => {
  it("never ships a real env file", () => {
    const gitignore = readFileSync(path.resolve(__dirname, "..", ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });

  it("pins the app to London alongside the database", () => {
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "..", "vercel.json"), "utf8"));
    expect(vercel.regions).toEqual(["lhr1"]);
  });
});

import { describe, expect, it } from "vitest";
import { r2Endpoint } from "@/lib/ingest/storage";

describe("r2Endpoint", () => {
  it("uses the default endpoint when no jurisdiction is set", () => {
    expect(r2Endpoint("abc")).toBe("https://abc.r2.cloudflarestorage.com");
  });

  it("uses the jurisdiction's endpoint for EU and FedRAMP buckets", () => {
    expect(r2Endpoint("abc", "eu")).toBe("https://abc.eu.r2.cloudflarestorage.com");
    expect(r2Endpoint("abc", "fedramp")).toBe("https://abc.fedramp.r2.cloudflarestorage.com");
  });
});

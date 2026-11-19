/**
 * M2-04 · The sources allowlist — docs/drafting/sources-allowlist.md, a short file Michael edits.
 * The model's web search may look only here; a citation from anywhere else is thrown away before
 * it can become a source — nor a shop or store page on an allowed site. Each domain is checked to
 * resolve when the desk runs.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";

export type Site = { domain: string; name: string };

export const MAX_SITES = 64;
const DOMAIN = /^(?!-)(?:[a-z0-9-]+\.)+[a-z]{2,}$/;

export const isDomain = (s: string) => DOMAIN.test(s) && !s.includes("..") && !s.endsWith("-");

/** `- domain — who it is` lines; anything else is prose and ignored. */
export function parseAllowlist(markdown: string): Site[] {
  const sites: Site[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const m = raw.match(/^-\s+(\S+)(?:\s+(?:—|–|-|:)\s+(.+))?\s*$/);
    if (!m) continue;
    const domain = m[1].toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    if (!isDomain(domain)) continue;
    if (sites.some((s) => s.domain === domain)) continue;
    sites.push({ domain, name: (m[2] ?? domain).trim() });
  }
  if (sites.length > MAX_SITES) throw new Error(`The sources allowlist holds ${sites.length} sites; the search allows at most ${MAX_SITES}.`);
  return sites;
}

export function loadAllowlist(path: string): Site[] {
  if (!existsSync(path)) throw new Error(`The sources allowlist is missing (${path}).`);
  return parseAllowlist(readFileSync(path, "utf8"));
}

/** Which sites resolve today; the rest are reported and not searched. */
export async function resolving(sites: Site[], lookup: (host: string) => Promise<unknown> = dnsLookup): Promise<{ ok: Site[]; failed: Site[] }> {
  const ok: Site[] = [];
  const failed: Site[] = [];
  for (const s of sites) {
    try {
      await lookup(s.domain);
      ok.push(s);
    } catch {
      failed.push(s);
    }
  }
  return { ok, failed };
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A subdomain that sells: shop., store., webshop., e-shop. — a shop page is not a source (rule 2). */
const SHOP_LABEL = /^(?:e-?)?(?:web)?(?:shop|store)s?$/i;

/**
 * The allowlisted site an address belongs to (subdomains included), or null — never a shop or store
 * subdomain, and never an address that is not http(s): a `javascript:` address naming a site is not
 * that site.
 */
export function siteFor(url: string, sites: Site[]): Site | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  const site = sites.find((s) => host === s.domain || host.endsWith("." + s.domain));
  if (!site) return null;
  const labels = host === site.domain ? [] : host.slice(0, host.length - site.domain.length - 1).split(".");
  if (labels.some((l) => SHOP_LABEL.test(l))) return null;
  return site;
}

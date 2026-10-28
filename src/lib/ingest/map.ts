/**
 * Pure mapping from Airtable records to platform rows. No I/O here, so every rule is testable
 * against a synthetic fixture.
 */
import { createHash } from "node:crypto";
import type { AirtableAttachment, AirtableRecord } from "./airtable";
import { F, P } from "./fields";

// ---------------------------------------------------------------------------------------------
// Row shapes the runner writes
// ---------------------------------------------------------------------------------------------

export type ItemStatus =
  | "hung"
  | "in_storage"
  | "on_loan"
  | "in_transit"
  | "at_framer"
  | "with_artist"
  | "sold"
  | "gifted"
  | "unknown";

export type ArtistRow = {
  surname: string;
  given_name: string | null;
  display_name: string;
  normalized_key: string;
  nationality: string[];
};

export type ItemRow = {
  airtable_record_id: string;
  artist_key: string | null;
  title: string | null;
  year_text: string | null;
  year: number | null;
  medium: string | null;
  materials: string | null;
  dimensions_framed: string | null;
  dimensions_unframed: string | null;
  edition: string | null;
  acquired_on: string | null;
  purchase_price: number | null;
  purchase_currency: string | null;
  purchase_price_zar: number | null;
  acquired_from: string | null;
  credit_gallery: string | null;
  current_value: number | null;
  current_value_currency: string | null;
  valuation_date: string | null;
  status: ItemStatus;
  sold_year: number | null;
  location: string | null;
  location_tags: string[];
  condition_note: string | null;
  admin_notes: string | null;
  comments_raw: string | null;
  notes_raw: string | null;
  links: string | null;
  has_high_res: boolean | null;
  has_low_res: boolean | null;
  has_invoice: boolean | null;
  has_coa: boolean | null;
  high_res_note: string | null;
  owner_names: string[];
  owner_defaulted: boolean;
  provenance_record_ids: string[];
  airtable_modified_at: string | null;
  attachments: MappedAttachment[];
  raw: Record<string, unknown>;
  content_hash: string;
};

export type MappedAttachment = {
  group: "image" | "invoice" | "coa" | "other";
  attachment: AirtableAttachment;
  sort_order: number;
};

export type ProvenanceRow = {
  airtable_record_id: string;
  item_record_ids: string[];
  label: string;
  details_url: string | null;
  reviews: string | null;
  added_info: string | null;
  attachments: AirtableAttachment[];
  raw: Record<string, unknown>;
  content_hash: string;
};

// ---------------------------------------------------------------------------------------------
// Small readers — Airtable's REST shapes, tolerated
// ---------------------------------------------------------------------------------------------

export function text(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "name" in v) return text((v as { name: unknown }).name);
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function list(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => text(x)).filter((x): x is string => x !== null);
}

export function attachments(v: unknown): AirtableAttachment[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is AirtableAttachment => !!a && typeof a === "object" && "id" in a && "url" in a)
    .map((a) => ({
      id: a.id,
      url: a.url,
      filename: a.filename ?? a.id,
      size: a.size,
      type: a.type,
      width: a.width,
      height: a.height,
    }));
}

export function linkedIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && "id" in x ? String((x as { id: unknown }).id) : null))
    .filter((x): x is string => x !== null);
}

/** "Yes" / "Yes " / "No" / "No Image" / "N/A" → true / false / null */
export function yesNo(v: unknown): boolean | null {
  const t = text(v)?.toLowerCase();
  if (!t) return null;
  if (t === "yes") return true;
  if (t === "no" || t === "no image") return false;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Year — the base holds "2o24", "Circa 1980's", "2014/22014", "undated". Tolerate, never invent.
// ---------------------------------------------------------------------------------------------

export function parseYear(raw: string | null): number | null {
  if (!raw) return null;
  // A letter o standing in for a zero between digits: "2o24" → "2024".
  const cleaned = raw.replace(/(\d)[oO](\d)/g, (_m, a: string, b: string) => `${a}0${b}`);
  const m = cleaned.match(/(^|\D)(1[89]\d{2}|20\d{2})(?!\d)/);
  if (!m) return null;
  const y = Number(m[2]);
  return y >= 1800 && y <= 2100 ? y : null;
}

// ---------------------------------------------------------------------------------------------
// Artists — one entity per (surname, given name), case- and accent-insensitive
// ---------------------------------------------------------------------------------------------

export function normalizeKey(surname: string, givenName: string | null): string {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return `${fold(surname)}|${givenName ? fold(givenName) : ""}`;
}

export function artistFromRecord(r: AirtableRecord): ArtistRow | null {
  const surname = text(r.fields[F.surname]);
  const given = text(r.fields[F.givenName]);
  if (!surname && !given) return null;
  const s = surname ?? given!;
  const g = surname ? given : null;
  return {
    surname: s,
    given_name: g,
    display_name: g ? `${g} ${s}` : s,
    normalized_key: normalizeKey(s, g),
    nationality: list(r.fields[F.nationality]).filter((n) => n !== "ZAR"), // "ZAR" is a data-entry slip
  };
}

// ---------------------------------------------------------------------------------------------
// Location — Airtable mixes places, states and condition notes in one multi-select. Map by rule;
// anything unmapped is kept as a tag and flagged in admin notes, never lost.
// ---------------------------------------------------------------------------------------------

export type LocationResult = {
  status: ItemStatus;
  location: string | null;
  condition_note: string | null;
  sold_year: number | null;
  unmapped: string[];
};

/**
 * The vocabulary the rules need — residences, storage, framers, studios, owners. Location and
 * ownership are sensitive classes, so the real vocabulary lives beside `~/curator/.env` on Workshop
 * (`ingest-rules.json`), never in the repository. The repository holds only the rule *shapes* and a
 * synthetic vocabulary for tests. See `ingest-rules.example.json`.
 */
export type IngestRules = {
  defaultOwner: string;
  owners: { name: string; kind: "person" | "joint" | "company" | "trust" | "vehicle" }[];
  /** Places the collection lives in: a work tagged with one is hung there. */
  residences: string[];
  /** Storage facilities: a work tagged with one is in storage there. */
  storage: string[];
  /** Framers and finishers: a work tagged with one is at the framer. */
  framers: string[];
  /** Tags of the form "<tag> - rework" / "<tag> - recent purchase" mean the work is with that artist. */
  studios: { tag: string; name: string }[];
};

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function applyLocationRules(tags: string[], rules: IngestRules): LocationResult {
  const acc: LocationResult = { status: "unknown", location: null, condition_note: null, sold_year: null, unmapped: [] };
  const hangIfUnknown = () => {
    if (acc.status === "unknown") acc.status = "hung";
  };

  for (const tag of tags) {
    let m: RegExpMatchArray | null;

    if ((m = tag.match(/^sold\s*(\d{4})?$/i))) {
      acc.status = "sold";
      if (m[1]) acc.sold_year = Number(m[1]);
      continue;
    }
    if ((m = tag.match(/^on loan\s+(.+)$/i))) {
      acc.status = "on_loan";
      acc.location = m[1].trim();
      continue;
    }
    if ((m = tag.match(/^(.+?)\s*\(to be fixed\)$/i))) {
      hangIfUnknown();
      acc.location = acc.location ?? m[1].trim();
      acc.condition_note = "To be fixed";
      continue;
    }
    if (/^framed$/i.test(tag)) continue; // a state of the object, carried in location_tags

    const studio = rules.studios.find((s) => tag.match(new RegExp(`^${escapeRe(s.tag)}\\s*-\\s*(rework|recent purchase)$`, "i")));
    if (studio) {
      const kind = tag.match(/(rework|recent purchase)$/i)![1].toLowerCase();
      acc.status = "with_artist";
      acc.location = studio.name;
      acc.condition_note = kind === "rework" ? "With the artist for rework" : "Recent purchase, with the artist";
      continue;
    }
    if (rules.storage.some((s) => eq(s, tag)) || /(^storage\s|\sstorage$)/i.test(tag)) {
      acc.status = "in_storage";
      acc.location = acc.location ?? tag.trim();
      continue;
    }
    if (rules.framers.some((f) => eq(f, tag))) {
      acc.status = "at_framer";
      acc.location = acc.location ?? tag.trim();
      continue;
    }
    if (rules.residences.some((r) => eq(r, tag))) {
      hangIfUnknown();
      acc.location = acc.location ?? tag.trim();
      continue;
    }
    acc.unmapped.push(tag);
  }
  return acc;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------------------------
// Content hash — over what we map, never over Airtable's rotating attachment URLs
// ---------------------------------------------------------------------------------------------

export function stableHash(value: unknown): string {
  const seen = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(seen);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = seen((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(seen(value))).digest("hex");
}

function attachmentIdentity(a: AirtableAttachment) {
  return { id: a.id, filename: a.filename, size: a.size ?? null, type: a.type ?? null };
}

// ---------------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------------

export function mapItem(r: AirtableRecord, rules: IngestRules): ItemRow {
  const f = r.fields;
  const artist = artistFromRecord(r);
  const tags = list(f[F.location]);
  const loc = applyLocationRules(tags, rules);

  const adminFlags: string[] = [];
  if (loc.unmapped.length) adminFlags.push(`Unmapped location tag(s): ${loc.unmapped.join("; ")}`);
  if (!loc.location && loc.status !== "sold") adminFlags.push("No location recorded");
  const yearText = text(f[F.year]);
  const year = parseYear(yearText);
  if (yearText && year === null && !/undated/i.test(yearText)) adminFlags.push(`Year not parseable: "${yearText}"`);

  const currency = text(f[F.currency]);
  const purchaseCurrency = currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
  if (currency && !purchaseCurrency) adminFlags.push(`Currency not a code: "${currency}"`);

  const owners = list(f[F.ownership]);
  const ownerNames = owners.length ? owners : [rules.defaultOwner];
  const ownerDefaulted = owners.length === 0;

  // Airtable's "Last Modified" field is configured to watch Current Value only, so it is the date
  // the value was last set — an "as at" for the valuation, and nothing else. Recorded as such.
  const valueModified = text(f[F.lastModified]);
  const currentValue = num(f[F.currentValue]);
  const valuationDate = currentValue !== null && valueModified ? valueModified.slice(0, 10) : null;

  const atts: MappedAttachment[] = [
    ...attachments(f[F.lowResImageFiles]).map((a, i) => ({ group: "image" as const, attachment: a, sort_order: i })),
    ...attachments(f[F.invoiceFiles]).map((a, i) => ({ group: "invoice" as const, attachment: a, sort_order: i })),
    ...attachments(f[F.coaFiles]).map((a, i) => ({ group: "coa" as const, attachment: a, sort_order: i })),
    ...attachments(f[F.addedInfoFiles]).map((a, i) => ({ group: "other" as const, attachment: a, sort_order: i })),
  ];

  const row: Omit<ItemRow, "content_hash"> = {
    airtable_record_id: r.id,
    artist_key: artist?.normalized_key ?? null,
    title: text(f[F.title]),
    year_text: yearText,
    year,
    medium: text(f[F.medium]),
    materials: text(f[F.materials]),
    dimensions_framed: text(f[F.dimensionsFramed]),
    dimensions_unframed: text(f[F.dimensionsUnframed]),
    edition: text(f[F.edition]),
    acquired_on: text(f[F.invoiceDate]),
    purchase_price: num(f[F.purchasePrice]),
    purchase_currency: purchaseCurrency,
    purchase_price_zar: num(f[F.purchasePriceZar]),
    acquired_from: text(f[F.sourced]),
    credit_gallery: text(f[F.gallery]),
    current_value: currentValue,
    current_value_currency: purchaseCurrency,
    valuation_date: valuationDate,
    status: loc.status,
    sold_year: loc.sold_year,
    location: loc.location,
    location_tags: tags,
    condition_note: loc.condition_note,
    admin_notes: adminFlags.length ? adminFlags.join("\n") : null,
    comments_raw: text(f[F.comments]),
    notes_raw: text(f[F.notes]),
    links: text(f[F.links]),
    has_high_res: yesNo(f[F.highResImage]),
    has_low_res: yesNo(f[F.lowResImage]),
    has_invoice: yesNo(f[F.invoiceFlag]),
    has_coa: yesNo(f[F.coaFlag]),
    high_res_note: text(f[F.highResNote]),
    owner_names: ownerNames,
    owner_defaulted: ownerDefaulted,
    provenance_record_ids: linkedIds(f[F.provenance]),
    airtable_modified_at: valueModified,
    attachments: atts,
    raw: rawForStorage(r),
  };

  // The hash covers the mapped row AND the whole raw record (minus rotating URLs), so an edit to a
  // field we do not map yet still refreshes the stored copy — nothing goes stale.
  const content_hash = stableHash({
    ...row,
    attachments: atts.map((a) => ({ group: a.group, sort_order: a.sort_order, ...attachmentIdentity(a.attachment) })),
  });

  return { ...row, content_hash };
}

// ---------------------------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------------------------

export function mapProvenance(r: AirtableRecord): ProvenanceRow | null {
  const f = r.fields;
  const label = text(f[P.label]);
  const itemIds = linkedIds(f[P.items]);
  if (!label || itemIds.length === 0) return null;
  const atts = attachments(f[P.attachments]);
  const row: Omit<ProvenanceRow, "content_hash"> = {
    airtable_record_id: r.id,
    item_record_ids: itemIds,
    label,
    details_url: text(f[P.detailsUrl]),
    reviews: text(f[P.reviews]),
    added_info: text(f[P.addedInfo]),
    attachments: atts,
    raw: rawForStorage(r),
  };
  return { ...row, content_hash: stableHash({ ...row, attachments: atts.map(attachmentIdentity) }) };
}

/** The raw record, minus the rotating attachment URLs, for `airtable_raw`. */
export function rawForStorage(r: AirtableRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r.fields)) {
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && "url" in x && "id" in x)) {
      out[k] = (v as AirtableAttachment[]).map(attachmentIdentity);
    } else {
      out[k] = v;
    }
  }
  return { id: r.id, createdTime: r.createdTime, fields: out };
}

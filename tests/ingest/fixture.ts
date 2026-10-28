/**
 * A synthetic Airtable base in the shape of the real one. No real works, values or locations —
 * location and ownership are sensitive classes and never belong in a repository.
 */
import type { AirtableRecord } from "@/lib/ingest/airtable";
import { COLLECTION_TABLE, F, P, PROVENANCE_TABLE } from "@/lib/ingest/fields";
import type { IngestRules } from "@/lib/ingest/map";

/** A synthetic vocabulary — the real one lives outside the repository. */
export const RULES: IngestRules = {
  defaultOwner: "Principal",
  owners: [
    { name: "Principal", kind: "person" },
    { name: "Partner", kind: "person" },
    { name: "Joint", kind: "joint" },
    { name: "Company", kind: "company" },
  ],
  residences: ["Hilltop House", "The Cottage"],
  storage: ["City Storage"],
  framers: ["Frame & Co"],
  studios: [{ tag: "Painter", name: "Pat Painter" }],
};

export const att = (id: string, filename: string, type = "image/jpeg", size = 1234, extra: Record<string, unknown> = {}) => ({
  id,
  url: `https://cdn.example.test/${id}/${encodeURIComponent(filename)}?sig=${Math.random().toString(36).slice(2)}`,
  filename,
  size,
  type,
  ...extra,
});

export function collectionRecords(): AirtableRecord[] {
  return [
    {
      id: "recAAA00000000001",
      createdTime: "2026-01-20T16:09:01.000Z",
      fields: {
        [F.surname]: "Example",
        [F.givenName]: "Ada",
        [F.nationality]: ["Ruritania"],
        [F.title]: "Study in Grey",
        [F.year]: "2o24",
        [F.medium]: "Painting",
        [F.materials]: "oil on linen",
        [F.dimensionsUnframed]: "100 x 80 cm",
        [F.edition]: "Unique",
        [F.invoiceDate]: "2024-03-01",
        [F.currency]: "USD",
        [F.purchasePrice]: 1000,
        [F.purchasePriceZar]: 18000,
        [F.sourced]: "Gallery One",
        [F.gallery]: "Gallery One, Somewhere",
        [F.currentValue]: 1500,
        [F.location]: ["City Storage"],
        [F.ownership]: ["Partner"],
        [F.comments]: "A note.",
        [F.highResImage]: "No",
        [F.lowResImage]: "Yes",
        [F.invoiceFlag]: "Yes",
        [F.coaFlag]: "N/A",
        [F.lowResImageFiles]: [att("attIMG0000000001", "Example, Ada, Study in Grey.jpg", "image/jpeg", 2048, { width: 600, height: 480 })],
        [F.invoiceFiles]: [att("attINV0000000001", "Ada Example, Study in Grey, 2024.pdf", "application/pdf", 4096)],
        [F.provenance]: ["recPPP00000000001"],
        [F.lastModified]: "2026-05-04T13:35:43.000Z",
      },
    },
    {
      id: "recAAA00000000002",
      createdTime: "2026-01-20T16:09:01.000Z",
      fields: {
        [F.surname]: "Example",
        [F.givenName]: "Ada",
        [F.nationality]: ["Ruritania", "ZAR"],
        [F.title]: "Study in Blue",
        [F.year]: "Circa 1980's",
        [F.medium]: "Work on Paper",
        [F.location]: ["SOLD 2023"],
        [F.highResImage]: "No Image",
        [F.lowResImage]: "No",
        [F.provenance]: ["recPPP00000000002", "recPPP00000000001"], // the work's own order: the sale line first
      },
    },
    {
      id: "recAAA00000000003",
      createdTime: "2026-01-20T16:09:01.000Z",
      fields: {
        [F.surname]: "Beispiel",
        [F.givenName]: "Björn",
        [F.title]: "Untitled",
        [F.year]: "Undated",
        [F.medium]: "Sculpture",
        [F.location]: ["On Loan Museum", "Framed", "Somewhere Odd"],
        [F.currency]: "193,207.00",
        [F.lowResImageFiles]: [
          att("attIMG0000000003", "Beispiel, Bjorn, Untitled 1.jpg", "image/jpeg", 2048, { width: 800, height: 600 }),
          att("attIMG0000000004", "Beispiel, Bjorn, Untitled 2.jpg", "image/jpeg", 2048, { width: 800, height: 600 }),
          // the same file uploaded twice — identical bytes, a different attachment id
          att("attIMG0000000005", "Beispiel, Bjorn, Untitled 1.jpg", "image/jpeg", 2048, { width: 800, height: 600 }),
        ],
      },
    },
  ];
}

export function provenanceRecords(): AirtableRecord[] {
  return [
    {
      id: "recPPP00000000001",
      createdTime: "2026-01-20T16:09:01.000Z",
      fields: {
        [P.label]: "Purchased from Gallery One (March 2024)",
        [P.items]: ["recAAA00000000001", "recAAA00000000002"],
        [P.detailsUrl]: "https://example.test/exhibition",
        [P.attachments]: [att("attPRV0000000001", "catalogue-page.pdf", "application/pdf", 512)],
      },
    },
    {
      id: "recPPP00000000002",
      createdTime: "2026-01-20T16:09:01.000Z",
      fields: {
        [P.label]: "Sold at auction, 2023",
        [P.items]: ["recAAA00000000002"],
      },
    },
    {
      id: "recPPP00000000003",
      createdTime: "2026-01-20T16:09:01.000Z",
      fields: {
        [P.label]: "Orphan line with no linked work",
        [P.items]: [],
      },
    },
  ];
}

export function tables(): Record<string, AirtableRecord[]> {
  return { [COLLECTION_TABLE]: collectionRecords(), [PROVENANCE_TABLE]: provenanceRecords() };
}

/** Serves bytes for any fixture attachment URL. */
export async function fakeFetch(url: string): Promise<Response> {
  const m = url.match(/cdn\.example\.test\/([^/]+)\/([^?]+)/);
  if (!m) return new Response("not found", { status: 404 });
  // bytes follow the filename, so the same file uploaded twice has identical bytes
  const body = Buffer.from(`bytes-of-${decodeURIComponent(m[2])}`);
  return new Response(body, { status: 200, headers: { "content-type": "application/octet-stream" } });
}

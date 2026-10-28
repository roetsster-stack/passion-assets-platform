/**
 * Field IDs of the source register — the Airtable base "Michael Roets Collection".
 *
 * The ingest reads by field ID (`returnFieldsByFieldId=true`), so a rename in Airtable changes
 * nothing here. A new field in Airtable is invisible until it is mapped below; nothing is lost in
 * the meantime because every record also travels whole in `items.airtable_raw`.
 */

export const COLLECTION_TABLE = "tblgdeKCkNfqVbvRK";
export const PROVENANCE_TABLE = "tblWN6qqQvKjdblJe";

export const F = {
  // identity
  surname: "fldonHmQEj93y6zC2",
  givenName: "fldQJoYITIBt2IYUB",
  nationality: "fldzfAtkOUiFmNUyS",
  title: "fldc6wGwMxNkeD96F",
  year: "fldDj03QKqP11i4Ew",
  medium: "fld5HciKFh6hWZD4A",
  materials: "fldDIWkHSPmQK4dbh",
  dimensionsFramed: "fldY2iKvQcn7Vc1x0",
  dimensionsUnframed: "fldFZAh8hBJjgTOo6",
  edition: "fld2jfoZXuI24x1fn",

  // acquisition
  invoiceDate: "fldYCzyrn8UNfmRht",
  currency: "fld1dsg32kWNSTiKB",
  purchasePrice: "fldN7Ohv1a7nEqLNy",
  purchasePriceZar: "fldgVuPr4awwIBJnA",
  sourced: "fldqmwAK4v2FETB69",
  gallery: "fldg6RYb3ZQwYtYYE",

  // valuation
  currentValue: "fld6RY9ZZqKq2ufcK",

  // state
  location: "fldOZ4hkPxpGPulhx",
  ownership: "fldHwhJE67FiaPqN8",

  // narrative and notes
  comments: "fldFwmlIjj13STEjr",
  notes: "fldu2T5l55OQdC3Eq",
  links: "fldR57Hip6fCuB7bV",

  // register flags
  highResImage: "fldoUnnBoZgCvXYmr",
  highResNote: "fldYQOjTCapMJNgsu",
  lowResImage: "fldQwoGxkhSkOeQcK",
  invoiceFlag: "fldwdXkCqg4nlv5UF",
  coaFlag: "fldeCAJw22P4jPvRK",

  // attachments
  lowResImageFiles: "fldKBcdQG1Fre0DgM",
  invoiceFiles: "fldZzeTiDGOc81pbt",
  coaFiles: "fldwhoFfSimf9TE7r",
  addedInfoFiles: "fldFMp8KxEoef1TXm",

  // links
  provenance: "fldHPFoWCVfjHPYQr",

  // bookkeeping
  lastModified: "fldGMyzbiDELKcOXM",
} as const;

export const P = {
  label: "fldCoPwctIr4yA8Hu",
  items: "fldscvrGZiDPj3N4r",
  detailsUrl: "fldHDSZoQydxaFfP3",
  reviews: "fld8kWtZtYDtvXuFq",
  addedInfo: "fldEJekiirCAkyZHh",
  attachments: "fldmd8PkafmtwHiB1",
} as const;

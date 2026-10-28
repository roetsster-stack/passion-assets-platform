/**
 * A thin reader for the Airtable REST API. Read-only; the token it is given should be scoped to
 * the one base with `data.records:read` only.
 */

export type AirtableAttachment = {
  id: string;
  url: string;
  filename: string;
  size?: number;
  type?: string;
  width?: number;
  height?: number;
};

export type AirtableRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

export interface AirtableSource {
  listAll(tableId: string): Promise<AirtableRecord[]>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createAirtableSource(opts: {
  baseId: string;
  token: string;
  fetchImpl?: FetchLike;
  pageSize?: number;
}): AirtableSource {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const pageSize = opts.pageSize ?? 100;

  async function getPage(tableId: string, offset?: string): Promise<{ records: AirtableRecord[]; offset?: string }> {
    const params = new URLSearchParams({ returnFieldsByFieldId: "true", pageSize: String(pageSize) });
    if (offset) params.set("offset", offset);
    const url = `https://api.airtable.com/v0/${opts.baseId}/${tableId}?${params.toString()}`;

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${opts.token}` } });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Airtable ${res.status} reading ${tableId}: ${await res.text()}`);
      }
      return (await res.json()) as { records: AirtableRecord[]; offset?: string };
    }
    throw new Error(`Airtable rate limit persisted reading ${tableId}`);
  }

  return {
    async listAll(tableId) {
      const all: AirtableRecord[] = [];
      let offset: string | undefined;
      do {
        const page = await getPage(tableId, offset);
        all.push(...page.records);
        offset = page.offset;
        // Airtable allows five requests a second per base; be polite between pages.
        if (offset) await new Promise((r) => setTimeout(r, 220));
      } while (offset);
      return all;
    },
  };
}

/** A source built from records already in hand — for tests and dry runs. */
export function createStaticSource(tables: Record<string, AirtableRecord[]>): AirtableSource {
  return {
    async listAll(tableId) {
      return tables[tableId] ?? [];
    },
  };
}

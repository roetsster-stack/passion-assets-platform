/**
 * Object storage for masters and documents. Cloudflare R2 through the S3 API; an in-memory store
 * for tests. Buckets are private: nothing in them is ever addressed by a public URL.
 */
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface ObjectStore {
  exists(bucket: string, key: string): Promise<boolean>;
  /** Writes the object unless it is already there. Masters are write-once. */
  putIfAbsent(bucket: string, key: string, body: Buffer, contentType?: string): Promise<{ written: boolean }>;
}

export type R2Jurisdiction = "eu" | "fedramp";

/**
 * R2's S3 endpoint. A bucket created in a jurisdiction (EU for data residency) is only reachable
 * at that jurisdiction's endpoint; on the default one it answers "bucket does not exist".
 */
export function r2Endpoint(accountId: string, jurisdiction?: R2Jurisdiction): string {
  return jurisdiction
    ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
    : `https://${accountId}.r2.cloudflarestorage.com`;
}

export function createR2Store(env: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction?: R2Jurisdiction;
}): ObjectStore {
  const client = new S3Client({
    region: "auto",
    endpoint: r2Endpoint(env.accountId, env.jurisdiction),
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
  });

  async function exists(bucket: string, key: string) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw err;
    }
  }

  return {
    exists,
    async putIfAbsent(bucket, key, body, contentType) {
      if (await exists(bucket, key)) return { written: false };
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType ?? "application/octet-stream" }),
      );
      return { written: true };
    },
  };
}

export function createMemoryStore(): ObjectStore & { objects: Map<string, { body: Buffer; contentType?: string }> } {
  const objects = new Map<string, { body: Buffer; contentType?: string }>();
  const k = (b: string, key: string) => `${b}/${key}`;
  return {
    objects,
    async exists(bucket, key) {
      return objects.has(k(bucket, key));
    },
    async putIfAbsent(bucket, key, body, contentType) {
      if (objects.has(k(bucket, key))) return { written: false };
      objects.set(k(bucket, key), { body, contentType });
      return { written: true };
    },
  };
}

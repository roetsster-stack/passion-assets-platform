import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parseR2Jurisdiction, r2Endpoint } from "@/lib/ingest/storage";
import { SIGNED_URL_SECONDS } from "./door";

/**
 * Presigned GETs on R2, for the image door and the tile door only. The app holds a read-only key on
 * the renditions bucket; the write key stays on Workshop. Reads env at call time so the build never needs the keys.
 *
 * R2_JURISDICTION: "eu" or "fedramp" when the buckets were created in that jurisdiction — such a
 * bucket answers only at its jurisdiction's endpoint. The endpoint rule and the parser are the
 * ingest's own (`@/lib/ingest/storage`), so the writer and the doors can never disagree.
 */

let client: S3Client | null = null;

function r2(): S3Client {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (the read-only pair).");
  }
  client = new S3Client({
    region: "auto",
    endpoint: r2Endpoint(accountId, parseR2Jurisdiction(process.env.R2_JURISDICTION)),
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

/** A GET address for one object that stops working after `seconds`, and that the browser may keep privately for as long. */
export async function signObject(bucket: string, key: string, contentType: string | null, seconds: number): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseCacheControl: `private, max-age=${seconds}`,
      ResponseContentDisposition: "inline",
      ...(contentType ? { ResponseContentType: contentType } : {}),
    }),
    { expiresIn: seconds },
  );
}

/** A GET address for one picture that stops working after five minutes. */
export function signImage(bucket: string, key: string, contentType: string | null): Promise<string> {
  return signObject(bucket, key, contentType, SIGNED_URL_SECONDS);
}

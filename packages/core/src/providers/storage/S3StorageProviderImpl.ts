// Storage on Amazon S3 (T275, T326), selected with STORAGE_PROVIDER=s3. Uploads are presigned PUTs
// that sign the content type and the exact length, so S3 itself refuses any other file; `stat` is
// HeadObject. Photos are read at the bucket's plain address, which the bucket policy makes public
// for keys under packages/ only (README); everything else stays private. Every call gives up after
// 5 s, and a read stops at the caller's limit (T384).
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { UploadInstruction } from "@clever/contracts/photo";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import type { IClock } from "../clock/IClock.js";
import type { IStorageProvider, StoredObject } from "./IStorageProvider.js";
import { readLimited } from "./read-limited.js";

const UPLOAD_SECONDS = 10 * 60;
const TIMEOUT_MS = 5_000;

export type S3StorageOptions = {
  bucket: string;
  region: string;
  clock: IClock;
  /** Tests pass a client; the api lets the adapter build one from the region. */
  client?: S3Client;
};

const statusOf = (err: unknown) =>
  (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;

export class S3StorageProviderImpl implements IStorageProvider {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = options.client ?? new S3Client({ region: options.region });
  }

  async createUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<UploadInstruction> {
    const now = this.options.clock.now();
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    const url = await this.sign(command, UPLOAD_SECONDS, now, ["content-type", "content-length"]);
    // The browser sets Content-Length itself from the file; S3 checks it against the signature.
    return {
      url,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt: new Date(now.getTime() + UPLOAD_SECONDS * 1000).toISOString(),
    };
  }

  getPublicUrl(key: string): string {
    const { bucket, region } = this.options;
    const path = key.split("/").map(encodeURIComponent).join("/");
    return `https://${bucket}.s3.${region}.amazonaws.com/${path}`;
  }

  async stat(key: string): Promise<StoredObject | null> {
    return this.call("check", async (abortSignal) => {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
        { abortSignal },
      );
      if (!head.ContentType || head.ContentLength === undefined) {
        throw new InfrastructureError("S3 sent an incomplete object description", 502);
      }
      return { contentType: head.ContentType, sizeBytes: head.ContentLength };
    });
  }

  async read(key: string, maxBytes: number): Promise<Buffer | null> {
    const tooLarge = () =>
      new InfrastructureError(`S3 holds more than ${maxBytes} bytes under a key`, 502);
    return this.call("read", async (abortSignal) => {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
        { abortSignal },
      );
      if (!object.Body) throw new InfrastructureError("S3 sent an object without a body", 502);
      const body = object.Body.transformToWebStream();
      if ((object.ContentLength ?? 0) > maxBytes) {
        await body.cancel();
        throw tooLarge();
      }
      const { bytes, more } = await readLimited(body, maxBytes);
      if (more) throw tooLarge();
      return bytes;
    });
  }

  async readHead(key: string, bytes: number): Promise<Buffer | null> {
    return this.call("read", async (abortSignal) => {
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Range: `bytes=0-${bytes - 1}`,
        }),
        { abortSignal },
      );
      if (!object.Body) throw new InfrastructureError("S3 sent an object without a body", 502);
      return (await readLimited(object.Body.transformToWebStream(), bytes)).bytes;
    });
  }

  /**
   * One S3 call, given up after 5 s (contracts/providers.md): the request is aborted and the call
   * fails as an outage, even if S3 is still sending. A 404 is "nothing stored" (null); any other
   * failure is an InfrastructureError, never a raw SDK error.
   */
  private async call<T>(
    what: string,
    run: (abortSignal: AbortSignal) => Promise<T>,
  ): Promise<T | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new InfrastructureError(`S3 did not finish a storage ${what} within 5 s`, 503));
      }, TIMEOUT_MS);
    });
    try {
      return await Promise.race([run(controller.signal), timeout]);
    } catch (err) {
      if (err instanceof InfrastructureError) throw err;
      if (statusOf(err) === 404) return null;
      throw new InfrastructureError(
        `S3 refused a storage ${what} (${statusOf(err) ?? "no answer"})`,
        502,
        err,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async sign(
    command: PutObjectCommand,
    expiresIn: number,
    signingDate: Date,
    headers: string[],
  ): Promise<string> {
    try {
      return await getSignedUrl(this.client, command, {
        expiresIn,
        signingDate,
        signableHeaders: new Set(headers),
      });
    } catch (err) {
      throw new InfrastructureError("S3 links could not be signed", 503, err);
    }
  }
}

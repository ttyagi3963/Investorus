// Storage on Amazon S3 (T275), selected with STORAGE_PROVIDER=s3. Uploads are presigned PUTs that
// sign the content type and the exact length, so S3 itself refuses any other file; reads are
// presigned GETs; `stat` is HeadObject. The bucket stays private: every link expires.
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

const UPLOAD_SECONDS = 10 * 60;
const READ_SECONDS = 60 * 60;

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

  getReadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.options.bucket, Key: key });
    return this.sign(command, READ_SECONDS, this.options.clock.now(), []);
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      if (!head.ContentType || head.ContentLength === undefined) {
        throw new InfrastructureError("S3 sent an incomplete object description", 502);
      }
      return { contentType: head.ContentType, sizeBytes: head.ContentLength };
    } catch (err) {
      if (err instanceof InfrastructureError) throw err;
      if (statusOf(err) === 404) return null;
      throw new InfrastructureError(
        `S3 refused a storage check (${statusOf(err) ?? "no answer"})`,
        502,
        err,
      );
    }
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      if (!object.Body) throw new InfrastructureError("S3 sent an object without a body", 502);
      return Buffer.from(await object.Body.transformToByteArray());
    } catch (err) {
      if (err instanceof InfrastructureError) throw err;
      if (statusOf(err) === 404) return null;
      throw new InfrastructureError(
        `S3 refused a storage read (${statusOf(err) ?? "no answer"})`,
        502,
        err,
      );
    }
  }

  private async sign(
    command: PutObjectCommand | GetObjectCommand,
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

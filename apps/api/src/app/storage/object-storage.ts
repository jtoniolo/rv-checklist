import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/** A stored object on its way out: the byte stream plus the Content-Type it was stored with. */
export interface StoredObject {
  readonly body: Readable;
  readonly contentType: string | undefined;
}

/**
 * Object-storage seam for attachments (ADR-0026) and, later, photo fields
 * (ADR-0007) — the app's one bucket sits behind it. Services depend on this
 * abstract class; specs substitute {@link InMemoryObjectStorage}, so CI never
 * touches Garage. Transfer is API-proxied: bytes stream through here, never
 * via presigned URLs.
 *
 * `deletePrefix` exists because deletion is hard and cascaded: a stop's
 * objects all live under `stops/<stopId>/`, so cascade cleanup is one prefix
 * listing.
 */
export abstract class ObjectStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Rejects when the key does not exist — callers resolve existence from the DB row first. */
  abstract get(key: string): Promise<StoredObject>;
  abstract delete(key: string): Promise<void>;
  abstract deletePrefix(prefix: string): Promise<void>;
}

/**
 * The real thing — `@aws-sdk/client-s3` against the Garage endpoint from env.
 * Garage needs path-style addressing (`forcePathStyle`) and signs against its
 * fixed default region name, `garage`.
 */
@Injectable()
export class S3ObjectStorage extends ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: 'garage',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      // In Node the SDK's Body is always a Readable.
      body: response.Body as Readable,
      contentType: response.ContentType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (listed.Contents ?? []).flatMap((object) =>
        object.Key === undefined ? [] : [{ Key: object.Key }],
      );
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys },
          }),
        );
      }
      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined;
    } while (continuationToken !== undefined);
  }
}

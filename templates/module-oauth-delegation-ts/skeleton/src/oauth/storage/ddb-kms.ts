// ── DDBKmsTokenStorage ───────────────────────────────────────────────
//
// Production backend. One DDB row per (userId, provider). Each row
// stores the full TokenGrant JSON encrypted with a KMS data key.
// `EncryptionContext: { purpose, userId, provider }` binds the
// ciphertext to its user/provider pair — a leaked blob cannot be
// decrypted cross-user because KMS checks the context on Decrypt.
//
// The AWS SDK packages are optional peer dependencies. Install them
// alongside this module if you use this backend.

import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  type AttributeValue,
  type QueryCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { DecryptCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { NodeHttpHandler } from "@smithy/node-http-handler";

import type { TokenGrant, TokenStorage } from "./types.js";

const ENCRYPTION_PURPOSE = "oauth-token";
const TWO_YEARS_SECONDS = 2 * 365 * 24 * 3600;

export interface DDBKmsTokenStorageConfig {
  tableName: string;
  keyId: string;
  region?: string;
  /** Override the DynamoDB client (tests). */
  ddbClient?: DynamoDBClient;
  /** Override the KMS client (tests). */
  kmsClient?: KMSClient;
  /** Override the TTL attribute value (seconds from now). Default: 2 years. */
  ttlSeconds?: number;
}

export class DDBKmsTokenStorage implements TokenStorage {
  private readonly ddb: DynamoDBClient;
  private readonly kms: KMSClient;
  private readonly tableName: string;
  private readonly keyId: string;
  private readonly ttlSeconds: number;

  constructor(config: DDBKmsTokenStorageConfig) {
    this.tableName = config.tableName;
    this.keyId = config.keyId;
    this.ttlSeconds = config.ttlSeconds ?? TWO_YEARS_SECONDS;

    const handler = new NodeHttpHandler({ connectionTimeout: 1000, requestTimeout: 5000 });
    this.ddb =
      config.ddbClient ??
      new DynamoDBClient({ region: config.region, requestHandler: handler });
    this.kms =
      config.kmsClient ??
      new KMSClient({ region: config.region, requestHandler: handler });
  }

  async get(userId: string, provider: string): Promise<TokenGrant | null> {
    const response = await this.ddb.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: {
          userId: { S: userId },
          provider: { S: provider },
        },
      }),
    );
    const ciphertext = response.Item?.ciphertext?.B;
    if (!ciphertext) return null;
    return this.decrypt(Buffer.from(ciphertext), userId, provider);
  }

  async put(userId: string, provider: string, grant: TokenGrant): Promise<void> {
    const ciphertext = await this.encrypt(grant, userId, provider);
    const now = Math.floor(Date.now() / 1000);
    await this.ddb.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: {
          userId: { S: userId },
          provider: { S: provider },
          ciphertext: { B: ciphertext },
          updatedAt: { S: new Date().toISOString() },
          ttl: { N: String(now + this.ttlSeconds) },
        },
      }),
    );
  }

  async delete(userId: string, provider: string): Promise<void> {
    await this.ddb.send(
      new DeleteItemCommand({
        TableName: this.tableName,
        Key: {
          userId: { S: userId },
          provider: { S: provider },
        },
      }),
    );
  }

  async deleteAllForUser(userId: string): Promise<void> {
    let exclusiveStartKey: Record<string, AttributeValue> | undefined = undefined;
    do {
      const response: QueryCommandOutput = await this.ddb.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "userId = :u",
          ExpressionAttributeValues: { ":u": { S: userId } },
          ProjectionExpression: "userId, #p",
          ExpressionAttributeNames: { "#p": "provider" },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const item of response.Items ?? []) {
        const provider = item.provider?.S;
        if (!provider) continue;
        await this.ddb.send(
          new DeleteItemCommand({
            TableName: this.tableName,
            Key: {
              userId: { S: userId },
              provider: { S: provider },
            },
          }),
        );
      }
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);
  }

  private async encrypt(grant: TokenGrant, userId: string, provider: string): Promise<Buffer> {
    const plaintext = Buffer.from(JSON.stringify(grant), "utf-8");
    const response = await this.kms.send(
      new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: plaintext,
        EncryptionContext: { purpose: ENCRYPTION_PURPOSE, userId, provider },
      }),
    );
    if (!response.CiphertextBlob) {
      throw new Error("KMS Encrypt returned no ciphertext");
    }
    return Buffer.from(response.CiphertextBlob);
  }

  private async decrypt(
    ciphertext: Buffer,
    userId: string,
    provider: string,
  ): Promise<TokenGrant> {
    const response = await this.kms.send(
      new DecryptCommand({
        CiphertextBlob: ciphertext,
        EncryptionContext: { purpose: ENCRYPTION_PURPOSE, userId, provider },
      }),
    );
    if (!response.Plaintext) {
      throw new Error("KMS Decrypt returned no plaintext");
    }
    return JSON.parse(Buffer.from(response.Plaintext).toString("utf-8")) as TokenGrant;
  }
}

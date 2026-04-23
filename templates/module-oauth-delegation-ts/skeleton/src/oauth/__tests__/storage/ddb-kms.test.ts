import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { DecryptCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DDBKmsTokenStorage } from "../../storage/ddb-kms.js";

const ddbMock = mockClient(DynamoDBClient);
const kmsMock = mockClient(KMSClient);

const TABLE = "oauth-tokens";
const KEY_ID = "alias/oauth-tokens";

function makeStorage(): DDBKmsTokenStorage {
  return new DDBKmsTokenStorage({
    tableName: TABLE,
    keyId: KEY_ID,
    ddbClient: new DynamoDBClient({}),
    kmsClient: new KMSClient({}),
  });
}

describe("DDBKmsTokenStorage", () => {
  beforeEach(() => {
    ddbMock.reset();
    kmsMock.reset();
  });

  afterEach(() => {
    ddbMock.reset();
    kmsMock.reset();
  });

  it("put encrypts via KMS with EncryptionContext bound to userId+provider", async () => {
    kmsMock
      .on(EncryptCommand)
      .resolves({ CiphertextBlob: new Uint8Array([1, 2, 3, 4]) });
    ddbMock.on(PutItemCommand).resolves({});

    const storage = makeStorage();
    await storage.put("user-abc", "notion", { accessToken: "A", refreshToken: "R" });

    const encryptCalls = kmsMock.commandCalls(EncryptCommand);
    expect(encryptCalls).toHaveLength(1);
    const input = encryptCalls[0].args[0].input;
    expect(input.KeyId).toBe(KEY_ID);
    expect(input.EncryptionContext).toEqual({
      purpose: "oauth-token",
      userId: "user-abc",
      provider: "notion",
    });

    const putCalls = ddbMock.commandCalls(PutItemCommand);
    expect(putCalls).toHaveLength(1);
    const putInput = putCalls[0].args[0].input;
    expect(putInput.TableName).toBe(TABLE);
    expect(putInput.Item?.userId).toEqual({ S: "user-abc" });
    expect(putInput.Item?.provider).toEqual({ S: "notion" });
    expect(putInput.Item?.ciphertext?.B).toBeInstanceOf(Buffer);
  });

  it("get decrypts with the same EncryptionContext", async () => {
    const plaintext = Buffer.from(JSON.stringify({ accessToken: "A", refreshToken: "R" }));
    ddbMock.on(GetItemCommand).resolves({
      Item: {
        userId: { S: "user-abc" },
        provider: { S: "notion" },
        ciphertext: { B: Buffer.from([1, 2, 3, 4]) },
      },
    });
    kmsMock.on(DecryptCommand).resolves({ Plaintext: plaintext });

    const storage = makeStorage();
    const grant = await storage.get("user-abc", "notion");
    expect(grant).toEqual({ accessToken: "A", refreshToken: "R" });

    const decryptCalls = kmsMock.commandCalls(DecryptCommand);
    expect(decryptCalls[0].args[0].input.EncryptionContext).toEqual({
      purpose: "oauth-token",
      userId: "user-abc",
      provider: "notion",
    });
  });

  it("get returns null when the item is missing", async () => {
    ddbMock.on(GetItemCommand).resolves({});
    const storage = makeStorage();
    expect(await storage.get("u", "notion")).toBeNull();
  });

  it("delete issues a DeleteItemCommand with composite key", async () => {
    ddbMock.on(DeleteItemCommand).resolves({});
    const storage = makeStorage();
    await storage.delete("user-abc", "notion");

    const calls = ddbMock.commandCalls(DeleteItemCommand);
    expect(calls).toHaveLength(1);
    const key = calls[0].args[0].input.Key!;
    expect(key.userId).toEqual({ S: "user-abc" });
    expect(key.provider).toEqual({ S: "notion" });
  });

  it("deleteAllForUser queries by userId PK then deletes each provider row", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { userId: { S: "u" }, provider: { S: "notion" } },
        { userId: { S: "u" }, provider: { S: "google" } },
      ],
      LastEvaluatedKey: undefined,
    });
    ddbMock.on(DeleteItemCommand).resolves({});

    const storage = makeStorage();
    await storage.deleteAllForUser("u");

    const deleteCalls = ddbMock.commandCalls(DeleteItemCommand);
    expect(deleteCalls).toHaveLength(2);
    const providers = deleteCalls.map((c) => c.args[0].input.Key!.provider as { S: string });
    expect(providers.map((p) => p.S).sort()).toEqual(["google", "notion"]);
  });

  it("rejects when KMS Encrypt returns no ciphertext", async () => {
    kmsMock.on(EncryptCommand).resolves({});
    const storage = makeStorage();
    await expect(storage.put("u", "notion", { accessToken: "A" })).rejects.toThrow(/no ciphertext/);
  });

  it("rejects when KMS Decrypt returns no plaintext", async () => {
    ddbMock.on(GetItemCommand).resolves({
      Item: {
        userId: { S: "u" },
        provider: { S: "notion" },
        ciphertext: { B: Buffer.from([1, 2]) },
      },
    });
    kmsMock.on(DecryptCommand).resolves({});
    const storage = makeStorage();
    await expect(storage.get("u", "notion")).rejects.toThrow(/no plaintext/);
  });
});

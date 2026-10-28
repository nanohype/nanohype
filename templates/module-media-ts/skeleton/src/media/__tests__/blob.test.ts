import { afterEach, describe, expect, it, vi } from "vitest";
import { toBlob } from "../providers/blob.js";

// ── Upload payload tests ──────────────────────────────────────────
//
// The part a provider uploads carries exactly the bytes the caller's view
// covers. A Buffer is often a window onto a larger pool whose other bytes
// belong to someone else, so a part built from the view's backing buffer
// uploads the wrong file. The part is also one a Blob accepts, which rules
// out a view over shared memory.

type BlobArgs = ConstructorParameters<typeof Blob>;

/**
 * A Blob that refuses a view over shared memory, as WebIDL's BufferSource
 * does. Node's own Blob takes one, which leaves the copy unobservable unless
 * the suite holds the stricter contract.
 */
class BufferSourceBlob extends Blob {
  constructor(...[parts, options]: BlobArgs) {
    for (const part of parts ?? []) {
      if (ArrayBuffer.isView(part) && !(part.buffer instanceof ArrayBuffer)) {
        throw new TypeError("a Blob part may not view a SharedArrayBuffer");
      }
    }
    super(parts, options);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toBlob", () => {
  it("carries only the bytes a Buffer views, not the pool behind it", async () => {
    const pool = Buffer.alloc(32, 0xff);
    pool.write("bytes", 8);

    const blob = toBlob(pool.subarray(8, 13));

    expect(blob.size).toBe(5);
    expect(Buffer.from(await blob.arrayBuffer()).toString()).toBe("bytes");
  });

  it("hands a view over an ArrayBuffer to the Blob without copying it first", () => {
    const received: BlobArgs[0][] = [];
    vi.stubGlobal(
      "Blob",
      class extends Blob {
        constructor(...[parts, options]: BlobArgs) {
          received.push(parts);
          super(parts, options);
        }
      },
    );
    const data = new Uint8Array([1, 2, 3]);

    toBlob(data);

    expect(received).toHaveLength(1);
    expect(received[0]?.[0]).toBe(data);
  });

  it("copies a view over shared memory into a part a Blob accepts", async () => {
    vi.stubGlobal("Blob", BufferSourceBlob);
    const shared = new Uint8Array(new SharedArrayBuffer(4));
    shared.set([1, 2, 3, 4]);

    const blob = toBlob(shared.subarray(1, 3));

    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([2, 3]);
  });
});

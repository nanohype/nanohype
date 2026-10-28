// ── Upload payloads ──────────────────────────────────────────────
//
// A multipart upload carries its bytes as a Blob part, and a Blob part is a
// view over an ArrayBuffer: WebIDL's BufferSource, and the type @types/node
// gives the constructor, both exclude a view over shared memory. The providers
// accept any Uint8Array, a Buffer included, and a Uint8Array may sit over a
// SharedArrayBuffer. That view is copied into an ArrayBuffer of its own. Every
// other view goes to the Blob as it is, because the Blob copies the bytes it
// is given, and copying the whole payload first buys nothing.

/** A Blob holding exactly the bytes `data` views, for a multipart upload. */
export function toBlob(data: Uint8Array): Blob {
  return new Blob([isOverArrayBuffer(data) ? data : new Uint8Array(data)]);
}

function isOverArrayBuffer(view: Uint8Array): view is Uint8Array<ArrayBuffer> {
  return view.buffer instanceof ArrayBuffer;
}

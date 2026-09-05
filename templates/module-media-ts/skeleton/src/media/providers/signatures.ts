import { createHash, createHmac } from "node:crypto";

// ── Provider request signing ────────────────────────────────────────
//
// The three signing constructions the vendor adapters use, kept apart from the
// adapters themselves.
//
// A wrong signature is the failure a type checker, a linter and a test of the
// surrounding code all pass over: the URL is well formed, the header is
// present, and the vendor answers 401 or 403 with no clue which component was
// wrong. Each construction is fixed by the vendor, so each is pinned against
// the vendor's published specification.
//
// Which digest each uses is the vendor's decision and not this module's. The
// account recomputes the signature to validate it, so an algorithm chosen here
// for its strength produces a value the vendor rejects. imgix specifies MD5 and
// Uploadcare HMAC-SHA1, and neither publishes an alternative. Cloudinary is the
// one that does — it validates SHA-1 and SHA-256 interchangeably — so that is
// the one construction here where a choice existed, and it takes SHA-256.
//
// A static analyser reading this file sees three weak-algorithm sites. Two are
// a contract; the third would be a finding, and is not present.
//
// They live here because the adapters around them talk to an account over the
// network and cannot run in a unit suite, while these are pure functions over
// their arguments. Splitting them is what lets the part that authenticates
// requests be measured whole while the part that needs credentials is not.

/** MD5 of an empty body, which the Uploadcare signature includes verbatim. */
export const EMPTY_BODY_MD5 = createHash("md5").update("").digest("hex");

/**
 * imgix secure-URL signature: a plain MD5 of the token concatenated with the
 * path and, when present, the query string including its leading `?`.
 *
 * Not an HMAC. imgix keys nothing — the token is a prefix of the hashed
 * string, so `md5(token + path + query)` and `hmac_md5(token, path + query)`
 * are different digests and imgix rejects the second. The token still has to
 * stay secret, because it is unguessable rather than because of any MAC
 * construction.
 *
 * `pathWithQuery` must carry its leading slash and keep any percent-encoding
 * intact, and `s` must be the last query parameter in the emitted URL.
 *
 * MD5 is not a choice: imgix validates this exact construction and no other,
 * so a stronger hash produces a signature the CDN rejects. Forging a URL
 * requires the token, not a collision.
 *
 * https://github.com/imgix/imgix-blueprint#securing-urls
 */
export function signImgixPath(pathWithQuery: string, token: string): string {
  return createHash("md5")
    .update(token + pathWithQuery)
    .digest("hex");
}

/**
 * Cloudinary signature: `hash(sorted_params + api_secret)`. The secret is
 * appended rather than keyed, so HMAC is not an option — the wire format is
 * theirs.
 *
 * The digest is a choice: Cloudinary validates SHA-1 and SHA-256
 * interchangeably, so this signs with SHA-256 and leaves SHA-1's collision
 * weakness out of a scaffold people copy.
 */
export function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha256")
    .update(sorted + apiSecret)
    .digest("hex");
}

/**
 * Uploadcare REST signature: HMAC-SHA1 over method, body MD5, content type,
 * date and URI, joined by newlines, in that order.
 *
 * SHA-1 is the vendor's, and here it is keyed: HMAC-SHA1 has no practical
 * break and remains acceptable for authentication. Contrast the Cloudinary
 * construction above, which signs a bare digest and therefore uses SHA-256.
 *
 * The algorithm is not this module's to choose. Uploadcare's REST
 * authentication scheme specifies HMAC-SHA1 and names no alternative, and the
 * account recomputes the digest to validate it — a stronger hash produces a
 * signature Uploadcare rejects, so the request fails rather than being signed
 * better.
 *
 * https://uploadcare.com/docs/api/rest/authentication/
 */
export function signUploadcareRequest(
  method: string,
  uri: string,
  secretKey: string,
  date: string,
  contentType: string,
  bodyMd5: string = EMPTY_BODY_MD5,
): string {
  const signString = [method, bodyMd5, contentType, date, uri].join("\n");
  // Fixed by Uploadcare's REST authentication contract, which specifies
  // HMAC-SHA1 and accepts nothing else. Keyed, so the collision weakness that
  // makes bare SHA-1 unfit for signing does not apply.
  //
  // A scanner reads this as a weak algorithm and is right that SHA-1 is one.
  // The alert is dismissed against this repository with that reason recorded
  // rather than suppressed from here: code scanning does not honour an inline
  // directive in this setup, and a directive that suppresses nothing is a
  // comment wearing the look of a control.
  return createHmac("sha1", secretKey).update(signString).digest("hex");
}

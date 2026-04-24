/* eslint-disable @typescript-eslint/no-explicit-any */

// Tests check arbitrary JSON response shapes that don't merit full
// typing per call site. `json(res)` centralizes the assertion so the
// rest of the file stays focused on what's being verified.
export async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * Types shared across the renderer.
 *
 * `Message` is declared once here rather than per component — three copies of
 * the same shape drift the moment one of them gains a field.
 */

/** A single chat message in the conversation. */
export interface Message {
  /** Stable identity for list rendering. A timestamp is not enough — a reply
   *  can land in the same millisecond as the message that prompted it. */
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ── TransformBuilder ─────────────────────────────────────────────
//
// Fluent immutable API for composing TransformOptions. Each method
// returns a new TransformBuilder instance -- no mutation. Call
// .build() to produce the final TransformOptions object.
//
//   const opts = new TransformBuilder()
//     .width(200)
//     .height(200)
//     .fit("cover")
//     .format("webp")
//     .quality(80)
//     .build();
//

import type { TransformOptions, FitMode, MediaFormat } from "../types.js";

export class TransformBuilder {
  private readonly opts: TransformOptions;

  constructor(initial?: TransformOptions) {
    this.opts = { ...initial };
  }

  /** Set the target width in pixels. Returns a new builder. */
  width(value: number): TransformBuilder {
    return new TransformBuilder({ ...this.opts, width: value });
  }

  /** Set the target height in pixels. Returns a new builder. */
  height(value: number): TransformBuilder {
    return new TransformBuilder({ ...this.opts, height: value });
  }

  /** Set the fit mode. Returns a new builder. */
  fit(value: FitMode): TransformBuilder {
    return new TransformBuilder({ ...this.opts, fit: value });
  }

  /** Set the output format. Returns a new builder. */
  format(value: MediaFormat): TransformBuilder {
    return new TransformBuilder({ ...this.opts, format: value });
  }

  /** Set the quality level (1-100). Returns a new builder. */
  quality(value: number): TransformBuilder {
    if (value < 1 || value > 100) {
      throw new RangeError("Quality must be between 1 and 100");
    }
    return new TransformBuilder({ ...this.opts, quality: value });
  }

  /** Produce the final TransformOptions object. */
  build(): TransformOptions {
    return { ...this.opts };
  }
}

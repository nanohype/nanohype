/**
 * Tests for dataset splitting.
 *
 * Verifies that the split function correctly distributes examples
 * across train, validation, and test sets according to the configured
 * ratios, preserves all examples, and rejects invalid ratios.
 */

import { describe, it, expect } from "vitest";
import { splitDataset } from "../dataset/split.js";
import type { TrainingExample } from "../dataset/types.js";

function makeExamples(count: number): TrainingExample[] {
  return Array.from({ length: count }, (_, i) => ({
    messages: [
      { role: "user" as const, content: `Question ${i}` },
      { role: "assistant" as const, content: `Answer ${i}` },
    ],
  }));
}

describe("splitDataset", () => {
  it("splits into correct proportions", () => {
    const examples = makeExamples(100);
    const split = splitDataset(examples, {
      trainRatio: 0.8,
      valRatio: 0.1,
      testRatio: 0.1,
    });

    expect(split.train.length).toBe(80);
    expect(split.validation.length).toBe(10);
    expect(split.test.length).toBe(10);
  });

  it("preserves total count across splits", () => {
    const examples = makeExamples(50);
    const split = splitDataset(examples, {
      trainRatio: 0.6,
      valRatio: 0.2,
      testRatio: 0.2,
    });

    const total = split.train.length + split.validation.length + split.test.length;
    expect(total).toBe(50);
  });

  it("handles all-train split", () => {
    const examples = makeExamples(20);
    const split = splitDataset(examples, {
      trainRatio: 1.0,
      valRatio: 0.0,
      testRatio: 0.0,
    });

    expect(split.train.length).toBe(20);
    expect(split.validation.length).toBe(0);
    expect(split.test.length).toBe(0);
  });

  it("handles small datasets", () => {
    const examples = makeExamples(3);
    const split = splitDataset(examples, {
      trainRatio: 0.8,
      valRatio: 0.1,
      testRatio: 0.1,
    });

    const total = split.train.length + split.validation.length + split.test.length;
    expect(total).toBe(3);
  });

  it("handles empty dataset", () => {
    const split = splitDataset([], {
      trainRatio: 0.8,
      valRatio: 0.1,
      testRatio: 0.1,
    });

    expect(split.train.length).toBe(0);
    expect(split.validation.length).toBe(0);
    expect(split.test.length).toBe(0);
  });

  it("throws when ratios do not sum to 1.0", () => {
    const examples = makeExamples(10);
    expect(() =>
      splitDataset(examples, {
        trainRatio: 0.5,
        valRatio: 0.1,
        testRatio: 0.1,
      }),
    ).toThrow("Split ratios must sum to 1.0");
  });

  it("throws on negative ratios", () => {
    const examples = makeExamples(10);
    expect(() =>
      splitDataset(examples, {
        trainRatio: 1.2,
        valRatio: -0.1,
        testRatio: -0.1,
      }),
    ).toThrow("Split ratios must be non-negative");
  });

  it("does not return the same array reference as input", () => {
    const examples = makeExamples(10);
    const split = splitDataset(examples, {
      trainRatio: 0.8,
      valRatio: 0.1,
      testRatio: 0.1,
    });

    expect(split.train).not.toBe(examples);
  });
});

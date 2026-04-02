/**
 * Dataset splitting.
 *
 * Splits a validated dataset into train, validation, and test sets
 * using configurable ratios. Shuffles examples before splitting to
 * avoid ordering bias. Uses Fisher-Yates shuffle for uniform
 * distribution.
 */

import type { TrainingExample, DatasetSplit } from "./types.js";

/**
 * Fisher-Yates shuffle — mutates the array in place.
 * Returns the same array reference for convenience.
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Split options for configuring train/val/test ratios.
 */
export interface SplitOptions {
  trainRatio: number;
  valRatio: number;
  testRatio: number;
}

/**
 * Split a dataset into train, validation, and test sets.
 *
 * Shuffles the input before splitting. Ratios must sum to approximately
 * 1.0 (within floating-point tolerance). Any remainder from rounding
 * goes to the training set to maximize training data.
 *
 * @throws if ratios do not sum to approximately 1.0
 * @throws if any ratio is negative
 */
export function splitDataset(
  examples: TrainingExample[],
  options: SplitOptions,
): DatasetSplit {
  const { trainRatio, valRatio, testRatio } = options;

  if (trainRatio < 0 || valRatio < 0 || testRatio < 0) {
    throw new Error("Split ratios must be non-negative");
  }

  const total = trainRatio + valRatio + testRatio;
  if (Math.abs(total - 1.0) > 0.01) {
    throw new Error(
      `Split ratios must sum to 1.0, got ${total.toFixed(3)} ` +
      `(train=${trainRatio}, val=${valRatio}, test=${testRatio})`,
    );
  }

  const shuffled = shuffle([...examples]);
  const n = shuffled.length;

  const valCount = Math.round(n * valRatio);
  const testCount = Math.round(n * testRatio);
  const trainCount = n - valCount - testCount;

  return {
    train: shuffled.slice(0, trainCount),
    validation: shuffled.slice(trainCount, trainCount + valCount),
    test: shuffled.slice(trainCount + valCount),
  };
}

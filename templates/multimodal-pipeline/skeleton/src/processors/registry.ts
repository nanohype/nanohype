/**
 * Processor registry for multimodal input handlers.
 *
 * Each processor module registers itself as a side effect of being
 * imported. The registry maps MIME types to processors and provides
 * lookup by modality or MIME type at runtime.
 */

import type { Processor, Modality } from "./types.js";

const processors = new Map<string, Processor>();
const modalityMap = new Map<Modality, Processor>();

export function registerProcessor(processor: Processor): void {
  modalityMap.set(processor.modality, processor);
  for (const mimeType of processor.supportedMimeTypes) {
    processors.set(mimeType, processor);
  }
}

export function getProcessorByMimeType(mimeType: string): Processor {
  const processor = processors.get(mimeType);
  if (!processor) {
    const available = [...processors.keys()].join(", ") || "(none)";
    throw new Error(
      `No processor registered for MIME type "${mimeType}". Supported types: ${available}`,
    );
  }
  return processor;
}

export function getProcessorByModality(modality: Modality): Processor {
  const processor = modalityMap.get(modality);
  if (!processor) {
    const available = [...modalityMap.keys()].join(", ") || "(none)";
    throw new Error(
      `No processor registered for modality "${modality}". Registered modalities: ${available}`,
    );
  }
  return processor;
}

export function listProcessors(): Processor[] {
  return [...modalityMap.values()];
}

export function listSupportedMimeTypes(): string[] {
  return [...processors.keys()];
}

import type { A2ATransport } from "./types.js";

/**
 * Transport registry. Each transport module registers itself as a
 * side effect of being imported, making the registry the single
 * place to look up an A2ATransport by name at runtime.
 */

const transports = new Map<string, () => A2ATransport>();

/**
 * Register a transport factory under the given name.
 * Called at module load time by each transport module.
 */
export function registerTransport(
  name: string,
  factory: () => A2ATransport,
): void {
  transports.set(name, factory);
}

/**
 * Retrieve a transport by name, creating it via its factory.
 * Throws if the name has not been registered.
 */
export function getTransport(name: string): A2ATransport {
  const factory = transports.get(name);
  if (!factory) {
    const available = [...transports.keys()].join(", ") || "(none)";
    throw new Error(
      `Unknown A2A transport "${name}". Registered transports: ${available}`,
    );
  }
  return factory();
}

/**
 * List the names of all registered transports.
 */
export function listTransports(): string[] {
  return [...transports.keys()];
}

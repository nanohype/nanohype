const writeLocks = new Map<string, Promise<void>>();

export async function acquireWriteLock(tenantId: string): Promise<() => void> {
  const existing = writeLocks.get(tenantId) ?? Promise.resolve();

  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  writeLocks.set(tenantId, next);

  await existing;

  return () => {
    release();
    if (writeLocks.get(tenantId) === next) {
      writeLocks.delete(tenantId);
    }
  };
}

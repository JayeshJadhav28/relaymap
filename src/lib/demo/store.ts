import type { Store } from "./types";
import { createSeedStore } from "./seed";

type GlobalWithStore = typeof globalThis & { __relaymapStore?: Store };

/**
 * The synthetic demo store is process-local and reset on restart. It is
 * explicitly not a production database and makes no isolation claim.
 */
export function getStore(): Store {
  const globalStore = globalThis as GlobalWithStore;
  if (!globalStore.__relaymapStore) {
    globalStore.__relaymapStore = createSeedStore();
  }
  return globalStore.__relaymapStore;
}

export function resetStore(): Store {
  const globalStore = globalThis as GlobalWithStore;
  globalStore.__relaymapStore = createSeedStore();
  return globalStore.__relaymapStore;
}

export function mutateStore<T>(mutation: (store: Store) => T): T {
  return mutation(getStore());
}

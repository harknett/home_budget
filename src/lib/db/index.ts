import "server-only";

import { Store } from "./store";
import { dbFile, ensureDataDir } from "./paths";

export { dataDir, dbFile } from "./paths";

// Next re-evaluates modules on hot reload; keep one connection per process.
const globalForStore = globalThis as unknown as {
  __store?: Store;
  __storeClass?: unknown;
  __shutdownHooked?: boolean;
};

/**
 * Close the database when the service is asked to stop.
 *
 * SIGTERM is what `systemctl stop` sends. SQLite in WAL mode survives an
 * abrupt exit, so this is about checkpointing the WAL back into the file, so a
 * backup taken while the service is down is one complete file.
 */
function hookShutdown(): void {
  if (globalForStore.__shutdownHooked) return;
  globalForStore.__shutdownHooked = true;

  const close = (signal: NodeJS.Signals) => () => {
    try {
      globalForStore.__store?.close();
    } catch {
      // Already closed, or never opened. Nothing useful to do while exiting.
    }
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  };

  process.once("SIGTERM", close("SIGTERM"));
  process.once("SIGINT", close("SIGINT"));
}

export function getStore(): Store {
  // The cached instance is only good while it came from the class held now. A
  // hot reload produces a new class object, and an instance built from the old
  // one keeps the old prototype - a method added in the edit just saved would
  // read as "not a function" until a restart.
  if (globalForStore.__store && globalForStore.__storeClass === Store) {
    return globalForStore.__store;
  }
  globalForStore.__store?.close();
  ensureDataDir();
  globalForStore.__store = new Store(dbFile());
  globalForStore.__storeClass = Store;
  hookShutdown();
  return globalForStore.__store;
}

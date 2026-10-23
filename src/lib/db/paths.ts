import fs from "node:fs";
import path from "node:path";

/**
 * Where the budget lives.
 *
 * Free of the server-only guard so a maintenance script can resolve the same
 * path. It reads environment variables and touches nothing else.
 */
export function dataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  return configured && configured !== ""
    ? path.resolve(configured)
    : path.join(process.cwd(), "data");
}

export function dbFile(): string {
  return path.join(dataDir(), "budget.db");
}

export function ensureDataDir(): string {
  fs.mkdirSync(dataDir(), { recursive: true });
  return dbFile();
}

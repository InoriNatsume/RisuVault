import { join } from "node:path";

export const VAULT_DIR = ".risuvault";

export function vaultDir(root: string) { return join(root, VAULT_DIR); }
export function configPath(root: string) { return join(vaultDir(root), "config.json"); }
export function dbPath(root: string) { return join(vaultDir(root), "vault.db"); }
export function cacheDir(root: string) { return join(vaultDir(root), "cache"); }
export function projectsDir(root: string) { return join(root, "projects"); }
export function projectDir(root: string, uuid: string) { return join(projectsDir(root), uuid); }
export function projectCacheDir(root: string, uuid: string) { return join(cacheDir(root), uuid); }
export function inboxDir(root: string) { return join(root, "inbox"); }
export function outboxDir(root: string) { return join(root, "outbox"); }

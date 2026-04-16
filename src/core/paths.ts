import { join } from "node:path";

export const VAULT_DIR = ".risuvault";

export function vaultDir(root: string) { return join(root, VAULT_DIR); }
export function configPath(root: string) { return join(vaultDir(root), "config.json"); }
export function dbPath(root: string) { return join(vaultDir(root), "vault.db"); }
export function projectGitRoot(root: string) { return join(root, "project_git"); }
export function projectGitDir(root: string, uuid: string) { return join(projectGitRoot(root), uuid); }
export function projectWorkRoot(root: string) { return join(root, "project_work"); }
export function projectWorkDir(root: string, name: string) { return join(projectWorkRoot(root), name); }
export function inboxDir(root: string) { return join(root, "inbox"); }
export function outboxDir(root: string) { return join(root, "outbox"); }
export function globalRefsDir(root: string) { return join(root, "global_refs"); }
export function refGitDir(root: string) { return join(globalRefsDir(root), "ref_git"); }
export function refWorkDir(root: string) { return join(globalRefsDir(root), "ref_work"); }

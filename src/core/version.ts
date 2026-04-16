export type BumpKind = "minor" | "major" | { explicit: string };

export function bumpVersion(current: string, kind: BumpKind): string {
  if (typeof kind === "object" && "explicit" in kind) return kind.explicit;
  const m = current.match(/^(\d+)\.(\d+)$/);
  if (!m) throw new Error(`cannot bump version "${current}": expected N.N format`);
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  if (kind === "minor") return `${major}.${minor + 1}`;
  return `${major + 1}.0`;
}

export function formatVersion(v: string, opts: { prefix?: boolean } = {}): string {
  return opts.prefix ? `v${v}` : v;
}

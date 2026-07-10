// Public assets need Vite's base prefix at runtime. Keeping this in one helper
// lets the same build work from the dev server, a subpath deployment, and a
// file-based desktop wallpaper package.
export function assetUrl(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(path)) return path;
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  // Agent configuration may persist a URL that was already resolved. Consumers
  // can safely call this helper again without producing `/base/base/assets/...`.
  if (path.startsWith(normalizedBase)) return path;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
}

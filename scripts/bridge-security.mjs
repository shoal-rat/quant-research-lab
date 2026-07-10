// Browser-facing protection for the localhost bridge. CORS is not an access
// control mechanism by itself: a cross-site POST can still execute even when its
// response is unreadable. Call this predicate before handling every request.

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function configuredBridgeOrigins(value = "") {
  return new Set(
    String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        try {
          return new URL(item).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
}

export function isTrustedBridgeOrigin(origin, configured = new Set()) {
  // Non-browser clients (the bundled CLI scripts and curl) do not send Origin.
  if (origin === undefined || origin === null || origin === "") return true;
  try {
    const url = new URL(String(origin));
    if ((url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_HOSTS.has(url.hostname)) return true;
    return configured.has(url.origin);
  } catch {
    return false;
  }
}

export function isCrossSiteBrowserRequest(secFetchSite) {
  return String(secFetchSite ?? "").toLowerCase() === "cross-site";
}

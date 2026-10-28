export function resolveApiBaseUrl(
  isProduction,
  configuredUrl,
  origin = "https://app.example",
) {
  const configuredApiBaseUrl = String(configuredUrl || "")
    .trim()
    .replace(/\/+$/, "");

  const apiBaseUrl =
    configuredApiBaseUrl ||
    (isProduction ? "/api" : "http://127.0.0.1:8000");

  if (isProduction && configuredApiBaseUrl) {
    const isAbsoluteHttpUrl = /^https?:\/\//i.test(configuredApiBaseUrl);
    const isRootRelativeUrl =
      configuredApiBaseUrl.startsWith("/") &&
      !configuredApiBaseUrl.startsWith("//");

    if (!isAbsoluteHttpUrl && !isRootRelativeUrl) {
      throw new Error(
        "VITE_API_BASE_URL must be an absolute URL or root-relative path.",
      );
    }

    const parsedUrl = new URL(apiBaseUrl, origin);
    const host = parsedUrl.hostname.toLowerCase();
    const localHosts = new Set([
      "localhost",
      "127.0.0.1",
      "::1",
      "[::1]",
      "0.0.0.0",
    ]);
    const privateIpv4 =
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host);

    if (
      localHosts.has(host) ||
      privateIpv4 ||
      host.endsWith(".local") ||
      (isAbsoluteHttpUrl && parsedUrl.protocol !== "https:")
    ) {
      throw new Error(
        "VITE_API_BASE_URL must use a public API URL in production.",
      );
    }
  }

  return apiBaseUrl;
}

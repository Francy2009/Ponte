export function serverSettings(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  function integer(name: string, fallback: number, min: number, max: number) {
    const value =
      env[name] === undefined || env[name] === ""
        ? fallback
        : Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    return value;
  }
  const host = env.HOST || (production ? "0.0.0.0" : "127.0.0.1");
  if (!["127.0.0.1", "0.0.0.0", "::1", "::"].includes(host))
    throw new Error("HOST must be a loopback or all-interfaces IP address.");
  let origin: string | undefined;
  if (env.APP_ORIGIN) {
    try {
      const url = new URL(env.APP_ORIGIN);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
        url.hostname,
      );
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        (production && url.protocol !== "https:" && !loopback)
      )
        throw Error();
      origin = url.origin;
    } catch {
      throw new Error(
        "APP_ORIGIN must be the site's HTTPS origin, with no path or credentials (HTTP is allowed for localhost checks).",
      );
    }
  }
  if (production && !origin)
    throw new Error(
      "Set APP_ORIGIN to the public HTTPS origin before starting in production.",
    );
  return {
    production,
    host,
    origin,
    port: integer("PORT", 3001, 1, 65535),
    trustProxy: integer("TRUST_PROXY", 0, 0, 5),
    apiLimit: integer("API_RATE_LIMIT", 180, 1, 10000),
    aiLimit: integer("AI_RATE_LIMIT", 20, 1, 1000),
    aiDailyLimit: integer("AI_DAILY_REQUEST_LIMIT", 100, 1, 10000),
    pdfTimeoutMs: integer("PDF_TIMEOUT_MS", 30000, 100, 60000),
  };
}
export type ServerSettings = ReturnType<typeof serverSettings>;

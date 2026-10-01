// Site settings shape and /admin form validation. Pure (no database), so tests can cover it.
import { isProPalette, type SiteThemeDefaults } from "../theme/palettes";

export interface SiteSettings extends SiteThemeDefaults {
  sentry: { dsn: string | null; server: boolean; browser: boolean };
  umami: { enabled: boolean; scriptUrl: string | null; websiteId: string | null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// These values end up in <script src>, the browser SDK and the server's outgoing requests: https only, except
// plain http on this machine (a local Umami under `aspire run`).
function httpUrl(value: string): URL | null {
  if (value.length > 500) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && local) ? url : null;
  } catch {
    return null;
  }
}

const isPrivateIPv4 = ([a, b]: number[]) =>
  a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);

// The server sends events to the DSN, so it must not point into the local network (SSRF).
// ponytail: literal addresses only; a DNS name that resolves privately passes. Fine for an admin-only field;
// resolve and re-check at send time if non-admins ever set it.
// `hostname` is the URL-normalized form: numeric (2130706433) and IPv4-mapped IPv6 hosts arrive canonical.
function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost") return true;
  if (hostname.startsWith("[")) {
    const ip = hostname.slice(1, -1).toLowerCase();
    if (ip === "::1" || ip === "::" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)) return true; // fc00::/7, fe80::/10
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
    if (!mapped) return false;
    const high = parseInt(mapped[1], 16);
    return isPrivateIPv4([high >> 8, high & 255]);
  }
  const parts = hostname.split(".").map(Number);
  return parts.length === 4 && parts.every(Number.isInteger) && isPrivateIPv4(parts);
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function parseSettingsForm(form: FormData): { settings: SiteSettings } | { error: string } {
  const theme = form.get("theme");
  const proPalette = form.get("proPalette");
  if ((theme !== "brand" && theme !== "pro") || !isProPalette(proPalette)) return { error: "Pick a theme and a Pro palette." };

  const dsn = text(form, "sentryDsn");
  // A Sentry DSN is https://<public key>@<host>/<project id>.
  const dsnUrl = dsn ? httpUrl(dsn) : null;
  if (dsn && (!dsnUrl || !dsnUrl.username || !/^\/\d+$/.test(dsnUrl.pathname))) {
    return { error: "The Sentry DSN should look like https://<key>@<host>/<project id>." };
  }
  if (dsnUrl && isPrivateHost(dsnUrl.hostname)) return { error: "The Sentry DSN must point at a public host." };
  const sentryServer = form.has("sentryServer");
  const sentryBrowser = form.has("sentryBrowser");
  if ((sentryServer || sentryBrowser) && !dsn) return { error: "Enter a Sentry DSN to turn on error reporting." };

  const scriptUrl = text(form, "umamiScriptUrl");
  const websiteId = text(form, "umamiWebsiteId");
  if (scriptUrl && !httpUrl(scriptUrl)) return { error: "The Umami script URL must be an https URL (http only for localhost)." };
  if (websiteId && !UUID.test(websiteId)) return { error: "The Umami website id is a UUID from Umami's website settings." };
  const umamiEnabled = form.has("umamiEnabled");
  if (umamiEnabled && (!scriptUrl || !websiteId)) return { error: "Enter the Umami script URL and website id to turn on analytics." };

  return {
    settings: {
      theme,
      proPalette,
      sentry: { dsn: dsn || null, server: sentryServer, browser: sentryBrowser },
      umami: { enabled: umamiEnabled, scriptUrl: scriptUrl || null, websiteId: websiteId || null },
    },
  };
}

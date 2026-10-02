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

// 0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16 and 100.64/10 (shared address space, e.g. Tailscale).
const isPrivateIPv4 = ([a, b]: number[]) =>
  a === 0 ||
  a === 10 ||
  a === 127 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168);

// The eight 16-bit groups of an IPv6 address in any text form (`::` compression, dotted IPv4 tail), or null.
function ipv6Groups(ip: string): number[] | null {
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    ip = `${ip.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const zeros = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array<string>(Math.max(zeros, 0)).fill("0"), ...tail];
  return groups.length === 8 && groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g)) ? groups.map((g) => parseInt(g, 16)) : null;
}

// A bare IP address (no brackets) in a private, loopback, link-local or shared range, including IPv6 forms that
// carry an IPv4 address (mapped, NAT64, 6to4) or tunnel to one (Teredo). Also used at connect time by server
// Sentry's DNS lookup (sentry.ts), so a DSN name that resolves into the local network is refused there.
export function isPrivateAddress(ip: string): boolean {
  if (!ip.includes(":")) {
    const parts = ip.split(".").map(Number);
    return parts.length === 4 && parts.every(Number.isInteger) && isPrivateIPv4(parts);
  }
  // A zone id (`fe80::1%eth0`, from a hosts-file entry) doesn't change the address; anything unparseable fails closed.
  const g = ipv6Groups(ip.replace(/%.*$/, ""));
  if (!g) return true;
  const v4 = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 6)) return true; // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
  if (zeros(0, 5) && g[5] === 0xffff) return isPrivateIPv4(v4(g[6], g[7])); // IPv4-mapped ::ffff:a.b.c.d
  // NAT64: 64:ff9b::/96 embeds the IPv4 address (public ones are how IPv6-only hosts reach Sentry); 64:ff9b:1::/48
  // is local-use by definition.
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 1 || isPrivateIPv4(v4(g[6], g[7]));
  if (g[0] === 0x2002) return isPrivateIPv4(v4(g[1], g[2])); // 6to4 (deprecated): 2002:AABB:CCDD::/48
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo: the IPv4 address is obfuscated; never a Sentry host
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0; // ULA, link-, site-local
}

// The server sends events to the DSN, so it must not point into the local network (SSRF). Literal addresses are
// refused here; a DNS name is checked when server Sentry connects (publicOnlyLookup in sentry.ts).
// `hostname` is the URL-normalized form: numeric (2130706433) and IPv4-mapped IPv6 hosts arrive canonical.
function isPrivateHost(hostname: string): boolean {
  // `localhost.` (a fully qualified name) and `*.localhost` (RFC 6761) resolve to loopback too.
  const name = hostname.replace(/\.$/, "");
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  return isPrivateAddress(hostname.startsWith("[") ? hostname.slice(1, -1) : hostname);
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

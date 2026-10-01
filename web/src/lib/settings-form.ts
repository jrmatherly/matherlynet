// Site settings shape and /admin form validation. Pure (no database), so tests can cover it.
import { isProPalette, type SiteThemeDefaults } from "../theme/palettes";

export interface SiteSettings extends SiteThemeDefaults {
  sentry: { dsn: string | null; server: boolean; browser: boolean };
  umami: { enabled: boolean; scriptUrl: string | null; websiteId: string | null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only http(s) URLs: these values end up in <script src> and in the browser SDK.
function httpUrl(value: string): URL | null {
  if (value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
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
  const sentryServer = form.has("sentryServer");
  const sentryBrowser = form.has("sentryBrowser");
  if ((sentryServer || sentryBrowser) && !dsn) return { error: "Enter a Sentry DSN to turn on error reporting." };

  const scriptUrl = text(form, "umamiScriptUrl");
  const websiteId = text(form, "umamiWebsiteId");
  if (scriptUrl && !httpUrl(scriptUrl)) return { error: "The Umami script URL must be an http(s) URL." };
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

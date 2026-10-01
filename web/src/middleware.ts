import { defineMiddleware } from "astro:middleware";
import { auth } from "./lib/auth";
import { captureServerError } from "./lib/sentry";
import { siteOrigin } from "./lib/site";
import { getSiteSettings } from "./lib/site-settings";
import { MODE_COOKIE, THEME_COOKIE, resolveTheme } from "./theme/palettes";

// Security headers beside the CSP (which Astro sets from astro.config.mjs). X-Frame-Options backs up the
// CSP's frame-ancestors for older browsers.
const securityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  // HSTS only means something over HTTPS; local http://localhost must not get it.
  ...(siteOrigin().protocol === "https:" ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
};

export const onRequest = defineMiddleware(async (context, next) => {
  let response: Response;
  // The session lookup sits inside the try too, so a database outage on a signed-in request is reported (once a
  // DSN has loaded; Sentry keeps it while the database is down). Site settings never throw: they fall back.
  try {
    const [result, siteSettings] = await Promise.all([
      auth.api.getSession({ headers: context.request.headers }),
      getSiteSettings(),
    ]);
    context.locals.user = result?.user ?? null;
    context.locals.session = result?.session ?? null;
    context.locals.siteSettings = siteSettings;
    context.locals.theme = resolveTheme(
      { theme: context.cookies.get(THEME_COOKIE)?.value, mode: context.cookies.get(MODE_COOKIE)?.value },
      siteSettings,
    );
    response = await next();
  } catch (error) {
    captureServerError(error, context.request);
    throw error;
  }
  for (const [name, value] of Object.entries(securityHeaders)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  return response;
});

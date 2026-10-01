import { defineMiddleware } from "astro:middleware";
import { auth } from "./lib/auth";
import { captureServerError } from "./lib/sentry";
import { getSiteSettings } from "./lib/site-settings";
import { MODE_COOKIE, THEME_COOKIE, resolveTheme } from "./theme/palettes";

export const onRequest = defineMiddleware(async (context, next) => {
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
  try {
    return await next();
  } catch (error) {
    captureServerError(error, context.request);
    throw error;
  }
});

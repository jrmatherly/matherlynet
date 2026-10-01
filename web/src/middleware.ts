import { defineMiddleware } from "astro:middleware";
import { auth } from "./lib/auth";
import { getSiteDefaults } from "./lib/site-settings";
import { MODE_COOKIE, THEME_COOKIE, resolveTheme } from "./theme/palettes";

export const onRequest = defineMiddleware(async (context, next) => {
  const [result, siteDefaults] = await Promise.all([
    auth.api.getSession({ headers: context.request.headers }),
    getSiteDefaults(),
  ]);
  context.locals.user = result?.user ?? null;
  context.locals.session = result?.session ?? null;
  context.locals.siteDefaults = siteDefaults;
  context.locals.theme = resolveTheme(
    { theme: context.cookies.get(THEME_COOKIE)?.value, mode: context.cookies.get(MODE_COOKIE)?.value },
    siteDefaults,
  );
  return next();
});

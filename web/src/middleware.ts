import { defineMiddleware } from "astro:middleware";
import { auth } from "./lib/auth";
import { MODE_COOKIE, THEME_COOKIE, resolveTheme } from "./theme/palettes";

export const onRequest = defineMiddleware(async (context, next) => {
  const result = await auth.api.getSession({ headers: context.request.headers });
  context.locals.user = result?.user ?? null;
  context.locals.session = result?.session ?? null;
  context.locals.theme = resolveTheme({
    theme: context.cookies.get(THEME_COOKIE)?.value,
    mode: context.cookies.get(MODE_COOKIE)?.value,
  });
  return next();
});

import type { Breadcrumb, Event } from "@sentry/browser";
import type { Integration } from "@sentry/core";

// Path only: query strings and fragments can carry tokens (e.g. /reset-password?token=…).
export const stripQuery = (url: unknown): unknown => (typeof url === "string" ? url.split(/[?#]/)[0] : url);

// Browser Sentry's beforeSend: the SDK reports location.href and the Referer unfiltered (HttpContext integration).
export function scrubEvent<T extends Event>(event: T): T {
  const request = event.request;
  if (request) {
    if (request.url) request.url = stripQuery(request.url) as string;
    if (request.headers?.Referer) request.headers.Referer = stripQuery(request.headers.Referer) as string;
    delete request.query_string;
  }
  return event;
}

// Browser Sentry's beforeBreadcrumb: navigation (from/to) and fetch/xhr (url) breadcrumbs record raw URLs.
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  for (const key of ["url", "from", "to"]) if (crumb.data && key in crumb.data) crumb.data[key] = stripQuery(crumb.data[key]);
  return crumb;
}

// userInfo false stops Sentry inferring the visitor's IP from the connection (infer_ip "never"). The CultureContext
// integration collects the visitor's timezone and locale, which /privacy says stay out.
export const browserSentryOptions = {
  dataCollection: { userInfo: false },
  integrations: (defaults: Integration[]) => defaults.filter((integration) => integration.name !== "CultureContext"),
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};

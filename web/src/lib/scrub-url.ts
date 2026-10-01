// Path only: query strings and fragments can carry tokens (e.g. /reset-password?token=…).
export const stripQuery = (url: unknown): unknown => (typeof url === "string" ? url.split(/[?#]/)[0] : url);

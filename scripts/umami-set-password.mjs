// Changes Umami's default admin password through its API (Umami has no env var for it).
// Usage: UMAMI_URL=https://analytics.example.com UMAMI_NEW_PASSWORD=... node scripts/umami-set-password.mjs
// Docs: https://docs.umami.is/docs/api/authentication, https://docs.umami.is/docs/api-reference/update-my-password.md
const base = process.env.UMAMI_URL;
const next = process.env.UMAMI_NEW_PASSWORD;
const current = process.env.UMAMI_CURRENT_PASSWORD ?? "umami";
if (!base || !next) throw new Error("Set UMAMI_URL and UMAMI_NEW_PASSWORD");
const post = (path, body, token) =>
  fetch(new URL(path, base), {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const login = await post("/api/auth/login", { username: process.env.UMAMI_USERNAME ?? "admin", password: current });
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const { token } = await login.json();
const res = await post("/api/me/password", { currentPassword: current, newPassword: next }, token);
if (!res.ok) throw new Error(`Password change failed: ${res.status} ${await res.text()}`);
console.log("Umami admin password changed.");

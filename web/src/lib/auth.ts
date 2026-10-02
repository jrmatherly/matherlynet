import { betterAuth, type User } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/auth-schema";
import { sendMail } from "./mail";
import { pwnedPasswordCheck } from "./pwned";
import { captureError } from "./sentry";

// A provider is enabled only when both its client id and secret are set.
const socialProviders = Object.fromEntries(
  (["github", "google"] as const).flatMap((p) => {
    const clientId = process.env[`${p.toUpperCase()}_CLIENT_ID`];
    const clientSecret = process.env[`${p.toUpperCase()}_CLIENT_SECRET`];
    return clientId && clientSecret ? [[p, { clientId, clientSecret }]] : [];
  }),
);

// Lets pages offer only the sign-in buttons that will work.
export const enabledProviders = Object.keys(socialProviders) as ("github" | "google")[];

// The account matching the admin-email parameter becomes admin when its email is proven, and only then: at
// creation when an OAuth provider vouches for it, or when one of verifyingPaths writes emailVerified: true (the
// emailed link, or OAuth sign-in linking to an unverified account). Without verification anyone could claim it.
// Nothing else promotes, so a demotion through the admin plugin sticks (even an admin re-setting emailVerified);
// an account verified before admin-email was set is therefore never promoted.
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
async function promoteAdmin(u: (User & Record<string, unknown>) | null) {
  // null: better-auth passes the update's result, which is null when no row matched.
  if (!u || !adminEmail || !u.emailVerified || u.email.toLowerCase() !== adminEmail || u.role === "admin") return;
  try {
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, u.id));
  } catch (error) {
    // The verification is already committed and won't run again (the link short-circuits once verified), so
    // rethrowing would only turn the sign-in into a 500. Say how to finish the promotion by hand instead.
    console.error(`auth: admin promotion failed; run: UPDATE "user" SET role = 'admin' WHERE id = '${u.id}'`, error);
    captureError(error, { step: "admin-promotion", userId: u.id });
  }
}

// Endpoints (better-auth route templates) where emailVerified becomes true because the address was proven: the
// emailed link, an OAuth callback or ID-token sign-in. Not /admin/update-user: an admin setting the flag isn't a
// verification. An unlisted path fails safe: no promotion, which can be done by hand.
const verifyingPaths = new Set(["/verify-email", "/callback/:id", "/sign-in/social"]);
// update.before sees only the update payload and update.after only the resulting row; better-auth passes both the
// same endpoint context (db/with-hooks.mjs updateWithHooks), which links the two.
const verifying = new WeakSet<object>();

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // Enforced by every password route except /admin/create-user (better-auth 1.7.7), where the breached-password hook
    // (pwned.ts) applies it.
    minPasswordLength: 12,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendMail(user.email, "Reset your password", `Reset your matherlynet password:\n\n${url}\n\nIf you didn't ask for this, ignore this email.`),
    // Sign-up answers the same for new and existing emails; the fake response needs the admin plugin's fields.
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
      ...additionalFields,
      id,
    }),
  },
  emailVerification: {
    // Signing in unverified re-sends the link, so a lost email isn't a dead end.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendMail(user.email, "Verify your email", `Confirm your email to finish signing up for matherlynet:\n\n${url}`),
  },
  socialProviders,
  // Shared across replicas; better-auth enables limiting in production only. /ok is the K8s probe path: limiting
  // it would read and write rate_limit on every probe and fail the probes whenever Postgres is down.
  rateLimit: { storage: "database", customRules: { "/ok": false } },
  // Production sits behind Cloudflare, which sets this header. The origin must be reachable only through
  // Cloudflare, or a client could send the header itself.
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  databaseHooks: {
    user: {
      // Created already verified = an OAuth provider vouched for the email.
      create: { after: promoteAdmin },
      update: {
        before: async (data, ctx) => {
          if (data.emailVerified === true && ctx && verifyingPaths.has(ctx.path)) verifying.add(ctx);
        },
        after: async (u, ctx) => {
          if (ctx && verifying.delete(ctx)) await promoteAdmin(u);
        },
      },
    },
  },
  // /api/auth/* errors never reach the Astro middleware's Sentry capture: better-auth turns them into responses.
  // onAPIError sees what escapes an endpoint (crashes such as a database outage, middleware rejections); it
  // replaces better-auth's default logging, so it logs too. 4xx are the client's problem and stay out.
  onAPIError: {
    onError: (error, ctx) => {
      if (isAPIError(error) && error.statusCode < 500) return;
      ctx.logger.error("auth request failed", error);
      captureError(error);
    },
  },
  // APIErrors thrown inside an endpoint become responses before onAPIError (api/dispatch.mjs), e.g. a 500 from a
  // failed session insert: this hook reports those. One thrown by a before hook (the breached-password lookup's 503)
  // skips this hook and reaches onAPIError instead (checked against 1.7.7 through auth.handler).
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      if (isAPIError(returned) && returned.statusCode >= 500) captureError(returned, { path: ctx.path });
    }),
  },
  plugins: [admin(), pwnedPasswordCheck()],
});

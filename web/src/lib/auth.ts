import { betterAuth, type User } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, haveIBeenPwned } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/auth-schema";
import { sendMail } from "./mail";

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

// The account matching the admin-email parameter becomes admin when its email becomes verified: by link
// (afterEmailVerification), or at creation when an OAuth provider vouches for it (user.create.after). Without
// verification anyone could claim it. Not on every user update, so a demotion through the admin plugin sticks;
// an account verified before admin-email was set is therefore never promoted.
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
async function promoteAdmin(u: User & Record<string, unknown>) {
  if (adminEmail && u.emailVerified && u.email.toLowerCase() === adminEmail && u.role !== "admin") {
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, u.id));
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
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
    // Receives the updated user (emailVerified: true), so promoteAdmin's check passes.
    afterEmailVerification: promoteAdmin,
  },
  socialProviders,
  // Shared across replicas; better-auth enables limiting in production only.
  rateLimit: { storage: "database" },
  // Production sits behind Cloudflare, which sets this header. The origin must be reachable only through
  // Cloudflare, or a client could send the header itself.
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  // Created already verified = an OAuth provider vouched for the email.
  databaseHooks: { user: { create: { after: promoteAdmin } } },
  plugins: [admin(), haveIBeenPwned()],
});

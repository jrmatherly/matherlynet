import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";

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

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  socialProviders,
});

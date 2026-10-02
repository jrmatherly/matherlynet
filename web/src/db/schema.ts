import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// App tables (auth tables are generated into auth-schema.ts).

// One row (id = 1): site-wide settings an admin sets on /admin.
export const siteSettings = pgTable(
  "site_settings",
  {
    id: integer("id").primaryKey().default(1),
    theme: text("theme").notNull(),
    proPalette: text("pro_palette").notNull(),
    // Display face for headings: "sans" (Geist) or "serif" (Newsreader). Default so the existing row migrates.
    typeface: text("typeface").notNull().default("sans"),
    // Error monitoring: any Sentry-compatible DSN; server and browser reporting switch independently.
    sentryDsn: text("sentry_dsn"),
    sentryServer: boolean("sentry_server").default(false).notNull(),
    sentryBrowser: boolean("sentry_browser").default(false).notNull(),
    // Analytics: the Umami tracker script and website id (created in Umami's UI).
    umamiEnabled: boolean("umami_enabled").default(false).notNull(),
    umamiScriptUrl: text("umami_script_url"),
    umamiWebsiteId: text("umami_website_id"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [check("site_settings_single_row", sql`${table.id} = 1`)],
);

import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

// One row per accepted live /playground call (lib/playground-io.ts): the audit record, the limiter's counter and the
// seat. No free text: the prompt and the answer are never stored, only their lengths. All times are Postgres's now(),
// so replica clocks never enter a comparison.
export const playgroundCall = pgTable(
  "playground_call",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // visitorKey(): "u:<user id>" or "h:<32 hex>". Never an address.
    visitor: text("visitor").notNull(),
    caller: text("caller").notNull(),
    promptChars: integer("prompt_chars").notNull(),
    // Set when the call takes a model seat at Routing, and never cleared: a row with it held a seat and counts toward
    // the site's daily cap, whatever its decision. A call refused "busy" never gets it.
    routedAt: timestamp("routed_at", { withTimezone: true }),
    decision: text("decision"),
    stoppedAt: text("stopped_at"),
    // An enum value (a limit, a guardrail category, a routing refusal, a finish or a stop), never text.
    reason: text("reason"),
    replyChars: integer("reply_chars"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
  },
  (t) => [
    check("playground_call_closed", sql`(${t.endedAt} is null) = (${t.decision} is null)`),
    check("playground_call_decision", sql`${t.decision} in ('forwarded', 'refused', 'cut', 'lost')`),
    index("playground_call_started_at").on(t.startedAt),
    // The sweep reads open rows only; this keeps it off the closed rows.
    index("playground_call_open").on(t.startedAt).where(sql`${t.endedAt} is null`),
    // The per-visitor counts read one visitor's last hour.
    index("playground_call_visitor").on(t.visitor, t.startedAt),
    // The seat count and the site's day read seated rows only.
    index("playground_call_routed").on(t.routedAt).where(sql`${t.routedAt} is not null`),
  ],
);

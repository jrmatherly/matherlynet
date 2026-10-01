import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// App tables (auth tables are generated into auth-schema.ts).

// One row (id = 1): site-wide defaults an admin sets on /admin.
export const siteSettings = pgTable(
  "site_settings",
  {
    id: integer("id").primaryKey().default(1),
    theme: text("theme").notNull(),
    proPalette: text("pro_palette").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [check("site_settings_single_row", sql`${table.id} = 1`)],
);

import { drizzle } from "drizzle-orm/node-postgres";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

// APPDB_URI is injected by Aspire from the `appdb` Postgres resource.
export const db = drizzle(process.env.APPDB_URI!, { schema: { ...authSchema, ...appSchema } });

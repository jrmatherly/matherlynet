import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./auth-schema";

// APPDB_URI is injected by Aspire from the `appdb` Postgres resource.
export const db = drizzle(process.env.APPDB_URI!, { schema });

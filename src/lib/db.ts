import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const databaseUrl = process.env["DATABASE_URL"] ?? "file:./data/aeris.sqlite";
const databasePath = databaseUrl.replace(/^file:/, "");

export const sqlite = new Database(databasePath);
export const db = drizzle(sqlite);

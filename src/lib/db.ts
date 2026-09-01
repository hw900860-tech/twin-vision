import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const databaseUrl = process.env["DATABASE_URL"] ?? "file:./data/aeris.sqlite";
const databasePath = databaseUrl.replace(/^file:/, "");

// Ensure directory exists
const dir = path.dirname(databasePath);
if (dir && dir !== "." && !fs.existsSync(dir)) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn("Could not create database directory:", e);
  }
}

let sqliteInstance: any;
let dbInstance: any;

try {
  sqliteInstance = new Database(databasePath);
  dbInstance = drizzle(sqliteInstance);
} catch (error) {
  console.warn("SQLite initialization warning, falling back to memory database:", error);
  try {
    sqliteInstance = new Database(":memory:");
    dbInstance = drizzle(sqliteInstance);
  } catch (e) {
    sqliteInstance = null;
    dbInstance = null;
  }
}

export const sqlite = sqliteInstance;
export const db = dbInstance;


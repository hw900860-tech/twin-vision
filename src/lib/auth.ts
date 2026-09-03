import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./auth-schema";

export const auth = betterAuth({
  baseURL: process.env['BETTER_AUTH_URL'] || "http://localhost:5173",
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [admin()],
  trustedOrigins: ["http://localhost:5173", "*.e2b.app", "*.daytonaproxy01.net"],
});

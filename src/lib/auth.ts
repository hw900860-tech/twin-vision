import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./auth-schema";

/**
 * Public base URL of this deployment.
 *
 * Priority: explicit BETTER_AUTH_URL → Vercel production domain → Vercel
 * per-deployment URL (previews) → localhost dev fallback. On Vercel both
 * VERCEL_* vars are injected automatically, so no manual configuration is
 * needed; set BETTER_AUTH_URL once a custom domain is attached.
 */
function publicBaseUrl(): string {
  if (process.env["BETTER_AUTH_URL"]) return process.env["BETTER_AUTH_URL"];
  const prod = process.env["VERCEL_PROJECT_PRODUCTION_URL"];
  if (prod) return `https://${prod}`;
  const deployment = process.env["VERCEL_URL"];
  if (deployment) return `https://${deployment}`;
  return "http://localhost:5173";
}

export const auth = betterAuth({
  baseURL: publicBaseUrl(),
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [admin()],
  trustedOrigins: [
    "http://localhost:5173",
    "*.e2b.app",
    "*.daytonaproxy01.net",
    // Explicit Vercel domains (baseURL is trusted implicitly, this covers
    // flows where better-auth validates the origin header against prod URL).
    ...(process.env["VERCEL_PROJECT_PRODUCTION_URL"]
      ? [`https://${process.env["VERCEL_PROJECT_PRODUCTION_URL"]}`]
      : []),
  ],
});

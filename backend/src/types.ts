import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  FRONTEND_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  SESSION_SECRET: string;
  BOOTSTRAP_OWNER_EMAIL: string;
  ADMIN_EMAILS: string;
}

export interface AuthContext {
  userId: number;
  accountId: number;
  email: string;
  isAdmin: boolean;
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Check for required environment variables
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const VITE_SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

if (!SUPABASE_ANON_KEY) {
  console.warn("SUPABASE_ANON_KEY not found - using DATABASE_URL connection");
}

if (!VITE_SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("VITE_SUPABASE_SERVICE_ROLE_KEY not found - using DATABASE_URL connection");
}

// Create database connection using postgres-js for better reliability
const sql_client = postgres(DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 60,
  types: {
    // Force timestamps to be returned as strings
    date: (value) => value,
    timestamp: (value) => value,
    timestamptz: (value) => value,
  }
});
export const db = drizzle(sql_client);

// Export configuration for client-side use
export const supabaseConfig = {
  url: DATABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  serviceRoleKey: VITE_SUPABASE_SERVICE_ROLE_KEY,
};
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DEFAULT_TEAM_PASSWORD",
];

const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());
if (missing.length > 0) {
  console.error("Missing required env vars for production:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

if (String(process.env.DEFAULT_TEAM_PASSWORD).trim().length < 8) {
  console.error("DEFAULT_TEAM_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

if (String(process.env.DEFAULT_TEAM_PASSWORD).trim() === "Team@1234") {
  console.error("DEFAULT_TEAM_PASSWORD is still default (Team@1234). Change it before deploy.");
  process.exit(1);
}

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
const expected = [
  "005_returns_exchange_restock.sql",
  "006_returns_delete_policy.sql",
  "007_return_stock_and_audit.sql",
  "008_app_settings_login_gate.sql",
];
const missingFiles = expected.filter((f) => !fs.existsSync(path.join(migrationsDir, f)));
if (missingFiles.length > 0) {
  console.error("Missing required migration files:");
  for (const f of missingFiles) console.error(`- ${f}`);
  process.exit(1);
}

console.log("Production preflight passed.");

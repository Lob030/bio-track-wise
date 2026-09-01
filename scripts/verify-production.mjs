import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const failures = [];
const warnings = [];
const root = process.cwd();
const strictEnvironment = process.argv.includes("--strict-env");

const migrations = readdirSync(join(root, "supabase", "migrations")).filter((name) =>
  name.endsWith(".sql"),
);
const migrationIds = migrations.map((name) => name.split("_")[0]);
const duplicates = migrationIds.filter((id, index) => migrationIds.indexOf(id) !== index);
if (duplicates.length) failures.push(`Migration identifiers repeated: ${[...new Set(duplicates)]}`);
if (!migrations.includes("20260808000001_complete_costing.sql")) {
  failures.push("Complete costing migration is missing.");
}
if (!migrations.includes("20260808000002_operational_management_suite.sql")) {
  failures.push("Operational management migration is missing.");
}
if (!migrations.includes("20260808000003_product_consolidation.sql")) {
  failures.push("Product consolidation migration is missing.");
}
if (!migrations.includes("20260808000004_inventory_source_bridge.sql")) {
  failures.push("Inventory source bridge migration is missing.");
}
if (!migrations.includes("20260808000005_professional_control_center.sql")) {
  failures.push("Professional control center migration is missing.");
}
if (!migrations.includes("20260809000001_professional_integration_hardening.sql")) {
  failures.push("Professional integration hardening migration is missing.");
}

for (const requiredFunction of [
  "supabase/functions/evaluate-alerts/index.ts",
  "supabase/functions/generate-operational-tasks/index.ts",
]) {
  if (!existsSync(join(root, requiredFunction))) {
    failures.push(`Required Edge Function missing: ${requiredFunction}`);
  }
}

for (const required of [
  ".env.example",
  "docs/despliegue-operacion.md",
  "docs/continuidad-operativa.md",
  "scripts/test-restore.ps1",
  "scripts/verify-restore.sql",
]) {
  if (!existsSync(join(root, required)))
    failures.push(`Required production artifact missing: ${required}`);
}

const requiredEnvironment = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SITE_URL",
  "APP_VERSION",
  "OPERATIONS_CRON_SECRET",
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length) {
  const message = `Deployment variables not present in this shell: ${missingEnvironment.join(", ")}`;
  if (strictEnvironment) failures.push(message);
  else warnings.push(`${message}. Run with --strict-env in deployment CI.`);
}

const publicDirectory = join(root, "dist", "client");
if (!existsSync(publicDirectory)) {
  failures.push("dist/client is missing. Run npm run build first.");
} else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const inspect = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) inspect(path);
      else if (statSync(path).size <= 10_000_000 && readFileSync(path, "utf8").includes(secret)) {
        failures.push(`Server secret found in browser bundle: ${path.slice(root.length + 1)}`);
      }
    }
  };
  inspect(publicDirectory);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`Production repository checks passed (${migrations.length} migrations).`);

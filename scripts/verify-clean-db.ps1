param(
  [switch]$RunIntegration
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required. Install it, then run this script again."
}

# --local limits the reset to the local development database.
supabase start
supabase db reset --local

if ($RunIntegration) {
  npm run test:integration
}

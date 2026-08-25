param(
  [string]$SourceDatabaseUrl = $env:SOURCE_DATABASE_URL,
  [string]$OutputRoot = ".\backups"
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceDatabaseUrl)) {
  throw "Set SOURCE_DATABASE_URL or pass -SourceDatabaseUrl."
}
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path (Resolve-Path -LiteralPath (New-Item -ItemType Directory -Force -Path $OutputRoot)) "biotrack-$stamp"
New-Item -ItemType Directory -Force -Path $target | Out-Null

supabase db dump --db-url $SourceDatabaseUrl -f (Join-Path $target "roles.sql") --role-only
if ($LASTEXITCODE -ne 0) { throw "Role dump failed." }
supabase db dump --db-url $SourceDatabaseUrl -f (Join-Path $target "schema.sql")
if ($LASTEXITCODE -ne 0) { throw "Schema dump failed." }
supabase db dump --db-url $SourceDatabaseUrl -f (Join-Path $target "data.sql") --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
if ($LASTEXITCODE -ne 0) { throw "Data dump failed." }

$hashes = Get-ChildItem -LiteralPath $target -File | Get-FileHash -Algorithm SHA256 |
  Select-Object @{Name="file";Expression={ Split-Path $_.Path -Leaf }}, Hash
$manifest = [ordered]@{
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  format = "supabase-logical-sql"
  files = $hashes
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $target "manifest.json") -Encoding utf8

Write-Output "Backup created: $target"

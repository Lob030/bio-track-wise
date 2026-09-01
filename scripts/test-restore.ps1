param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [string]$RestoreDatabaseUrl = $env:RESTORE_DATABASE_URL,
  [switch]$ConfirmDisposableTarget
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmDisposableTarget) {
  throw "Refusing to restore without -ConfirmDisposableTarget. The target must be disposable."
}
if ([string]::IsNullOrWhiteSpace($RestoreDatabaseUrl)) {
  throw "Set RESTORE_DATABASE_URL or pass -RestoreDatabaseUrl."
}
if ($RestoreDatabaseUrl -eq $env:SOURCE_DATABASE_URL) {
  throw "Restore target must not be the source database."
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "psql is required."
}

$directory = Resolve-Path -LiteralPath $BackupDirectory
$roles = Join-Path $directory "roles.sql"
$schema = Join-Path $directory "schema.sql"
$data = Join-Path $directory "data.sql"
$manifestPath = Join-Path $directory "manifest.json"
foreach ($path in @($roles, $schema, $data, $manifestPath)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing backup file: $path" }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
  $path = Join-Path $directory $entry.file
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  if ($actual -ne $entry.Hash) { throw "Checksum mismatch: $($entry.file)" }
}

psql --single-transaction --variable ON_ERROR_STOP=1 --file $roles --file $schema `
  --command "SET session_replication_role = replica" --file $data --dbname $RestoreDatabaseUrl
if ($LASTEXITCODE -ne 0) { throw "Restore failed." }

$verifySql = Join-Path $PSScriptRoot "verify-restore.sql"
psql --variable ON_ERROR_STOP=1 --file $verifySql --dbname $RestoreDatabaseUrl
if ($LASTEXITCODE -ne 0) { throw "Post-restore verification failed." }

Write-Output "Restore drill completed successfully on the disposable target."

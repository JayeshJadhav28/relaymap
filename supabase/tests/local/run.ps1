<#
.SYNOPSIS
  Reproduces the RelayMap PostgreSQL migration, constraint and RLS validation.

.DESCRIPTION
  Starts (or reuses) a disposable PostgreSQL 17 container, applies the local
  Supabase auth stubs, applies all seven migrations in filename order, then runs
  the constraint/RLS assertions and the demo-seed idempotency test.

  This script validates the SQL against real PostgreSQL. It does not create a
  Supabase project and does not prove GoTrue, storage or PostgREST behaviour.

.EXAMPLE
  pwsh -File supabase/tests/local/run.ps1
  pwsh -File supabase/tests/local/run.ps1 -KeepDatabase
#>
param(
  [string]$Container = "relaymap-pg",
  [string]$Database = "relaymap_verify",
  [string]$PgUser = "postgres",
  [int]$Port = 55432,
  [switch]$KeepDatabase
)

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$migrations = Join-Path $appRoot "supabase\migrations"
$bootstrap = Join-Path $PSScriptRoot "00_bootstrap.sql"
$constraints = Join-Path $PSScriptRoot "10_constraints.sql"
$seed = Join-Path $PSScriptRoot "20_seed.sql"

function Invoke-PsqlFile {
  param([string]$Path, [string]$DatabaseName)
  Write-Host "  -> $(Split-Path $Path -Leaf)"
  $previous = $ErrorActionPreference
  # psql writes NOTICE lines to stderr; treat them as output, not failures, and
  # decide success from the real process exit code.
  $ErrorActionPreference = "Continue"
  Get-Content -Raw $Path | docker exec -i $Container psql -U $PgUser -d $DatabaseName -v ON_ERROR_STOP=1 -q -f - 2>&1 | ForEach-Object { Write-Host $_ }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  if ($code -ne 0) {
    throw "psql failed for $(Split-Path $Path -Leaf) with exit code $code"
  }
}

function Invoke-PsqlCommand {
  param([string]$Sql)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  docker exec $Container psql -U $PgUser -d postgres -v ON_ERROR_STOP=1 -q -c $Sql 2>&1 | ForEach-Object { Write-Host $_ }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  if ($code -ne 0) {
    throw "psql command failed with exit code $code"
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required. Install Docker Desktop or run the SQL manually."
}
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
docker info *> $null
$dockerInfoCode = $LASTEXITCODE
$ErrorActionPreference = $previousPreference
if ($dockerInfoCode -ne 0) {
  throw "The Docker daemon is not running."
}

$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$existing = docker ps -a --filter "name=^/$Container$" --format "{{.Names}}"
if (-not $existing) {
  Write-Host "Creating disposable container $Container on port $Port ..."
  docker run -d --name $Container -e POSTGRES_PASSWORD=relaymap_local_only -p "${Port}:5432" postgres:17-alpine *> $null
  $createCode = $LASTEXITCODE
  Start-Sleep -Seconds 4
  if ($createCode -ne 0) { $ErrorActionPreference = $previousPreference; throw "Could not create the PostgreSQL container." }
} elseif (-not (docker ps --filter "name=^/$Container$" --format "{{.Names}}")) {
  Write-Host "Starting existing container $Container ..."
  docker start $Container *> $null
  $startCode = $LASTEXITCODE
  Start-Sleep -Seconds 3
  if ($startCode -ne 0) { $ErrorActionPreference = $previousPreference; throw "Could not start the PostgreSQL container." }
}
$ErrorActionPreference = $previousPreference

Write-Host "Using PostgreSQL:"
docker exec $Container postgres --version

Write-Host "Recreating database $Database ..."
Invoke-PsqlCommand "drop database if exists $Database;"
Invoke-PsqlCommand "create database $Database;"

Write-Host "Applying bootstrap and migrations:"
Invoke-PsqlFile -Path $bootstrap -DatabaseName $Database
Get-ChildItem $migrations -Filter "*.sql" | Sort-Object Name | ForEach-Object {
  Invoke-PsqlFile -Path $_.FullName -DatabaseName $Database
}

Write-Host "Running constraint and RLS assertions:"
Invoke-PsqlFile -Path $constraints -DatabaseName $Database

Write-Host "Running demo seed twice (idempotency):"
Invoke-PsqlFile -Path $seed -DatabaseName $Database
Invoke-PsqlFile -Path $seed -DatabaseName $Database

if (-not $KeepDatabase) {
  Write-Host "Dropping disposable database $Database ..."
  Invoke-PsqlCommand "drop database if exists $Database;"
}

Write-Host ""
Write-Host "All RelayMap PostgreSQL assertions passed." -ForegroundColor Green
Write-Host "The container '$Container' was left running for reuse; stop it with: docker stop $Container"

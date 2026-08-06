param(
  [int]$PriorConservativeMicros = 1070397,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ProofControlReporter = Join-Path $PSScriptRoot "pdf50-provider-proof-control-report.mjs"
$VaultSchema = "edustruct.pdf50-e2e.dpapi.v1"
$VaultDirectory = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "EduStruct\CredentialVaults"
$VaultPath = Join-Path $VaultDirectory "pdf50-e2e-secrets.clixml"
$RequiredVaultValues = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "PDF50_E2E_EXPECTED_PROJECT_REF"
)
$RequiredEnvironment = @(
  $RequiredVaultValues
  "PDF50_E2E_ENVIRONMENT",
  "PDF50_E2E_CONFIRM_CLEANUP",
  "PDF50_PROVIDER_TEST_MODE",
  "AI_JOBS_LOCAL_MAX_INVOCATIONS",
  "PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS",
  "PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS",
  "PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS",
  "PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD",
  "AI_PARSING_VISUAL_E2E_ENVIRONMENT",
  "AI_PARSING_VISUAL_E2E_CONFIRM_CLEANUP",
  "AI_PARSING_VISUAL_PRIOR_CONSERVATIVE_MICROS"
)

function Set-ProcessValueFromSecureString([string]$Name, [Security.SecureString]$SecureValue) {
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  $PlainText = $null
  try {
    $PlainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    [Environment]::SetEnvironmentVariable($Name, $PlainText, "Process")
  }
  finally {
    $PlainText = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
  }
}

$ExitCode = 1
$FailureCategory = "launcher_failed"
$ProofControl = $null
$Vault = $null
try {
  if ($env:OS -ne "Windows_NT") {
    $FailureCategory = "windows_dpapi_required"
    throw "blocked"
  }
  if ($env:NODE_ENV -eq "production") {
    $FailureCategory = "production_environment_refused"
    throw "blocked"
  }
  if ($PriorConservativeMicros -ne 1070397) {
    $FailureCategory = "cost_envelope_rejected"
    throw "blocked"
  }
  try {
    $ProofControlJson = & node $ProofControlReporter --json
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ProofControlJson)) {
      throw "invalid"
    }
    $ProofControl = $ProofControlJson | ConvertFrom-Json
  }
  catch {
    $FailureCategory = "provider_proof_control_invalid"
    throw "blocked"
  }
  if (($PriorConservativeMicros + [int]$ProofControl.conservativeCostMicros) -gt 2000000) {
    $FailureCategory = "cost_envelope_rejected"
    throw "blocked"
  }
  if (-not (Test-Path -LiteralPath $VaultPath)) {
    $FailureCategory = "credential_vault_missing"
    throw "blocked"
  }
  try {
    $Vault = Import-Clixml -LiteralPath $VaultPath
  }
  catch {
    $FailureCategory = "credential_vault_invalid"
    throw "blocked"
  }
  if ($Vault.Schema -cne $VaultSchema) {
    $FailureCategory = "credential_vault_invalid"
    throw "blocked"
  }
  foreach ($Name in $RequiredVaultValues) {
    $SecureValue = $Vault.Values.$Name
    if ($SecureValue -isnot [Security.SecureString] -or $SecureValue.Length -eq 0) {
      $FailureCategory = "credential_vault_invalid"
      throw "blocked"
    }
    Set-ProcessValueFromSecureString $Name $SecureValue
  }

  $env:PDF50_E2E_ENVIRONMENT = "DISPOSABLE_PDF50_PROVIDER_E2E"
  $env:PDF50_E2E_CONFIRM_CLEANUP = "DELETE_PDF50_PROVIDER_E2E_FIXTURES"
  $env:PDF50_PROVIDER_TEST_MODE = [string]$ProofControl.mode
  $env:AI_JOBS_LOCAL_MAX_INVOCATIONS = [string]$ProofControl.workerRouteInvocations
  $env:PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS = [string]$ProofControl.providerInferenceAttempts
  $env:PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS = [string]$ProofControl.providerMaxNetworkRequests
  $env:PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS = [string]$ProofControl.providerMaxOutputTokens
  $env:PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD = [string]$ProofControl.approvedBudgetUsd
  $env:AI_PARSING_VISUAL_E2E_ENVIRONMENT = "DISPOSABLE_AI_PARSING_VISUAL_EVIDENCE"
  $env:AI_PARSING_VISUAL_E2E_CONFIRM_CLEANUP = "DELETE_AI_PARSING_VISUAL_EVIDENCE_FIXTURES"
  $env:AI_PARSING_VISUAL_PRIOR_CONSERVATIVE_MICROS = [string]$PriorConservativeMicros
  $env:NODE_ENV = "development"

  Write-Host "AI_PARSING_VISUAL_EVIDENCE_VAULT=LOADED"
  Write-Host "VAULT_SCOPE=CURRENT_WINDOWS_USER_AND_COMPUTER"
  Push-Location $Root
  try {
    & node "scripts\ai-parsing-visual-evidence-live-e2e.mjs"
    $ExitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}
catch {
  $ExitCode = 1
  Write-Host "AI_PARSING_VISUAL_EVIDENCE_LIVE_E2E=BLOCKED"
  Write-Host "FAILURE_CATEGORY=$FailureCategory"
}
finally {
  foreach ($Name in $RequiredEnvironment) {
    [Environment]::SetEnvironmentVariable($Name, $null, "Process")
  }
  Remove-Item "Env:NODE_ENV" -ErrorAction SilentlyContinue
  $Vault = $null
  $ProofControl = $null
  Write-Host "AI Parsing visual launcher finished. Process-only variables cleared."
}

if (-not $NoPause) {
  Read-Host "Press Enter to close"
}
exit $ExitCode

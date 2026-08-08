param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("4", "10", "50")]
  [string]$Stage,

  [ValidateRange(0, 2000000)]
  [int]$PriorConservativeMicros = 0,

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
  "PDF50_SCALE_E2E_ENVIRONMENT",
  "PDF50_SCALE_E2E_CONFIRM_CLEANUP",
  "PDF50_SCALE_PRIOR_CONSERVATIVE_MICROS",
  "PDF50_SCALE_STAGE"
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
    try {
      Set-ProcessValueFromSecureString $Name $SecureValue
    }
    catch {
      $FailureCategory = "credential_vault_decryption_failed"
      throw "blocked"
    }
  }

  $env:PDF50_E2E_ENVIRONMENT = "DISPOSABLE_PDF50_PROVIDER_E2E"
  $env:PDF50_E2E_CONFIRM_CLEANUP = "DELETE_PDF50_PROVIDER_E2E_FIXTURES"
  $env:PDF50_PROVIDER_TEST_MODE = [string]$ProofControl.mode
  $env:AI_JOBS_LOCAL_MAX_INVOCATIONS = [string]$ProofControl.workerRouteInvocations
  $env:PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS = [string]$ProofControl.providerInferenceAttempts
  $env:PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS = [string]$ProofControl.providerMaxNetworkRequests
  $env:PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS = [string]$ProofControl.providerMaxOutputTokens
  $env:PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD = [string]$ProofControl.approvedBudgetUsd
  $env:PDF50_SCALE_E2E_ENVIRONMENT = "DISPOSABLE_PDF50_SCALE_QUALIFICATION"
  $env:PDF50_SCALE_E2E_CONFIRM_CLEANUP = "DELETE_PDF50_SCALE_QUALIFICATION_FIXTURES"
  $env:PDF50_SCALE_PRIOR_CONSERVATIVE_MICROS = [string]$PriorConservativeMicros
  $env:PDF50_SCALE_STAGE = $Stage
  $env:NODE_ENV = "development"

  Write-Host "PDF50_SCALE_QUALIFICATION_VAULT=LOADED"
  Write-Host "VAULT_SCOPE=CURRENT_WINDOWS_USER_AND_COMPUTER"
  Write-Host "SCALE_STAGE=$Stage"

  Push-Location $Root
  try {
    & node "scripts\pdf50-scale-qualification-live-e2e.mjs"
    $ExitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}
catch {
  $ExitCode = 1
  Write-Host "PDF50_SCALE_$Stage=BLOCKED"
  Write-Host "FAILURE_CATEGORY=$FailureCategory"
}
finally {
  foreach ($Name in $RequiredEnvironment) {
    [Environment]::SetEnvironmentVariable($Name, $null, "Process")
  }
  Remove-Item "Env:NODE_ENV" -ErrorAction SilentlyContinue
  $Vault = $null
  $ProofControl = $null
  Write-Host "PDF50 scale launcher finished. Process-only variables cleared."
}

if (-not $NoPause) {
  Read-Host "Press Enter to close"
}
exit $ExitCode

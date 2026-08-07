$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$VaultSchema = "edustruct.pdf50-e2e.dpapi.v1"
$VaultDirectory = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "EduStruct\CredentialVaults"
$VaultPath = Join-Path $VaultDirectory "pdf50-e2e-secrets.clixml"
$RequiredVaultValues = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "PDF50_E2E_EXPECTED_PROJECT_REF"
)
$ProcessOnlyValues = @($RequiredVaultValues) + @(
  "GEMINI_BASELINE_ENVIRONMENT",
  "GEMINI_BASELINE_CONFIRM",
  "GEMINI_BASELINE_BUDGET_USD",
  "GEMINI_BASELINE_RUN_ORDINAL",
  "GEMINI_BASELINE_EXPECTED_HEAD"
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

  Push-Location $Root
  try {
    $Head = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $Head -notmatch '^[a-f0-9]{40}$') {
      $FailureCategory = "git_head_unavailable"
      throw "blocked"
    }
    if ((& git status --porcelain=v1 --untracked-files=all)) {
      $FailureCategory = "dirty_worktree_refused"
      throw "blocked"
    }

    $env:GEMINI_BASELINE_ENVIRONMENT = "DISPOSABLE_GEMINI_AI_PARSING_BASELINE_V1"
    $env:GEMINI_BASELINE_CONFIRM = "RUN_GEMINI_AI_PARSING_BASELINE_V1"
    $env:GEMINI_BASELINE_BUDGET_USD = "0.50"
    $env:GEMINI_BASELINE_RUN_ORDINAL = "1"
    $env:GEMINI_BASELINE_EXPECTED_HEAD = $Head
    $env:NODE_ENV = "development"
    Remove-Item "Env:AI_IMPORT_LLM_DEBUG_LOGS" -ErrorAction SilentlyContinue

    Write-Host "GEMINI_AI_PARSING_BASELINE_VAULT=LOADED"
    Write-Host "VAULT_SCOPE=CURRENT_WINDOWS_USER_AND_COMPUTER"
    Write-Host "BENCHMARK_RUN_ORDINAL=1"
    Write-Host "MAX_PROVIDER_BUDGET_USD=0.50"

    & node "scripts\ai-parsing-eval\run-gemini-baseline-v1.mjs"
    $ExitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}
catch {
  $ExitCode = 1
  Write-Host "GEMINI_AI_PARSING_BASELINE_V1=BLOCKED"
  Write-Host "FAILURE_CATEGORY=$FailureCategory"
}
finally {
  foreach ($Name in $ProcessOnlyValues) {
    [Environment]::SetEnvironmentVariable($Name, $null, "Process")
  }
  Remove-Item "Env:NODE_ENV" -ErrorAction SilentlyContinue
  Remove-Item "Env:AI_IMPORT_LLM_DEBUG_LOGS" -ErrorAction SilentlyContinue
  $Vault = $null
  Write-Host "Gemini baseline launcher finished. Process-only variables cleared."
}

exit $ExitCode

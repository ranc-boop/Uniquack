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
$RequiredEnvironment = @(
  $RequiredVaultValues
  "PDF50_GEMINI_COMPATIBILITY_ENVIRONMENT",
  "PDF50_GEMINI_COMPATIBILITY_CONFIRM",
  "PDF50_GEMINI_COMPATIBILITY_BUDGET_USD"
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

  $env:PDF50_GEMINI_COMPATIBILITY_ENVIRONMENT = "DISPOSABLE_PDF50_GEMINI_COMPATIBILITY"
  $env:PDF50_GEMINI_COMPATIBILITY_CONFIRM = "RUN_SYNTHETIC_GEMINI_COMPATIBILITY_PROBE"
  $env:PDF50_GEMINI_COMPATIBILITY_BUDGET_USD = "1"
  $env:NODE_ENV = "development"
  Remove-Item "Env:AI_IMPORT_LLM_DEBUG_LOGS" -ErrorAction SilentlyContinue

  Write-Host "PDF50_GEMINI_COMPATIBILITY_VAULT=LOADED"
  Write-Host "VAULT_SCOPE=CURRENT_WINDOWS_USER_AND_COMPUTER"

  Push-Location $Root
  try {
    & node "scripts\pdf50-gemini-structured-compatibility-probe.mjs"
    $ExitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}
catch {
  $ExitCode = 1
  Write-Host "PDF50_GEMINI_COMPATIBILITY_PROBE=BLOCKED"
  Write-Host "FAILURE_CATEGORY=$FailureCategory"
}
finally {
  foreach ($Name in $RequiredEnvironment) {
    [Environment]::SetEnvironmentVariable($Name, $null, "Process")
  }
  Remove-Item "Env:NODE_ENV" -ErrorAction SilentlyContinue
  Remove-Item "Env:AI_IMPORT_LLM_DEBUG_LOGS" -ErrorAction SilentlyContinue
  $Vault = $null
  Write-Host "Gemini compatibility launcher finished. Process-only variables cleared."
}

Read-Host "Press Enter to close"
exit $ExitCode

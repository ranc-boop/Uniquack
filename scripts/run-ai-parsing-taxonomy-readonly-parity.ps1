$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$VaultSchema = "edustruct.pdf50-e2e.dpapi.v1"
$VaultDirectory = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "EduStruct\CredentialVaults"
$VaultPath = Join-Path $VaultDirectory "pdf50-e2e-secrets.clixml"
$VaultNames = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "PDF50_E2E_EXPECTED_PROJECT_REF"
)
$ProcessNames = @(
  $VaultNames
  "AI_PARSING_TAXONOMY_READONLY_ENVIRONMENT",
  "AI_PARSING_TAXONOMY_READONLY_CONFIRMATION"
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
$FailureCategory = "readonly_launcher_failed"
$Vault = $null
try {
  if ($env:OS -ne "Windows_NT") {
    $FailureCategory = "windows_dpapi_required"
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
  foreach ($Name in $VaultNames) {
    $SecureValue = $Vault.Values.$Name
    if ($SecureValue -isnot [Security.SecureString] -or $SecureValue.Length -eq 0) {
      $FailureCategory = "credential_vault_invalid"
      throw "blocked"
    }
    Set-ProcessValueFromSecureString $Name $SecureValue
  }

  $env:AI_PARSING_TAXONOMY_READONLY_ENVIRONMENT = "AUTHORIZED_CURRENT_CLEAN_TAXONOMY_READONLY"
  $env:AI_PARSING_TAXONOMY_READONLY_CONFIRMATION = "NO_WRITES_NO_PROVIDER"
  Write-Host "AI_PARSING_TAXONOMY_READONLY_VAULT=LOADED"
  Write-Host "VAULT_SCOPE=CURRENT_WINDOWS_USER_AND_COMPUTER"

  Push-Location $Root
  try {
    & node "scripts\ai-parsing-eval\hosted-taxonomy-readonly-parity.mjs"
    $ExitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}
catch {
  $ExitCode = 1
  Write-Host "HOSTED_TAXONOMY_READONLY_AUDIT=BLOCKED"
  Write-Host "FAILURE_CATEGORY=$FailureCategory"
}
finally {
  foreach ($Name in $ProcessNames) {
    [Environment]::SetEnvironmentVariable($Name, $null, "Process")
  }
  $Vault = $null
  Write-Host "PROCESS_ENVIRONMENT_CLEARED=PASS"
}

exit $ExitCode

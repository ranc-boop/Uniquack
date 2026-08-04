$ErrorActionPreference = "Stop"

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
$ExitCode = 1
$Vault = $null

try {
  if ($env:OS -ne "Windows_NT") {
    throw "windows_dpapi_required"
  }
  if (-not (Test-Path -LiteralPath $VaultPath)) {
    throw "credential_vault_missing"
  }

  $Vault = Import-Clixml -LiteralPath $VaultPath
  if ($Vault.Schema -cne $VaultSchema) {
    throw "credential_vault_invalid"
  }
  foreach ($Name in $RequiredVaultValues) {
    $Value = $Vault.Values.$Name
    if ($Value -isnot [Security.SecureString] -or $Value.Length -eq 0) {
      throw "credential_vault_invalid"
    }
  }

  Write-Host "PDF50_E2E_VAULT_VALIDATION=PASS"
  Write-Host "VAULT_SCOPE=CURRENT_WINDOWS_USER_AND_COMPUTER"
  Write-Host "PLAINTEXT_VALUES_CREATED=0"
  $ExitCode = 0
}
catch {
  Write-Host "PDF50_E2E_VAULT_VALIDATION=BLOCKED"
  Write-Host "FAILURE_CATEGORY=credential_vault_validation_failed"
}
finally {
  $Value = $null
  $Vault = $null
  Write-Host "No credential value was printed or placed in the process environment."
}

Read-Host "Press Enter to close"
exit $ExitCode

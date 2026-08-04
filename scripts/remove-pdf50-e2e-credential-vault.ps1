$ErrorActionPreference = "Stop"

$VaultDirectory = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "EduStruct\CredentialVaults"
$VaultPath = Join-Path $VaultDirectory "pdf50-e2e-secrets.clixml"
$ExitCode = 1

if (-not (Test-Path -LiteralPath $VaultPath)) {
  Write-Host "PDF50_E2E_VAULT_REMOVE=PASS"
  Write-Host "VAULT_STATE=ABSENT"
  Read-Host "Press Enter to close"
  exit 0
}

$Confirmation = Read-Host "Type DELETE_PDF50_E2E_CREDENTIAL_VAULT to delete the encrypted vault"
if ($Confirmation -cne "DELETE_PDF50_E2E_CREDENTIAL_VAULT") {
  Write-Host "PDF50_E2E_VAULT_REMOVE=BLOCKED"
  Write-Host "FAILURE_CATEGORY=vault_deletion_not_confirmed"
  Read-Host "Press Enter to close"
  exit 1
}

try {
  Remove-Item -LiteralPath $VaultPath -Force
  Write-Host "PDF50_E2E_VAULT_REMOVE=PASS"
  Write-Host "VAULT_STATE=ABSENT"
  $ExitCode = 0
}
catch {
  Write-Host "PDF50_E2E_VAULT_REMOVE=BLOCKED"
  Write-Host "FAILURE_CATEGORY=credential_vault_delete_failed"
}

Read-Host "Press Enter to close"
exit $ExitCode

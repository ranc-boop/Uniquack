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
$Phase = "initialize"

function Stop-WithStatus([string]$Category) {
  Write-Host "PDF50_E2E_VAULT_SETUP=BLOCKED"
  Write-Host "FAILURE_CATEGORY=$Category"
  Read-Host "Press Enter to close"
  exit 1
}

function Read-RequiredSecureValue([string]$Name) {
  $Value = Read-Host -Prompt "Enter $Name" -AsSecureString
  if ($null -eq $Value -or $Value.Length -eq 0) {
    throw "required_value_missing"
  }
  return $Value
}

function Set-PrivateVaultAcl([string]$Path) {
  $CurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $SystemSid = New-Object Security.Principal.SecurityIdentifier(
    [Security.Principal.WellKnownSidType]::LocalSystemSid,
    $null
  )
  $Acl = New-Object Security.AccessControl.FileSecurity
  $Acl.SetOwner($CurrentSid)
  $Acl.SetAccessRuleProtection($true, $false)
  $Acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
    $CurrentSid,
    [Security.AccessControl.FileSystemRights]::FullControl,
    [Security.AccessControl.AccessControlType]::Allow
  )))
  $Acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
    $SystemSid,
    [Security.AccessControl.FileSystemRights]::FullControl,
    [Security.AccessControl.AccessControlType]::Allow
  )))
  Set-Acl -LiteralPath $Path -AclObject $Acl
}

if ($env:OS -ne "Windows_NT") {
  Stop-WithStatus "windows_dpapi_required"
}

if ($env:NODE_ENV -eq "production") {
  Stop-WithStatus "production_environment_refused"
}

if (Test-Path -LiteralPath $VaultPath) {
  $Confirmation = Read-Host "Vault already exists. Type REPLACE_PDF50_E2E_CREDENTIAL_VAULT to rotate it"
  if ($Confirmation -cne "REPLACE_PDF50_E2E_CREDENTIAL_VAULT") {
    Stop-WithStatus "vault_replacement_not_confirmed"
  }
}

$TempPath = $null
try {
  $Phase = "collect_values"
  $SecureValues = [ordered]@{}
  foreach ($Name in $RequiredVaultValues) {
    $SecureValues[$Name] = Read-RequiredSecureValue $Name
  }

  $Phase = "create_private_temp"
  New-Item -ItemType Directory -Path $VaultDirectory -Force | Out-Null
  $TempPath = Join-Path $VaultDirectory (".pdf50-e2e-secrets.{0}.tmp" -f [Guid]::NewGuid().ToString("N"))
  $Payload = [pscustomobject]@{
    Schema = $VaultSchema
    CreatedAtUtc = [DateTime]::UtcNow.ToString("o")
    Values = [pscustomobject]$SecureValues
  }

  $Payload | Export-Clixml -LiteralPath $TempPath -Depth 4 -Force
  Set-PrivateVaultAcl $TempPath

  $Phase = "validate_private_temp"
  $RoundTrip = Import-Clixml -LiteralPath $TempPath
  if ($RoundTrip.Schema -cne $VaultSchema) {
    throw "vault_round_trip_failed"
  }
  foreach ($Name in $RequiredVaultValues) {
    $Value = $RoundTrip.Values.$Name
    if ($Value -isnot [Security.SecureString] -or $Value.Length -eq 0) {
      throw "vault_round_trip_failed"
    }
  }

  $Phase = "install_vault"
  if (Test-Path -LiteralPath $VaultPath) {
    [IO.File]::Replace($TempPath, $VaultPath, $null, $true)
  }
  else {
    [IO.File]::Move($TempPath, $VaultPath)
  }
  $TempPath = $null

  $Phase = "validate_installed_vault"
  $InstalledVault = Import-Clixml -LiteralPath $VaultPath
  if ($InstalledVault.Schema -cne $VaultSchema) {
    throw "vault_install_validation_failed"
  }
  foreach ($Name in $RequiredVaultValues) {
    $Value = $InstalledVault.Values.$Name
    if ($Value -isnot [Security.SecureString] -or $Value.Length -eq 0) {
      throw "vault_install_validation_failed"
    }
  }

  Write-Host "PDF50_E2E_VAULT_SETUP=PASS"
  Write-Host "VAULT_SCOPE=CURRENT_WINDOWS_USER_AND_COMPUTER"
  Write-Host "VAULT_LOCATION=%LOCALAPPDATA%\EduStruct\CredentialVaults\pdf50-e2e-secrets.clixml"
  $ExitCode = 0
}
catch {
  Write-Host "PDF50_E2E_VAULT_SETUP=BLOCKED"
  Write-Host "FAILURE_CATEGORY=credential_vault_setup_failed_$Phase"
}
finally {
  if ($null -ne $TempPath -and (Test-Path -LiteralPath $TempPath)) {
    Remove-Item -LiteralPath $TempPath -Force -ErrorAction SilentlyContinue
  }
  if ($null -ne $SecureValues) {
    foreach ($Name in $RequiredVaultValues) {
      $SecureValues[$Name] = $null
    }
  }
  $Payload = $null
  $RoundTrip = $null
  $InstalledVault = $null
  Write-Host "No credential value was written to the repository or printed."
}

Read-Host "Press Enter to close"
exit $ExitCode

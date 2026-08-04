import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadPDF50ProviderProofControl,
  pdf50ProviderProofEnvironment,
} from "./lib/pdf50-provider-proof-control.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const setup = readFileSync(
  resolve(root, "scripts", "setup-pdf50-e2e-credential-vault.ps1"),
  "utf8",
);
const launcher = readFileSync(
  resolve(root, "scripts", "run-pdf50-end-to-end-live-e2e.ps1"),
  "utf8",
);
const validator = readFileSync(
  resolve(root, "scripts", "validate-pdf50-e2e-credential-vault.ps1"),
  "utf8",
);
const removal = readFileSync(
  resolve(root, "scripts", "remove-pdf50-e2e-credential-vault.ps1"),
  "utf8",
);
const proofControl = await loadPDF50ProviderProofControl();
const proofEnvironment = pdf50ProviderProofEnvironment(proofControl);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const source of [setup, launcher, validator, removal]) {
  assert(!source.includes("dotenv"), "credential vault scripts must not load dotenv");
  assert(!source.includes(".env.local"), "credential vault scripts must not read .env.local");
}

for (const source of [setup, launcher]) {
  assert(
    source.includes('"edustruct.pdf50-e2e.dpapi.v1"') &&
      source.includes('GetFolderPath("LocalApplicationData")') &&
      source.includes('"EduStruct\\CredentialVaults"') &&
      source.includes('"pdf50-e2e-secrets.clixml"'),
    "setup and launcher must share the fixed versioned local vault contract",
  );
  assert(
    source.includes('$env:OS -ne "Windows_NT"') &&
      source.includes('"windows_dpapi_required"'),
    "DPAPI vault use must fail closed outside Windows",
  );
}

assert(
  setup.includes("Read-Host -Prompt") &&
    setup.includes("-AsSecureString") &&
    setup.includes("Export-Clixml -LiteralPath $TempPath") &&
    setup.includes("Set-PrivateVaultAcl $TempPath") &&
    setup.includes("[IO.File]::Replace") &&
    setup.includes("[IO.File]::Move") &&
    !setup.includes("PtrToStringBSTR"),
  "setup must collect secure values and atomically persist only DPAPI-protected XML",
);
assert(
  setup.includes('"REPLACE_PDF50_E2E_CREDENTIAL_VAULT"') &&
    setup.includes("vault_round_trip_failed") &&
    setup.includes("PDF50_E2E_VAULT_SETUP=PASS"),
  "setup must confirm replacement and verify the encrypted round trip",
);
assert(
  setup.includes("credential_vault_setup_failed_$Phase") &&
    setup.includes('$Phase = "validate_installed_vault"') &&
    setup.includes("$InstalledVault = Import-Clixml -LiteralPath $VaultPath"),
  "setup must report a sanitized phase and verify the installed vault",
);

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "PDF50_E2E_EXPECTED_PROJECT_REF",
]) {
  assert(setup.includes(`"${name}"`), `setup is missing allowlisted value ${name}`);
  assert(launcher.includes(`"${name}"`), `launcher is missing allowlisted value ${name}`);
}
for (const source of [setup, launcher, validator]) {
  assert(
    !source.includes('"TEST_TEACHER_USERNAME"') &&
      !source.includes('"TEST_TEACHER_PASSWORD"'),
    "vault tooling must not collect, decrypt, or require standing Teacher credentials",
  );
}

assert(
  launcher.includes("Import-Clixml -LiteralPath $VaultPath") &&
    launcher.includes("credential_vault_missing") &&
    launcher.includes("credential_vault_invalid") &&
    launcher.includes("credential_vault_decryption_failed") &&
    !launcher.includes("Read-PrivateValue") &&
    !launcher.includes('Read-Host "Enter'),
  "launcher must fail closed to the encrypted vault without credential prompt fallback",
);
assert(
  launcher.includes("SecureStringToBSTR") &&
    launcher.includes("ZeroFreeBSTR") &&
    launcher.includes("SetEnvironmentVariable($Name, $PlainText, \"Process\")") &&
    launcher.includes("SetEnvironmentVariable($Name, $null, \"Process\")"),
  "launcher must minimize plaintext lifetime and clear every process value",
);
assert(
  validator.includes("Import-Clixml -LiteralPath $VaultPath") &&
    validator.includes("PDF50_E2E_VAULT_VALIDATION=PASS") &&
    validator.includes("PLAINTEXT_VALUES_CREATED=0") &&
    !validator.includes("SecureStringToBSTR") &&
    !validator.includes("SetEnvironmentVariable"),
  "read-only vault validation must not unwrap or export credential values",
);

for (const literal of [
  '$env:PDF50_E2E_ENVIRONMENT = "DISPOSABLE_PDF50_PROVIDER_E2E"',
  '$env:PDF50_E2E_CONFIRM_CLEANUP = "DELETE_PDF50_PROVIDER_E2E_FIXTURES"',
]) {
  assert(launcher.includes(literal), `launcher is missing fixed safety control ${literal}`);
}

assert(
  launcher.includes('"pdf50-provider-proof-control-report.mjs"') &&
    launcher.includes("$ProofControlJson | ConvertFrom-Json") &&
    launcher.includes('"provider_proof_control_invalid"'),
  "launcher must fail closed to the canonical proof-control reporter",
);
for (const [name, field] of [
  ["PDF50_PROVIDER_TEST_MODE", "mode"],
  ["AI_JOBS_LOCAL_MAX_INVOCATIONS", "workerRouteInvocations"],
  ["PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS", "providerInferenceAttempts"],
  ["PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS", "providerMaxNetworkRequests"],
  ["PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS", "providerMaxOutputTokens"],
  ["PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD", "approvedBudgetUsd"],
]) {
  assert(
    proofEnvironment[name]?.length > 0 &&
      launcher.includes(`$env:${name} = [string]$ProofControl.${field}`),
    `launcher must derive ${name} from the canonical proof contract`,
  );
}

assert(
  removal.includes('"DELETE_PDF50_E2E_CREDENTIAL_VAULT"') &&
    removal.includes("Remove-Item -LiteralPath $VaultPath -Force") &&
    !removal.includes("-Recurse"),
  "vault removal must require an exact acknowledgement and delete only the fixed file",
);

console.log("PASS PDF50 DPAPI credential vault safety contract");

import assert from "node:assert/strict";
import test from "node:test";

import { loginErrorMessageKey } from "../src/lib/auth/login-error.ts";

test("maps known login failures to localized message keys", () => {
  assert.equal(loginErrorMessageKey("invalid_credentials"), "auth.invalidCredentials");
  assert.equal(loginErrorMessageKey("credentials_required"), "auth.usernamePasswordRequired");
  assert.equal(loginErrorMessageKey("environment_not_configured"), "auth.environmentUnavailable");
});

test("does not render untrusted provider error text", () => {
  assert.equal(loginErrorMessageKey("Invalid login credentials"), null);
  assert.equal(loginErrorMessageKey("<script>alert(1)</script>"), null);
});

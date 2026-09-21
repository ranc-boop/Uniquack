import assert from "node:assert/strict";
import test from "node:test";

import { assignmentErrorMessageKey } from "../src/lib/teacher-assignment-error.ts";

test("maps assignment action error codes to localizable message keys", () => {
  assert.equal(
    assignmentErrorMessageKey("missing_content"),
    "assignment.errorMissingContent",
  );
  assert.equal(
    assignmentErrorMessageKey("forbidden"),
    "assignment.errorForbidden",
  );
  assert.equal(assignmentErrorMessageKey("unexpected"), "common.requestFailed");
  assert.equal(assignmentErrorMessageKey(null), "common.requestFailed");
});

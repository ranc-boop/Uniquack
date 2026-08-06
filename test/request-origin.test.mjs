import assert from "node:assert/strict";
import test from "node:test";

import { resolveTrustedPostOrigin } from "../src/lib/request-origin.ts";

const directRequest = {
  environment: "development",
  host: "127.0.0.1:3317",
  origin: "http://127.0.0.1:3317",
  requestUrl: "http://internal-next:3000/api/teacher/focus-selections",
  secFetchSite: "same-origin",
};

test("accepts a same-origin direct development request", () => {
  assert.equal(resolveTrustedPostOrigin(directRequest), "http://127.0.0.1:3317");
});
test("normalizes valid configured origins and rejects production without one", () => {
  assert.equal(
    resolveTrustedPostOrigin({
      ...directRequest,
      configuredSiteUrl: "http://127.0.0.1:3317/",
      origin: "http://127.0.0.1:3317",
    }),
    "http://127.0.0.1:3317",
  );
  assert.equal(
    resolveTrustedPostOrigin({
      ...directRequest,
      environment: "production",
      host: "teacher.example.test",
      origin: "https://teacher.example.test",
      requestUrl: "https://teacher.example.test/api/teacher/focus-selections",
    }),
    null,
  );
});

test("accepts a configured proxy origin only when forwarded headers agree", () => {
  const input = {
    configuredSiteUrl: "https://teacher.example.test",
    environment: "production",
    host: "internal-next:3000",
    origin: "https://teacher.example.test",
    requestUrl: "http://internal-next:3000/api/teacher/focus-selections",
    secFetchSite: "same-origin",
    trustProxyHeaders: true,
    xForwardedHost: "teacher.example.test",
    xForwardedProto: "https",
  };

  assert.equal(
    resolveTrustedPostOrigin(input),
    "https://teacher.example.test",
  );
  assert.equal(
    resolveTrustedPostOrigin({ ...input, xForwardedHost: "other.example.test" }),
    null,
  );
  assert.equal(
    resolveTrustedPostOrigin({ ...input, xForwardedProto: "http" }),
    null,
  );
});

test("fails closed for missing, malformed, or ambiguous browser origins", () => {
  const invalidOrigins = [
    undefined,
    null,
    "null",
    " https://teacher.example.test",
    "https://teacher.example.test,https://evil.example",
    "https://user:password@teacher.example.test",
    "https://teacher.example.test/path",
    "https://teacher.example.test/?next=1",
    "https://teacher.example.test/#fragment",
    "javascript://teacher.example.test",
    "not-an-origin",
  ];

  for (const origin of invalidOrigins) {
    assert.equal(
      resolveTrustedPostOrigin({ ...directRequest, origin }),
      null,
      `invalid origin should be rejected: ${String(origin)}`,
    );
  }
});

test("fails closed for cross-site metadata and invalid configured sites", () => {
  assert.equal(
    resolveTrustedPostOrigin({ ...directRequest, secFetchSite: "cross-site" }),
    null,
  );
  assert.equal(
    resolveTrustedPostOrigin({
      ...directRequest,
      configuredSiteUrl: "https://teacher.example.test/path",
    }),
    null,
  );
  assert.equal(
    resolveTrustedPostOrigin({
      ...directRequest,
      trustProxyHeaders: true,
      configuredSiteUrl: null,
      xForwardedHost: "127.0.0.1:3317",
      xForwardedProto: "http",
    }),
    null,
  );
});

test("rejects ambiguous forwarded headers, unsupported protocols, and bad request URLs", () => {
  const proxy = {
    configuredSiteUrl: "https://teacher.example.test",
    environment: "production",
    host: "internal-next:3000",
    origin: "https://teacher.example.test",
    requestUrl: "http://internal-next:3000/api/teacher/focus-selections",
    secFetchSite: "same-origin",
    trustProxyHeaders: true,
    xForwardedHost: "teacher.example.test",
    xForwardedProto: "https",
  };

  for (const headers of [
    { xForwardedHost: "teacher.example.test,evil.example" },
    { xForwardedHost: "teacher.example.test evil.example" },
    { xForwardedProto: "https,http" },
    { xForwardedProto: "javascript" },
  ]) {
    assert.equal(resolveTrustedPostOrigin({ ...proxy, ...headers }), null);
  }

  assert.equal(
    resolveTrustedPostOrigin({
      ...directRequest,
      requestUrl: "not a URL",
    }),
    null,
  );
  assert.equal(
    resolveTrustedPostOrigin({
      ...directRequest,
      host: "127.0.0.1:3317 evil.example",
    }),
    null,
  );
});

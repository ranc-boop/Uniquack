import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCALE_COOKIE_NAME,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  formatDate,
  formatDateTime,
  formatNumber,
  localeCookieOptions,
  parseLocaleFormValue,
  resolveLocale,
} from "../src/lib/i18n/locale.ts";
import {
  MESSAGE_CATALOGS,
  translate,
  validateMessageCatalogs,
} from "../src/lib/i18n/messages.ts";

test("uses a valid locale cookie before the browser language", () => {
  assert.equal(
    resolveLocale({
      cookieValue: "en",
      acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
    }),
    "en",
  );
  assert.equal(LOCALE_COOKIE_NAME, "edustruct_locale");
});

test("uses simplified Chinese for a Chinese browser when no cookie exists", () => {
  assert.equal(
    resolveLocale({ cookieValue: null, acceptLanguage: "zh-HK,zh;q=0.9" }),
    "zh-CN",
  );
});

test("falls back to English for an invalid cookie and non-Chinese browser", () => {
  assert.equal(
    resolveLocale({ cookieValue: "fr", acceptLanguage: "fr-FR,fr;q=0.9" }),
    "en",
  );
});

test("builds a safe, persistent locale cookie without exposing it to scripts", () => {
  assert.deepEqual(localeCookieOptions(false), {
    httpOnly: true,
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: false,
  });
  assert.equal(localeCookieOptions(true).secure, true);
});

test("accepts only allowlisted locale form values", () => {
  assert.equal(parseLocaleFormValue("zh-CN"), "zh-CN");
  assert.equal(parseLocaleFormValue("en"), "en");
  assert.equal(parseLocaleFormValue("zh-TW"), null);
  assert.equal(parseLocaleFormValue(null), null);
});

test("uses localized message copy and keeps catalog keys in parity", () => {
  assert.equal(translate("zh-CN", "chrome.language"), "语言");
  assert.equal(translate("en", "auth.signIn"), "Sign in");
  assert.equal(
    translate("zh-CN", "chrome.adminPreviewNotice", { workspace: "教师" }),
    "你正在查看教师体验。操作仍会归属于你的管理员账户。",
  );
  assert.deepEqual(validateMessageCatalogs(MESSAGE_CATALOGS), []);
});

test("provides Chinese copy for all primary workspace entry points", () => {
  assert.equal(translate("zh-CN", "admin.dashboard"), "仪表盘");
  assert.equal(translate("zh-CN", "teacher.nextAction"), "下一步操作");
  assert.equal(
    translate("zh-CN", "teacherLibrary.openInNewTab"),
    "在新标签页中打开",
  );
  assert.equal(translate("zh-CN", "student.myWork"), "我的任务");
  assert.equal(translate("zh-CN", "practice.goalPlaceholder"), "你想练习什么？");
  assert.equal(translate("zh-CN", "practice.newSession"), "新建练习会话");
  assert.equal(
    translate("zh-CN", "practice.assignmentScope", {
      count: "4",
      title: "微积分作业",
    }),
    "使用“微积分作业”中的 4 道已布置题目。",
  );
});

test("formats numbers and dates with the selected locale", () => {
  assert.equal(formatNumber("en", 12345.6), "12,345.6");
  assert.equal(formatNumber("zh-CN", 12345.6), "12,345.6");
  assert.equal(
    formatDate("zh-CN", "2026-09-20T00:00:00.000Z", { timeZone: "UTC" }),
    "2026/9/20",
  );
});

test("allows Intl style options without combining them with component options", () => {
  assert.doesNotThrow(() =>
    formatDate("en", "2026-09-20T00:00:00.000Z", {
      dateStyle: "medium",
      timeZone: "UTC",
    }),
  );
  assert.doesNotThrow(() =>
    formatDateTime("zh-CN", "2026-09-20T00:00:00.000Z", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }),
  );
});

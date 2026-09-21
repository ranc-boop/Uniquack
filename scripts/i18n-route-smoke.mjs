const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, headers) {
  const response = await fetch(new URL(path, baseUrl), { headers });
  assert(response.status < 500, `${path} returned ${response.status}`);
  return response.text();
}

async function expectLocale({
  expectedCopy,
  expectedLang,
  headers,
  name,
  path = "/auth/login",
}) {
  const html = await request(path, headers);
  assert(html.includes(`<html lang="${expectedLang}"`), `${name} did not render ${expectedLang}`);
  assert(html.includes(expectedCopy), `${name} did not render expected copy: ${expectedCopy}`);
  console.log(`PASS ${name}`);
}

await expectLocale({
  expectedCopy: "登录",
  expectedLang: "zh-CN",
  headers: { "accept-language": "zh-CN,zh;q=0.9" },
  name: "Chinese browser language fallback",
});

await expectLocale({
  expectedCopy: "Sign in",
  expectedLang: "en",
  headers: {
    "accept-language": "zh-CN,zh;q=0.9",
    cookie: "edustruct_locale=en",
  },
  name: "English locale cookie override",
});

await expectLocale({
  expectedCopy: "登录",
  expectedLang: "zh-CN",
  headers: {
    "accept-language": "zh-CN,zh;q=0.9",
    cookie: "edustruct_locale=unsupported",
  },
  name: "Invalid locale cookie fallback",
});

await expectLocale({
  expectedCopy: "开始练习",
  expectedLang: "zh-CN",
  headers: { "accept-language": "zh-CN" },
  name: "Chinese public landing page",
  path: "/",
});

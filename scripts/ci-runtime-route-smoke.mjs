const baseUrl = process.env.SITE_URL ?? "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkPublicRoute(path, expectedMarkers) {
  const response = await fetch(new URL(path, baseUrl));
  assert(response.status < 500, `${path} returned ${response.status}`);
  const text = await response.text();
  assert(
    expectedMarkers.some((marker) => text.includes(marker)),
    `${path} did not include any expected marker: ${expectedMarkers.join(", ")}`,
  );
  console.log(`PASS ${path} public runtime route`);
}

async function checkProtectedRoute(path) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  assert(response.status < 500, `${path} returned ${response.status}`);

  const location = response.headers.get("location") ?? "";
  if (response.status >= 300 && response.status < 400) {
    assert(
      location.includes("/auth/login"),
      `${path} redirected to unexpected location: ${location}`,
    );
    console.log(`PASS ${path} protected runtime redirect`);
    return;
  }

  const text = await response.text();
  assert(
    text.includes('id="__next-page-redirect"') && text.includes("url=/auth/login"),
    `${path} did not redirect to login`,
  );
  console.log(`PASS ${path} protected runtime streamed redirect`);
}

await checkPublicRoute("/questions", ["Public Library"]);
await checkPublicRoute("/videos", ["Supabase is not configured", "Videos"]);
await checkProtectedRoute("/admin");
await checkProtectedRoute("/teacher");
await checkProtectedRoute("/student");

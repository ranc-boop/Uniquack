import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");
const [practicePage, loader, client, pendingLink, nav, work, detail, library, groups] =
  await Promise.all([
    read("src/app/practice/page.tsx"),
    read("src/components/practice/practice-agent-loader.tsx"),
    read("src/components/practice/practice-agent-client.tsx"),
    read("src/components/route-pending-link.tsx"),
    read("src/components/student/student-workspace-nav.tsx"),
    read("src/app/student/work/page.tsx"),
    read("src/app/student/work/[id]/page.tsx"),
    read("src/app/student/library/page.tsx"),
    read("src/app/student/groups/page.tsx"),
  ]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  practicePage.includes("safeStudentReturnTarget") &&
    practicePage.includes("exitHref={exitHref}") &&
    loader.includes("exitHref={exitHref}") &&
    client.includes('className="sticky top-16 z-50') &&
    client.includes('pendingLabel="Leaving…"') &&
    client.includes('"Back to My Work"') &&
    client.includes('"Back to Assignment"') &&
    client.includes('"Back to Dashboard"'),
  "Practice must expose a persistent, source-aware exit action.",
);
assert(
  pendingLink.includes('aria-live="polite"') &&
    pendingLink.includes('role="status"') &&
    pendingLink.includes("motion-safe:animate-spin") &&
    pendingLink.includes("event.metaKey") &&
    pendingLink.includes("router.push(href)"),
  "Student navigation must preserve keyboard/modifier behavior and announce pending routes.",
);
assert(
  work.includes("&returnTo=") && detail.includes("&returnTo=") &&
    !nav.includes('href: "/student/library"') &&
    !nav.includes('href: "/student/groups"') &&
    library.includes('redirect("/student/public-library")') &&
    groups.includes('redirect("/student/classrooms")'),
  "Student routes must preserve Practice origin and retire empty modules safely.",
);
assert(
  !work.includes("Focus on the next assignment") &&
    !client.includes("Misses and memory update as you submit rounds."),
  "Student and Practice pages must omit redundant helper copy.",
);

console.log("PASS Student Practice exit, pending navigation, redirects, and concise copy");

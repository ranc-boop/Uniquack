import { readFile } from "node:fs/promises";

const [pendingLink, sidebar, questionNav, questionPage, teacherLoading] =
  await Promise.all([
    readFile(
      new URL(
        "../src/components/admin/admin-pending-link.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/components/admin/admin-sidebar.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/admin/admin-question-library-nav.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/app/admin/questions/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/app/teacher/banks/[bankId]/loading.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  pendingLink.includes("router.prefetch(href)") &&
    pendingLink.includes("onMouseEnter={prefetchTarget}") &&
    pendingLink.includes("onFocus={prefetchTarget}") &&
    pendingLink.includes("prefetch={false}") &&
    pendingLink.includes("startTransition(() => router.push(href))"),
  "Admin navigation must prefetch only on intent and expose pending state.",
);

assert(
  sidebar.includes("<AdminPendingLink") &&
    questionNav.includes("<AdminPendingLink"),
  "Admin sidebar and question workspace navigation must use intent prefetch.",
);

assert(
  questionPage.includes("<AdminPendingLink") &&
    questionPage.includes("pendingLabel={`question ${question.question_code}`}"),
  "Question rows must not viewport-prefetch every detail payload.",
);

assert(
  teacherLoading.includes("Loading Library workspace") &&
    teacherLoading.includes("lg:grid-cols-[1.3fr_0.8fr]"),
  "Teacher Library subroutes must have an immediate shared loading boundary.",
);

console.log("PASS workspace navigation uses intent prefetch and loading boundaries");

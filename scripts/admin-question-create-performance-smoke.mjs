import { readFile } from "node:fs/promises";

const [listPage, createPage] = await Promise.all([
  readFile(new URL("../src/app/admin/questions/page.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/app/admin/questions/new/page.tsx", import.meta.url),
    "utf8",
  ),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  listPage.includes('createHref="/admin/questions/new"') &&
    !listPage.includes('id="create-question-form"') &&
    !listPage.includes("<QuestionHtmlEditor") &&
    !listPage.includes("<QuestionAssetsPanel") &&
    !listPage.includes("<QuestionSourceFilesPanel"),
  "The question list must not mount the heavyweight authoring graph before Create is opened.",
);

assert(
  createPage.includes('id="create-question-form"') &&
    createPage.includes("action={createQuestion}") &&
    createPage.includes("<QuestionHtmlEditor") &&
    createPage.includes("<QuestionAssetsPanel") &&
    createPage.includes("<QuestionSourceFilesPanel") &&
    createPage.includes("private Global Review Draft"),
  "The dedicated create route must preserve authoring, media, source, and Review Draft safety.",
);

console.log("PASS admin question create graph is loaded only on the dedicated route");

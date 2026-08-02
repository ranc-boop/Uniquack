#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const [questionsPage, questionDetailPage, videosPage, videoDetailPage] =
  await Promise.all([
    readFile(resolve(root, "src/app/questions/page.tsx"), "utf8"),
    readFile(resolve(root, "src/app/questions/[id]/page.tsx"), "utf8"),
    readFile(resolve(root, "src/app/videos/page.tsx"), "utf8"),
    readFile(resolve(root, "src/app/videos/[id]/page.tsx"), "utf8"),
  ]);

assert(
  questionsPage.includes("const [taxonomyResult, officialSearchResult] = await Promise.all([") &&
    questionsPage.includes("loadTaxonomyCatalog(supabase)") &&
    questionsPage.includes('"search_official_public_questions_v2"'),
  "Public question Library must overlap taxonomy catalog and search RPC loading.",
);

assert(
  questionDetailPage.includes("const taxonomyCatalogPromise = loadTaxonomyCatalog(supabase);") &&
    questionDetailPage.includes("taxonomyCatalogPromise,") &&
    questionDetailPage.includes('.from("question_assets")'),
  "Public question detail must overlap taxonomy loading with question and related-content reads.",
);

assert(
  videosPage.includes("const [taxonomyResult, difficultyResult, searchResult] = await Promise.all([") &&
    videosPage.includes("difficultyQuestionsPromise") &&
    videosPage.includes("searchQuestionsPromise"),
  "Public video Library must overlap taxonomy and independent question prefilters.",
);

assert(
  videosPage.includes("const [questionsResult, taxonomyAssignmentsResult] = await Promise.all([") &&
    videosPage.includes('.from("question_taxonomy_assignments")'),
  "Public video Library must batch independent related-question and taxonomy reads.",
);

assert(
  videoDetailPage.includes("const taxonomyCatalogPromise = loadTaxonomyCatalog(supabase);") &&
    videoDetailPage.includes("const [questionResult, taxonomyAssignmentsResult, taxonomyResult] =") &&
    videoDetailPage.includes("await Promise.all(["),
  "Public video detail must overlap taxonomy loading and batch question metadata reads.",
);

console.log("PASS public Library loading performance query-shape guard");

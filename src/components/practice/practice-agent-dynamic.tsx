"use client";

import dynamic from "next/dynamic";

import { PracticeInlineLoading } from "@/components/practice/practice-session-scope-panels";

export const FeedbackText = dynamic(
  () => import("@/components/math-content").then((module) => module.FeedbackText),
  { loading: () => null, ssr: false },
);

export const QuestionText = dynamic(
  () => import("@/components/math-content").then((module) => module.QuestionText),
  { loading: () => null, ssr: false },
);

export const PracticeCompletionPanel = dynamic(
  () =>
    import("@/components/practice/practice-completion-panel").then(
      (module) => module.PracticeCompletionPanel,
    ),
  {
    loading: () => <PracticeInlineLoading label="Loading completion report..." />,
    ssr: false,
  },
);

export const PracticeQuestionCard = dynamic(
  () =>
    import("@/components/practice/practice-question-card").then(
      (module) => module.PracticeQuestionCard,
    ),
  {
    loading: () => <PracticeInlineLoading label="Loading question..." />,
    ssr: false,
  },
);

export const PracticeRoundReviewPanel = dynamic(
  () =>
    import("@/components/practice/practice-round-review-panel").then(
      (module) => module.PracticeRoundReviewPanel,
    ),
  {
    loading: () => <PracticeInlineLoading label="Loading round review..." />,
    ssr: false,
  },
);

export const ReadableDataCard = dynamic(
  () =>
    import("@/components/practice/practice-readable-data-card").then(
      (module) => module.ReadableDataCard,
    ),
  {
    loading: () => <PracticeInlineLoading label="Loading study state..." />,
    ssr: false,
  },
);

export const TracePanel = dynamic(
  () => import("@/components/practice/practice-trace-panel").then((module) => module.TracePanel),
  {
    loading: () => <PracticeInlineLoading label="Loading trace..." />,
    ssr: false,
  },
);

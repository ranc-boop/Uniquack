"use client";

import dynamic from "next/dynamic";

import { useLocale } from "@/components/i18n/locale-provider";
import { PracticeInlineLoading } from "@/components/practice/practice-session-scope-panels";
import type { MessageKey } from "@/lib/i18n/messages";

function PracticeDynamicLoading({ messageKey }: { messageKey: MessageKey }) {
  const { t } = useLocale();

  return <PracticeInlineLoading label={t(messageKey)} />;
}

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
    loading: () => <PracticeDynamicLoading messageKey="practice.loadingCompletion" />,
    ssr: false,
  },
);

export const PracticeQuestionCard = dynamic(
  () =>
    import("@/components/practice/practice-question-card").then(
      (module) => module.PracticeQuestionCard,
    ),
  {
    loading: () => <PracticeDynamicLoading messageKey="practice.loadingQuestion" />,
    ssr: false,
  },
);

export const PracticeRoundReviewPanel = dynamic(
  () =>
    import("@/components/practice/practice-round-review-panel").then(
      (module) => module.PracticeRoundReviewPanel,
    ),
  {
    loading: () => <PracticeDynamicLoading messageKey="practice.loadingRoundReview" />,
    ssr: false,
  },
);

export const ReadableDataCard = dynamic(
  () =>
    import("@/components/practice/practice-readable-data-card").then(
      (module) => module.ReadableDataCard,
    ),
  {
    loading: () => <PracticeDynamicLoading messageKey="practice.loadingStudyState" />,
    ssr: false,
  },
);

export const TracePanel = dynamic(
  () => import("@/components/practice/practice-trace-panel").then((module) => module.TracePanel),
  {
    loading: () => <PracticeDynamicLoading messageKey="practice.loadingTrace" />,
    ssr: false,
  },
);

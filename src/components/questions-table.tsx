import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toDangerousHtml } from "@/lib/sanitize/html";

type QuestionRow = {
  id: string;
  question_code: string;
  title: string;
  content_html: string;
  difficulty_rating: number;
  status: string;
};

type QuestionsTableProps = {
  questions: QuestionRow[];
  tagsByQuestionId: Record<string, string[]>;
};

function ClickableCell({
  href,
  label,
  children,
  className = "",
}: {
  href: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableCell className={`relative ${className}`}>
      <Link
        href={href}
        prefetch={false}
        aria-label={label}
        className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      <div className="relative z-0">{children}</div>
    </TableCell>
  );
}

export function QuestionsTable({
  questions,
  tagsByQuestionId,
}: QuestionsTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Content</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((question) => {
            const href = `/questions/${question.id}`;
            const label = `Open question ${question.question_code} ${question.title}`;

            return (
              <TableRow
                key={question.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <ClickableCell href={href} label={label} className="font-mono text-xs">
                  {question.question_code}
                </ClickableCell>
                <ClickableCell href={href} label={label} className="font-medium">
                  {question.title}
                </ClickableCell>
                <ClickableCell href={href} label={label} className="max-w-md">
                  <div
                    className="rich-html rich-html--compact pointer-events-none line-clamp-3 text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={toDangerousHtml(question.content_html)}
                  />
                </ClickableCell>
                <ClickableCell href={href} label={label}>
                  <div className="flex flex-wrap gap-1">
                    {(tagsByQuestionId[question.id] ?? []).map((tagName) => (
                      <Badge key={tagName} variant="outline">
                        {tagName}
                      </Badge>
                    ))}
                  </div>
                </ClickableCell>
                <ClickableCell href={href} label={label}>
                  {question.difficulty_rating}
                </ClickableCell>
                <ClickableCell href={href} label={label}>
                  <Badge variant="secondary">{question.status}</Badge>
                </ClickableCell>
                <ClickableCell href={href} label={label}>
                  <Badge variant="outline">Open</Badge>
                </ClickableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

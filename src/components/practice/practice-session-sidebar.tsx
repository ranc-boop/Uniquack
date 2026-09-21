"use client";

import {
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  FeedbackText,
} from "@/components/practice/practice-agent-dynamic";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  PracticeInlineLoading,
  PracticeSessionListLoading,
} from "@/components/practice/practice-session-scope-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { PRACTICE_INPUT_LIMITS } from "@/lib/practice/request-validation";
import type { PracticeSessionListItem } from "@/lib/practice/types";

type PracticeSessionSidebarProps = {
  activeSessionId?: string | null;
  isCollapsed: boolean;
  isPending: boolean;
  sessionHistoryHasMore: boolean;
  sessionHistoryLoading: boolean;
  sessionHistoryLoadingMore: boolean;
  sessions: PracticeSessionListItem[];
  renamingSessionId: string | null;
  renameValue: string;
  preferenceLoading: boolean;
  memoryEditing: boolean;
  longTermMemory: string;
  longTermMemoryDraft: string;
  onBeginRename: (session: PracticeSessionListItem) => void;
  onCancelRename: () => void;
  onClearLongTermMemory: () => void;
  onCollapse: () => void;
  onCreateNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onExpand: () => void;
  onLoadMore: () => void;
  onPrefetchSession: (sessionId: string) => void;
  onResetPracticeProgress: () => void;
  onRenameValueChange: (value: string) => void;
  onResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSaveLongTermMemory: () => void;
  onSetMemoryEditing: (editing: boolean) => void;
  onSetLongTermMemoryDraft: (value: string) => void;
  onSubmitRename: (sessionId: string) => void;
  onSwitchSession: (sessionId: string) => void;
};

function SidebarIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden="true" className="size-4" />;
}

export function PracticeSessionSidebar({
  activeSessionId,
  isCollapsed,
  isPending,
  sessionHistoryHasMore,
  sessionHistoryLoading,
  sessionHistoryLoadingMore,
  sessions,
  renamingSessionId,
  renameValue,
  preferenceLoading,
  memoryEditing,
  longTermMemory,
  longTermMemoryDraft,
  onBeginRename,
  onCancelRename,
  onClearLongTermMemory,
  onCollapse,
  onCreateNewSession,
  onDeleteSession,
  onExpand,
  onLoadMore,
  onPrefetchSession,
  onResetPracticeProgress,
  onRenameValueChange,
  onResize,
  onSaveLongTermMemory,
  onSetMemoryEditing,
  onSetLongTermMemoryDraft,
  onSubmitRename,
  onSwitchSession,
}: PracticeSessionSidebarProps) {
  const { t } = useLocale();

  return (
    <aside className="relative transition-all duration-300 xl:sticky xl:top-20 xl:h-[calc(100vh-5rem)] xl:overflow-y-auto">
      {!isCollapsed ? (
        <button
          aria-label={t("practice.resizeSessionsSidebar")}
          className="student-focus-ring group absolute -right-2 top-0 z-40 hidden h-full w-4 cursor-col-resize rounded-full bg-transparent xl:block"
          onPointerDown={onResize}
          type="button"
        >
          <span className="absolute left-1/2 top-4 h-[calc(100%-2rem)] w-px -translate-x-1/2 rounded-full bg-slate-200 transition-all duration-200 group-hover:w-1 group-hover:bg-sky-400 group-active:w-1 group-active:bg-sky-600" />
          <span className="absolute left-1/2 top-1/2 h-12 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100" />
        </button>
      ) : null}
      {isCollapsed ? (
        <div className="hidden h-full min-h-64 flex-col items-center border-r border-slate-200 bg-slate-50/80 px-2 py-5 xl:flex">
          <Button
            aria-label={t("practice.expandSessionsSidebar")}
            className="size-10 rounded-xl bg-slate-200/70 text-slate-900 hover:bg-slate-200"
            onClick={onExpand}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
          </Button>
          <div className="mt-8 flex flex-col items-center gap-4">
            <Button
              aria-label={t("practice.newSession")}
              className="size-10"
              disabled={isPending}
              onClick={onCreateNewSession}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus className="size-5" aria-hidden="true" />
            </Button>
            <Button
              aria-label={t("practice.showSessions")}
              className="size-10"
              onClick={onExpand}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </Button>
          </div>
          <div className="mt-auto flex size-9 items-center justify-center rounded-full bg-slate-400 text-xs font-bold text-white">
            O2
          </div>
        </div>
      ) : (
        <div className="flex min-h-full flex-col border-r border-slate-200 bg-slate-50/80 px-4 py-6">
          <section>
            <div className="sticky top-3 z-30 mb-9 bg-slate-50/95 pb-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">{t("practice.sessions")}</h2>
                <Button
                  aria-label={t("practice.collapseSessionsSidebar")}
                  className="hidden size-9 shrink-0 rounded-xl bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200 xl:inline-flex"
                  onClick={onCollapse}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronsLeft className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="space-y-8">
              <button
                className="student-focus-ring group flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 text-left ring-1 ring-slate-200/80 transition-all duration-200 hover:bg-sky-50 hover:ring-sky-200"
                disabled={isPending}
                onClick={onCreateNewSession}
                type="button"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sky-600 text-white shadow-sm shadow-sky-950/10 transition-colors group-hover:bg-sky-700">
                  <Plus className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{t("practice.newSession")}</span>
                </span>
              </button>
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm font-bold text-slate-950">{t("practice.recent")}</p>
                  <span className="ml-3 h-px flex-1 bg-slate-100" />
                </div>
                <div className="space-y-1" data-testid="practice-session-list">
                  {sessionHistoryLoading ? (
                    <PracticeSessionListLoading />
                  ) : sessions.length ? sessions.map((item) => (
                    <div
                      key={item.id}
                      className={`group flex items-center gap-1 rounded-xl pr-1 transition-all duration-200 ${
                        activeSessionId === item.id
                          ? "bg-white shadow-sm ring-1 ring-slate-200"
                          : "bg-transparent hover:bg-slate-50"
                      }`}
                    >
                      <button
                        aria-current={activeSessionId === item.id ? "true" : undefined}
                        className="student-focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left"
                        data-session-active={activeSessionId === item.id ? "yes" : "no"}
                        data-testid="practice-session-item"
                        onFocus={() => onPrefetchSession(item.id)}
                        onMouseEnter={() => onPrefetchSession(item.id)}
                        onClick={() => onSwitchSession(item.id)}
                        type="button"
                      >
                        <span
                          className={`h-7 w-1 shrink-0 rounded-full ${
                            activeSessionId === item.id ? "bg-sky-600" : "bg-slate-200 group-hover:bg-sky-300"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          {renamingSessionId === item.id ? (
                            <Input
                              autoFocus
                              className="h-8 border-sky-200 bg-white text-sm font-bold"
                              maxLength={PRACTICE_INPUT_LIMITS.SESSION_TITLE_CHARS}
                              onBlur={() => onSubmitRename(item.id)}
                              onChange={(event) => onRenameValueChange(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  onSubmitRename(item.id);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  onCancelRename();
                                }
                              }}
                              value={renameValue}
                            />
                          ) : (
                            <span className="block truncate text-sm font-bold text-slate-900">{item.title}</span>
                          )}
                        </span>
                      </button>
                      {activeSessionId === item.id ? (
                        <span className="size-2 rounded-full bg-sky-600" aria-label={t("practice.currentSession")} />
                      ) : null}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            aria-label={t("practice.sessionActions", { title: item.title })}
                            className="size-8 shrink-0 text-slate-500 opacity-70 hover:text-slate-900 group-hover:opacity-100"
                            disabled={isPending}
                            onClick={(event) => event.stopPropagation()}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1">
                          <Button
                            className="h-9 w-full justify-start px-2 text-slate-700"
                            disabled={isPending}
                            onClick={() => onBeginRename(item)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <SidebarIcon icon={Pencil} />
                            {t("practice.renameSession")}
                          </Button>
                          <Button
                            className="h-9 w-full justify-start px-2 text-destructive hover:text-destructive"
                            disabled={isPending}
                            onClick={() => onDeleteSession(item.id)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <SidebarIcon icon={Trash2} />
                            {t("common.delete")}
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                      {t("practice.noSavedSessions")}
                    </div>
                  )}
                </div>
                {sessionHistoryHasMore ? (
                  <Button
                    className="mt-2 w-full"
                    disabled={isPending || sessionHistoryLoadingMore}
                    onClick={onLoadMore}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {sessionHistoryLoadingMore ? t("practice.loadingMore") : t("practice.loadMoreSessions")}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
          <div className="mt-auto space-y-3">
            <details className="rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-200/70">
              <summary className="cursor-pointer text-sm font-bold text-slate-900">{t("practice.cycle")}</summary>
              <div className="mt-3 space-y-3">
                <p>{t("practice.cycleDescription")}</p>
                <Button
                  className="w-full justify-start"
                  disabled={isPending}
                  onClick={onResetPracticeProgress}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {t("practice.allAgain")}
                </Button>
              </div>
            </details>
            <details className="rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-200/70">
              <summary className="cursor-pointer text-sm font-bold text-slate-900">{t("practice.longTermMemory")}</summary>
              <div className="mt-3 space-y-2">
                {preferenceLoading ? (
                  <PracticeInlineLoading label={t("practice.loadingMemory")} />
                ) : memoryEditing ? (
                  <Textarea
                    className="min-h-28 bg-white text-xs"
                    maxLength={PRACTICE_INPUT_LIMITS.SESSION_MEMORY_CHARS}
                    onChange={(event) => onSetLongTermMemoryDraft(event.target.value)}
                    value={longTermMemoryDraft}
                  />
                ) : longTermMemory.trim() ? (
                  <FeedbackText className="border-none bg-transparent p-0 text-xs leading-5 text-slate-600" compact value={longTermMemory} />
                ) : (
                  <p className="text-slate-500">
                    {t("practice.memoryEmpty")}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {memoryEditing ? (
                    <>
                      <Button disabled={isPending} onClick={onSaveLongTermMemory} size="sm" type="button" variant="secondary">{t("common.save")}</Button>
                      <Button disabled={isPending} onClick={() => { onSetMemoryEditing(false); onSetLongTermMemoryDraft(longTermMemory); }} size="sm" type="button" variant="outline">{t("common.cancel")}</Button>
                    </>
                  ) : (
                    <Button disabled={isPending} onClick={() => onSetMemoryEditing(true)} size="sm" type="button" variant="outline">{t("common.edit")}</Button>
                  )}
                  <Button disabled={isPending || !longTermMemory.trim()} onClick={onClearLongTermMemory} size="sm" type="button" variant="ghost">{t("practice.clearMemory")}</Button>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
    </aside>
  );
}

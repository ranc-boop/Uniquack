"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type PracticeWorkspaceErrorBoundaryProps = {
  children: ReactNode;
};

type PracticeWorkspaceErrorBoundaryState = {
  hasError: boolean;
};

export class PracticeWorkspaceErrorBoundary extends Component<
  PracticeWorkspaceErrorBoundaryProps,
  PracticeWorkspaceErrorBoundaryState
> {
  state: PracticeWorkspaceErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Route-level failures are rendered below. Do not expose session content,
    // provider output, or stack traces in the learner workspace.
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section
        aria-live="assertive"
        className="mx-auto flex min-h-72 max-w-xl flex-col items-start justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        role="alert"
      >
        <div>
          <h1 className="text-xl font-semibold text-slate-950">Practice is still safe</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This workspace could not finish rendering. Your saved sessions and submitted work have not been removed.
          </p>
        </div>
        <Button
          onClick={() => {
            this.setState({ hasError: false });
            window.location.reload();
          }}
          type="button"
        >
          <RefreshCw className="mr-2 size-4" aria-hidden="true" />
          Reload practice
        </Button>
      </section>
    );
  }
}

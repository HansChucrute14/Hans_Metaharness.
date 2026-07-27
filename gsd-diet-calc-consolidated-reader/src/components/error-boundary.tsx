"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

/**
 * ErrorBoundary
 *
 * Catches render errors anywhere in its children subtree and shows a friendly
 * fallback instead of a blank white screen. Used at three levels:
 *   1. Top-level (page.tsx) — catches anything that escapes the reader.
 *   2. Around <MarkdownRenderer /> — a single bad markdown block only kills
 *      the prose area; sidebar / graph / search keep working.
 *   3. Around <DependencyGraphDialog /> — a graph render error doesn't
 *      kill the reader.
 *
 * Why a class component: React's error-boundary API requires
 * `getDerivedStateFromError` + `componentDidCatch`, which only work in classes.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label shown in the fallback to help the user locate the failure. */
  label?: string;
  /** Optional custom fallback. If omitted, the default fallback is used. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called when the user clicks "Retry". Defaults to resetting error state. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console — preserves the pre-boundary behavior of surfacing errors
    // in dev tools while keeping the UI interactive.
    console.error("[ErrorBoundary]", this.props.label ?? "unknown", error, info);
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const label = this.props.label ?? "this section";
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex flex-col items-center justify-center gap-3 p-8 m-2 border border-rose-300/70 dark:border-rose-800/60 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 text-center"
      >
        <AlertTriangle className="h-7 w-7 text-rose-600 dark:text-rose-400" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            Failed to render {label}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono break-all max-w-md">
            {error.message || String(error)}
          </p>
        </div>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                window.location.href = "/";
              } catch {
                /* noop */
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
          >
            <Home className="h-3.5 w-3.5" />
            Go home
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;

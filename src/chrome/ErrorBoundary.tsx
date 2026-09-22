import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, Check, Copy, RefreshCw } from "./icons";

export type ErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  compact?: boolean;
  onReset?: () => void;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    // Diagnostic log in development / console
    console.error("[ErrorBoundary caught error]:", error, errorInfo);
  }

  componentWillUnmount(): void {
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
    }
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
    });
    this.props.onReset?.();
  };

  private toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  private copyDetails = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const payload = [
      `Error: ${error.name}: ${error.message}`,
      error.stack ? `\nStack:\n${error.stack}` : "",
      errorInfo?.componentStack
        ? `\nComponent Stack:\n${errorInfo.componentStack}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      }
      this.setState({ copied: true });
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.setState({ copied: false });
      }, 2000);
    } catch {
      // Ignore clipboard write failures in restricted environments
    }
  };

  render(): ReactNode {
    const { hasError, error, showDetails, copied } = this.state;
    const { children, fallback, title, description, compact } = this.props;

    if (!hasError || !error) {
      return children;
    }

    if (fallback) {
      return fallback({ error, reset: this.reset });
    }

    const heading = title ?? "Something went wrong";
    const subtext =
      description ?? error.message ?? "An unexpected rendering error occurred.";

    if (compact) {
      return (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span className="truncate font-medium">{subtext}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={this.copyDetails}
              title={copied ? "Copied diagnostic" : "Copy error details"}
              className="rounded p-1 hover:bg-rose-500/20 text-rose-300 transition-colors"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-xs font-medium hover:bg-rose-500/30 text-rose-100 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className="flex h-full min-h-[160px] w-full flex-col items-center justify-center p-6 text-center"
      >
        <div className="flex max-w-lg flex-col items-center gap-4 rounded-xl border border-white/10 bg-neutral-900/60 p-6 shadow-xl backdrop-blur">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="h-6 w-6" />
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-base font-semibold text-neutral-100">
              {heading}
            </h3>
            <p className="text-xs text-neutral-400 line-clamp-3 select-text">
              {subtext}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={this.reset}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3.5 py-1.5 text-xs font-medium text-neutral-900 shadow-sm transition hover:bg-white active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>

            <button
              type="button"
              onClick={this.copyDetails}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:bg-white/10 active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-neutral-400" />
                  Copy details
                </>
              )}
            </button>

            <button
              type="button"
              onClick={this.toggleDetails}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-400 transition hover:text-neutral-200"
            >
              {showDetails ? "Hide stack" : "View stack"}
            </button>
          </div>

          {showDetails && (
            <div className="mt-2 w-full max-h-48 overflow-auto rounded-lg border border-white/5 bg-black/40 p-3 text-left font-mono text-[11px] leading-relaxed text-neutral-400 select-text">
              <div className="text-rose-400 font-semibold mb-1">
                {error.name}: {error.message}
              </div>
              {error.stack && (
                <pre className="whitespace-pre-wrap">{error.stack}</pre>
              )}
              {this.state.errorInfo?.componentStack && (
                <pre className="mt-2 text-neutral-500 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}

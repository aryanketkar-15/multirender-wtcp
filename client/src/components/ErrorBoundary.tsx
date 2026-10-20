/**
 * ErrorBoundary — catches render errors and presents a recoverable
 * error state without exposing stack traces to the user.
 *
 * T7.2.3: error states that are specific and recoverable; no raw
 * stack traces reach the user.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 * Or with a custom fallback:
 *   <ErrorBoundary fallback={<p>Something went wrong.</p>}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI. If omitted the default ErrorCard is shown. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  /** Short description safe to show to the user */
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    // Extract a safe message — never include a stack trace
    const message =
      error instanceof Error
        ? error.message.slice(0, 120) // cap at 120 chars; no stack
        : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in development only; never surface to UI
    if (typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : true) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <ErrorCard message={this.state.message} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

/** Standalone recoverable error card — also exported for use without the boundary. */
export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-card" role="alert" aria-live="assertive">
      <div className="error-card-icon" aria-hidden="true">
        {/* Inline alert triangle — no external icon dependency */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      </div>
      <p className="error-card-heading">Something went wrong</p>
      <p className="error-card-message">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="btn secondary btn-sm"
          onClick={onRetry}
          aria-label="Retry the failed operation"
          id="error-retry-btn"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

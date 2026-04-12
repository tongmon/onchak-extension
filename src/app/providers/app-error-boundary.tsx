import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

interface AppErrorBoundaryState {
  errorMessage: string | null;
  errorStack: string | null;
}

export class AppErrorBoundary extends Component<
  PropsWithChildren,
  AppErrorBoundaryState
> {
  public override state: AppErrorBoundaryState = {
    errorMessage: null,
    errorStack: null,
  };

  public static getDerivedStateFromError(error: unknown) {
    return {
      errorMessage:
        error instanceof Error
          ? error.message
          : 'An unexpected extension UI error occurred.',
      errorStack: error instanceof Error ? error.stack ?? null : null,
    };
  }

  public override componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error('Extension UI crashed.', error, errorInfo);
  }

  public override render(): ReactNode {
    if (this.state.errorMessage) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            color: '#0f172a',
          }}
        >
          <div
            style={{
              border: '1px solid rgba(239, 68, 68, 0.28)',
              borderRadius: 16,
              background: 'rgba(254, 242, 242, 0.95)',
              padding: 16,
              boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#b91c1c',
                marginBottom: 8,
              }}
            >
              UI rendering failed
            </div>

            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
              {this.state.errorMessage}
            </div>

            <div
              style={{
                fontSize: 13,
                color: '#475569',
                lineHeight: 1.5,
                marginBottom: 16,
              }}
            >
              Reload the extension page after updating the build. The runtime
              error was also written to the console.
            </div>

            {this.state.errorStack ? (
              <pre
                style={{
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  borderRadius: 12,
                  padding: 12,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: 12,
                  lineHeight: 1.5,
                  margin: '0 0 16px',
                }}
              >
                {this.state.errorStack}
              </pre>
            ) : null}

            <button
              onClick={() => {
                window.location.reload();
              }}
              style={{
                appearance: 'none',
                border: '1px solid rgba(15, 23, 42, 0.12)',
                borderRadius: 999,
                background: '#ffffff',
                color: '#0f172a',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 16px',
              }}
              type="button"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

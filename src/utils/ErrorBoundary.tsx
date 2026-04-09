/**
 * ErrorBoundary.tsx — React Error Boundary
 *
 * WHY error boundary:
 *   Tanpa ini, satu bug di komponen apapun = seluruh app blank putih.
 *   Error boundary menangkap error React dan menampilkan fallback UI
 *   yang informatif, termasuk tombol "Reload" dan log error.
 *
 * USAGE:
 *   Wrap komponen yang mungkin crash:
 *   <ErrorBoundary name="LibraryView">
 *     <LibraryView ... />
 *   </ErrorBoundary>
 */

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  name?: string;        // nama komponen untuk debugging
  fallback?: ReactNode; // custom fallback UI
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary:${this.props.name ?? "Unknown"}]`, error, errorInfo);
  }

  reset = () => this.setState({ hasError: false, error: null, errorInfo: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        height: "100%", padding: 40, textAlign: "center",
        fontFamily: "'DM Sans', sans-serif",
        color: "#e2e8f0",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          Terjadi kesalahan di {this.props.name ?? "komponen ini"}
        </h3>
        <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20, maxWidth: 400, lineHeight: 1.6 }}>
          {this.state.error?.message ?? "Unknown error"}
        </p>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={this.reset}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: 12,
              background: "rgba(124,58,237,0.2)", border: "1px solid #7C3AED",
              color: "#a78bfa", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            🔄 Coba Lagi
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: 12,
              background: "transparent", border: "1px solid #3f3f5a",
              color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ↺ Reload App
          </button>
        </div>

        {/* Stack trace (hanya di dev mode) */}
        {import.meta.env.DEV && this.state.errorInfo && (
          <details style={{ marginTop: 20, textAlign: "left", maxWidth: 600 }}>
            <summary style={{ fontSize: 11, color: "#6b7280", cursor: "pointer" }}>
              Stack trace (dev only)
            </summary>
            <pre style={{
              fontSize: 10, color: "#4b5563",
              background: "#1a1a2e", padding: 12, borderRadius: 6,
              overflow: "auto", maxHeight: 200, marginTop: 8,
              fontFamily: "Space Mono, monospace",
            }}>
              {this.state.error?.stack}
              {"\n---\n"}
              {this.state.errorInfo.componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

/**
 * HOC: wrap komponen dengan ErrorBoundary
 * Usage: const SafeLibrary = withErrorBoundary(LibraryView, "Library")
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  name: string
) {
  return function WithBoundary(props: P) {
    return (
      <ErrorBoundary name={name}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          lang="ar"
          className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8 text-center"
          data-testid="error-boundary-fallback"
        >
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-bold text-destructive">
            {this.props.fallbackLabel ?? "حدث خطأ غير متوقع"}
          </h2>
          {this.state.error && (
            <pre className="text-xs text-muted-foreground bg-muted rounded p-3 max-w-lg overflow-auto text-right whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          )}
          <Button variant="outline" onClick={this.handleReset} data-testid="button-error-reset">
            إعادة المحاولة
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

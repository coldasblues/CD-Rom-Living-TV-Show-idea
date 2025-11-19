import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[100] bg-black text-red-600 font-mono p-4 flex flex-col items-center justify-center">
            <div className="border-4 border-red-600 p-8 max-w-3xl w-full bg-red-950/10 shadow-[0_0_50px_rgba(220,38,38,0.2)]">
              <h1 className="text-6xl mb-4 font-bold tracking-widest animate-pulse text-center">FATAL ERROR</h1>
              <div className="h-px w-full bg-red-600 mb-8"></div>
              
              <p className="text-xl mb-4 text-red-400 uppercase tracking-wider text-center">System process terminated unexpectedly</p>
              
              <div className="bg-black p-4 border border-red-900 rounded text-left mb-8 max-h-96 overflow-y-auto font-mono text-sm">
                <p className="font-bold mb-2 text-red-300">{this.state.error?.toString()}</p>
                <pre className="text-xs text-red-500/60 whitespace-pre-wrap">
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>

              <div className="text-center">
                <button 
                    onClick={() => window.location.reload()} 
                    className="border-2 border-red-600 text-red-600 px-8 py-3 hover:bg-red-600 hover:text-black transition-colors uppercase tracking-[0.2em] font-bold text-lg"
                >
                    HARD REBOOT
                </button>
              </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Safety App ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 bg-blue-600/20 border border-blue-500/40 rounded-3xl flex items-center justify-center text-3xl mb-4 shadow-lg shadow-blue-600/20">
            🛡️
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Safety — Initialisation</h1>
          <p className="text-sm text-slate-400 max-w-sm mb-6">
            Cliquez pour charger la carte en direct.
          </p>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                try {
                  localStorage.removeItem('safety_local_incidents_v2');
                } catch {}
                window.location.reload();
              }
            }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold rounded-2xl shadow-lg transition-all"
          >
            Actualiser Safety
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

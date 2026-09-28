import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class MapErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Erreur cartographique' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[SafetyMapEngine] ErrorBoundary caught error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 w-full h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center z-10">
          <div className="w-14 h-14 bg-blue-600/20 border border-blue-500/40 rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-xl">
            🗺️
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Moteur Cartographique Safety</h2>
          <p className="text-xs text-slate-400 max-w-xs mb-5">
            La carte rencontre momentanément un problème d'initialisation WebGL.
          </p>
          <button
            onClick={this.handleRetry}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-lg transition-all"
          >
            Réessayer
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

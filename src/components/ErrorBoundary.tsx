import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF8F3] flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl bg-white border border-[#E8E4D9] p-6 space-y-4">
            <h2 className="text-lg font-extrabold text-[#111111]">Database / Application Error</h2>
            <pre className="p-3 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD] text-xs overflow-x-auto text-rose-700 whitespace-pre-wrap">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-full bg-[#FACC15] text-[#111111] text-xs font-bold cursor-pointer"
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

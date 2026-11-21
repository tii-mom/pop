import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || '页面发生未知异常',
    };
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-pop-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-pop-border bg-pop-card p-6 text-center space-y-4">
          <img
            src="/assets/fruit-edition/brand/pop.png"
            alt="POP 果实"
            className="w-12 h-12 mx-auto rounded-xl border border-pop-border object-cover"
          />
          <div className="space-y-1">
            <h1 className="text-base font-bold text-white">页面加载遇到问题</h1>
            <p className="text-xs text-gray-400 break-words">{this.state.message}</p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="w-full rounded-xl bg-pop-lime text-black font-bold py-2.5 text-xs hover:brightness-95 transition"
          >
            刷新恢复
          </button>
        </div>
      </div>
    );
  }
}

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  error?: Error;
}

/** Per-route boundary. Reset by giving it `key={location.pathname}` from the parent. */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route error:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('chunk') ||
        this.state.error?.message?.includes('Loading') ||
        this.state.error?.name === 'ChunkLoadError';
      return (
        <div className="h-full flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold mb-2">{isChunkError ? '加载失败' : '页面出错'}</h1>
            <p className="text-sm text-muted-foreground mb-4">
              {isChunkError ? '可能是网络抖动或开发服务器更新了代码。' : this.state.error?.message || '页面发生未知错误'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={this.reset}>
                <RefreshCw className="w-3.5 h-3.5" /> 重试
              </Button>
              <Button onClick={() => location.reload()}>刷新页面</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Button, Result, Typography } from 'antd';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { pushDebugLog } from './debug-panel';

const { Paragraph } = Typography;

type Props = { children: ReactNode };

type State = { err: Error | null; info: ErrorInfo | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { err: null, info: null };
  }

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    this.setState({ info });
    pushDebugLog({
      kind: 'error',
      message: err.message,
      detail: `${err.stack ?? ''}\n${info.componentStack ?? ''}`,
    });
  }

  render(): ReactNode {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, background: '#101015', minHeight: '100vh' }}>
          <Result
            status="error"
            title="界面渲染出错"
            subTitle={this.state.err.message}
            extra={
              <Button type="primary" onClick={() => window.location.reload()}>
                重新加载
              </Button>
            }
          >
            <Paragraph style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', color: '#aaa' }}>
              {this.state.err.stack}
            </Paragraph>
          </Result>
        </div>
      );
    }
    return this.props.children;
  }
}

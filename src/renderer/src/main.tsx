import './monaco-setup';
import './bootstrap-crApi';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import App from './App';
import { ErrorBoundary } from './components/debug/error-boundary';
import { DebugPanel, installGlobalErrorHooks } from './components/debug/debug-panel';

/** Ant Design 5：官方 reset 在 es/style，勿使用已移除的 antd/dist/reset.css（会导致白屏） */
import 'antd/es/style/reset.css';

installGlobalErrorHooks();

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<p style="padding:24px;color:#c00">#root 缺失</p>';
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: { borderRadius: 6 },
        }}
      >
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <DebugPanel />
      </ConfigProvider>
    </React.StrictMode>
  );
}

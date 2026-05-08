import { Button, Collapse, Tag, Typography } from 'antd';
import { BugOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';

const { Paragraph } = Typography;
const AntText = Typography.Text;

export type DebugLogEntry = {
  t: string;
  kind: 'log' | 'error' | 'unhandled';
  message: string;
  detail?: string;
};

let globalLogs: DebugLogEntry[] = [];
const listeners = new Set<() => void>();

export function pushDebugLog(entry: Omit<DebugLogEntry, 't'>): void {
  globalLogs = [...globalLogs.slice(-200), { ...entry, t: new Date().toISOString() }];
  listeners.forEach((l) => l());
}

export function installGlobalErrorHooks(): void {
  window.addEventListener('error', (ev) => {
    pushDebugLog({
      kind: 'error',
      message: ev.message || 'error',
      detail: ev.filename ? `${ev.filename}:${ev.lineno}` : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    pushDebugLog({
      kind: 'unhandled',
      message: r instanceof Error ? r.message : String(r),
      detail: r instanceof Error ? r.stack : undefined,
    });
  });
}

export function DebugPanel(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => {
    const fn = (): void => bump((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const copyAll = useCallback(() => {
    const text = JSON.stringify(
      {
        crApi: typeof window.crApi !== 'undefined',
        href: window.location.href,
        logs: globalLogs,
      },
      null,
      2
    );
    void navigator.clipboard.writeText(text);
  }, []);

  const crOk = typeof window.crApi !== 'undefined';

  return (
    <>
      <Button
        type="primary"
        shape="circle"
        icon={<BugOutlined />}
        title="调试面板"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 10000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      />
      {open ? (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 64,
            width: 420,
            maxHeight: '70vh',
            overflow: 'auto',
            zIndex: 9999,
            padding: 12,
            background: '#141414',
            border: '1px solid #303030',
            borderRadius: 8,
            boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <AntText strong style={{ color: '#fff' }}>
              调试
            </AntText>
            <Button size="small" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </div>
          <Paragraph style={{ marginBottom: 8 }}>
            <Tag color={crOk ? 'success' : 'error'}>preload / crApi</Tag>
            <AntText type="secondary" style={{ fontSize: 12 }}>
              {crOk ? '已注入' : '未注入 — 检查 preload 路径与白屏'}
            </AntText>
          </Paragraph>
          <Paragraph copyable style={{ fontSize: 11, wordBreak: 'break-all', marginBottom: 8 }}>
            {window.location.href}
          </Paragraph>
          <Button size="small" block style={{ marginBottom: 8 }} onClick={copyAll}>
            复制环境与日志
          </Button>
          <Collapse
            size="small"
            items={[
              {
                key: 'logs',
                label: `最近日志 (${globalLogs.length})`,
                children: (
                  <pre
                    style={{
                      fontSize: 10,
                      maxHeight: 240,
                      overflow: 'auto',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      color: '#ccc',
                    }}
                  >
                    {globalLogs.length === 0
                      ? '暂无'
                      : globalLogs
                          .map((l) => `[${l.t}] ${l.kind}: ${l.message}${l.detail ? `\n${l.detail}` : ''}`)
                          .join('\n\n')}
                  </pre>
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </>
  );
}

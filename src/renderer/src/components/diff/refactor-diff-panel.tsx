import { DiffEditor, Editor } from '@monaco-editor/react';
import { Alert, Col, Row, Spin, Tag, Typography } from 'antd';
import type { RefactorFileStatus } from '../../../../shared/ipc-types';
import { FILE_STATUS_LABELS, phaseDisplayLabel } from '../../constants/refactor-ui';

const { Paragraph } = Typography;
const AntText = Typography.Text;

const RUNNING: RefactorFileStatus[] = ['refactoring', 're_refactoring'];
const PENDING: RefactorFileStatus[] = ['generated_pending', 'regenerated_pending'];

const PLACEHOLDER_RIGHT = `// 尚无成功的生成快照。\n// 点击顶部「开始重构」生成 React/TSX；完成后此处将显示对比结果。\n`;

type Props = {
  /** 当前选中的工程内相对路径，用于左侧语言高亮 */
  sourcePath?: string | null;
  original: string;
  modified: string;
  /** 是否存在可读的最新成功生成物（为 false 时右侧为占位说明，不做 Diff 噪声对比） */
  hasGeneratedSnapshot: boolean;
  previewVersionNo?: number | null;
  diffLoading?: boolean;
  displayStatus?: RefactorFileStatus | null;
  taskPhase?: string | null;
  taskMessage?: string | null;
};

function inferOriginalLanguage(path: string | null | undefined): string {
  if (!path) return 'html';
  const p = path.toLowerCase();
  if (p.endsWith('.vue')) return 'html';
  return 'typescript';
}

export function RefactorDiffPanel({
  sourcePath,
  original,
  modified,
  hasGeneratedSnapshot,
  previewVersionNo,
  diffLoading,
  displayStatus,
  taskPhase,
  taskMessage,
}: Props): JSX.Element {
  const hasSource = original.length > 0;
  const st = displayStatus ?? undefined;
  const isRunning = st != null && RUNNING.includes(st);
  const isPending = st != null && PENDING.includes(st);
  const isFailed = st === 'failed';

  const showLiveRail =
    Boolean(diffLoading) ||
    Boolean(taskPhase || taskMessage) ||
    isRunning ||
    isPending ||
    isFailed;

  let alertType: 'info' | 'success' | 'warning' | 'error' = 'info';
  if (isFailed) alertType = 'error';
  else if (isPending) alertType = 'warning';
  else if (!isRunning && hasSource && hasGeneratedSnapshot && st === 'confirmed') alertType = 'success';

  const headline =
    diffLoading && !taskPhase
      ? '加载预览'
      : taskPhase
        ? phaseDisplayLabel(taskPhase)
        : isRunning
          ? '重构进行中'
          : isPending
            ? '生成结果待确认'
            : st === 'failed'
              ? '上一次生成失败'
              : st === 'confirmed'
                ? '当前版本已确认'
                : '状态';

  const detail =
    taskMessage ??
    (diffLoading
      ? '正在读取磁盘上的 Vue 源码与生成快照…'
      : isRunning
        ? '模型处理中，阶段进度见下方日志。完成后将自动刷新。'
        : isPending
          ? '请在右侧进行采纳或拒绝。'
          : st === 'failed'
            ? '可查看任务日志或重试本次重构。'
            : undefined);

  let body: JSX.Element;

  if (!hasSource) {
    body = (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 320,
          padding: 24,
          gap: 12,
        }}
      >
        {showLiveRail ? (
          <>
            <Spin size="large" />
            <Paragraph style={{ marginBottom: 0, textAlign: 'center', maxWidth: 420 }}>
              {taskPhase
                ? `${phaseDisplayLabel(taskPhase)}${taskMessage ? ` · ${taskMessage}` : ''}`
                : diffLoading
                  ? '正在加载…'
                  : isRunning
                    ? '重构进行中，请稍候…'
                    : '准备中…'}
            </Paragraph>
            {st != null ? (
              <Tag color={isRunning ? 'processing' : isPending ? 'warning' : 'default'}>
                {FILE_STATUS_LABELS[st]}
              </Tag>
            ) : null}
          </>
        ) : (
          <AntText type="secondary">在左侧目录选择任意 .vue 文件，可在此预览源码与生成结果。</AntText>
        )}
      </div>
    );
  } else if (hasGeneratedSnapshot) {
    body = (
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AntText strong>前后对比</AntText>
          {previewVersionNo != null ? <Tag>生成快照 v{previewVersionNo}</Tag> : null}
          <AntText type="secondary" style={{ fontSize: 12 }}>
            左：Vue 源码 · 右：最新成功生成的 TSX
          </AntText>
        </div>
        <div style={{ height: 440, minHeight: 440, border: '1px solid #303030' }}>
          <DiffEditor
            height={440}
            originalLanguage={inferOriginalLanguage(sourcePath ?? null)}
            modifiedLanguage="typescript"
            original={original}
            modified={modified}
            options={{
              readOnly: true,
              renderSideBySide: true,
            }}
            theme="vs-dark"
          />
        </div>
      </div>
    );
  } else {
    body = (
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AntText strong>代码预览</AntText>
          <AntText type="secondary" style={{ fontSize: 12 }}>
            左：当前磁盘上的 Vue · 右：生成物（尚未有成功快照时仅作说明）
          </AntText>
        </div>
        <Row gutter={[12, 12]}>
          <Col xs={24} lg={12}>
            <AntText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Vue 源码
            </AntText>
            <div style={{ border: '1px solid #303030', borderRadius: 4, overflow: 'hidden' }}>
              <Editor
                height={400}
                language={inferOriginalLanguage(sourcePath ?? null)}
                value={original}
                theme="vs-dark"
                options={{ readOnly: true, minimap: { enabled: true }, fontSize: 13 }}
              />
            </div>
          </Col>
          <Col xs={24} lg={12}>
            <AntText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              生成预览（TSX）
            </AntText>
            <div style={{ border: '1px solid #303030', borderRadius: 4, overflow: 'hidden' }}>
              <Editor
                height={400}
                language="typescript"
                value={PLACEHOLDER_RIGHT}
                theme="vs-dark"
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
              />
            </div>
          </Col>
        </Row>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 360 }}>
      {showLiveRail ? (
        <Alert
          type={alertType}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{headline}</strong>
              {st != null ? (
                <Tag color={isRunning ? 'processing' : isPending ? 'warning' : 'default'}>
                  {FILE_STATUS_LABELS[st]}
                </Tag>
              ) : null}
            </span>
          }
          description={detail}
        />
      ) : null}

      <Spin spinning={Boolean(diffLoading)} tip={diffLoading ? '正在加载预览…' : undefined}>
        <div style={{ position: 'relative' }}>{body}</div>
      </Spin>
    </div>
  );
}

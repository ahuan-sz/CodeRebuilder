import { Button, Input, Space, message } from 'antd';
import { useState } from 'react';
import type { RefactorFileStatus } from '../../../../shared/ipc-types';
import type { MigrationSkillId } from '../../../../shared/migration-skills';

const { TextArea } = Input;

type Props = {
  projectId: string;
  sourceFilePath: string;
  versionNo: number | null;
  status: RefactorFileStatus | null;
  onDone: () => void;
  disabled?: boolean;
  migrationSkill?: MigrationSkillId;
};

export function ReviewActions({
  projectId,
  sourceFilePath,
  versionNo,
  status,
  onDone,
  disabled,
  migrationSkill,
}: Props): JSX.Element {
  const [append, setAppend] = useState('');
  const [busy, setBusy] = useState(false);

  const canReview =
    !disabled &&
    versionNo != null &&
    (status === 'generated_pending' || status === 'regenerated_pending');

  const canRetry =
    !disabled &&
    (status === 'confirmed' ||
      status === 'generated_pending' ||
      status === 'regenerated_pending' ||
      status === 'failed');

  const accept = async (): Promise<void> => {
    if (!canReview || versionNo == null) return;
    setBusy(true);
    const reviewer =
      typeof navigator !== 'undefined' ? `${navigator.userAgent}`.slice(0, 80) : 'user';
    const res = await window.crApi.confirmVersion({
      projectId,
      sourceFilePath,
      versionNo,
      action: 'accept',
      reviewer,
    });
    setBusy(false);
    if (!res.success) {
      void message.error(res.error.message);
      return;
    }
    void message.success('已采纳并写入 .react 镜像路径');
    onDone();
  };

  const reject = async (): Promise<void> => {
    if (!canReview || versionNo == null) return;
    setBusy(true);
    const res = await window.crApi.confirmVersion({
      projectId,
      sourceFilePath,
      versionNo,
      action: 'reject',
      reviewer: 'local',
    });
    setBusy(false);
    if (!res.success) {
      void message.error(res.error.message);
      return;
    }
    void message.info('已拒绝，保留待确认状态');
    onDone();
  };

  const retry = async (): Promise<void> => {
    setBusy(true);
    const res = await window.crApi.startFile({
      projectId,
      sourceFilePath,
      appendPrompt: append.trim() || undefined,
      migrationSkill,
    });
    setBusy(false);
    if (!res.success) {
      void message.error(res.error.message);
      return;
    }
    void message.success('已排队二次重构');
    setAppend('');
    onDone();
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space wrap>
        <Button type="primary" disabled={!canReview || busy} loading={busy} onClick={() => void accept()}>
          确认采纳
        </Button>
        <Button danger disabled={!canReview || busy} loading={busy} onClick={() => void reject()}>
          拒绝
        </Button>
      </Space>
      <div>
        <div style={{ marginBottom: 8 }}>追加说明（可选，再次生成时传给模型）</div>
        <TextArea
          rows={3}
          value={append}
          onChange={(e) => setAppend(e.target.value)}
          placeholder="可选。例如：使用 useCallback 优化事件处理；留空则按默认提示再次生成一版。"
        />
        <Button
          style={{ marginTop: 8 }}
          disabled={!canRetry || busy}
          loading={busy}
          onClick={() => void retry()}
        >
          再次生成
        </Button>
      </div>
    </Space>
  );
}

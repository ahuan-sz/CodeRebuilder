import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  List,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRefactorStore } from '../stores/refactor-store';
import { RefactorDiffPanel } from '../components/diff/refactor-diff-panel';
import { ReviewActions } from '../components/diff/review-actions';
import type { RefactorFileStatus, VersionListItem } from '../../../shared/ipc-types';
import type { MigrationSkillId } from '../../../shared/migration-skills';
import { MIGRATION_SKILLS } from '../../../shared/migration-skills';
import {
  FILE_STATUS_LABELS,
  phaseDisplayLabel,
  refactorStatusTagColor,
} from '../constants/refactor-ui';
import { findFileStatusInTree } from '../utils/tree-file-status';

const { Title } = Typography;
const AntText = Typography.Text;

export function RefactorWorkbench(): JSX.Element {
  const project = useRefactorStore((s) => s.project);
  const selectedPath = useRefactorStore((s) => s.selectedPath);
  const taskLog = useRefactorStore((s) => s.taskLog);
  const totalVueFiles = useRefactorStore((s) => s.totalVueFiles);
  const scan = useRefactorStore((s) => s.scan);
  const tree = useRefactorStore((s) => s.tree);
  const taskProgressByPath = useRefactorStore((s) => s.taskProgressByPath);
  const workbenchRefreshSeq = useRefactorStore((s) => s.workbenchRefreshSeq);

  const [source, setSource] = useState('');
  const [generated, setGenerated] = useState('');
  const [versionNo, setVersionNo] = useState<number | null>(null);
  const [hasGeneratedSnapshot, setHasGeneratedSnapshot] = useState(false);
  const [status, setStatus] = useState<RefactorFileStatus | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [migrationSkill, setMigrationSkill] = useState<MigrationSkillId>('vue_sfc_default');
  const [aiHint, setAiHint] = useState<{ type: 'warning' | 'error'; description: string } | null>(
    null
  );

  const treeStatus = useMemo(
    () => findFileStatusInTree(tree, selectedPath),
    [tree, selectedPath]
  );
  const taskProg = selectedPath ? taskProgressByPath[selectedPath] : undefined;
  const displayStatus = treeStatus ?? status;

  const workbenchCardTitle = useMemo(() => {
    const hint = (() => {
      if (!selectedPath) return null;
      if (diffLoading) return '正在加载差异对比…';
      if (taskProg) {
        return `${phaseDisplayLabel(taskProg.phase)}${taskProg.message ? ` · ${taskProg.message}` : ''}`;
      }
      const s = displayStatus;
      if (s === 'refactoring' || s === 're_refactoring') return '流水线进行中…';
      if (s === 'generated_pending' || s === 'regenerated_pending')
        return '生成完毕 · 请在右侧采纳或拒绝';
      if (s === 'confirmed') return '当前版本已确认 · 可再次生成（追加说明可选）';
      if (s === 'failed') return '上次生成失败 · 可重试或查看日志';
      if (s === 'idle') return '可点击「开始重构」启动任务';
      return '就绪 · 可查看差异或开始重构';
    })();

    return (
      <Space direction="vertical" size={2} style={{ paddingBottom: 2 }}>
        <Space wrap align="center" size="middle">
          <span style={{ fontWeight: 600 }}>重构工作台</span>
          {!selectedPath ? (
            <AntText type="secondary" style={{ fontSize: 13, fontWeight: 'normal' }}>
              请先在左侧树中选择 .vue 源文件
            </AntText>
          ) : (
            <>
              {displayStatus != null ? (
                <Tag color={refactorStatusTagColor(displayStatus)}>
                  {FILE_STATUS_LABELS[displayStatus]}
                </Tag>
              ) : null}
              {hint ? (
                <AntText type="secondary" style={{ fontSize: 13, fontWeight: 'normal' }}>
                  {hint}
                </AntText>
              ) : null}
            </>
          )}
        </Space>
        {selectedPath ? (
          <AntText
            type="secondary"
            ellipsis
            title={selectedPath}
            style={{ fontSize: 12, fontWeight: 'normal', maxWidth: 'min(100vw - 200px, 720px)' }}
          >
            {selectedPath}
          </AntText>
        ) : null}
      </Space>
    );
  }, [selectedPath, displayStatus, diffLoading, taskProg]);

  const loadDiff = useCallback(async () => {
    if (!project || !selectedPath) {
      setSource('');
      setGenerated('');
      setVersionNo(null);
      setHasGeneratedSnapshot(false);
      setStatus(null);
      return;
    }
    setDiffLoading(true);
    const res = await window.crApi.getLatestDiff({
      projectId: project.projectId,
      sourceFilePath: selectedPath,
    });
    setDiffLoading(false);
    if (!res.success) {
      void message.error(res.error.message);
      setSource('');
      setGenerated('');
      setVersionNo(null);
      setHasGeneratedSnapshot(false);
      setStatus(null);
      return;
    }
    setSource(res.data.sourceCode);
    setGenerated(res.data.generatedCode);
    setVersionNo(res.data.versionNo);
    setHasGeneratedSnapshot(res.data.hasGeneratedSnapshot);
    setStatus(res.data.status);
  }, [project, selectedPath, workbenchRefreshSeq]);

  useEffect(() => {
    void loadDiff();
  }, [loadDiff]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!window.crApi) return;
      const c = await window.crApi.getConfig();
      const k = await window.crApi.keyStatus();
      if (cancelled || !c.success || !k.success) return;
      const p = c.data.ai.provider;
      const hk = k.data.hasKey;
      if (p === 'mock') {
        setAiHint({
          type: 'warning',
          description:
            '当前为 Mock 模式：生成结果是固定占位组件，与所选 Vue 源码无关。若要做真实 AI 迁移：打开「设置」，将提供商改为 OpenAI 或 DeepSeek，填写 Base URL（DeepSeek 通常为 https://api.deepseek.com/v1）并保存 API Key。',
        });
        return;
      }
      if (p === 'anthropic') {
        setAiHint({
          type: 'error',
          description:
            'Anthropic 提供商尚未接入 SDK。请改用 OpenAI 兼容或 DeepSeek，并保存 Key；否则无法生成代码。',
        });
        return;
      }
      if (!hk) {
        setAiHint({
          type: 'error',
          description:
            '未保存 API Key：开始重构会因无法调用大模型而失败。请到「设置」保存 OpenAI 兼容密钥，或改回 Mock 仅体验流程。',
        });
        return;
      }
      setAiHint(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.projectId, workbenchRefreshSeq]);

  const loadVersions = async (): Promise<void> => {
    if (!project || !selectedPath) return;
    const res = await window.crApi.listVersions({
      projectId: project.projectId,
      sourceFilePath: selectedPath,
    });
    if (!res.success) {
      void message.error(res.error.message);
      return;
    }
    setVersions(res.data);
    setVersionsOpen(true);
  };

  const startRefactor = async (): Promise<void> => {
    if (!project || !selectedPath) return;
    setStartBusy(true);
    const res = await window.crApi.startFile({
      projectId: project.projectId,
      sourceFilePath: selectedPath,
      migrationSkill,
    });
    setStartBusy(false);
    if (!res.success) {
      void message.error(res.error.message);
      return;
    }
    void message.success('重构任务已启动');
  };

  if (!project) {
    return <AntText type="secondary">请先打开本地项目目录。</AntText>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={16}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Vue 文件数" value={totalVueFiles} />
          </Card>
        </Col>
        <Col span={16}>
          <Card size="small" title="当前项目">
            <Space direction="vertical">
              <Title level={5} style={{ margin: 0 }}>
                {project.name}
              </Title>
              <AntText code>{project.projectRoot}</AntText>
              {!project.isVueProject ? <AntText type="warning">未检测到 .vue 文件</AntText> : null}
            </Space>
          </Card>
        </Col>
      </Row>

      {aiHint ? (
        <Alert
          type={aiHint.type}
          showIcon
          message={aiHint.type === 'warning' ? '未接入真实大模型' : '当前无法调用 AI'}
          description={aiHint.description}
        />
      ) : null}

      <Card title={workbenchCardTitle} extra={
          <Space>
            <Button size="small" onClick={() => void scan()}>
              重新扫描
            </Button>
            <Button size="small" onClick={() => void loadVersions()} disabled={!selectedPath}>
              版本历史
            </Button>
            <Button
              type="primary"
              size="small"
              loading={startBusy}
              disabled={!selectedPath}
              onClick={() => void startRefactor()}
            >
              开始重构
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16, maxWidth: 520 }}>
          <AntText type="secondary" style={{ display: 'block', marginBottom: 6 }}>
            迁移技能（内置 Prompt 模板）：.vue 采用分步解析 Template / Script / Style 后拼装；Vuex
            技能用于 .ts/.js store 整文件单轮迁移。
          </AntText>
          <Select<MigrationSkillId>
            style={{ width: '100%' }}
            value={migrationSkill}
            onChange={setMigrationSkill}
            options={MIGRATION_SKILLS.map((s) => ({
              value: s.id,
              label: s.label,
              title: s.description,
            }))}
          />
        </div>
        <Row gutter={16}>
          <Col span={16}>
            <RefactorDiffPanel
              sourcePath={selectedPath}
              original={source}
              modified={generated}
              hasGeneratedSnapshot={hasGeneratedSnapshot}
              previewVersionNo={versionNo}
              diffLoading={diffLoading}
              displayStatus={displayStatus ?? null}
              taskPhase={taskProg?.phase ?? null}
              taskMessage={taskProg?.message ?? null}
            />
          </Col>
          <Col span={8}>
            <ReviewActions
              projectId={project.projectId}
              sourceFilePath={selectedPath ?? ''}
              versionNo={versionNo}
              status={displayStatus ?? null}
              onDone={() => {
                void loadDiff();
                void scan();
              }}
              disabled={!selectedPath}
              migrationSkill={migrationSkill}
            />
          </Col>
        </Row>
      </Card>

      <Card title="任务日志" size="small">
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 12,
            maxHeight: 200,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {taskLog.slice(-80).join('\n')}
        </div>
      </Card>

      <Drawer
        title="版本历史"
        width={480}
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
      >
        <List
          dataSource={versions}
          renderItem={(v) => (
            <List.Item>
              <List.Item.Meta
                title={`v${v.versionNo} · ${v.roundType}`}
                description={`${v.createdAt} · ${v.modelName} · ${v.generationStatus}`}
              />
            </List.Item>
          )}
        />
      </Drawer>
    </Space>
  );
}

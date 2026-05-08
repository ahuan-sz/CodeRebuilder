import { SettingOutlined, SwapOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefactorTree } from './components/project-tree/refactor-tree';
import { RefactorWorkbench } from './pages/refactor-workbench';
import { PlanSelector } from './components/plan-selector/plan-selector';
import { ModeSelector } from './components/mode-selector/mode-selector';
import { DependencyAnalysis } from './components/dependency-analysis/dependency-analysis';
import { subscribeRefactorIpc, useRefactorStore } from './stores/refactor-store';
import type { AppConfig, RefactorPlan } from '../../shared/ipc-types';
import {
  AI_PROVIDER_PRESETS,
  mergeModelOptionForSelect,
  normalizeImportedAi,
  type AiProviderId,
} from '../../shared/ai-provider-presets';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;
const AntText = Typography.Text;

const HEADER_H = 56;

type SettingsValues = AppConfig & { apiKeyInput?: string };

export default function App(): JSX.Element {
  const openProject = useRefactorStore((s) => s.openProject);
  const restoreLastProject = useRefactorStore((s) => s.restoreLastProject);
  const setPlan = useRefactorStore((s) => s.setPlan);
  const plan = useRefactorStore((s) => s.plan);
  const project = useRefactorStore((s) => s.project);
  const projectMode = useRefactorStore((s) => s.projectMode);
  const setProjectMode = useRefactorStore((s) => s.setProjectMode);
  const analysisResult = useRefactorStore((s) => s.analysisResult);
  const analysisLoading = useRefactorStore((s) => s.analysisLoading);
  const runAnalysis = useRefactorStore((s) => s.runAnalysis);
  const scanLoading = useRefactorStore((s) => s.scanLoading);

  const [showPlanSelector, setShowPlanSelector] = useState(false);
  /** 'initial'：首次启动未选方案；'workbench'：从重构界面主动切换 */
  const [planSelectorSource, setPlanSelectorSource] = useState<'initial' | 'workbench'>('initial');
  const tree = useRefactorStore((s) => s.tree);
  const selectedPath = useRefactorStore((s) => s.selectedPath);
  const selectFile = useRefactorStore((s) => s.selectFile);
  const bumpWorkbenchRefresh = useRefactorStore((s) => s.bumpWorkbenchRefresh);

  const [form] = Form.useForm<SettingsValues>();

  const watchedProvider = (Form.useWatch(['ai', 'provider'], form) ?? 'mock') as AiProviderId;
  const watchedModel = Form.useWatch(['ai', 'model'], form) as string | undefined;
  const providerPreset = AI_PROVIDER_PRESETS[watchedProvider];
  const modelSelectOptions = useMemo(
    () => mergeModelOptionForSelect(providerPreset.modelOptions, watchedModel),
    [providerPreset.modelOptions, watchedModel]
  );

  const applyAiProviderPreset = useCallback(
    (provider: AiProviderId): void => {
      const preset = AI_PROVIDER_PRESETS[provider];
      const cur = form.getFieldValue('ai') ?? {};
      form.setFieldsValue({
        ai: {
          ...cur,
          provider,
          model: preset.defaultModel,
          openaiBaseUrl: preset.defaultBaseUrl ?? '',
        },
      });
    },
    [form]
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    if (!window.crApi) {
      console.warn('[CodeRebuilder] window.crApi 仍不可用（请确认 main.tsx 已调用 ensureCrApiBrowserStub）');
      return () => {};
    }
    const unsub = subscribeRefactorIpc();
    void (async () => {
      const api = window.crApi;
      if (!api) return;
      const k = await api.keyStatus();
      if (k.success) setHasKey(k.data.hasKey);
      // 读取持久化的方案
      const cfgRes = await api.getConfig();
      if (cfgRes.success && cfgRes.data.refactorPlan) {
        useRefactorStore.setState({ plan: cfgRes.data.refactorPlan });
      } else {
        // 未选方案，展示初次启动选择界面
        setPlanSelectorSource('initial');
        setShowPlanSelector(true);
      }
      await restoreLastProject();
    })();
    return unsub;
  }, [restoreLastProject]);

  const handlePlanConfirm = useCallback(async (newPlan: RefactorPlan): Promise<void> => {
    await setPlan(newPlan);
    setShowPlanSelector(false);
  }, [setPlan]);

  const refreshSettingsBootstrap = useCallback(async (): Promise<boolean> => {
    if (!window.crApi) return false;
    setSettingsLoading(true);
    try {
      const [c, k] = await Promise.all([
        window.crApi.getConfig(),
        window.crApi.keyStatus(),
      ]);
      if (!c.success || !k.success) {
        void message.error(c.success === false ? c.error.message : k.error!.message);
        return false;
      }
      form.setFieldsValue({
        ...c.data,
        ai: normalizeImportedAi(c.data.ai),
        apiKeyInput: '',
      });
      setHasKey(k.data.hasKey);
      return true;
    } finally {
      setSettingsLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (settingsOpen) void refreshSettingsBootstrap();
  }, [settingsOpen, refreshSettingsBootstrap]);

  const confirmClearKey = (): void => {
    Modal.confirm({
      title: '清除本应用保存的 API Key？',
      content:
        '仅删除本机用户目录下的密钥文件；若启动 Electron 的环境变量 OPENAI_API_KEY 仍存在，系统将仍视为可用密钥。',
      okText: '清除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!window.crApi) return;
        const res = await window.crApi.clearOpenAiKey();
        if (!res.success) {
          void message.error(res.error.message);
          return;
        }
        setHasKey(res.data.hasKey);
        bumpWorkbenchRefresh();
        void message.success('已清除本地保存的密钥');
      },
    });
  };

  const onSettingsFinish = async (v: SettingsValues): Promise<void> => {
    if (!window.crApi) return;
    const { apiKeyInput, ...rest } = v;
    const keyTrim = typeof apiKeyInput === 'string' ? apiKeyInput.trim() : '';
    const draft: AppConfig = { ...rest };
    const bu = draft.ai.openaiBaseUrl?.trim();
    draft.ai.openaiBaseUrl = bu || undefined;
    if (keyTrim) {
      const kr = await window.crApi.setOpenAiKey(keyTrim);
      if (!kr.success) {
        void message.error(kr.error.message);
        return;
      }
      setHasKey(kr.data.hasKey);
    }
    const res = await window.crApi.setConfig(draft);
    if (!res.success) {
      void message.error(res.error.message);
      return;
    }
    form.setFieldValue('apiKeyInput', '');
    bumpWorkbenchRefresh();
    void message.success('设置已保存');
  };

  const planLabel: Record<string, string> = {
    vue2_to_vue3: 'Vue 2 → Vue 3',
    vue2_to_react: 'Vue 2 → React',
    vue3_to_react: 'Vue 3 → React',
  };

  return (
    <Layout style={{ height: '100%', overflow: 'hidden', flexDirection: 'column' }}>
      {typeof window !== 'undefined' && window.__CR_BROWSER_STUB__ ? (
        <Alert
          type="warning"
          showIcon
          closable
          style={{ flexShrink: 0, borderRadius: 0 }}
          message="当前在浏览器中预览（无 Electron）"
          description="本地文件夹、IPC、重构等仅在 Electron 窗口中可用。请使用终端执行 npm run dev，使用自动弹出的应用窗口，勿在浏览器打开 localhost:5173。"
        />
      ) : null}

      <Header
        style={{
          flexShrink: 0,
          height: HEADER_H,
          paddingInline: 16,
          display: 'flex',
          alignItems: 'center',
          lineHeight: `${HEADER_H}px`,
        }}
      >
        <Title level={4} style={{ color: '#fff', margin: 0, flex: 1 }}>
          CodeRebuilder
        </Title>
        <Space>
          {/* 重构界面：显示当前方案标记（可点击切换） */}
          {plan && !showPlanSelector && (
            <Button
              type="text"
              size="small"
              icon={<SwapOutlined />}
              style={{ color: 'rgba(255,255,255,0.65)', paddingInline: 4 }}
              onClick={() => { setPlanSelectorSource('workbench'); setShowPlanSelector(true); }}
            >
              <Tag color="blue" style={{ marginLeft: 4 }}>
                {planLabel[plan.migrationPath] ?? plan.migrationPath}
              </Tag>
            </Button>
          )}
          {/* 从重构界面跳入方案选择：提供返回按钮，避免用户迷失 */}
          {showPlanSelector && planSelectorSource === 'workbench' && (
            <Button
              type="primary"
              ghost
              onClick={() => setShowPlanSelector(false)}
            >
              ← 返回重构界面
            </Button>
          )}
          {plan && !showPlanSelector && (
            <Button type="primary" ghost onClick={() => void openProject()} loading={scanLoading}>
              打开项目
            </Button>
          )}
          <Button type="primary" ghost icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
            设置
          </Button>
        </Space>
      </Header>

      <Layout style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* 文件树仅在重构模式下可见 */}
        {!showPlanSelector && projectMode === 'refactor' && (
          <Sider theme="dark" width={300} style={{ overflow: 'hidden' }}>
            <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', padding: 12, boxSizing: 'border-box' }}>
              <RefactorTree
                tree={tree}
                selectedPath={selectedPath}
                onSelectPath={(p) => selectFile(p)}
              />
            </div>
          </Sider>
        )}

        <Content
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 1. 方案选择（未选方案） */}
          {showPlanSelector ? (
            <PlanSelector
              initialPlan={plan ?? undefined}
              onConfirm={(p) => void handlePlanConfirm(p)}
            />
          ) : !project ? (
            /* 2. 未打开项目 */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography.Text type="secondary">请点击「打开项目」选择项目目录</Typography.Text>
            </div>
          ) : projectMode === 'selector' ? (
            /* 3. 模式选择 */
            <ModeSelector
              projectName={project.name}
              projectRoot={project.projectRoot}
              analysisLoading={analysisLoading}
              hasAnalysisResult={!!analysisResult}
              onAnalyze={() => {
                if (analysisResult) { setProjectMode('analysis'); }
                else { void runAnalysis(); }
              }}
              onRefactor={() => setProjectMode('refactor')}
            />
          ) : projectMode === 'analysis' && analysisResult ? (
            /* 4. 依赖分析 */
            <DependencyAnalysis
              result={analysisResult}
              projectName={project.name}
              analysisLoading={analysisLoading}
              onBack={() => setProjectMode('selector')}
              onReanalyze={() => void runAnalysis()}
            />
          ) : (
            /* 5. 重构工作台 */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{ flexShrink: 0, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <Button
                  size="small"
                  type="text"
                  icon={<span style={{ marginRight: 4 }}>←</span>}
                  style={{ color: 'rgba(255,255,255,0.75)' }}
                  onClick={() => setProjectMode('selector')}
                >
                  返回
                </Button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 24 }}>
                <RefactorWorkbench />
              </div>
            </div>
          )}
        </Content>
      </Layout>

      <Drawer
        title="偏好设置"
        width={560}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        destroyOnClose={false}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space wrap>
              <Button disabled={settingsLoading || !hasKey} onClick={() => confirmClearKey()}>
                清除本机密钥
              </Button>
              <Button onClick={() => setSettingsOpen(false)}>关闭</Button>
              <Button
                type="primary"
                loading={settingsLoading}
                onClick={() => void form.validateFields().then(() => form.submit())}
              >
                保存设置
              </Button>
            </Space>
          </div>
        }
      >
        <Spin spinning={settingsLoading}>
          <Form form={form} layout="vertical" onFinish={(v) => void onSettingsFinish(v)}>
            <Divider orientation="left">AI 网关与模型</Divider>
            <Form.Item label="提供商" name={['ai', 'provider']}>
              <Select
                options={[
                  {
                    label: '免费平台',
                    options: [
                      { value: 'zhipuai', label: '🆓 智谱AI · GLM-4-Flash（推荐·30B·200K 上下文）' },
                      { value: 'github_models', label: '🆓 GitHub Models · GPT-4o / DeepSeek-R1' },
                      { value: 'hunyuan', label: '🆓 腾讯混元 · hunyuan-lite（1M 上下文）' },
                    ],
                  },
                  {
                    label: '付费平台',
                    options: [
                      { value: 'openai', label: 'OpenAI' },
                      { value: 'deepseek', label: 'DeepSeek（OpenAI 兼容）' },
                      { value: 'anthropic', label: 'Anthropic（暂未接入）' },
                    ],
                  },
                  {
                    label: '其他',
                    options: [
                      { value: 'mock', label: 'Mock（离线占位，不调 API）' },
                    ],
                  },
                ]}
                onChange={(p) => applyAiProviderPreset(p)}
              />
            </Form.Item>
            <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
              切换提供商时会自动填入 Base URL 与推荐模型。免费平台注册后即可获取 API Key，无需付费。
            </Typography.Paragraph>
            <Form.Item
              label="模型"
              name={['ai', 'model']}
              rules={[{ required: true, message: '请选择模型' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择模型"
                options={modelSelectOptions}
              />
            </Form.Item>
            <Form.Item
              label="API Base URL（OpenAI 兼容）"
              name={['ai', 'openaiBaseUrl']}
              tooltip="OpenAI、DeepSeek、多数兼容中转服务使用；留空则等价于由上方自动填充或交给 SDK 默认值"
              extra={
                hasKey ? (
                  <AntText type="success">检测：当前存在可用 API Key（本机存储或环境变量 OPENAI_API_KEY）</AntText>
                ) : null
              }
            >
              <Input
                allowClear
                placeholder={
                  providerPreset.defaultBaseUrl?.length
                    ? providerPreset.defaultBaseUrl
                    : watchedProvider === 'mock'
                      ? 'Mock 可不填'
                      : '按提供商自动填充，可改为自有中转地址'
                }
              />
            </Form.Item>
            <Form.Item>
              <Button type="link" size="small" onClick={() => applyAiProviderPreset(watchedProvider)}>
                恢复当前提供商：官方默认 Base URL + 推荐模型
              </Button>
            </Form.Item>
            <Form.Item label="API Key">
              <Form.Item name="apiKeyInput" noStyle>
                <Input.Password
                  placeholder="在此处填写密钥并保存；留空则不修改已保存的密钥"
                  autoComplete="new-password"
                />
              </Form.Item>
              <AntText type="secondary" style={{ display: 'block', marginTop: 6 }}>
                保存设置时会一并写入密钥；也可使用下方「迁移助手」等区域后点底部「保存设置」一次性提交。
              </AntText>
            </Form.Item>
            <Form.Item label="生成文件扩展名" name={['ai', 'targetExt']}>
              <Select
                options={[
                  { value: 'tsx', label: 'tsx' },
                  { value: 'jsx', label: 'jsx' },
                ]}
              />
            </Form.Item>

            <Divider orientation="left">迁移助手</Divider>
            <Typography.Paragraph type="secondary">
              外部 CLI 粗稿与项目上下文；API 网关与密钥见上文。
            </Typography.Paragraph>
            <Form.Item
              label="项目规范 / MCP 摘要（每条迁移 Prompt 前置）"
              name={['refactorAssistant', 'contextMarkdown']}
            >
              <Input.TextArea
                rows={6}
                placeholder="目录约定、状态管理、UI 库、MCP 分析摘要等。"
              />
            </Form.Item>
            <Form.Item
              label="对 .vue 启用外部工具初稿"
              name={['refactorAssistant', 'mechanicalDraft', 'enabled']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item label="初稿工具" name={['refactorAssistant', 'mechanicalDraft', 'preset']}>
              <Select
                options={[
                  { value: 'none', label: '不用外部工具' },
                  {
                    value: 'v2r_llm',
                    label: 'v2r-llm（npx）',
                  },
                  { value: 'vue_to_react_vtr', label: 'vue-to-react / vtr' },
                  { value: 'custom', label: '自定义 shell' },
                ]}
              />
            </Form.Item>
            <Form.Item label="外部命令超时（秒）" name={['refactorAssistant', 'mechanicalDraft', 'timeoutSec']}>
              <InputNumber min={30} max={900} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              tooltip="占位符：{input} {outputDir} {stem} {projectRoot} {outFile}"
              label="自定义 shell（预设为「自定义」时）"
              name={['refactorAssistant', 'mechanicalDraft', 'customCommand']}
            >
              <Input.TextArea
                rows={2}
                placeholder='例：npx -y v2r-llm transform -i "{input}" -o "{outputDir}" -n "{stem}.js"'
              />
            </Form.Item>

          </Form>
        </Spin>
      </Drawer>
    </Layout>
  );
}

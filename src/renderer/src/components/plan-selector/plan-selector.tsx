import {
  Button,
  Card,
  Col,
  ConfigProvider,
  Divider,
  Radio,
  Row,
  Space,
  Switch,
  Typography,
  theme,
} from 'antd';
import { useState } from 'react';
import type { MigrationPath, RefactorPlan } from '../../../../shared/ipc-types';

const { Title, Paragraph } = Typography;
const AntText = Typography.Text;

function VueLogo({ size = 40 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 261.76 226.69" xmlns="http://www.w3.org/2000/svg">
      <path d="M161.096.001l-30.224 52.35L100.647.002H-.005L130.872 226.69 261.749 0z" fill="#41b883" />
      <path d="M161.096.001l-30.224 52.35L100.647.002H52.346l78.526 136.01L209.398.001z" fill="#34495e" />
    </svg>
  );
}

function ReactLogo({ size = 40 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="-11.5 -10.23174 23 20.46348" xmlns="http://www.w3.org/2000/svg">
      <circle cx="0" cy="0" r="2.05" fill="#61dafb" />
      <g stroke="#61dafb" strokeWidth="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  );
}

type PathConfig = {
  label: string;
  logo: JSX.Element;
  description: string;
  defaultState: string;
  stateOptions: { value: string; label: string }[];
  defaultStyle: string;
  styleOptions: { value: string; label: string }[];
};

const PATH_CONFIGS: Record<MigrationPath, PathConfig> = {
  vue2_to_vue3: {
    label: 'Vue 2  →  Vue 3',
    logo: <VueLogo />,
    description: 'Options API 迁移至 Composition API / script setup，可选升级状态管理与样式方案',
    defaultState: 'pinia',
    stateOptions: [
      { value: 'pinia', label: 'Pinia（推荐）' },
      { value: 'vuex', label: 'Vuex 4（保留）' },
    ],
    defaultStyle: 'less',
    styleOptions: [
      { value: 'less', label: 'Less（推荐）' },
      { value: 'sass', label: 'Sass / SCSS' },
      { value: 'css', label: '原生 CSS' },
    ],
  },
  vue2_to_react: {
    label: 'Vue 2  →  React',
    logo: <ReactLogo />,
    description: 'Vue 2 Options API 全面迁移至 React 函数组件 + Hooks，生成 .tsx 文件',
    defaultState: 'zustand',
    stateOptions: [
      { value: 'zustand', label: 'Zustand（推荐）' },
      { value: 'redux-toolkit', label: 'Redux Toolkit' },
    ],
    defaultStyle: 'css-modules',
    styleOptions: [
      { value: 'css-modules', label: 'CSS Modules（推荐）' },
      { value: 'tailwind', label: 'Tailwind CSS' },
      { value: 'unocss', label: 'UnoCSS' },
    ],
  },
  vue3_to_react: {
    label: 'Vue 3  →  React',
    logo: <ReactLogo />,
    description: 'Vue 3 Composition API 迁移至 React 函数组件 + Hooks，生成 .tsx 文件',
    defaultState: 'zustand',
    stateOptions: [
      { value: 'zustand', label: 'Zustand（推荐）' },
      { value: 'redux-toolkit', label: 'Redux Toolkit' },
    ],
    defaultStyle: 'css-modules',
    styleOptions: [
      { value: 'css-modules', label: 'CSS Modules（推荐）' },
      { value: 'tailwind', label: 'Tailwind CSS' },
      { value: 'unocss', label: 'UnoCSS' },
    ],
  },
};

const MIGRATION_PATHS: MigrationPath[] = ['vue2_to_vue3', 'vue2_to_react', 'vue3_to_react'];

type Props = {
  initialPlan?: RefactorPlan;
  onConfirm: (plan: RefactorPlan) => void;
};

export function PlanSelector({ initialPlan, onConfirm }: Props): JSX.Element {
  const [selectedPath, setSelectedPath] = useState<MigrationPath>(
    initialPlan?.migrationPath ?? 'vue2_to_react'
  );
  const [useTypeScript, setUseTypeScript] = useState(initialPlan?.useTypeScript ?? true);

  const cfg = PATH_CONFIGS[selectedPath];

  const [stateManagement, setStateManagement] = useState<string>(
    initialPlan?.migrationPath === selectedPath
      ? (initialPlan?.stateManagement ?? cfg.defaultState)
      : cfg.defaultState
  );
  const [styleSolution, setStyleSolution] = useState<string>(
    initialPlan?.migrationPath === selectedPath
      ? (initialPlan?.styleSolution ?? cfg.defaultStyle)
      : cfg.defaultStyle
  );

  const handlePathChange = (path: MigrationPath): void => {
    setSelectedPath(path);
    const newCfg = PATH_CONFIGS[path];
    setStateManagement(newCfg.defaultState);
    setStyleSolution(newCfg.defaultStyle);
  };

  const handleConfirm = (): void => {
    onConfirm({
      migrationPath: selectedPath,
      useTypeScript,
      stateManagement,
      styleSolution,
    });
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm, token: { borderRadius: 6 } }}>
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        background: '#f5f5f5',
      }}
    >
      <div style={{ width: '100%', maxWidth: 860 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Title level={2} style={{ marginBottom: 8 }}>
            选择重构方案
          </Title>
          <AntText type="secondary">
            方案决定了 AI 使用的 Prompt 策略和目标技术栈，选定后可随时在顶部菜单更换
          </AntText>
        </div>

        {/* 迁移路径卡片 */}
        <Row gutter={16} style={{ marginBottom: 32 }}>
          {MIGRATION_PATHS.map((path) => {
            const c = PATH_CONFIGS[path];
            const active = selectedPath === path;
            return (
              <Col span={8} key={path}>
                <Card
                  hoverable
                  onClick={() => handlePathChange(path)}
                  style={{
                    cursor: 'pointer',
                    borderWidth: 2,
                    borderColor: active ? '#1677ff' : '#d9d9d9',
                    background: active ? '#e6f4ff' : '#fff',
                    transition: 'all 0.2s',
                    height: '100%',
                  }}
                  styles={{ body: { padding: '20px 16px' } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    {c.logo}
                  </div>
                  <Title
                    level={5}
                    style={{
                      textAlign: 'center',
                      color: active ? '#1677ff' : undefined,
                      marginBottom: 8,
                    }}
                  >
                    {c.label}
                  </Title>
                  <Paragraph
                    type="secondary"
                    style={{ fontSize: 12, textAlign: 'center', marginBottom: 0 }}
                  >
                    {c.description}
                  </Paragraph>
                </Card>
              </Col>
            );
          })}
        </Row>

        {/* 方案选项 */}
        <Card style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            {/* TypeScript */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Switch
                checked={useTypeScript}
                onChange={setUseTypeScript}
                checkedChildren="TS"
                unCheckedChildren="JS"
              />
              <div>
                <AntText strong>使用 TypeScript</AntText>
                <AntText type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {useTypeScript ? '生成 .tsx / .ts 文件，带类型注解' : '生成 .jsx / .js 文件'}
                </AntText>
              </div>
            </div>

            <Divider style={{ margin: '0' }} />

            {/* 状态管理 */}
            <div>
              <AntText strong style={{ display: 'block', marginBottom: 10 }}>状态管理</AntText>
              <Radio.Group
                value={stateManagement}
                onChange={(e) => setStateManagement(e.target.value as string)}
              >
                <Space direction="vertical" size={8}>
                  {cfg.stateOptions.map((o) => (
                    <Radio key={o.value} value={o.value}>{o.label}</Radio>
                  ))}
                </Space>
              </Radio.Group>
            </div>

            <Divider style={{ margin: '0' }} />

            {/* 样式方案 */}
            <div>
              <AntText strong style={{ display: 'block', marginBottom: 10 }}>样式方案</AntText>
              <Radio.Group
                value={styleSolution}
                onChange={(e) => setStyleSolution(e.target.value as string)}
              >
                <Space wrap size={[24, 8]}>
                  {cfg.styleOptions.map((o) => (
                    <Radio key={o.value} value={o.value}>{o.label}</Radio>
                  ))}
                </Space>
              </Radio.Group>
            </div>
          </Space>
        </Card>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Button
            type="primary"
            size="large"
            style={{ paddingInline: 56, height: 44, fontSize: 16 }}
            onClick={handleConfirm}
          >
            开始使用
          </Button>
        </div>
      </div>
    </div>
    </ConfigProvider>
  );
}

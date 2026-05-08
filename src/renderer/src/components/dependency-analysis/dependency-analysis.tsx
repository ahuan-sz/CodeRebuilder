import {
  ArrowLeftOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { DependencyAnalysisResult, ModuleInfo } from '../../../../shared/ipc-types';

// Alias to avoid collision with browser's native `Text` DOM constructor
const AntText = Typography.Text;

const ROLE_TAG: Record<ModuleInfo['role'], JSX.Element> = {
  core: <Tag color="blue">核心</Tag>,
  leaf: <Tag color="default">边缘</Tag>,
  normal: <Tag color="cyan">普通</Tag>,
};

function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadSvg(base64: string, filename: string): void {
  const svg = atob(base64);
  downloadText(svg, filename, 'image/svg+xml');
}

/** SVG 查看面板（base64 输入） */
function SvgViewer({
  base64,
  filename,
  error,
  loading,
}: {
  base64?: string;
  filename: string;
  error?: string;
  loading?: boolean;
}): JSX.Element {
  const [scale, setScale] = useState(1);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <Spin tip="正在运行分析工具（首次需下载，稍候…）" size="large" />
      </div>
    );
  }

  if (!base64) {
    return (
      <div style={{ padding: 24 }}>
        {error && (
          <Alert
            type="warning"
            showIcon
            message="图形生成失败"
            description={
              <div>
                <p>{error}</p>
                {error.includes('madge') && (
                  <p style={{ marginTop: 8 }}>
                    madge SVG 输出需要系统安装 Graphviz：
                    <code style={{ marginLeft: 8 }}>brew install graphviz</code>
                  </p>
                )}
              </div>
            }
            style={{ marginBottom: 16 }}
          />
        )}
        <Empty description="暂无图形数据" />
      </div>
    );
  }

  const src = `data:image/svg+xml;base64,${base64}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '8px 0 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button size="small" ghost style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
          onClick={() => setScale((s) => Math.min(s + 0.25, 4))}>放大</Button>
        <Button size="small" ghost style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
          onClick={() => setScale((s) => Math.max(s - 0.25, 0.25))}>缩小</Button>
        <Button size="small" ghost style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
          onClick={() => setScale(1)}>重置</Button>
        <AntText style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{Math.round(scale * 100)}%</AntText>
        <div style={{ flex: 1 }} />
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={() => downloadSvg(base64, filename)}
          ghost
          style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
        >
          下载 SVG
        </Button>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 8,
          padding: 16,
          cursor: 'grab',
        }}
      >
        <img
          src={src}
          alt={filename}
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left', display: 'block' }}
        />
      </div>
    </div>
  );
}

const COLUMNS: ColumnsType<ModuleInfo> = [
  {
    title: '文件',
    dataIndex: 'file',
    key: 'file',
    ellipsis: true,
    render: (v: string, row) => (
      <Space size={4}>
        {row.isInCircular && (
          <Tooltip title="存在循环依赖">
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
          </Tooltip>
        )}
        <AntText style={{ fontSize: 12 }} copyable={{ text: v }}>{v}</AntText>
      </Space>
    ),
  },
  {
    title: '依赖数',
    dataIndex: 'imports',
    key: 'imports',
    width: 80,
    align: 'right',
    sorter: (a, b) => a.imports.length - b.imports.length,
    render: (v: string[]) => v.length,
  },
  {
    title: '被引用',
    dataIndex: 'importedBy',
    key: 'importedBy',
    width: 80,
    align: 'right',
    defaultSortOrder: 'descend',
    sorter: (a, b) => a.importedBy.length - b.importedBy.length,
    render: (v: string[]) => <AntText strong>{v.length}</AntText>,
  },
  {
    title: '分类',
    dataIndex: 'role',
    key: 'role',
    width: 72,
    render: (v: ModuleInfo['role']) => ROLE_TAG[v],
  },
];

type Props = {
  result: DependencyAnalysisResult;
  projectName: string;
  onBack: () => void;
  onReanalyze: () => void;
  analysisLoading: boolean;
};

export function DependencyAnalysis({
  result,
  projectName,
  onBack,
  onReanalyze,
  analysisLoading,
}: Props): JSX.Element {
  const {
    modules,
    circularDependencies,
    totalFiles,
    coreThreshold,
    analyzedAt,
    dotFormat,
    cruiserDot,
    cruiserSvg,
    cruiserViolations,
    madgeSvg,
    madgeJson,
    externalToolsError,
  } = result;

  const coreModules = useMemo(() => modules.filter((m) => m.role === 'core'), [modules]);
  const leafModules = useMemo(() => modules.filter((m) => m.role === 'leaf'), [modules]);
  const circularFiles = useMemo(() => modules.filter((m) => m.isInCircular), [modules]);

  const handleDownloadJson = (): void => {
    const data = {
      analyzedAt,
      totalFiles,
      coreThreshold,
      modules: modules.map(({ file, imports, importedBy, role, isInCircular }) => ({
        file, imports, importedBy, role, isInCircular,
      })),
      circularDependencies,
      ...(madgeJson ? { madgeDeps: madgeJson } : {}),
    };
    downloadText(JSON.stringify(data, null, 2), `${projectName}-dependencies.json`, 'application/json');
  };

  const tableProps = {
    size: 'small' as const,
    pagination: { pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 个模块` },
    scroll: { x: 500 },
  };

  // ---- 模块列表子 tabs ----
  const listTabs = [
    {
      key: 'all',
      label: `全部 (${modules.length})`,
      children: <Table {...tableProps} dataSource={modules} columns={COLUMNS} rowKey="file" />,
    },
    {
      key: 'core',
      label: (
        <span>
          核心模块 <Badge count={coreModules.length} color="#1677ff" style={{ marginLeft: 4 }} />
        </span>
      ),
      children: (
        <>
          <AntText type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
            被引用次数 ≥ {coreThreshold} 的模块（建议优先重构）
          </AntText>
          <Table {...tableProps} dataSource={coreModules} columns={COLUMNS} rowKey="file" />
        </>
      ),
    },
    {
      key: 'leaf',
      label: (
        <span>
          边缘模块 <Badge count={leafModules.length} color="#8c8c8c" style={{ marginLeft: 4 }} />
        </span>
      ),
      children: (
        <>
          <AntText type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
            无其他模块引用的叶节点（可独立重构）
          </AntText>
          <Table {...tableProps} dataSource={leafModules} columns={COLUMNS} rowKey="file" />
        </>
      ),
    },
    {
      key: 'circular',
      label: (
        <span>
          循环依赖{' '}
          <Badge count={circularFiles.length} color="#faad14" style={{ marginLeft: 4 }} />
        </span>
      ),
      children:
        circularDependencies.length === 0 ? (
          <AntText type="secondary">未检测到循环依赖 🎉</AntText>
        ) : (
          <>
            <AntText type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              以下循环路径需在重构前拆解
            </AntText>
            <Table
              size="small"
              dataSource={circularDependencies.map((chain, i) => ({ key: i, chain }))}
              columns={[
                {
                  title: '循环路径',
                  dataIndex: 'chain',
                  render: (c: string[]) => (
                    <AntText style={{ fontSize: 12 }} copyable={{ text: c.join(' → ') }}>
                      {c.join(' → ')}
                    </AntText>
                  ),
                },
              ]}
              pagination={false}
            />
          </>
        ),
    },
    ...(cruiserViolations && cruiserViolations.length > 0
      ? [
          {
            key: 'violations',
            label: (
              <span>
                <WarningOutlined style={{ marginRight: 4, color: '#faad14' }} />
                违规 <Badge count={cruiserViolations.length} color="#ff4d4f" style={{ marginLeft: 4 }} />
              </span>
            ),
            children: (
              <>
                <AntText type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                  dependency-cruiser 检测到的规则违规（循环依赖、孤立模块等）
                </AntText>
                <Table
                  size="small"
                  dataSource={cruiserViolations.map((v, i) => ({ ...v, key: i }))}
                  columns={[
                    { title: '规则', dataIndex: 'rule', width: 180 },
                    {
                      title: '级别',
                      dataIndex: 'severity',
                      width: 80,
                      render: (s: string) => (
                        <Tag color={s === 'error' ? 'red' : s === 'warn' ? 'orange' : 'blue'}>{s}</Tag>
                      ),
                    },
                    { title: '来源', dataIndex: 'from', ellipsis: true, render: (v: string) => <AntText style={{ fontSize: 12 }}>{v}</AntText> },
                    { title: '目标', dataIndex: 'to', ellipsis: true, render: (v: string) => <AntText style={{ fontSize: 12 }}>{v}</AntText> },
                  ]}
                  pagination={{ pageSize: 15 }}
                  scroll={{ x: 600 }}
                />
              </>
            ),
          },
        ]
      : []),
  ];

  // ---- 顶层 tabs ----
  const topTabs = [
    {
      key: 'modules',
      label: '模块列表',
      children: <Tabs items={listTabs} size="small" />,
    },
    {
      key: 'cruiser',
      label: (
        <span>
          dependency-cruiser 图
          {(cruiserSvg || cruiserDot) && <Badge dot status="success" style={{ marginLeft: 6 }} />}
        </span>
      ),
      children: (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {cruiserDot && (
            <div style={{ flexShrink: 0, padding: '8px 0 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                ghost
                style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
                onClick={() => downloadText(cruiserDot!, `${projectName}-cruiser.dot`)}
              >
                下载 DOT
              </Button>
              {!cruiserSvg && (
                <AntText style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                  SVG 预览需安装 Graphviz：<code style={{ color: '#85e89d', fontSize: 11 }}>brew install graphviz</code>
                </AntText>
              )}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            <SvgViewer
              base64={cruiserSvg}
              filename={`${projectName}-cruiser.svg`}
              error={
                !cruiserSvg
                  ? (cruiserDot
                      ? '已生成 DOT 文件，SVG 预览需安装 Graphviz（brew install graphviz）'
                      : externalToolsError)
                  : undefined
              }
              loading={analysisLoading}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'madge',
      label: (
        <span>
          madge 模块图
          {(madgeSvg || madgeJson) && <Badge dot status="success" style={{ marginLeft: 6 }} />}
        </span>
      ),
      children: (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {madgeJson && (
            <div style={{ flexShrink: 0, padding: '8px 0 12px', display: 'flex', gap: 8 }}>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                ghost
                style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
                onClick={() =>
                  downloadText(
                    JSON.stringify(madgeJson, null, 2),
                    `${projectName}-madge.json`,
                    'application/json'
                  )
                }
              >
                下载 JSON
              </Button>
              <AntText style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: '24px' }}>
                共 {Object.keys(madgeJson).length} 个 JS/TS 模块
              </AntText>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            <SvgViewer
              base64={madgeSvg}
              filename={`${projectName}-madge.svg`}
              error={
                !madgeSvg
                  ? (externalToolsError?.includes('madge') ? externalToolsError : undefined) ??
                    (madgeJson ? 'madge SVG 需要系统安装 Graphviz（brew install graphviz），JSON 数据已成功获取' : undefined)
                  : undefined
              }
              loading={false}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 工具栏 */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          size="small"
          type="text"
          style={{ color: 'rgba(255,255,255,0.75)' }}
        >
          返回
        </Button>
        <AntText style={{ color: '#fff', fontWeight: 600, flex: 1 }}>
          依赖分析：{projectName}
        </AntText>
        <AntText style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
          {new Date(analyzedAt).toLocaleString()}
        </AntText>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={analysisLoading}
          onClick={onReanalyze}
          style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
          ghost
        >
          重新分析
        </Button>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={handleDownloadJson}
          ghost
          style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
        >
          JSON
        </Button>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={() => downloadText(dotFormat, `${projectName}-lite.dot`)}
          ghost
          style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
        >
          DOT (轻量)
        </Button>
        {cruiserDot && (
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => downloadText(cruiserDot!, `${projectName}-cruiser.dot`)}
            ghost
            style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.3)' }}
          >
            DOT (cruiser)
          </Button>
        )}
      </div>

      {/* 统计卡片 */}
      <div style={{ flexShrink: 0, padding: '16px 20px 0' }}>
        <Row gutter={16}>
          {[
            { title: '扫描文件', value: totalFiles },
            { title: '核心模块', value: coreModules.length, color: '#1677ff' },
            { title: '边缘模块', value: leafModules.length, color: '#8c8c8c' },
            {
              title: '循环依赖',
              value: circularDependencies.length,
              color: circularDependencies.length > 0 ? '#faad14' : '#52c41a',
            },
          ].map((s) => (
            <Col span={6} key={s.title}>
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{s.title}</span>}
                value={s.value}
                valueStyle={{ color: s.color ?? '#fff', fontSize: 22 }}
              />
            </Col>
          ))}
        </Row>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px' }}>
        <Tabs items={topTabs} size="small" style={{ height: '100%' }} />
      </div>
    </div>
  );
}

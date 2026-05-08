import { ApartmentOutlined, CodeOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Spin, Typography } from 'antd';

const { Title, Paragraph } = Typography;
const AntText = Typography.Text;

type Props = {
  projectName: string;
  projectRoot: string;
  analysisLoading: boolean;
  hasAnalysisResult: boolean;
  onAnalyze: () => void;
  onRefactor: () => void;
};

export function ModeSelector({
  projectName,
  projectRoot,
  analysisLoading,
  hasAnalysisResult,
  onAnalyze,
  onRefactor,
}: Props): JSX.Element {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 32px',
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 760 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Title level={3} style={{ marginBottom: 4 }}>
            {projectName}
          </Title>
          <AntText type="secondary" style={{ fontSize: 12 }}>
            {projectRoot}
          </AntText>
        </div>

        <Row gutter={24} align="stretch">
          {/* 项目分析 */}
          <Col span={12} style={{ display: 'flex' }}>
            <Card
              style={{ width: '100%', borderWidth: 1.5 }}
              styles={{ body: { padding: '32px 28px', height: '100%', display: 'flex', flexDirection: 'column' } }}
            >
              <ApartmentOutlined style={{ fontSize: 40, color: '#1677ff', marginBottom: 16 }} />
              <Title level={4} style={{ marginBottom: 8 }}>项目分析</Title>
              <Paragraph type="secondary" style={{ flex: 1, marginBottom: 0 }}>
                使用 <strong>dependency-cruiser</strong> 与 <strong>madge</strong> 深度扫描
                JS / TS / Vue 模块依赖关系，自动识别循环依赖与冗余模块，梳理核心模块与边缘模块，
                生成可下载的 SVG 依赖图、DOT 格式与 JSON 报告，为重构顺序提供数据支撑。
              </Paragraph>
              <div style={{ paddingTop: 24 }}>
                <Spin spinning={analysisLoading}>
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<ApartmentOutlined />}
                    onClick={onAnalyze}
                    loading={analysisLoading}
                  >
                    {hasAnalysisResult ? '查看依赖分析' : '开始分析'}
                  </Button>
                </Spin>
              </div>
            </Card>
          </Col>

          {/* 开始重构 */}
          <Col span={12} style={{ display: 'flex' }}>
            <Card
              style={{ width: '100%', borderWidth: 1.5 }}
              styles={{ body: { padding: '32px 28px', height: '100%', display: 'flex', flexDirection: 'column' } }}
            >
              <CodeOutlined style={{ fontSize: 40, color: '#52c41a', marginBottom: 16 }} />
              <Title level={4} style={{ marginBottom: 8 }}>开始重构</Title>
              <Paragraph type="secondary" style={{ flex: 1, marginBottom: 0 }}>
                按照所选迁移方案（Vue 2/3 → React / Vue 3）逐文件 AI 重构，左侧文件树实时展示
                待处理 / 进行中 / 已完成状态，右侧 Diff 面板并排对比原始代码与生成结果，
                支持版本历史回溯与逐文件人工验收确认。
              </Paragraph>
              <div style={{ paddingTop: 24 }}>
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<CodeOutlined />}
                  onClick={onRefactor}
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                >
                  进入重构
                </Button>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}

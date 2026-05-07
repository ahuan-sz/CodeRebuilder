/**
 * 迁移技能（Prompt 脚本）— 主进程 / 渲染层共用常量。
 */

export type MigrationSkillId =
  | 'vue_sfc_default'
  | 'vue2_options_to_react'
  | 'vuex_to_rtk'
  | 'vuex_to_zustand';

export const MIGRATION_SKILLS: { id: MigrationSkillId; label: string; description: string }[] = [
  {
    id: 'vue_sfc_default',
    label: 'Vue SFC → React（默认）',
    description: '标准单文件组件：分步解析 template / script / style 后拼装 .tsx + .module.css。',
  },
  {
    id: 'vue2_options_to_react',
    label: 'Vue2 选项式 → React + Hooks',
    description:
      '选项式 API→函数组件+hooks；mixin→自定义 Hook；filters→纯函数；$emit→回调 props；Vuex map* 映射为 selectors/hooks。',
  },
  {
    id: 'vuex_to_rtk',
    label: 'Vuex 模块 → Redux Toolkit（整文件）',
    description:
      '适用 .js/.ts 等 Vuex module 源码：转为 createSlice + thunks + selectors（单轮 LLM）。',
  },
  {
    id: 'vuex_to_zustand',
    label: 'Vuex 模块 → Zustand（整文件）',
    description:
      '适用 .js/.ts 等 Vuex module 源码：转为 Zustand store（单轮 LLM）。',
  },
];

export interface SkillPromptFragments {
  global: string;
  template: string;
  script: string;
  style: string;
  assembly: string;
}

const VUE2_OPTIONS_BLOCK = `
【Vue2 选项式专项】把这个 Vue2 选项式组件转换成 React 函数组件：
- 使用 hooks 管理 state 与生命周期语义（useEffect/useLayoutEffect 等对应 mounted/updated/unmounted）。
- 保留样式作用域：产出 CSS Modules（className={styles.xxx}）。
- 原 mixin 逻辑抽成自定义 Hook（useXxx）并在组件内组合使用。
- filters 转为纯函数，在 JSX 或组件顶层调用。
- $emit / 自定义事件改为回调 props（onXxx/onSomething）。
- mapState/mapGetters/mapActions 等：用 useMemo/派生 selector 或小 hook；避免整块 store 塞进组件。
`.trim();

const VUE_DEFAULT_GLOBAL = `
You are an expert migrating Vue SFC to React (TypeScript, function components) with CSS Modules.
`.trim();

const VUEX_RTK_BLOCK = `
【Vuex → Redux Toolkit】将以下 Vuex 模块转为 Redux Toolkit slice：
- state → initialState；
- mutations → reducers（createSlice）；
- 含异步的 actions → createAsyncThunk + extraReducers；
- getters → memoized selectors（createSelector）；
使用 TypeScript，导出 slice、actions、selectors（可留 react-redux Provider 占位说明）。
`.trim();

const VUEX_ZUSTAND_BLOCK = `
【Vuex → Zustand】将以下 Vuex 模块转为 Zustand store：
- state 与各 mutation/action 语义映射到 set / 异步方法；
- getters → 独立 selector 函数或派生 getter；
使用 TypeScript 与 create() API，避免 Vue 运行时。
`.trim();

export function isVuexStoreSkill(skill: MigrationSkillId): boolean {
  return skill === 'vuex_to_rtk' || skill === 'vuex_to_zustand';
}

/** Vuex 技能仅对非 .vue 源启用；误选时在 .vue 上回退为默认流水线。 */
export function effectiveMigrationSkill(
  skill: MigrationSkillId,
  sourceRelativePath: string
): MigrationSkillId {
  if (!isVuexStoreSkill(skill)) return skill;
  return /\.vue$/i.test(sourceRelativePath) ? 'vue_sfc_default' : skill;
}

export function getSkillFragments(skill: MigrationSkillId): SkillPromptFragments {
  switch (skill) {
    case 'vue2_options_to_react':
      return {
        global: `${VUE_DEFAULT_GLOBAL}\n${VUE2_OPTIONS_BLOCK}`,
        template:
          '将 <template> 转为语义等价 JSX；组件/指令/事件绑定按 React 约定；slots → children/render props。',
        script:
          `将 <script> 转为 hooks 驱动的逻辑。\n${VUE2_OPTIONS_BLOCK}\n若为 Composition API/script setup，照旧映射为 hooks。`,
        style: '将 <style> 转为与 JSX 类名匹配的 CSS Modules（可含 :global 等价策略）。',
        assembly:
          '合并为单个默认导出函数组件；import CSS Module； wired 对上一步的 JSX 与 hooks；可读、可编译。',
      };
    case 'vuex_to_rtk':
      return {
        global: VUEX_RTK_BLOCK,
        template: '(无 Vue template，本条忽略)',
        script: VUEX_RTK_BLOCK,
        style: '若无可附样式：输出占位 .module.css 单行注释即可。',
        assembly: '',
      };
    case 'vuex_to_zustand':
      return {
        global: VUEX_ZUSTAND_BLOCK,
        template: '(无 Vue template)',
        script: VUEX_ZUSTAND_BLOCK,
        style: '最小占位样式块。',
        assembly: '',
      };
    default:
      return {
        global: VUE_DEFAULT_GLOBAL,
        template: '将模板映射为 JSX；v-if→条件；v-for→map+key。',
        script: '将脚本映射为 hooks；选项式 / Composition API 均支持。',
        style: '将样式转为模块化 CSS。',
        assembly: '整合为默认导出单个 React 函数组件。',
      };
  }
}

export function normalizeSkillId(raw: string | undefined | null): MigrationSkillId {
  if (!raw) return 'vue_sfc_default';
  const ok = MIGRATION_SKILLS.some((s) => s.id === raw);
  return ok ? (raw as MigrationSkillId) : 'vue_sfc_default';
}

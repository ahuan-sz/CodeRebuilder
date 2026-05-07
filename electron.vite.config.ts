import react from '@vitejs/plugin-react';
import monacoEditorPluginImport from 'vite-plugin-monaco-editor';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

const monacoEditorPlugin =
  typeof monacoEditorPluginImport === 'function'
    ? monacoEditorPluginImport
    : (monacoEditorPluginImport as { default: typeof monacoEditorPluginImport }).default;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    /**
     * `electron` 在 devDependencies，`externalizeDepsPlugin` 默认不会 external，
     * Rolldown 会把 `electron` 包入口（path.txt 安装脚本）打进 preload，`contextBridge` 不存在 → crApi 永远未注入。
     */
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        /** 必须 external，否则 Rolldown 会打入 npm `electron` 包的错误入口（安装脚本），preload 内无 contextBridge */
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: 'index.js',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [
      react(),
      /** 将 Monaco Worker 打入产物并由本地路径加载，避免 CDN / CSP 导致永久 Loading */
      monacoEditorPlugin({
        languageWorkers: ['editorWorkerService', 'css', 'html', 'json', 'typescript'],
      }),
    ],
  },
});

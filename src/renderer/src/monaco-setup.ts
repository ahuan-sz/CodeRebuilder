/**
 * 使用 npm 包内的 Monaco（ESM），通过 loader 注入实例，不再走 AMD / CDN。
 * Worker 由 vite-plugin-monaco-editor 写入产物并在 index.html 注入 MonacoEnvironment。
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

loader.config({ monaco });

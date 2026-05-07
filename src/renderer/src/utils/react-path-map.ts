/** `.react/...` 镜像路径 → 对应的 Vue 源文件相对路径（用于左侧树点击后在工作台打开 Diff）。 */
export function reactMirrorRelToVueSource(rel: string): string | null {
  const prefix = '.react/';
  if (!rel.startsWith(prefix)) return null;
  const inner = rel.slice(prefix.length);
  if (/\.module\.css$/i.test(inner)) {
    return inner.replace(/\.module\.css$/i, '.vue');
  }
  return inner
    .replace(/\.tsx$/i, '.vue')
    .replace(/\.jsx$/i, '.vue')
    .replace(/\.ts$/i, '.vue')
    .replace(/\.js$/i, '.vue');
}

export function isReactMirrorPath(rel: string): boolean {
  return rel.startsWith('.react/');
}

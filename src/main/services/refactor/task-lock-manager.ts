const locks = new Map<string, string>();

export function taskKey(projectId: string, sourceFilePath: string): string {
  return `${projectId}::${sourceFilePath}`;
}

export function tryAcquire(projectId: string, sourceFilePath: string, taskId: string): boolean {
  const k = taskKey(projectId, sourceFilePath);
  if (locks.has(k)) return false;
  locks.set(k, taskId);
  return true;
}

export function release(projectId: string, sourceFilePath: string, taskId: string): void {
  const k = taskKey(projectId, sourceFilePath);
  if (locks.get(k) === taskId) {
    locks.delete(k);
  }
}

export function getRunningTask(projectId: string, sourceFilePath: string): string | undefined {
  return locks.get(taskKey(projectId, sourceFilePath));
}

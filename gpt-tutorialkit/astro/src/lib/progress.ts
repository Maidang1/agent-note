// 学习进度与草稿：只存在本机浏览器 localStorage，不上传。
const PREFIX = 'gpt-course:';
export const PROGRESS_EVENT = 'gpt-course:progress';

export type Done = { at: number; viaSolution: boolean };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 隐私模式等写不进去时，进度只在本页有效 */
  }
}

export function getDone(id: string): Done | null {
  return read<Done>(`done:${id}`);
}

export function markDone(id: string, viaSolution: boolean) {
  const prev = getDone(id);
  // 自己做出来过就不再降级成「看了答案」
  write(`done:${id}`, { at: Date.now(), viaSolution: prev ? prev.viaSolution && viaSolution : viaSolution });
  window.dispatchEvent(new CustomEvent(PROGRESS_EVENT));
}

export function loadDraft(id: string): string | null {
  return read<string>(`draft:${id}`);
}

export function saveDraft(id: string, code: string | null) {
  write(`draft:${id}`, code);
}

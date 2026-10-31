import { useEffect, useMemo, useRef, useState } from 'react';
import PythonCodeEditor from './PythonCodeEditor';
import { getDone, loadDraft, markDone, saveDraft } from '../lib/progress';

type Snippet = { label: string; url: string; start: number; code: string };

type Props = {
  lessonId: string;
  initialCode: string;
  solutionCode: string;
  originals: Snippet[];
  next?: { href: string; title: string };
  backend?: string;
};

type Check = { name: string; ok: boolean; msg: string };

type RunResult = {
  ok: boolean;
  exit_code?: number;
  timed_out?: boolean;
  truncated?: boolean;
  elapsed_ms?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  checks?: Check[] | null;
};

type Mode = 'run' | 'check';

export default function PythonRunner({ lessonId, initialCode, solutionCode, originals, next, backend }: Props) {
  const api = useMemo(() => backend || (typeof window !== 'undefined' &&
    (window as Window & { __RUNNER_API__?: string }).__RUNNER_API__) || 'http://127.0.0.1:8765', [backend]);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [viewingSolution, setViewingSolution] = useState(false);
  const [completed, setCompleted] = useState(false);
  const mine = useRef<string | null>(null); // 看答案前的自己的代码

  // 草稿和完成状态只在浏览器里读，避免和服务端渲染的初始代码冲突
  useEffect(() => {
    const draft = loadDraft(lessonId);
    if (draft != null) setCode(draft);
    setCompleted(Boolean(getDone(lessonId)));
  }, [lessonId]);

  useEffect(() => {
    if (viewingSolution) return;
    const t = setTimeout(() => saveDraft(lessonId, code === initialCode ? null : code), 300);
    return () => clearTimeout(t);
  }, [code, viewingSolution, lessonId, initialCode]);

  async function execute(kind: Mode) {
    if (busy) return;
    setBusy(kind);
    setMode(kind);
    setResult(null);
    try {
      const res = await fetch(`${api}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'check' ? { code, lesson: lessonId } : { code }),
      });
      if (!res.ok) throw new Error(`运行后端返回 HTTP ${res.status}`);
      const data: RunResult = await res.json();
      setResult(data);
      if (kind === 'check' && data.checks?.length && data.checks.every((c) => c.ok)) {
        markDone(lessonId, viewingSolution);
        setCompleted(true);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setResult({ ok: false, error: `连不上本机运行后端（${api}）。请确认 ./run.sh 正在运行。\n${message}` });
    } finally {
      setBusy(null);
    }
  }

  async function stop() {
    try {
      const response = await fetch(`${api}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setResult({ ok: false, error: `停止请求未成功：${message}` });
    }
  }

  function reset() {
    if (code !== initialCode && !window.confirm('重置会丢掉你在这一课写的代码，确定吗？')) return;
    mine.current = null;
    setViewingSolution(false);
    setCode(initialCode);
    setResult(null);
    setMode(null);
  }

  function toggleSolution() {
    if (viewingSolution) {
      setCode(mine.current ?? initialCode);
      setViewingSolution(false);
      return;
    }
    if (!window.confirm('先点「检查」看看提示，往往比直接看答案学得更牢。\n\n仍然要看答案吗？你的代码会保留，随时可以切回来。')) return;
    mine.current = code;
    setCode(solutionCode);
    setViewingSolution(true);
  }

  // —— 纯展示派生 ——
  const checks = mode === 'check' ? result?.checks ?? null : null;
  const passed = checks?.filter((c) => c.ok).length ?? 0;
  const allPassed = Boolean(checks && checks.length > 0 && passed === checks.length);
  const stopped = Boolean(result && result.exit_code === -9 && !result.timed_out && !result.truncated);
  const failed = Boolean(result && (!result.ok || result.error || result.timed_out || (result.exit_code ?? 0) !== 0));
  const firstFail = checks?.find((c) => !c.ok);

  let status = completed ? '本课已完成，可以继续改着玩' : '写完 TODO 后点「检查」';
  let tone: 'idle' | 'ok' | 'error' = 'idle';
  if (busy) status = busy === 'check' ? '正在判题…' : '正在运行…';
  else if (result?.error) { status = '没有运行'; tone = 'error'; }
  else if (stopped) status = '已手动停止';
  else if (result?.timed_out) { status = '超过 40 秒，已停止'; tone = 'error'; }
  else if (mode === 'check' && result) {
    if (!checks) { status = '判题没有跑完'; tone = 'error'; }
    else if (allPassed) { status = `全部通过 ${passed}/${checks.length}`; tone = 'ok'; }
    else { status = `通过 ${passed}/${checks.length}`; tone = 'error'; }
  } else if (mode === 'run' && result) {
    status = failed ? '运行出错' : '运行完成';
    tone = failed ? 'error' : 'idle';
  }

  return (
    <div className="runner" aria-busy={Boolean(busy)}>
      <div className="runner-toolbar" aria-label="代码操作">
        <div className="runner-file">
          <span className="runner-filename">lesson.py</span>
          {viewingSolution
            ? <span className="badge badge-outline">正在看答案</span>
            : <span className="runner-file-hint">自动保存在本机</span>}
        </div>
        <div className="runner-actions">
          <button onClick={toggleSolution} disabled={Boolean(busy)} className="btn btn-ghost btn-sm">
            {viewingSolution ? '回到我的代码' : '看答案'}
          </button>
          <button onClick={reset} disabled={Boolean(busy)} className="btn btn-ghost btn-sm">重置</button>
          {busy
            ? <button onClick={stop} className="btn btn-outline btn-sm">停止</button>
            : <button onClick={() => execute('run')} className="btn btn-outline btn-sm" title="⌘/Ctrl + Enter">
                运行 <kbd>⌘↵</kbd>
              </button>}
          <button onClick={() => execute('check')} disabled={Boolean(busy)} className="btn btn-primary btn-sm" title="⇧ + ⌘/Ctrl + Enter">
            检查 <kbd>⇧⌘↵</kbd>
          </button>
        </div>
      </div>

      <div className="runner-editor">
        <PythonCodeEditor value={code} onChange={setCode} onRun={() => execute('run')} onCheck={() => execute('check')} />
      </div>

      <div className="runner-output">
        <div className="runner-status" role="status">
          <span className={`status-dot status-${busy ? 'busy' : tone}`} aria-hidden="true" />
          <strong>{status}</strong>
          <span className="runner-meta">
            {result?.elapsed_ms != null && <span>{(result.elapsed_ms / 1000).toFixed(1)} s</span>}
            {result?.truncated && <span>输出已截断</span>}
          </span>
        </div>

        <div className="runner-scroll" aria-label="运行结果">
          {!result && !busy && (
            <ol className="runner-steps">
              <li>读左边的「为什么」，先猜一猜</li>
              <li>把右边高亮的 <code>TODO(...)</code> 换成你的代码</li>
              <li><b>运行</b>看输出，<b>检查</b>和原版逐项比对</li>
            </ol>
          )}
          {busy && <p className="runner-empty">{busy === 'check' ? '在本机执行你的代码，再逐项和原版对比…' : '在本机执行 lesson.py…'}</p>}
          {result?.error && <div className="alert alert-destructive" role="alert">{result.error}</div>}

          {checks && (
            <ul className="checks" aria-label="检查结果">
              {checks.map((c, i) => (
                <li key={i} className={c.ok ? 'check-ok' : 'check-fail'}>
                  <span className="check-icon" aria-hidden="true">{c.ok ? '✓' : '✕'}</span>
                  <div>
                    <div className="check-name">{c.name}</div>
                    {!c.ok && c.msg && <div className="check-msg">{c.msg}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {allPassed && (
            <div className="card complete-card">
              <div className="complete-head">
                <strong>{viewingSolution ? '答案跑通了' : '本课完成'}</strong>
                {viewingSolution && <span className="runner-file-hint">回到自己的代码再做一遍，印象更深</span>}
              </div>
              {originals.length > 0 && (
                <details className="original">
                  <summary>对照原版代码</summary>
                  {originals.map((o) => (
                    <div key={o.label}>
                      <a href={o.url} target="_blank" rel="noreferrer" className="original-label">{o.label} ↗</a>
                      <pre>{o.code.split('\n').map((line, i) => (
                        <span key={i}><span className="ln">{o.start + i}</span>{line}{'\n'}</span>
                      ))}</pre>
                    </div>
                  ))}
                </details>
              )}
              {next && <a className="btn btn-primary btn-sm next-link" href={next.href}>下一课：{next.title} →</a>}
            </div>
          )}

          {firstFail && !busy && (
            <p className="runner-hint">从第一条 ✕ 开始改。实在卡住，左边「提示」是一级一级往答案靠的。</p>
          )}

          {result && !busy && (result.stdout || result.stderr) && (
            <div className="output-blocks">
              {result.stdout && <div className="output-block">
                <div className="output-label">输出</div>
                <pre>{result.stdout}</pre>
              </div>}
              {result.stderr && <div className="output-block output-stderr">
                <div className="output-label">报错 / 警告</div>
                <pre>{result.stderr}</pre>
              </div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

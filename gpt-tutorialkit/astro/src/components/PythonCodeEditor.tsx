import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState, Prec, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { tags } from '@lezer/highlight';

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** ⌘/Ctrl+Enter */
  onRun?: () => void;
  /** ⇧+⌘/Ctrl+Enter */
  onCheck?: () => void;
};

const pythonHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--code-keyword)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  { tag: tags.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-function)' },
  { tag: [tags.className, tags.typeName], color: 'var(--code-type)' },
  { tag: tags.operator, color: 'var(--code-operator)' },
]);

// Esc 退出：低优先级注册——搜索面板等打开时由面板自己的 Esc 先关闭面板；
// 无面板时 blur contentDOM（焦点实际挂在 .cm-content 上，blur 外层 dom 无效），随后 Tab 可移出。
// Tab 缩进（indentWithTab）不受影响。
const escapeToBlur = Prec.low(keymap.of([{
  key: 'Escape',
  run: (view) => { view.contentDOM.blur(); return true; },
}]));

// 还没补全的 TODO(...) 行整行淡色标出，一眼看到要写哪里
const todoLine = Decoration.line({ class: 'cm-todo-line' });
function todoDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      if (/\bTODO\(/.test(line.text)) builder.add(line.from, line.from, todoLine);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}
const highlightTodos = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = todoDecorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) this.decorations = todoDecorations(update.view);
  }
}, { decorations: (v) => v.decorations });

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px', backgroundColor: 'var(--background)', color: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)', lineHeight: '1.7' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--ring)' },
  '.cm-line': { padding: '0 16px' },
  '.cm-todo-line': { backgroundColor: 'var(--todo)', boxShadow: 'inset 2px 0 0 var(--todo-edge)' },
  '.cm-gutters': { backgroundColor: 'var(--background)', color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)' },
  '.cm-gutterElement': { padding: '0 8px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
  '.cm-cursor': { borderLeftColor: 'var(--ring)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--selection)', outline: '1px solid var(--ring)' },
});

export default function PythonCodeEditor({ value, onChange, onRun, onCheck }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  const initialValue = useRef(value);
  callback.current = onChange;
  const actions = useRef({ onRun, onCheck });
  actions.current = { onRun, onCheck };

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          // 高优先级：basicSetup 的默认键位把 Mod-Enter 绑成「插入空行」
          Prec.highest(keymap.of([
            { key: 'Mod-Enter', run: () => { actions.current.onRun?.(); return true; } },
            { key: 'Shift-Mod-Enter', run: () => { actions.current.onCheck?.(); return true; } },
          ])),
          basicSetup,
          python(),
          indentUnit.of('    '),
          keymap.of([indentWithTab]),
          EditorView.lineWrapping,
          escapeToBlur,
          highlightTodos,
          editorTheme,
          syntaxHighlighting(pythonHighlight),
          EditorView.contentAttributes.of({ 'aria-label': 'Python 代码编辑器', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callback.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    editor.current = view;
    return () => { editor.current = null; view.destroy(); };
  }, []);

  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="python-code-editor" />;
}

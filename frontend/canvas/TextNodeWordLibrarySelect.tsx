import React from 'react';
import { TEXT_WORD_LIBRARY_KEYS } from './initialPromptPresets';

/**
 * 文本节点「词库」下拉：选中一个词库条目后，
 * 把对应 prompt 内容插入到节点 textarea 的光标位置（追加到现有 prompt 末尾）。
 * 下拉本身只承担「选择」状态，无持久化（区别于 t2i/i2i 的 activePresets 模式）。
 */
export const TextNodeWordLibrarySelect = React.memo(function TextNodeWordLibrarySelect({
  nodeId,
  promptPresets,
  onUpdateNode,
}: {
  nodeId: string;
  promptPresets: Record<string, string>;
  onUpdateNode: (nodeId: string, updates: { prompt?: string }) => void;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    // 重置回「未使用」选项，避免「选中」状态残留
    e.target.value = '';
    if (!key) return;
    const text = promptPresets[key];
    if (text == null) return;

    const inputEl = document.querySelector(
      `[data-node-prompt="${nodeId}"]`
    ) as HTMLTextAreaElement | null;

    const current = inputEl?.value ?? '';
    const insertAt = inputEl?.selectionStart ?? current.length;
    const needsLeadingBreak = insertAt > 0 && !/\s/.test(current[insertAt - 1] ?? '');
    const prefix = insertAt > 0 ? (needsLeadingBreak ? '\n' : '') : '';
    const next = current.slice(0, insertAt) + prefix + text + current.slice(insertAt);

    onUpdateNode(nodeId, { prompt: next });
    requestAnimationFrame(() => {
      if (!inputEl) return;
      inputEl.focus();
      const caret = insertAt + prefix.length + text.length;
      inputEl.selectionStart = inputEl.selectionEnd = caret;
    });
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 shrink-0 border-b border-[#333]">
      <span className="text-gray-500 shrink-0" style={{ fontSize: 30 }}>词库</span>
      <select
        className="flex-1 min-w-[120px] bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-emerald-500"
        style={{ fontSize: 30 }}
        defaultValue=""
        onPointerDown={(e) => e.stopPropagation()}
        onChange={handleChange}
        title="选择词库条目，将提示词插入到文本节点光标处"
      >
        <option value="" style={{ fontSize: 30 }}>未使用</option>
        {TEXT_WORD_LIBRARY_KEYS.map((k) => (
          <option key={k} value={k} style={{ fontSize: 30 }}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
});

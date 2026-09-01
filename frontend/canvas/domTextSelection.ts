/** 读取当前可复制的文字选区（兼容 textarea/input 与普通划选）。 */
export function getDomSelectedText(target?: EventTarget | null): string {
  const fromField = (el: Element | null): string => {
    if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return '';
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end <= start) return '';
    return el.value.slice(start, end);
  };

  const fromTarget = fromField(target instanceof Element ? target : null);
  if (fromTarget) return fromTarget;

  const fromActive = fromField(document.activeElement);
  if (fromActive) return fromActive;

  return window.getSelection()?.toString() ?? '';
}

const EDITABLE_SELECTOR =
  'textarea, input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), [contenteditable="true"]';

/** 右键目标是否落在可划选文字区域（输入框 / 对话气泡 / 文本节点正文）。 */
export function isTextSelectableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    `${EDITABLE_SELECTOR}, .canvas-selectable-text`
  );
}

/** 可编辑输入目标（可粘贴）。只读/禁用字段不算。 */
export function getTextEditableElement(
  target: EventTarget | null
): HTMLTextAreaElement | HTMLInputElement | HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(EDITABLE_SELECTOR);
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    if (el.disabled || el.readOnly) return null;
    return el;
  }
  if (el instanceof HTMLElement && el.isContentEditable) return el;
  return null;
}

export type PendingTextPasteTarget = {
  el: HTMLTextAreaElement | HTMLInputElement | HTMLElement;
  start: number;
  end: number;
};

/** 菜单打开后选区/焦点会丢，需在右键瞬间记下粘贴落点 */
let pendingTextPasteTarget: PendingTextPasteTarget | null = null;

export function setPendingTextPasteTarget(target: PendingTextPasteTarget | null): void {
  pendingTextPasteTarget = target;
}

export function getPendingTextPasteTarget(): PendingTextPasteTarget | null {
  return pendingTextPasteTarget;
}

export function captureTextPasteTarget(target: EventTarget | null): PendingTextPasteTarget | null {
  const el = getTextEditableElement(target);
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return {
      el,
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  }
  return { el, start: 0, end: 0 };
}

function setNativeInputValue(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
}

/** 在记下的光标/选区处插入剪贴板文字，并触发 input 以同步 React 受控值 */
export function insertTextIntoEditable(
  el: HTMLTextAreaElement | HTMLInputElement | HTMLElement,
  text: string,
  start: number,
  end: number
): void {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setNativeInputValue(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const caret = start + text.length;
    el.focus();
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* type=number 等可能不支持 */
    }
    return;
  }
  el.focus();
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    // 兜底：直接拼到末尾并触发 input
    el.textContent = (el.textContent ?? '') + text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export async function pastePendingTextFromClipboard(): Promise<boolean> {
  const pending = pendingTextPasteTarget;
  if (!pending || !pending.el.isConnected) return false;
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return false;
  }
  if (!text) return false;
  insertTextIntoEditable(pending.el, text, pending.start, pending.end);
  return true;
}

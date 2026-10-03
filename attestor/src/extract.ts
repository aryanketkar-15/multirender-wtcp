import {
  CONTROL_ROLES,
  IGNORED_TAGS,
  STATEFUL_ROLES,
  accessibleName,
  headingLevel,
  hiddenFromAT,
  isPresentational,
  labellingElements,
  roleOf,
  textOf,
} from './roles';
import type { Role } from './roles';

/** A semantic node before normalisation and measurement. `el` is kept for the measuring stages. */
export interface RawNode {
  role: Role;
  /** heading level; only for headings */
  level?: number;
  /** readable text; heading, paragraph and text nodes */
  text?: string;
  /** accessible name; links, buttons, checkboxes, radios, switches */
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  selected?: boolean;
  el: Element;
}

function truthy(el: Element, attr: string, prop: boolean | undefined): boolean {
  if (prop === true) return true;
  return el.getAttribute(attr)?.trim().toLowerCase() === 'true';
}

function stateOf(el: Element, role: Role): Partial<RawNode> {
  const input = el as HTMLInputElement;
  const state: Partial<RawNode> = {};
  if (STATEFUL_ROLES.includes(role)) {
    state.checked = truthy(el, 'aria-checked', 'checked' in el ? input.checked : undefined);
    state.required = truthy(el, 'aria-required', 'required' in el ? input.required : undefined);
  }
  if (CONTROL_ROLES.includes(role)) {
    state.disabled = truthy(el, 'aria-disabled', 'disabled' in el ? input.disabled : undefined);
  }
  if (el.hasAttribute('aria-selected')) state.selected = truthy(el, 'aria-selected', undefined);
  return state;
}

/**
 * Walks `root` in document order and returns the semantic nodes inside it. Anything outside
 * `root` is never visited. The root itself is a container, not a node.
 *
 * Ordering rules: pre-order, so a paragraph precedes the links inside it. Headings, buttons and
 * links are leaves. Text directly inside a non-allowlisted container becomes a `text` node, except
 * text that is the label of a control (it is already part of that control's name).
 */
export function extractNodes(root: Element): RawNode[] {
  const out: RawNode[] = [];

  const visit = (el: Element, emitText: boolean): void => {
    const tag = el.tagName.toLowerCase();
    if (IGNORED_TAGS.has(tag) || hiddenFromAT(el)) return;

    if (isPresentational(el)) {
      descend(el, emitText);
      return;
    }

    const role = roleOf(el);
    if (role === null) {
      descend(el, emitText && !(tag === 'label' && labelsAControl(el)));
      return;
    }

    switch (role) {
      case 'heading':
        out.push({ role, level: headingLevel(el), text: textOf(el), el });
        return;
      case 'paragraph':
        out.push({ role, text: textOf(el), el });
        descend(el, false); // links and controls inside the paragraph, after it
        return;
      case 'text':
        out.push({ role, text: textOf(el), el });
        return;
      default:
        out.push({ role, name: accessibleName(el), ...stateOf(el, role), el });
    }
  };

  const descend = (el: Element, emitText: boolean): void => {
    el.childNodes.forEach((child) => {
      if (child.nodeType === 1) {
        visit(child as Element, emitText);
      } else if (child.nodeType === 3 && emitText) {
        const text = child.nodeValue ?? '';
        if (text.trim() !== '') out.push({ role: 'text', text, el });
      }
    });
  };

  descend(root, true);
  return out;
}

function labelsAControl(label: Element): boolean {
  const control = (label as HTMLLabelElement).control;
  if (control) return true;
  if (label.querySelector('input:not([type=hidden]), [role=checkbox], [role=radio], [role=switch]'))
    return true;
  const target = label.getAttribute('for');
  if (!target) return false;
  const found = label.ownerDocument.getElementById(target);
  return found !== null && labellingElements(found).includes(label);
}

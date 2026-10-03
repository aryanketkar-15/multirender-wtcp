/**
 * Role allowlist and accessible-name computation.
 *
 * The allowlist deliberately excludes constructs whose role computation is known to diverge
 * between Blink, Gecko and WebKit (tables, lists, landmarks, comboboxes, ...). Narrowing it is the
 * cheapest stability lever available and costs little semantic signal. This module is part of the
 * SRI-pinned Attestor and has no dependencies.
 */

export const ROLES = [
  'heading',
  'paragraph',
  'text',
  'link',
  'checkbox',
  'radio',
  'switch',
  'button',
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that carry interaction state and are measured for occlusion and visibility as controls. */
export const CONTROL_ROLES: readonly Role[] = ['link', 'checkbox', 'radio', 'switch', 'button'];
export const STATEFUL_ROLES: readonly Role[] = ['checkbox', 'radio', 'switch'];

/** Subtrees that never carry consent-relevant semantics. */
export const IGNORED_TAGS = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'select',
  'option',
  'textarea',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'head',
]);

export function isAllowlisted(role: string): role is Role {
  return (ROLES as readonly string[]).includes(role);
}

/** True when assistive technology (and therefore the digest) must not see the element. */
export function hiddenFromAT(el: Element): boolean {
  if (el.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true') return true;
  if (el.hasAttribute('hidden')) return true;
  return el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type === 'hidden';
}

/** Explicit `role="presentation"` / `none`: the element itself is skipped, its children are not. */
export function isPresentational(el: Element): boolean {
  const role = el.getAttribute('role')?.trim().toLowerCase();
  return role === 'presentation' || role === 'none';
}

/** Implicit or explicit role, restricted to the allowlist. Returns null for everything else. */
export function roleOf(el: Element): Role | null {
  const explicit = el.getAttribute('role')?.trim().toLowerCase().split(/\s+/)[0];
  if (explicit && isAllowlisted(explicit)) return explicit;

  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'p') return 'paragraph';
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
  if (tag === 'button') return 'button';
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
  }
  return null;
}

export function headingLevel(el: Element): number {
  const aria = Number(el.getAttribute('aria-level'));
  if (Number.isInteger(aria) && aria >= 1 && aria <= 6) return aria;
  const m = /^h([1-6])$/.exec(el.tagName.toLowerCase());
  return m ? Number(m[1]) : 2;
}

/**
 * Text the user can read from a subtree: skips aria-hidden and `hidden` content, scripts and
 * styles, and an optional excluded element (a control inside its own label).
 */
export function textOf(node: Node, exclude?: Element): string {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  if (el === exclude) return '';
  if (IGNORED_TAGS.has(el.tagName.toLowerCase()) || hiddenFromAT(el)) return '';
  if (el.tagName.toLowerCase() === 'br') return ' ';
  let out = '';
  el.childNodes.forEach((child) => {
    out += textOf(child, exclude);
  });
  return out;
}

function labelsFor(el: Element): Element[] {
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) return [...labels];
  const found: Element[] = [];
  const wrapping = el.closest('label');
  if (wrapping) found.push(wrapping);
  if (el.id) {
    const doc = el.ownerDocument;
    doc.querySelectorAll('label[for]').forEach((l) => {
      if (l.getAttribute('for') === el.id && !found.includes(l)) found.push(l);
    });
  }
  return found;
}

/** The `<label>` elements that name a control; their text is part of the control's name. */
export function labellingElements(control: Element): Element[] {
  return labelsFor(control);
}

/** Accessible name, in the order: aria-labelledby, aria-label, native label, content, value, title. */
export function accessibleName(el: Element): string {
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const doc = el.ownerDocument;
    const text = labelledby
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((n): n is HTMLElement => n !== null)
      .map((n) => textOf(n))
      .join(' ');
    if (text.trim() !== '') return text;
  }
  const label = el.getAttribute('aria-label');
  if (label && label.trim() !== '') return label;

  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'reset') {
      const value = (el as HTMLInputElement).value;
      if (value && value.trim() !== '') return value;
    } else {
      const native = labelsFor(el)
        .map((l) => textOf(l, el))
        .join(' ');
      if (native.trim() !== '') return native;
    }
  }
  const content = textOf(el);
  if (content.trim() !== '') return content;
  return el.getAttribute('title') ?? '';
}

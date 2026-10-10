/**
 * Region policy `consent/v1` verification (matches PHP Mra\Validation\RegionPolicy).
 * Ensures that the committed bundle critical region includes:
 * - Disclosure text (<p> with content)
 * - Accept control (#btn-agree)
 * - Reject control (#btn-reject)
 * - Interactive elements (button, a, input)
 * - Neither hidden via attributes, inline style, or bundle CSS
 * - Attestation action target matches the control clicked
 */

export const CONSENT_V1_POLICY = 'consent/v1';
export const ACCEPT_ID = 'btn-agree';
export const REJECT_ID = 'btn-reject';

export interface RegionPolicyViolation {
  code: string;
  message: string;
}

export function checkRegionPolicy(
  bundle: Record<string, unknown>,
  attestationRecord: Record<string, unknown>,
): string[] {
  const violations: string[] = [];
  const policy = String(bundle.region_policy ?? '');
  if (policy !== CONSENT_V1_POLICY) {
    violations.push(`unknown policy ${policy}`);
    return violations;
  }

  const regionSelector = String(bundle.critical_region ?? '');
  const regionMatch = regionSelector.match(/^#([A-Za-z][\w-]*)$/);
  if (!regionMatch) {
    violations.push('critical region must be selected by id');
    return violations;
  }

  const regionId = regionMatch[1];
  const markup = String(bundle.markup ?? '');
  const css = String(bundle.css ?? '');

  // Extract the critical region content
  const regionRegex = new RegExp(
    `<([A-Za-z0-9]+)[^>]*\\bid=["']${regionId}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const regionElementMatch = markup.match(regionRegex);
  if (!regionElementMatch) {
    violations.push('critical region is absent from the bundle');
    return violations;
  }

  const regionContent = regionElementMatch[2];

  // Check for disclosure text: <p> with non-empty content
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let hasDisclosureText = false;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(regionContent)) !== null) {
    const textContent = pMatch[1].replace(/<[^>]*>/g, '').trim();
    if (textContent.length > 0) {
      hasDisclosureText = true;
      break;
    }
  }

  if (!hasDisclosureText) {
    violations.push('no disclosure text');
  }

  // Check controls: accept (#btn-agree) and reject (#btn-reject)
  const controls = [
    { id: ACCEPT_ID, label: 'accept' },
    { id: REJECT_ID, label: 'reject' },
  ];

  for (const { id, label } of controls) {
    const controlRegex = new RegExp(`<([A-Za-z0-9]+)([^>]*)?\\bid=["']${id}["']([^>]*)>`, 'i');
    const controlMatch = regionContent.match(controlRegex);
    if (!controlMatch) {
      violations.push(`no ${label} control`);
      continue;
    }

    const tagName = controlMatch[1].toLowerCase();
    if (!['button', 'a', 'input'].includes(tagName)) {
      violations.push(`${label} control is not a control element`);
    }

    const attrs = (controlMatch[2] ?? '') + ' ' + (controlMatch[3] ?? '');
    const isHiddenAttr = /\bhidden\b/i.test(attrs) || /aria-hidden=["']true["']/i.test(attrs);
    const isHiddenInline =
      /style=["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])|font-size\s*:\s*0(?![.\d]))/i.test(
        attrs,
      );
    const isHiddenCss = isHiddenByCss(css, id);

    if (isHiddenAttr || isHiddenInline || isHiddenCss) {
      violations.push(`${label} control is hidden`);
    }
  }

  // Check if critical region itself is hidden in CSS
  if (isHiddenByCss(css, regionId)) {
    violations.push('critical region is hidden');
  }

  // Check attestation agreement
  const actionTarget = String(attestationRecord.action_target ?? '');
  const action = String(attestationRecord.action ?? '');

  if (action === 'accept' && actionTarget !== `#${ACCEPT_ID}`) {
    violations.push(`action_target ${actionTarget} does not match accept action`);
  } else if (action === 'reject' && actionTarget !== `#${REJECT_ID}`) {
    violations.push(`action_target ${actionTarget} does not match reject action`);
  } else if (action !== 'accept' && action !== 'reject') {
    violations.push(`unknown attestation action ${action}`);
  }

  return violations;
}

function isHiddenByCss(css: string, id: string): boolean {
  const escaped = id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(
    `#${escaped}\\s*\\{[^}]*(display\\s*:\\s*none|visibility\\s*:\\s*hidden|opacity\\s*:\\s*0(?![.\\d])|font-size\\s*:\\s*0(?![.\\d]))`,
    'i',
  );
  return regex.test(css);
}

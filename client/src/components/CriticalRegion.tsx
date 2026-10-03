import { useEffect, useMemo, useRef } from 'react';
import { sanitizeSealedMarkup } from '../lib/bundle';

export type ConsentAction = 'accept' | 'reject';

interface Props {
  markup: string;
  css: string;
  onAction: (action: ConsentAction, target: string) => void;
  /** When true the controls are inert (an action was already recorded). */
  locked?: boolean;
}

/**
 * Renders the sealed critical region inside a declared container and wires its controls.
 *
 * Rules enforced here, because the digest reads exactly what this renders:
 *  - the consent checkbox is forced unticked on mount and never defaulted,
 *  - Accept stays disabled until the box is ticked,
 *  - an action is captured once: a double click records one action, not two,
 *  - everything is reachable and operable from the keyboard (native controls, no custom widgets).
 */
export function CriticalRegion({ markup, css, onAction, locked = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const acted = useRef(false);
  const html = useMemo(() => sanitizeSealedMarkup(markup), [markup]);

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    acted.current = false;
    const box = root.querySelector<HTMLInputElement>('#agree');
    const accept = root.querySelector<HTMLButtonElement>('#btn-agree');
    const reject = root.querySelector<HTMLButtonElement>('#btn-reject');
    if (box) box.checked = false;
    const sync = () => {
      if (accept) accept.disabled = acted.current || !(box?.checked ?? false);
      if (reject) reject.disabled = acted.current;
      if (box) box.disabled = acted.current;
    };
    const fire = (action: ConsentAction, target: string) => () => {
      if (acted.current) return;
      if (action === 'accept' && !(box?.checked ?? false)) return;
      acted.current = true;
      sync();
      onAction(action, target);
    };
    const onAccept = fire('accept', 'btn-agree');
    const onReject = fire('reject', 'btn-reject');
    box?.addEventListener('change', sync);
    accept?.addEventListener('click', onAccept);
    reject?.addEventListener('click', onReject);
    sync();
    return () => {
      box?.removeEventListener('change', sync);
      accept?.removeEventListener('click', onAccept);
      reject?.removeEventListener('click', onReject);
    };
  }, [html, onAction]);

  useEffect(() => {
    if (!locked) return;
    acted.current = true;
    host.current
      ?.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')
      .forEach((c) => (c.disabled = true));
  }, [locked]);

  return (
    <div className="card" data-testid="critical-region-host">
      <style>{css}</style>
      <div ref={host} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

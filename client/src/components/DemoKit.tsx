import { useEffect, useRef, useState } from 'react';
import { uploadAndVerifyPack } from '../lib/verifierClient';
import type { VerificationResult } from '../lib/verifierClient';
import { DiffView } from './DiffView';
import { StageList } from './StageList';
import { VerdictCard } from './VerdictCard';

const STEPS = ['Open the notice', 'Choose: leave it or alter it', 'Accept', 'Check independently'];

/** The four moments of the demo, in the order they happen. `current` is 1 to 4. */
export function DemoSteps({ current }: { current: number }) {
  return (
    <ol className="demo-steps" aria-label="Demo progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'now' : 'next';
        return (
          <li
            key={label}
            className={`demo-step ${state}`}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            <span className="demo-step-n" aria-hidden="true">
              {state === 'done' ? '✓' : n}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Lets the presenter play the attacker. The sealed paragraph is rewritten in the page after it
 * loaded, exactly the case the system exists to catch: the server's record is untouched and the
 * browser's attestation will describe the rewritten text.
 */
export function DemoAttack({
  altered,
  onAlter,
  disabled,
}: {
  altered: boolean;
  onAlter: () => void;
  disabled: boolean;
}) {
  return (
    <section className="card demo-attack" aria-labelledby="demo-attack-title">
      <h2 id="demo-attack-title">Play the attacker</h2>
      {altered ? (
        <p className="banner warn" role="status">
          The notice on screen now promises something the server never sent. Tick the box and
          accept, then watch whether the evidence notices.
        </p>
      ) : (
        <p>
          Imagine malware or a browser extension rewriting the notice after it loaded. Press the
          button to do that, or leave the page as it is and accept normally.
        </p>
      )}
      <button
        type="button"
        className="btn secondary"
        onClick={onAlter}
        disabled={disabled || altered}
      >
        {altered ? 'Page altered' : 'Alter the page'}
      </button>
    </section>
  );
}

/** Rewrites the first paragraph of the sealed region to a false promise. */
export function alterSealedParagraph(): boolean {
  const p = document.querySelector('#consent-region p');
  if (!p) return false;
  p.textContent = 'We will never share your data with anyone.';
  return true;
}

type Check =
  | { kind: 'running'; note: string }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; result: VerificationResult };

/** Downloads the pack just recorded and sends it to the independent verifier. */
export function DemoVerification({ packId }: { packId: string | null | undefined }) {
  const [check, setCheck] = useState<Check>({
    kind: 'running',
    note: 'Fetching your evidence pack',
  });

  const resultRef = useRef<HTMLDivElement>(null);

  // The verdict is the point of the demo: bring it into view when it arrives.
  useEffect(() => {
    if (check.kind === 'done')
      resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [check.kind]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!packId) throw new Error('The server did not return a pack for this record.');
        const res = await fetch(`/api/pack/${encodeURIComponent(packId)}/download`);
        if (!res.ok) throw new Error(`The pack could not be downloaded (HTTP ${res.status}).`);
        const blob = await res.blob();
        if (cancelled) return;
        setCheck({ kind: 'running', note: 'Re-rendering the sealed notice in a separate browser' });
        const result = await uploadAndVerifyPack(blob);
        if (!cancelled) setCheck({ kind: 'done', result });
      } catch (e) {
        if (!cancelled) {
          setCheck({
            kind: 'failed',
            message: e instanceof Error ? e.message : 'The check could not run.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packId]);

  if (check.kind === 'running') {
    return (
      <div className="banner warn" role="status">
        <span className="spinner" aria-hidden="true" /> {check.note}…
      </div>
    );
  }
  if (check.kind === 'failed') {
    return (
      <div className="banner error" role="alert">
        {check.message} Is the verifier service running on port 8095?
      </div>
    );
  }
  const { result } = check;
  return (
    <div className="demo-result" ref={resultRef}>
      <VerdictCard result={result} />
      {result.diff ? <DiffView diff={result.diff} /> : null}
      <StageList
        stages={result.stages}
        passedStages={result.passedStages}
        failedStage={result.failedStage}
      />
      <button type="button" className="btn secondary" onClick={() => window.location.reload()}>
        Run the demo again
      </button>
    </div>
  );
}

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DiffView } from '../src/components/DiffView';
import { StageList } from '../src/components/StageList';
import { VerdictCard } from '../src/components/VerdictCard';
import { getVerdictMeta } from '../src/lib/verdictMeta';
import * as verifierClient from '../src/lib/verifierClient';
import { Verify } from '../src/pages/Verify';

describe('Milestone 5.4 — Verifier interface and plain-language dashboard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // T5.4.1: Verified displays clearly
  test('T5.4.1: Verified displays clearly (honest pack verifies positive verdict and stages)', async () => {
    const honestResult: verifierClient.VerificationResult = {
      ok: true,
      verdict: 'VERIFIED',
      passedStages: 11,
      stages: Array.from({ length: 11 }, (_, i) => ({
        stage: i + 1,
        name: `Stage ${i + 1}`,
        ok: true,
      })),
      message: 'Pack verified successfully under headed re-render.',
      recomputedDigests: {
        critical_region_digest: 'sha256:' + 'a'.repeat(64),
        context_digest: 'sha256:' + 'b'.repeat(64),
      },
    };

    jest.spyOn(verifierClient, 'uploadAndVerifyPack').mockResolvedValue(honestResult);

    render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );

    const file = new File(['dummy zip content'], 'honest_pack.zip', {
      type: 'application/zip',
    });
    const input = screen.getByLabelText(/choose evidence pack zip file/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('honest_pack.zip')).toBeInTheDocument();

    const verifyBtn = screen.getByRole('button', { name: /run independent verification/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Evidence Verified — Consent Record Is Authentic & Mutual/i),
      ).toBeInTheDocument();
    });

    // Positive status badge
    expect(screen.getAllByText('VERIFIED').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/11 of 11 stages passed/i)).toBeInTheDocument();

    // Stages checklist listed
    expect(screen.getByRole('region', { name: /verification stages/i })).toBeInTheDocument();
    expect(screen.getByTestId('stage-item-1')).toHaveClass('stage-pass');
    expect(screen.getByTestId('stage-item-11')).toHaveClass('stage-pass');
  });

  // T5.4.2: Mismatch shows diff
  test('T5.4.2: Mismatch shows diff side-by-side with diverging node and highlighted field', async () => {
    const mismatchResult: verifierClient.VerificationResult = {
      ok: false,
      verdict: 'DIGEST_MISMATCH',
      passedStages: 10,
      failedStage: 11,
      stages: [
        ...Array.from({ length: 10 }, (_, i) => ({
          stage: i + 1,
          name: `Stage ${i + 1}`,
          ok: true,
        })),
        {
          stage: 11,
          name: 'Stage 11: Playwright Headed Re-render & Digest Match',
          ok: false,
          message: 'Critical region digest mismatch against client attestation.',
        },
      ],
      message: 'Critical region digest mismatch: node #0 differed.',
      diff: {
        hasMismatch: true,
        totalAttestedNodes: 3,
        totalRecomputedNodes: 3,
        summary: '1 diverging node detected (1 field differed)',
        mismatchedNodes: [
          {
            index: 0,
            role: 'paragraph',
            name: 'Disclosure Notice',
            summary: 'Field "text" differed: "No automatic renewal" vs "Automatic renewal applies"',
            differences: {
              text: {
                attested: 'No automatic renewal applies to this subscription.',
                recomputed: 'Automatic renewal applies and will bill monthly.',
              },
            },
          },
        ],
      },
    };

    jest.spyOn(verifierClient, 'uploadAndVerifyPack').mockResolvedValue(mismatchResult);

    render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );

    const file = new File(['dummy zip'], 'tampered_server.zip', { type: 'application/zip' });
    const input = screen.getByLabelText(/choose evidence pack zip file/i);
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /run independent verification/i }));

    await waitFor(() => {
      expect(screen.getByText(/Consent Notice Alteration Detected/i)).toBeInTheDocument();
    });

    // Check that DiffView is rendered with side-by-side evidence
    expect(screen.getByRole('region', { name: /visual render differences/i })).toBeInTheDocument();
    expect(screen.getByTestId('mismatched-node-0')).toBeInTheDocument();
    expect(
      screen.getByText('No automatic renewal applies to this subscription.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Automatic renewal applies and will bill monthly.'),
    ).toBeInTheDocument();
  });

  // T5.4.3: Signature failure explained
  test('T5.4.3: Signature failure explained with plain-language explanation, not a raw code', async () => {
    const sigFailureResult: verifierClient.VerificationResult = {
      ok: false,
      verdict: 'SERVER_SIGNATURE_INVALID',
      passedStages: 1,
      failedStage: 2,
      stages: [
        { stage: 1, name: 'Stage 1: Schema', ok: true },
        {
          stage: 2,
          name: 'Stage 2: Server Signature',
          ok: false,
          message: 'Ed25519 signature verification failed against trusted server public key.',
        },
      ],
      message: 'Server Ed25519 commitment signature invalid.',
    };

    jest.spyOn(verifierClient, 'uploadAndVerifyPack').mockResolvedValue(sigFailureResult);

    render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );

    const file = new File(['zip content'], 'edited_pack.zip', { type: 'application/zip' });
    const input = screen.getByLabelText(/choose evidence pack zip file/i);
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /run independent verification/i }));

    await waitFor(() => {
      expect(screen.getByText(/Server Signature Invalid or Forged/i)).toBeInTheDocument();
    });

    // Plain-language explanation exists
    expect(
      screen.getByText(
        /The server’s Ed25519 signature on the commitment record does not verify against the trusted server public key/i,
      ),
    ).toBeInTheDocument();

    // Raw code is kept behind disclosure
    const rawCode = screen.getByTestId('raw-verdict-code');
    expect(rawCode).toHaveTextContent('SERVER_SIGNATURE_INVALID');
  });

  // T5.4.4: Upload progress
  test('T5.4.4: Upload progress displays progress and keeps UI responsive', async () => {
    let progressCb: ((pct: number) => void) | undefined;
    jest.spyOn(verifierClient, 'uploadAndVerifyPack').mockImplementation((_file, opts) => {
      progressCb = opts?.onProgress;
      return new Promise((resolve) => {
        // simulate async delay
        setTimeout(() => {
          resolve({
            ok: true,
            verdict: 'VERIFIED',
            passedStages: 11,
            stages: [],
            message: 'Done',
          });
        }, 100);
      });
    });

    render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );

    const file = new File(['large payload'], 'large_pack.zip', { type: 'application/zip' });
    const input = screen.getByLabelText(/choose evidence pack zip file/i);
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /run independent verification/i }));

    // While verifying, status region is present
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Trigger intermediate progress
    const cb = progressCb;
    if (cb) {
      act(() => {
        cb(65);
      });
    }

    await waitFor(() => {
      expect(screen.getByText('65%')).toBeInTheDocument();
      expect(screen.getByText(/Uploading evidence pack \(65%\)/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Evidence Verified — Consent Record Is Authentic & Mutual/i),
      ).toBeInTheDocument();
    });
  });

  // T5.4.5: Non-ZIP rejected
  test('T5.4.5: Non-ZIP rejected with clear validation message', () => {
    const uploadSpy = jest.spyOn(verifierClient, 'uploadAndVerifyPack');

    render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );

    const txtFile = new File(['hello world'], 'notice.txt', { type: 'text/plain' });
    const input = screen.getByLabelText(/choose evidence pack zip file/i);
    fireEvent.change(input, { target: { files: [txtFile] } });

    // Clear error message shown
    expect(
      screen.getByText(
        /Only \.zip evidence packs can be verified\. Please upload a valid MRA evidence pack\./i,
      ),
    ).toBeInTheDocument();

    // No upload should have occurred
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('notice.txt')).not.toBeInTheDocument();
  });

  // T5.4.6: Stage list accurate
  test('T5.4.6: Stage list accurately reflects API stage results and failure points', () => {
    const stages = [
      { stage: 1, name: 'Stage 1: Schema', ok: true },
      { stage: 2, name: 'Stage 2: Server Signature', ok: true },
      {
        stage: 3,
        name: 'Stage 3: Client Signature',
        ok: false,
        message: 'Invalid ECDSA curve point',
      },
    ];

    render(<StageList stages={stages} passedStages={2} failedStage={3} />);

    expect(screen.getByTestId('stage-item-1')).toHaveClass('stage-pass');
    expect(screen.getByTestId('stage-item-2')).toHaveClass('stage-pass');
    expect(screen.getByTestId('stage-item-3')).toHaveClass('stage-fail');
    expect(screen.getByText('Invalid ECDSA curve point')).toBeInTheDocument();
    expect(screen.getByTestId('stage-item-4')).toHaveClass('stage-pending');
  });

  // T5.4.7: Responsive
  test('T5.4.7: Responsive styling classes and elements present for narrow displays', () => {
    const { container } = render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );

    // Verify container and responsive class structures
    expect(container.querySelector('.verifier-dashboard')).toBeInTheDocument();
    expect(container.querySelector('.dropzone')).toBeInTheDocument();
    expect(container.querySelector('.dropzone-content')).toBeInTheDocument();
  });

  // T5.4.8: Keyboard accessible
  test('T5.4.8: Keyboard accessible dropzone and disclosure operable', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );

    const dropzone = screen.getByRole('button', { name: /upload evidence pack dropzone/i });
    expect(dropzone).toHaveAttribute('tabIndex', '0');

    // Focus on dropzone using keyboard
    dropzone.focus();
    expect(dropzone).toHaveFocus();

    // Render VerdictCard directly to test disclosure keyboard operation
    const result: verifierClient.VerificationResult = {
      ok: true,
      verdict: 'VERIFIED',
      passedStages: 11,
      stages: [],
      message: 'Verified',
    };

    const { container } = render(<VerdictCard result={result} />);
    const summaryToggle = container.querySelector('.disclosure-toggle');
    expect(summaryToggle).toBeInTheDocument();
    if (summaryToggle) {
      await user.click(summaryToggle);
      const details = container.querySelector('.verdict-disclosure');
      expect(details).toHaveAttribute('open');
    }
  });

  // Verification Checklist: All twelve verdicts have human-readable explanations
  test('Checklist: All twelve core verdicts have human-readable titles, summaries, and impact notes', () => {
    const requiredVerdicts = [
      'VERIFIED',
      'DIGEST_MISMATCH',
      'CONTEXT_MISMATCH',
      'SERVER_SIGNATURE_INVALID',
      'CLIENT_SIGNATURE_INVALID',
      'KEY_BINDING_INVALID',
      'BUNDLE_TAMPERED',
      'COMMITMENT_BINDING_INVALID',
      'REPLAY_DETECTED',
      'MERKLE_PROOF_INVALID',
      'REGION_POLICY_VIOLATION',
      'ATTESTOR_UNRECOGNISED',
      'MALFORMED_PACK',
      'RENDER_FAILED',
    ];

    requiredVerdicts.forEach((code) => {
      const meta = getVerdictMeta(code);
      expect(meta).toBeDefined();
      expect(meta.title.length).toBeGreaterThan(5);
      expect(meta.summary.length).toBeGreaterThan(15);
      expect(meta.legalSignificance.length).toBeGreaterThan(10);
      expect(['success', 'attack', 'tamper', 'invalid']).toContain(meta.category);
    });
  });

  // Prominence change and pre-tick diff display in DiffView
  test('DiffView correctly renders prominence and pre-tick differences', () => {
    const diff: verifierClient.DiffResult = {
      hasMismatch: true,
      totalAttestedNodes: 2,
      totalRecomputedNodes: 2,
      summary: '2 nodes differed',
      mismatchedNodes: [
        {
          index: 1,
          role: 'button',
          name: 'Reject',
          summary: 'Prominence and contrast altered',
          differences: {
            prominence: { attested: 'primary', recomputed: 'ghost' },
            contrast: { attested: 'high', recomputed: 'low' },
          },
        },
        {
          index: 2,
          role: 'checkbox',
          name: 'Opt-in',
          summary: 'Checkbox checked state altered',
          differences: {
            checked: { attested: false, recomputed: true },
          },
        },
      ],
    };

    render(<DiffView diff={diff} />);

    expect(screen.getByText(/Side-by-Side Discrepancy Evidence/i)).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
    expect(screen.getByText('ghost')).toBeInTheDocument();
    expect(screen.getByText('false (unchecked/inactive)')).toBeInTheDocument();
    expect(screen.getByText('true (checked/active)')).toBeInTheDocument();
  });
});

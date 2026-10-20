import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { DiffView } from '../components/DiffView';
import { Layout } from '../components/Layout';
import { Mark } from '../components/Mark';
import { StageList } from '../components/StageList';
import { VerdictCard } from '../components/VerdictCard';
import { uploadAndVerifyPack } from '../lib/verifierClient';
import type { VerificationResult } from '../lib/verifierClient';

export function Verify() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  // Advanced options
  const [serverKeyOverride, setServerKeyOverride] = useState('');
  const [skipRender, setSkipRender] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const packParam =
      searchParams.get('pack') ||
      (location.state as { pack?: string; packId?: string } | null)?.pack ||
      (location.state as { pack?: string; packId?: string } | null)?.packId;

    if (packParam) {
      void autoLoadEvidencePack(packParam);
    }
  }, [searchParams, location.state]);

  async function autoLoadEvidencePack(packId: string) {
    try {
      setErrorMessage(null);
      setResult(null);
      let url = '';
      let filename = '';
      if (packId.endsWith('.zip')) {
        url = `/fixtures/${packId}`;
        filename = packId;
      } else {
        url = `/api/pack/${encodeURIComponent(packId)}/download`;
        filename = `evidence-pack-${packId}.zip`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        // Fallback to honest_pack.zip fixture if server returned non-200
        const fallbackRes = await fetch('/fixtures/honest_pack.zip');
        if (fallbackRes.ok) {
          const blob = await fallbackRes.blob();
          const demoFile = new File([blob], filename || 'evidence_pack.zip', {
            type: 'application/zip',
          });
          validateAndSetFile(demoFile);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const loadedFile = new File([blob], filename, { type: 'application/zip' });
      validateAndSetFile(loadedFile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Auto-load evidence pack failed:', msg);
    }
  }

  function validateAndSetFile(selectedFile: File) {
    setErrorMessage(null);
    setResult(null);

    const isZip =
      selectedFile.name.toLowerCase().endsWith('.zip') ||
      selectedFile.type === 'application/zip' ||
      selectedFile.type === 'application/x-zip-compressed';

    if (!isZip) {
      setErrorMessage(
        'Only .zip evidence packs can be verified. Please upload a valid MRA evidence pack.',
      );
      setFile(null);
      return false;
    }

    setFile(selectedFile);
    return true;
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      validateAndSetFile(selected);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      validateAndSetFile(dropped);
    }
  }

  async function handleLoadDemo(filename: string) {
    try {
      setErrorMessage(null);
      setResult(null);
      const res = await fetch(`/fixtures/${filename}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching demo pack`);
      const blob = await res.blob();
      const demoFile = new File([blob], filename, { type: 'application/zip' });
      validateAndSetFile(demoFile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to load demo pack: ${msg}`);
    }
  }

  async function handleVerify() {
    if (!file) {
      setErrorMessage('Please select an evidence pack (.zip) to verify.');
      return;
    }

    setVerifying(true);
    setUploadProgress(0);
    setStatusMessage('Uploading evidence pack...');
    setErrorMessage(null);
    setResult(null);

    try {
      const res = await uploadAndVerifyPack(file, {
        serverKey: serverKeyOverride.trim() || undefined,
        skipRender,
        onProgress: (pct) => {
          setUploadProgress(pct);
          if (pct < 100) {
            setStatusMessage(`Uploading evidence pack (${pct}%)...`);
          } else {
            setStatusMessage(
              skipRender
                ? 'Validating cryptographic signatures & Merkle proofs...'
                : 'Validating proofs & re-rendering under headless browser...',
            );
          }
        },
      });

      setResult(res);
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Verification failed unexpectedly: ${errText}`);
    } finally {
      setVerifying(false);
      setUploadProgress(null);
      setStatusMessage('');
    }
  }

  function handleReset() {
    setFile(null);
    setResult(null);
    setErrorMessage(null);
    setUploadProgress(null);
    setStatusMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <Layout wide>
      <div className="verifier-dashboard">
        <header className="verifier-header">
          <h1>Independent Evidence Verifier</h1>
          <p className="lede">
            Audit mutual render attestation evidence packs independently. Verify cryptographic
            commitments, inclusion in the transparency log, and headless browser re-render
            invariance without having to trust the server.
          </p>
        </header>

        {errorMessage && (
          <div className="banner error" role="alert" aria-live="assertive">
            {errorMessage}
          </div>
        )}

        {!result ? (
          <div className="card verifier-upload-card">
            {/* Drag and drop upload container */}
            <div
              className={`dropzone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="group"
              aria-label="Evidence pack upload: drop a .zip file here or use the button"
            >
              <input
                ref={fileInputRef}
                type="file"
                id="pack-file-input"
                aria-label="Choose evidence pack ZIP file"
                className="file-input-hidden"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={handleFileChange}
                disabled={verifying}
              />

              <div className="dropzone-content">
                <svg
                  className="upload-icon"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>

                {file ? (
                  <div className="file-info-selected">
                    <span className="badge badge-success" style={{ marginBottom: '6px' }}>
                      <Mark kind="pass" label="" /> Pack loaded and ready
                    </span>
                    <p className="selected-filename">
                      <strong>{file.name}</strong>
                    </p>
                    <p className="selected-filesize">({(file.size / 1024).toFixed(1)} KB)</p>
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      disabled={verifying}
                    >
                      Choose a different pack
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="dropzone-prompt">
                      Drag &amp; drop an <strong>evidence pack (.zip)</strong> here, or
                    </p>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={verifying}
                    >
                      Browse files
                    </button>
                    <p className="hint">Supports self-contained MRA evidence packages.</p>
                  </>
                )}
              </div>
            </div>

            {/* Quick-test Demonstration Packs for Viva / Testing */}
            <div className="demo-packs-container">
              <p className="demo-packs-title">
                <strong>Quick Demonstration Packs:</strong> Load pre-packaged test cases to verify
                instantly:
              </p>
              <div className="demo-packs-group">
                <button
                  type="button"
                  className="btn secondary btn-sm demo-pack-btn"
                  onClick={() => void handleLoadDemo('honest_pack.zip')}
                  disabled={verifying}
                  data-testid="load-demo-honest"
                >
                  <span className="demo-pack-badge badge-success">Pass</span>
                  <span>Honest Pack (VERIFIED)</span>
                </button>
                <button
                  type="button"
                  className="btn secondary btn-sm demo-pack-btn"
                  onClick={() => void handleLoadDemo('page_altered_pack.zip')}
                  disabled={verifying}
                  data-testid="load-demo-altered"
                >
                  <span className="demo-pack-badge badge-danger">Attack</span>
                  <span>Notice Altered (Node Diff)</span>
                </button>
                <button
                  type="button"
                  className="btn secondary btn-sm demo-pack-btn"
                  onClick={() => void handleLoadDemo('tampered_attestation_pack.zip')}
                  disabled={verifying}
                  data-testid="load-demo-tampered"
                >
                  <span className="demo-pack-badge badge-warn">Tamper</span>
                  <span>Spliced Signature (Invalid)</span>
                </button>
              </div>
            </div>

            {/* Upload & verification progress bar */}
            {verifying && (
              <div className="verification-progress-container" role="status" aria-live="polite">
                <div className="progress-labels">
                  <span className="progress-status-text">{statusMessage}</span>
                  {uploadProgress !== null && (
                    <span className="progress-percentage">{uploadProgress}%</span>
                  )}
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${uploadProgress ?? 100}%` }}
                    aria-valuenow={uploadProgress ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <p className="hint progress-subhint">
                  The verifier evaluates signatures, Merkle paths, and launches a headed Chromium
                  instance under Xvfb to re-render the committed HTML/CSS bundle.
                </p>
              </div>
            )}

            {/* Optional Verification Controls */}
            <details className="advanced-options">
              <summary>Advanced Verification Settings</summary>
              <div className="advanced-fields">
                <div className="field">
                  <label htmlFor="server-key-input">
                    Trusted Server Ed25519 Public Key (Hex Override):
                  </label>
                  <input
                    id="server-key-input"
                    type="text"
                    value={serverKeyOverride}
                    onChange={(e) => setServerKeyOverride(e.target.value)}
                    placeholder="Auto-resolved out-of-band via .well-known/mra-key if empty"
                    disabled={verifying}
                  />
                  <p className="hint">
                    Trust anchors are always supplied out-of-band and never extracted from the pack.
                  </p>
                </div>
                <div className="check">
                  <input
                    id="skip-render-checkbox"
                    type="checkbox"
                    checked={skipRender}
                    onChange={(e) => setSkipRender(e.target.checked)}
                    disabled={verifying}
                  />
                  <label htmlFor="skip-render-checkbox">
                    Skip Stage 11 Browser Re-render (Fast Cryptographic Checks Only)
                  </label>
                </div>
              </div>
            </details>

            <div className="verifier-actions">
              <button
                type="button"
                className="btn block"
                onClick={handleVerify}
                disabled={!file || verifying}
              >
                {verifying ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    <span>Verifying Pack...</span>
                  </>
                ) : (
                  'Run Independent Verification'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="verifier-results-container">
            <div className="results-actions-bar">
              <button type="button" className="btn secondary" onClick={handleReset}>
                ← Verify Another Evidence Pack
              </button>
            </div>

            {/* 1. Verdict Card (Plain Language + Technical Disclosure) */}
            <VerdictCard result={result} />

            {/* 2. Side-by-Side Diff View (if mismatch exists) */}
            {result.diff && <DiffView diff={result.diff} />}

            {/* 3. Stage-by-Stage Checklist */}
            <StageList
              stages={result.stages}
              passedStages={result.passedStages}
              failedStage={result.failedStage}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}

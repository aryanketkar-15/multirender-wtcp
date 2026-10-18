/**
 * Independent Verifier API client.
 * Communicates with the independent verifier service (port 8095 by default).
 */

export interface NodeDifference {
  field: string;
  attested: unknown;
  recomputed: unknown;
}

export interface MismatchedNode {
  index: number;
  role: string;
  name?: string;
  text?: string;
  differences: Record<string, { attested: unknown; recomputed: unknown }>;
  summary: string;
}

export interface DiffResult {
  hasMismatch: boolean;
  totalAttestedNodes: number;
  totalRecomputedNodes: number;
  mismatchedNodes: MismatchedNode[];
  summary: string;
}

export interface StageResult {
  stage: number;
  name: string;
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface VerificationResult {
  ok: boolean;
  verdict: string;
  passedStages: number;
  failedStage?: number;
  stages: StageResult[];
  message: string;
  diff?: DiffResult;
  recomputedDigests?: {
    critical_region_digest: string;
    context_digest: string;
  };
}

export interface VerifyUploadOptions {
  verifierUrl?: string;
  serverKey?: string;
  skipRender?: boolean;
  onProgress?: (percent: number) => void;
}

export const DEFAULT_VERIFIER_URL =
  (typeof process !== 'undefined' && process.env?.VITE_VERIFIER_URL) || 'http://localhost:8095';

/**
 * Upload an evidence pack archive (.zip) to the verifier service and return the verification result.
 */
export async function uploadAndVerifyPack(
  file: File | Blob,
  options: VerifyUploadOptions = {},
): Promise<VerificationResult> {
  const baseUrl = options.verifierUrl || DEFAULT_VERIFIER_URL;
  const url = new URL('/verify', baseUrl);
  if (options.serverKey) {
    url.searchParams.set('server_key', options.serverKey);
  } else {
    url.searchParams.set('key_url', 'http://127.0.0.1:8080/.well-known/mra-key');
  }
  if (options.skipRender) {
    url.searchParams.set('skip_render', 'true');
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url.toString(), true);
    xhr.setRequestHeader('Accept', 'application/json');

    if (options.serverKey) {
      xhr.setRequestHeader('X-MRA-Server-Key', options.serverKey);
    }

    if (xhr.upload && options.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          options.onProgress?.(percent);
        }
      };
    }

    xhr.onload = () => {
      if (options.onProgress) {
        options.onProgress(100);
      }
      try {
        const data = JSON.parse(xhr.responseText) as VerificationResult;
        resolve(data);
      } catch {
        resolve({
          ok: false,
          verdict: 'MALFORMED_PACK',
          passedStages: 0,
          failedStage: 1,
          stages: [
            {
              stage: 1,
              name: 'Schema and file extraction',
              ok: false,
              message: `Invalid server response (HTTP ${xhr.status})`,
            },
          ],
          message: `Verifier returned an invalid response (HTTP ${xhr.status}).`,
        });
      }
    };

    xhr.onerror = () => {
      resolve({
        ok: false,
        verdict: 'VERIFIER_OFFLINE',
        passedStages: 0,
        stages: [],
        message:
          'Could not connect to the independent verifier service. Please verify that the verifier service is running on ' +
          baseUrl,
      });
    };

    xhr.send(file);
  });
}

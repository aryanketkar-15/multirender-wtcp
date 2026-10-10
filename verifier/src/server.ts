import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyPackStages1To10 } from './checks/verify';
import type { VerificationOptions, VerificationResult } from './verdicts';

export const DEFAULT_PORT = 8095;

/**
 * Fetch server public key from .well-known/mra-key if not provided in env/options.
 */
export async function resolveServerPublicKey(
  keyUrl?: string,
  providedKeyHex?: string,
): Promise<string | undefined> {
  if (providedKeyHex) {
    return providedKeyHex;
  }
  if (process.env.SERVER_PUBLIC_KEY) {
    return process.env.SERVER_PUBLIC_KEY;
  }
  const url = keyUrl || process.env.SERVER_PUBLIC_KEY_URL;
  if (!url) {
    return undefined;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return undefined;
    }
    const data = (await res.json()) as { keys?: Array<{ public_key?: string; status?: string }> };
    const current = data.keys?.find((k) => k.status === 'current') ?? data.keys?.[0];
    return current?.public_key;
  } catch {
    return undefined;
  }
}

/**
 * Parse incoming HTTP request body as a Buffer.
 */
function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Extract binary ZIP from request body (either raw binary or multipart/form-data).
 */
function extractZipBuffer(rawBody: Buffer, contentType?: string): Buffer {
  if (!contentType || !contentType.includes('multipart/form-data')) {
    return rawBody;
  }

  // Simple boundary extraction for multipart/form-data
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return rawBody;
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const boundaryBuffer = Buffer.from(`--${boundary}`);

  const start = rawBody.indexOf(boundaryBuffer);
  if (start === -1) {
    return rawBody;
  }

  const headerEnd = rawBody.indexOf(Buffer.from('\r\n\r\n'), start);
  if (headerEnd === -1) {
    return rawBody;
  }

  const nextBoundary = rawBody.indexOf(boundaryBuffer, headerEnd + 4);
  if (nextBoundary === -1) {
    return rawBody;
  }

  // Slice file data (omit trailing \r\n before next boundary)
  let end = nextBoundary;
  if (rawBody[end - 2] === 13 && rawBody[end - 1] === 10) {
    end -= 2;
  }

  return rawBody.subarray(headerEnd + 4, end);
}

/**
 * Handle incoming requests for the Verifier HTTP service.
 */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  defaultOptions: VerificationOptions = {},
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-MRA-Server-Key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: true,
        service: 'mra-verifier',
        version: '0.1.0',
        independent: true,
        stages: 10,
      }),
    );
    return;
  }

  // POST /verify endpoint
  if (req.method === 'POST' && url.pathname === '/verify') {
    try {
      const rawBody = await readRequestBody(req);
      const zipBuffer = extractZipBuffer(rawBody, req.headers['content-type']);

      if (zipBuffer.length === 0) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Empty pack payload received' }));
        return;
      }

      // Resolve server public key out-of-band
      const headerKey = req.headers['x-mra-server-key'] as string | undefined;
      const queryKey = url.searchParams.get('server_key') || undefined;
      const resolvedKey = await resolveServerPublicKey(
        url.searchParams.get('key_url') || undefined,
        queryKey || headerKey || defaultOptions.serverPublicKeyHex,
      );

      const stage10Result: VerificationResult = verifyPackStages1To10(zipBuffer, {
        ...defaultOptions,
        serverPublicKeyHex: resolvedKey,
      });

      if (!stage10Result.ok || url.searchParams.get('skip_render') === 'true') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(stage10Result, null, 2));
        return;
      }

      // Proceed to Stage 11: Playwright re-render
      const { unpackPack } = await import('./checks/unpack');
      const { renderAndVerify } = await import('./render');
      const unpacked = unpackPack(zipBuffer);
      const renderResult = await renderAndVerify(unpacked);

      const combinedResult: VerificationResult = {
        ok: renderResult.ok,
        verdict: renderResult.verdict,
        passedStages: renderResult.passedStages,
        failedStage: renderResult.failedStage,
        stages: [...stage10Result.stages, ...renderResult.stages],
        message: renderResult.message,
        diff: renderResult.diff,
        recomputedDigests: renderResult.recomputedDigests,
      };

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(combinedResult, null, 2));
      return;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
      return;
    }
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
}

/**
 * Start verifier server.
 */
export function startServer(port = Number(process.env.VERIFIER_PORT) || DEFAULT_PORT): http.Server {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: err.message }));
    });
  });

  server.listen(port, () => {
    console.log(`[mra-verifier] Independent verifier listening on http://127.0.0.1:${port}`);
  });

  return server;
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  startServer();
}

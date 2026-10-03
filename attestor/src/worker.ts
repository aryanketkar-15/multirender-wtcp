import { digestOf } from './digest';
import type { WorkerRequest, WorkerResponse } from './protocol';

/**
 * Digest worker. Hashing and canonicalisation of a large representation stay off the main thread,
 * so the consent page remains responsive. The worker only ever sees plain JSON, never the DOM.
 */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (m: WorkerResponse) => void;
};

scope.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'ping') {
      scope.postMessage({ type: 'pong', id: msg.id });
      return;
    }
    const started = performance.now();
    const { canonical, digest } = await digestOf(msg.representation);
    scope.postMessage({
      type: 'digest.result',
      id: msg.id,
      canonical,
      digest,
      completedAt: Date.now(),
      workerMs: performance.now() - started,
    });
  } catch (e) {
    scope.postMessage({
      type: 'error',
      id: msg.id,
      message: e instanceof Error ? e.message : String(e),
    });
  }
};

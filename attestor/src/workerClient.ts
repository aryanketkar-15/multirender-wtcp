import type { WorkerRequest, WorkerResponse } from './protocol';

/** Set by the build: the worker bundle as a string. Undefined when running from source. */
declare const __WORKER_SOURCE__: string | undefined;

export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export type DigestReply = Extract<WorkerResponse, { type: 'digest.result' }>;

export function createEmbeddedWorker(): WorkerLike {
  if (typeof __WORKER_SOURCE__ === 'undefined') {
    throw new Error('worker source is not embedded; use the built module');
  }
  const url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker as unknown as WorkerLike;
}

interface Slot {
  ok: (r: WorkerResponse) => void;
  fail: (e: Error) => void;
}

/** Request/response wrapper over the worker. One instance serves many digests. */
export class DigestWorker {
  private nextId = 1;
  private readonly pending = new Map<number, Slot>();
  private readonly worker: WorkerLike;

  constructor(factory: () => WorkerLike = createEmbeddedWorker) {
    this.worker = factory();
    this.worker.onmessage = (e) => {
      const slot = this.pending.get(e.data.id);
      if (!slot) return;
      this.pending.delete(e.data.id);
      if (e.data.type === 'error') slot.fail(new Error(e.data.message));
      else slot.ok(e.data);
    };
    this.worker.onerror = (e) => {
      for (const slot of this.pending.values()) slot.fail(new Error(e.message || 'worker failed'));
      this.pending.clear();
    };
  }

  private call(build: (id: number) => WorkerRequest): Promise<WorkerResponse> {
    const id = this.nextId++;
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail });
      this.worker.postMessage(build(id));
    });
  }

  async digest(representation: unknown): Promise<DigestReply> {
    const reply = await this.call((id) => ({ type: 'digest', id, representation }));
    if (reply.type !== 'digest.result') throw new Error('unexpected worker reply');
    return reply;
  }

  async ping(): Promise<void> {
    await this.call((id) => ({ type: 'ping', id }));
  }

  terminate(): void {
    this.worker.terminate();
  }
}

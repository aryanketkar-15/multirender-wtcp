/** Typed message protocol between the main thread and the digest worker. */
export type WorkerRequest =
  { type: 'digest'; id: number; representation: unknown } | { type: 'ping'; id: number };

export type WorkerResponse =
  | {
      type: 'digest.result';
      id: number;
      canonical: string;
      digest: string;
      /** wall-clock time the worker finished, to show the work ran off the main thread */
      completedAt: number;
      workerMs: number;
    }
  | { type: 'pong'; id: number }
  | { type: 'error'; id: number; message: string };

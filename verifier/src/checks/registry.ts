/**
 * Attestor Module registry check for the independent verifier.
 * The verifier holds its own list of recognized, reproducible Attestor hashes
 * independently of the server database.
 */

export const DEFAULT_RECOGNIZED_ATTESTORS: readonly string[] = [
  // Attestor v1.0.0 official build
  'sha256:f805f3642219c751e5e76699bb096aeb63ce5946e20a32748121bebb3cb2949a',
];

export function isRecognisedAttestor(
  attestorHash: string,
  customList?: readonly string[] | string[],
): boolean {
  const allowed = new Set([...DEFAULT_RECOGNIZED_ATTESTORS, ...(customList ?? [])]);
  return allowed.has(attestorHash.trim().toLowerCase());
}

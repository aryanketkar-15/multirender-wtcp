<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Service\MerkleLog;
use Mra\Service\SthService;

/**
 * Read-only, public access to the evidence log: the latest signed tree head, inclusion proofs and
 * consistency proofs. Like a transparency log, it holds digests and signed records only.
 */
final class LogController
{
    public function __construct(private readonly MerkleLog $log, private readonly SthService $sth)
    {
    }

    public function head(Request $request): Response
    {
        $head = $this->sth->latest();
        return $head === null
            ? Response::error(404, 'no_tree_head', 'No signed tree head has been published yet.')
            : Response::json(['record' => $head['record'], 'signature' => $head['signature']]);
    }

    /** Proof against the latest signed head, so it can be checked against a root someone signed. */
    public function proof(Request $request): Response
    {
        $index = filter_var($request->attribute('route.index'), FILTER_VALIDATE_INT);
        $head = $this->sth->latest();
        if ($head === null || $index === false) {
            return Response::error(404, 'not_found', 'No such proof.');
        }
        $size = (int) $head['record']['tree_size'];
        if ($index < 0 || $index >= $size) {
            return Response::error(409, 'not_yet_covered', 'This entry is not yet covered by a signed tree head.');
        }
        $leaf = $this->log->leaf($index);
        return Response::json([
            'leaf' => [
                'index' => $index,
                'kind' => $leaf['kind'] ?? null,
                'record' => json_decode($leaf['record_json'] ?? 'null', true),
            ],
            'proof' => $this->log->inclusionProof($index, $size),
            'tree_head' => ['record' => $head['record'], 'signature' => $head['signature']],
        ]);
    }

    public function consistency(Request $request): Response
    {
        $first = filter_var($request->query['first'] ?? null, FILTER_VALIDATE_INT);
        $second = filter_var($request->query['second'] ?? null, FILTER_VALIDATE_INT);
        if ($first === false || $second === false || $first < 1 || $first > $second || $second > $this->log->size()) {
            return Response::error(422, 'validation_failed', 'Need 1 <= first <= second <= current size.');
        }
        return Response::json([
            'first' => $first,
            'second' => $second,
            'first_root' => 'sha256:' . bin2hex($this->log->root($first)),
            'second_root' => 'sha256:' . bin2hex($this->log->root($second)),
            'proof' => $this->log->consistencyProof($first, $second),
        ]);
    }
}

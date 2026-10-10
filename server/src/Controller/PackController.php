<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Log\AuditLogger;
use Mra\Model\User;
use Mra\Repository\PackRepository;
use Mra\Service\EvidencePackBuilder;

final class PackController
{
    public function __construct(
        private readonly PackRepository $packs,
        private readonly EvidencePackBuilder $builder,
        private readonly AuditLogger $audit
    ) {
    }

    /**
     * Lists evidence packs for the authenticated user.
     */
    public function index(Request $request): Response
    {
        $user = $request->attribute('user');
        if (!$user instanceof User) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }

        $list = $this->packs->forUser($user->id);
        return Response::json(['packs' => $list]);
    }

    /**
     * Shows pack metadata or delegates to download if requested.
     */
    public function show(Request $request): Response
    {
        $id = (string) $request->attribute('route.id');
        $accept = $request->header('Accept') ?? '';

        if (str_contains($accept, 'application/zip') || ($request->query['format'] ?? null) === 'zip') {
            return $this->download($request);
        }

        $pack = $this->packs->find($id);
        if ($pack === null) {
            return Response::error(404, 'not_found', 'Evidence pack not found.');
        }

        return Response::json([
            'pack_id' => $pack['id'],
            'created_at' => $pack['created_at'],
            'action' => $pack['action'] ?? null,
            'attestation_hash' => $pack['attestation_hash'] ?? null,
            'commitment_hash' => $pack['commitment_hash'] ?? null,
            'download_url' => "/api/pack/{$pack['id']}/download",
            'status' => $pack['attestation_id'] === null ? 'stub' : 'ready',
        ]);
    }

    /**
     * Authenticated evidence pack download as a self-contained ZIP archive.
     */
    public function download(Request $request): Response
    {
        $user = $request->attribute('user');
        if (!$user instanceof User) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }

        $id = (string) $request->attribute('route.id');
        $zipBytes = $this->builder->build($id);

        $this->audit->record(
            'pack.downloaded',
            'success',
            $user->id,
            'evidence_pack',
            $id,
            [],
            $request->ip,
            $request->userAgent
        );

        return new Response(200, $zipBytes, [
            'Content-Type' => 'application/zip',
            'Content-Disposition' => "attachment; filename=\"evidence-pack-{$id}.zip\"",
            'Content-Length' => (string) strlen($zipBytes),
            'Cache-Control' => 'no-store, private',
        ]);
    }
}

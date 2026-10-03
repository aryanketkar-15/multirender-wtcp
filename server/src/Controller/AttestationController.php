<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Model\Session;
use Mra\Model\User;
use Mra\Service\AttestationRejected;
use Mra\Service\AttestationValidator;

final class AttestationController
{
    public function __construct(
        private readonly AttestationValidator $validator,
        private readonly SecurityLogger $security,
        private readonly AuditLogger $audit
    ) {
    }

    public function submit(Request $request): Response
    {
        $session = $request->attribute('session');
        $user = $request->attribute('user');
        if (!$session instanceof Session || !$user instanceof User) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }
        if ($request->malformedBody) {
            return Response::error(400, 'bad_request', 'Request body must be valid JSON.');
        }
        try {
            $result = $this->validator->validate($request->body, $session, $user);
        } catch (AttestationRejected $e) {
            $severity = in_array($e->errorCode, [
                AttestationRejected::CLIENT_SIGNATURE_INVALID,
                AttestationRejected::KEY_BINDING_INVALID,
                AttestationRejected::REPLAY_DETECTED,
                AttestationRejected::SESSION_MISMATCH,
            ], true) ? 'critical' : 'warning';
            $this->security->record(
                $e->errorCode === AttestationRejected::REPLAY_DETECTED ? 'attestation.replay_detected' : 'attestation.rejected',
                $severity,
                $user->id,
                ['code' => $e->errorCode] + $e->detail,
                $request->ip
            );
            return Response::json(
                ['error' => $e->errorCode, 'message' => $e->getMessage()] + ($e->detail === [] ? [] : ['detail' => $e->detail]),
                $e->status
            );
        }
        $this->audit->record(
            'attestation.accepted',
            'success',
            $user->id,
            'attestation',
            (string) $result['id'],
            [],
            $request->ip,
            $request->userAgent
        );
        return Response::json([
            'attestation_id' => $result['id'],
            'attestation_hash' => $result['attestation_hash'],
            'commitment_hash' => $result['commitment_hash'],
            'log_leaf_index' => $result['log_leaf_index'],
            'commitment_leaf_index' => $result['commitment_leaf_index'],
        ], 201);
    }
}

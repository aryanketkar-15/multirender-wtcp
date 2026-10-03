<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Log\AuditLogger;
use Mra\Model\Session;
use Mra\Model\User;
use Mra\Repository\BundleRepository;
use Mra\Repository\ConsentSettingsRepository;
use Mra\Service\CommitmentService;
use Mra\Service\ConsentBundleFactory;
use Mra\Service\NonceService;
use Mra\Service\SessionService;

final class BundleController
{
    public function __construct(
        private readonly ConsentSettingsRepository $settings,
        private readonly ConsentBundleFactory $factory,
        private readonly BundleRepository $bundles,
        private readonly NonceService $nonces,
        private readonly CommitmentService $commitments,
        private readonly SessionService $sessions,
        private readonly AuditLogger $audit
    ) {
    }

    /** Registers the browser's public-key fingerprint against the session, before any issuance. */
    public function registerKey(Request $request): Response
    {
        $session = $request->attribute('session');
        $fpr = $request->body['fingerprint'] ?? null;
        if (!$session instanceof Session) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }
        if (!is_string($fpr) || preg_match('/^sha256:[a-f0-9]{64}$/', $fpr) !== 1) {
            return Response::json(
                ['error' => 'validation_failed', 'fields' => ['fingerprint' => 'Expected sha256:<64 hex characters>']],
                422
            );
        }
        $this->sessions->registerClientKey($session, $fpr);
        return Response::json(['status' => 'registered']);
    }

    public function show(Request $request): Response
    {
        $session = $request->attribute('session');
        $user = $request->attribute('user');
        if (!$session instanceof Session || !$user instanceof User) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }
        // Re-read from storage: the registration may have happened on a request after this session was loaded.
        $fresh = $this->sessions->resolveById($session->id);
        $fpr = $fresh?->clientPubkeyFpr;
        if ($fpr === null) {
            return Response::error(409, 'client_key_required', 'Register your browser key before requesting a bundle.');
        }

        $settings = $this->settings->get();
        $bundle = $this->factory->build($settings);
        $this->bundles->save($bundle);
        $nonce = $this->nonces->issue($session->id, $user->id, $fpr, $bundle->bundleId);
        $issued = $this->commitments->issue($bundle, [
            'session_id' => substr($session->id, 0, 16),
            'nonce' => $nonce,
            'attestor_version' => $this->factory->attestorVersion(),
            'client_pubkey_fpr' => $fpr,
            'validity_minutes' => $settings['validity_minutes'],
        ]);
        $this->audit->record('bundle.issued', 'success', $user->id, 'bundle', $bundle->bundleId, [], $request->ip, $request->userAgent);

        return Response::json([
            'bundle' => $bundle->data,
            'bundle_hash' => $bundle->hash,
            'commitment' => $issued['commitment'],
            'commitment_hash' => $issued['commitment_hash'],
            'signature' => $issued['signature'],
            'nonce' => $nonce,
            'attestor' => $this->factory->attestorInfo(),
        ])->withHeader(CommitmentService::HEADER, $issued['header']);
    }
}

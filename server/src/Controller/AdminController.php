<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Log\AuditLogger;
use Mra\Model\User;
use Mra\Repository\ConsentSettingsRepository;
use Mra\Validation\Rules\Length;
use Mra\Validation\Rules\Required;
use Mra\Validation\Schemas;
use Mra\Validation\Validator;

/** Admin editing of the consent text. Exists so the demonstration can change the disclosure live. */
final class AdminController
{
    public function __construct(
        private readonly ConsentSettingsRepository $settings,
        private readonly AuditLogger $audit
    ) {
    }

    public function show(Request $request): Response
    {
        return Response::json(['settings' => $this->settings->get()]);
    }

    public function update(Request $request): Response
    {
        $admin = $request->attribute('user');
        if (!$admin instanceof User) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }
        $body = $request->body;
        $schema = Schemas::settings() + [
            'disclosure_text' => [
                [new Required(), 'Enter the disclosure text (1–2000 characters)'],
                [new Length(1, 2000), 'Enter the disclosure text (1–2000 characters)'],
            ],
            'accept_label' => [[new Required(), 'Enter a label (1–40 characters)'], [new Length(1, 40), 'Enter a label (1–40 characters)']],
            'reject_label' => [[new Required(), 'Enter a label (1–40 characters)'], [new Length(1, 40), 'Enter a label (1–40 characters)']],
        ];
        $errors = Validator::check($body, $schema);
        if ($errors !== []) {
            return Response::json(['error' => 'validation_failed', 'fields' => $errors], 422);
        }
        $new = [
            'disclosure_text' => trim((string) $body['disclosure_text']),
            'accept_label' => trim((string) $body['accept_label']),
            'reject_label' => trim((string) $body['reject_label']),
            'validity_minutes' => (int) $body['validity_minutes'],
            'retention_days' => (int) $body['retention_days'],
        ];
        $this->settings->update($new, $admin->id);
        $this->audit->record('consent.settings_updated', 'success', $admin->id, 'consent_settings', '1', [
            'validity_minutes' => $new['validity_minutes'],
            'retention_days' => $new['retention_days'],
        ], $request->ip, $request->userAgent);
        return Response::json(['settings' => $new]);
    }
}

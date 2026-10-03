<?php

declare(strict_types=1);

namespace Mra\Repository;

final class ConsentSettingsRepository extends BaseRepository
{
    /** @return array{disclosure_text:string,accept_label:string,reject_label:string,validity_minutes:int,retention_days:int} */
    public function get(): array
    {
        $row = $this->run(
            'SELECT disclosure_text, accept_label, reject_label, validity_minutes, retention_days FROM consent_settings WHERE id = 1'
        )->fetch();
        if ($row === false) {
            throw new \RuntimeException('Consent settings row is missing.');
        }
        return [
            'disclosure_text' => (string) $row['disclosure_text'],
            'accept_label' => (string) $row['accept_label'],
            'reject_label' => (string) $row['reject_label'],
            'validity_minutes' => (int) $row['validity_minutes'],
            'retention_days' => (int) $row['retention_days'],
        ];
    }

    /** @param array{disclosure_text:string,accept_label:string,reject_label:string,validity_minutes:int,retention_days:int} $s */
    public function update(array $s, int $adminId): void
    {
        $this->run(
            'UPDATE consent_settings
             SET disclosure_text = ?, accept_label = ?, reject_label = ?, validity_minutes = ?, retention_days = ?, updated_by = ?
             WHERE id = 1',
            [$s['disclosure_text'], $s['accept_label'], $s['reject_label'], $s['validity_minutes'], $s['retention_days'], $adminId]
        );
    }
}

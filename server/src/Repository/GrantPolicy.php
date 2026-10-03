<?php

declare(strict_types=1);

namespace Mra\Repository;

use PDO;

/**
 * Table-level privileges for the application account. This is a control, not decoration: if the
 * account could UPDATE or DELETE the evidence tables, "append-only" would exist only in application
 * code, and an SQL injection anywhere in the project would defeat it.
 *
 *   evidence (bundle, commitment, attestation, leaf, node, sth, publication)  SELECT, INSERT
 *   operational logs and log archives                                         INSERT
 *   everything else                                                           SELECT, INSERT, UPDATE, DELETE
 */
final class GrantPolicy
{
    /** Evidence: written once, readable, never changed or removed. */
    public const APPEND_ONLY = [
        'mra_bundle',
        'mra_commitment',
        'mra_attestation',
        'mra_leaf',
        'mra_node',
        'mra_sth',
        'mra_sth_publication',
    ];

    /** Operational logs: the application may append but not even read its own trail back. */
    public const INSERT_ONLY = ['audit_log', 'security_log'];

    public static function privilegesFor(string $table): string
    {
        if (in_array($table, self::INSERT_ONLY, true) || str_contains($table, '_archive_')) {
            return 'INSERT';
        }
        if (in_array($table, self::APPEND_ONLY, true)) {
            return 'SELECT, INSERT';
        }
        return 'SELECT, INSERT, UPDATE, DELETE';
    }

    /**
     * Applies the policy to every base table in `$database` for one account.
     *
     * @return array<string,string> table => privileges granted
     */
    public static function apply(PDO $admin, string $database, string $user, string $host): array
    {
        $stmt = $admin->prepare(
            'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = ?'
        );
        $stmt->execute([$database, 'BASE TABLE']);
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $admin->exec("REVOKE ALL PRIVILEGES, GRANT OPTION FROM `{$user}`@`{$host}`");
        $granted = [];
        foreach ($tables as $table) {
            $privileges = self::privilegesFor((string) $table);
            $admin->exec("GRANT {$privileges} ON `{$database}`.`{$table}` TO `{$user}`@`{$host}`");
            $granted[(string) $table] = $privileges;
        }
        $admin->exec('FLUSH PRIVILEGES');
        return $granted;
    }
}

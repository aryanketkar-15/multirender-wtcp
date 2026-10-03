<?php

declare(strict_types=1);

namespace Mra\Migration;

use PDO;
use RuntimeException;

/**
 * Numbered migrations: migrations/NNN_name.up.sql and NNN_name.down.sql. Applied versions are
 * recorded in schema_migrations. Statements are split on a semicolon at end of line.
 */
final class Migrator
{
    public function __construct(private readonly PDO $pdo, private readonly string $dir)
    {
    }

    /** @return list<string> versions applied by this call */
    public function up(): array
    {
        $applied = $this->applied();
        $done = [];
        foreach ($this->discover() as $version => $name) {
            if (isset($applied[$version])) {
                continue;
            }
            $this->execFile($this->dir . "/{$version}_{$name}.up.sql");
            $this->record((string) $version, $name);
            $done[] = (string) $version;
        }
        return $done;
    }

    /** @return list<string> versions reverted by this call */
    public function down(int $steps = 1): array
    {
        $applied = $this->applied();
        krsort($applied);
        $done = [];
        foreach ($applied as $version => $name) {
            if (count($done) >= $steps) {
                break;
            }
            $this->execFile($this->dir . "/{$version}_{$name}.down.sql");
            if ($this->tableExists('schema_migrations')) {
                $stmt = $this->pdo->prepare('DELETE FROM schema_migrations WHERE version = ?');
                $stmt->execute([(string) $version]);
            }
            $done[] = (string) $version;
        }
        return $done;
    }

    /** @return array<string,string> version => name, ascending */
    public function applied(): array
    {
        if (!$this->tableExists('schema_migrations')) {
            return [];
        }
        $rows = $this->pdo->query('SELECT version, name FROM schema_migrations ORDER BY version')
            ->fetchAll(PDO::FETCH_KEY_PAIR);
        $out = [];
        foreach ($rows as $version => $name) {
            $out[(string) $version] = (string) $name;
        }
        return $out;
    }

    /** @return array<string,string> version => name */
    private function discover(): array
    {
        $found = [];
        foreach (glob($this->dir . '/*.up.sql') ?: [] as $file) {
            if (preg_match('/^(\d{3})_([a-z0-9_]+)\.up\.sql$/', basename($file), $m)) {
                $found[$m[1]] = $m[2];
            }
        }
        ksort($found);
        return $found;
    }

    private function execFile(string $path): void
    {
        $sql = file_get_contents($path);
        if ($sql === false) {
            throw new RuntimeException('Migration file missing: ' . basename($path));
        }
        $sql = (string) preg_replace('/^\s*--.*$/m', '', $sql);
        foreach (preg_split('/;\s*(?:\R|$)/', $sql) ?: [] as $statement) {
            $statement = trim($statement);
            if ($statement !== '') {
                $this->pdo->exec($statement);
            }
        }
    }

    private function record(string $version, string $name): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
        $stmt->execute([$version, $name]);
    }

    private function tableExists(string $table): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?'
        );
        $stmt->execute([$table]);
        return (int) $stmt->fetchColumn() > 0;
    }
}

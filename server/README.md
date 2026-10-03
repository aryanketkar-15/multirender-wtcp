# server

PHP 8.2, no framework. Only `public/index.php` is web-reachable.

Required extensions: `pdo_mysql`, `sodium`, `mbstring`, `openssl`.

```bash
composer install
cp .env.example .env            # fill every value; never commit .env
php bin/migrate.php up          # run against DB_NAME
php -S 127.0.0.1:8080 -t public dev-router.php # development server
vendor/bin/phpunit              # needs a MySQL/MariaDB with DB_TEST_NAME
vendor/bin/phpcs                # lint
```

## Databases

Create `mra` and `mra_test`. The migration tests create and drop a scratch database named
`mra_migrate_test`, so the database user needs privileges on `mra\_%`.

```bash
php bin/migrate.php up --test   # migrate the test schema
php bin/migrate.php down all    # revert everything on DB_NAME
```

## Logs

Two operational logs (`audit_log`, `security_log`) are distinct from the Merkle evidence log built
in a later phase. `php bin/apply_grants.php` makes both INSERT-only for the application account;
`php bin/rotate_logs.php` (run with `DB_MAINT_*` credentials) archives rows past
`LOG_RETENTION_DAYS` into dated tables and alerts above `LOG_MAX_ROWS`.

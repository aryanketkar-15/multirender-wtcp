# server

PHP 8.2, no framework. Only `public/index.php` is web-reachable.

Required extensions: `pdo_mysql`, `sodium`, `mbstring`, `openssl`.

```bash
composer install
cp .env.example .env            # fill every value; never commit .env
php bin/migrate.php up          # run against DB_NAME
php -S 127.0.0.1:8080 -t public # development server
vendor/bin/phpunit              # needs a MySQL/MariaDB with DB_TEST_NAME
vendor/bin/phpcs                # lint
```

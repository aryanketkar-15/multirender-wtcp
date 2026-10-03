<?php

declare(strict_types=1);

use Mra\Config\Env;

// Key management for the prototype is environment variables loaded from outside the web root.
// There is no KMS; the report states this as a limitation rather than implying one.
return [
    'encryption_key_hex' => Env::get('APP_ENCRYPTION_KEY'),
    'blind_index_pepper_hex' => Env::get('BLIND_INDEX_PEPPER'),
];

<?php

declare(strict_types=1);

// Session policy. Cookie attributes themselves are fixed in Mra\Http\Cookie:
// Secure, HttpOnly, SameSite=Strict, Path=/, no Domain.
return [
    'cookie_name' => 'mra_sid',
    'idle_timeout' => 30 * 60,
    'absolute_timeout' => 12 * 60 * 60,
];

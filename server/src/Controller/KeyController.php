<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Crypto\KeyStore;
use Mra\Http\Request;
use Mra\Http\Response;

/** Publishes the verification keys at /.well-known/mra-key. Public keys only. */
final class KeyController
{
    public function __construct(private readonly KeyStore $keys)
    {
    }

    public function show(Request $request): Response
    {
        return Response::json(['alg' => 'Ed25519', 'keys' => $this->keys->publicKeys()])
            ->withHeader('Cache-Control', 'public, max-age=300');
    }
}

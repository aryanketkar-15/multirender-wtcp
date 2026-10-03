<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;

/** Stub: pack contents and download arrive in a later phase. Reaching it proves authorization held. */
final class PackController
{
    public function show(Request $request): Response
    {
        return Response::json(['pack_id' => $request->attribute('route.id'), 'status' => 'stub']);
    }
}

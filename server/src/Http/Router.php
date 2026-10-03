<?php

declare(strict_types=1);

namespace Mra\Http;

/**
 * Exact-match router with per-route middleware. A middleware is
 * callable(Request, callable $next): Response.
 */
final class Router
{
    /** @var array<string,array<string,array{handler:callable,middleware:list<callable>}>> */
    private array $routes = [];

    /** @param list<callable> $middleware */
    public function add(string $method, string $path, callable $handler, array $middleware = []): void
    {
        $this->routes[$path][strtoupper($method)] = ['handler' => $handler, 'middleware' => $middleware];
    }

    public function dispatch(Request $request): Response
    {
        $methods = $this->routes[$request->path] ?? null;
        if ($methods === null) {
            return Response::error(404, 'not_found', 'Not found.');
        }
        $route = $methods[$request->method] ?? null;
        if ($route === null) {
            return Response::error(405, 'method_not_allowed', 'Method not allowed.')
                ->withHeader('Allow', implode(', ', array_keys($methods)));
        }
        $next = $route['handler'];
        foreach (array_reverse($route['middleware']) as $mw) {
            $inner = $next;
            $next = static fn (Request $r): Response => $mw($r, $inner);
        }
        return $next($request);
    }
}

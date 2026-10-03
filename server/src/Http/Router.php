<?php

declare(strict_types=1);

namespace Mra\Http;

/**
 * Router with per-route middleware. Exact paths match first; `{name}` segments capture one path
 * segment into the request attribute `route.name`. A middleware is
 * callable(Request, callable $next): Response.
 */
final class Router
{
    /** @var array<string,array<string,array{handler:callable,middleware:list<callable>}>> */
    private array $routes = [];

    /** @var list<array{regex:string,names:list<string>,path:string}> */
    private array $patterns = [];

    /** @param list<callable> $middleware */
    public function add(string $method, string $path, callable $handler, array $middleware = []): void
    {
        $this->routes[$path][strtoupper($method)] = ['handler' => $handler, 'middleware' => $middleware];
        if (!str_contains($path, '{')) {
            return;
        }
        $names = [];
        $regex = '';
        foreach (preg_split('/(\{[a-z_]+\})/', $path, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [] as $part) {
            if (preg_match('/^\{([a-z_]+)\}$/', $part, $m) === 1) {
                $names[] = $m[1];
                $regex .= '([A-Za-z0-9_-]{1,64})';
            } else {
                $regex .= preg_quote($part, '#');
            }
        }
        $this->patterns[$path] = ['regex' => '#^' . $regex . '$#', 'names' => $names, 'path' => $path];
    }

    public function dispatch(Request $request): Response
    {
        [$path, $params] = $this->match($request->path);
        if ($path === null) {
            return Response::error(404, 'not_found', 'Not found.');
        }
        $methods = $this->routes[$path];
        $route = $methods[$request->method] ?? null;
        if ($route === null) {
            return Response::error(405, 'method_not_allowed', 'Method not allowed.')
                ->withHeader('Allow', implode(', ', array_keys($methods)));
        }
        foreach ($params as $name => $value) {
            $request = $request->with('route.' . $name, $value);
        }
        $next = $route['handler'];
        foreach (array_reverse($route['middleware']) as $mw) {
            $inner = $next;
            $next = static fn (Request $r): Response => $mw($r, $inner);
        }
        return $next($request);
    }

    /** @return array{0:?string,1:array<string,string>} */
    private function match(string $requestPath): array
    {
        if (isset($this->routes[$requestPath]) && !str_contains($requestPath, '{')) {
            return [$requestPath, []];
        }
        foreach ($this->patterns as $pattern) {
            if (preg_match($pattern['regex'], $requestPath, $m) === 1) {
                $params = [];
                foreach ($pattern['names'] as $i => $name) {
                    $params[$name] = $m[$i + 1];
                }
                return [$pattern['path'], $params];
            }
        }
        return [null, []];
    }
}

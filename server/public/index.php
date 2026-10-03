<?php

declare(strict_types=1);

http_response_code(404);
header('Content-Type: application/json');
echo '{"error":"not_found"}';

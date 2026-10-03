<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

use Mra\Mail\MailerInterface;

final class FakeMailer implements MailerInterface
{
    /** @var list<array{to:string,subject:string,body:string}> */
    public array $sent = [];

    public function send(string $to, string $subject, string $textBody): void
    {
        $this->sent[] = ['to' => $to, 'subject' => $subject, 'body' => $textBody];
    }

    /** The six-digit code in the most recent message, or null. */
    public function lastCode(): ?string
    {
        $last = end($this->sent);
        return ($last !== false && preg_match('/\b(\d{6})\b/', $last['body'], $m) === 1) ? $m[1] : null;
    }
}

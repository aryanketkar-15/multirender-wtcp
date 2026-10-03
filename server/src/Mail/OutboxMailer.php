<?php

declare(strict_types=1);

namespace Mra\Mail;

/**
 * Development mailer used when no SMTP host is configured: writes each message to a text file in
 * var/outbox so the full flow can be exercised without real delivery. Never used in production.
 */
final class OutboxMailer implements MailerInterface
{
    public function __construct(private readonly string $dir)
    {
    }

    public function send(string $to, string $subject, string $textBody): void
    {
        if (!is_dir($this->dir) && !@mkdir($this->dir, 0775, true) && !is_dir($this->dir)) {
            throw new MailException('Outbox directory is not writable.');
        }
        $name = sprintf('%s/%s-%s.txt', $this->dir, gmdate('Ymd-His'), bin2hex(random_bytes(4)));
        $ok = file_put_contents($name, "To: {$to}\nSubject: {$subject}\n\n{$textBody}\n");
        if ($ok === false) {
            throw new MailException('Outbox write failed.');
        }
    }
}

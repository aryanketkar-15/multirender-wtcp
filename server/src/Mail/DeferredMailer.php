<?php

declare(strict_types=1);

namespace Mra\Mail;

/**
 * Queues messages and delivers them after the HTTP response has been flushed. Delivery latency
 * therefore cannot reveal whether an address is registered (no account-enumeration timing oracle).
 */
final class DeferredMailer implements MailerInterface
{
    /** @var list<array{0:string,1:string,2:string}> */
    private array $queue = [];

    public function __construct(private readonly MailerInterface $inner)
    {
    }

    public function send(string $to, string $subject, string $textBody): void
    {
        $this->queue[] = [$to, $subject, $textBody];
    }

    public function flush(): void
    {
        $queue = $this->queue;
        $this->queue = [];
        foreach ($queue as [$to, $subject, $body]) {
            try {
                $this->inner->send($to, $subject, $body);
            } catch (MailException $e) {
                error_log('mail delivery failed: ' . $e->getMessage());
            }
        }
    }
}

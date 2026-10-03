<?php

declare(strict_types=1);

namespace Mra\Mail;

/** Injected behind an interface so tests use a fake and never send real mail. */
interface MailerInterface
{
    /** @throws MailException */
    public function send(string $to, string $subject, string $textBody): void;
}

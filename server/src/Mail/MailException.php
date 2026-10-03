<?php

declare(strict_types=1);

namespace Mra\Mail;

/** Delivery failed. The message never carries SMTP credentials or the recipient. */
final class MailException extends \RuntimeException
{
}

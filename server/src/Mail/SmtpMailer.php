<?php

declare(strict_types=1);

namespace Mra\Mail;

use PHPMailer\PHPMailer\Exception as PhpMailerException;
use PHPMailer\PHPMailer\PHPMailer;

/** PHPMailer over authenticated, TLS-protected SMTP. Credentials come from the environment only. */
final class SmtpMailer implements MailerInterface
{
    public function __construct(
        private readonly string $host,
        private readonly int $port,
        private readonly string $user,
        private readonly string $password,
        private readonly string $from
    ) {
    }

    public function send(string $to, string $subject, string $textBody): void
    {
        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host = $this->host;
            $mail->Port = $this->port;
            $mail->SMTPAuth = true;
            $mail->Username = $this->user;
            $mail->Password = $this->password;
            $mail->SMTPSecure = $this->port === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
            $mail->CharSet = PHPMailer::CHARSET_UTF8;
            $mail->setFrom($this->from, 'MRA');
            $mail->addAddress($to);
            $mail->Subject = $subject;
            $mail->Body = $textBody;
            $mail->isHTML(false);
            $mail->send();
        } catch (PhpMailerException) {
            throw new MailException('Mail delivery failed.');
        }
    }
}

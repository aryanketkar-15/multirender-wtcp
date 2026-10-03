<?php

declare(strict_types=1);

namespace Mra;

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Crypto\BlindIndex;
use Mra\Crypto\CryptoFactory;
use Mra\Crypto\FieldEncryptor;
use Mra\Crypto\KeyStore;
use Mra\Crypto\Signer;
use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Mail\DeferredMailer;
use Mra\Mail\MailerInterface;
use Mra\Mail\OutboxMailer;
use Mra\Mail\SmtpMailer;
use Mra\Repository\BundleRepository;
use Mra\Repository\CommitmentRepository;
use Mra\Repository\ConsentSettingsRepository;
use Mra\Repository\Database;
use Mra\Repository\OtpRepository;
use Mra\Repository\PackRepository;
use Mra\Repository\PasswordResetRepository;
use Mra\Repository\SessionRepository;
use Mra\Repository\UserRepository;
use Mra\Service\AuthService;
use Mra\Service\BundleBuilder;
use Mra\Service\CommitmentService;
use Mra\Service\ConsentBundleFactory;
use Mra\Service\NonceService;
use Mra\Service\OtpService;
use Mra\Service\PasswordResetService;
use Mra\Service\RegistrationService;
use Mra\Service\SessionService;
use Mra\Service\ThrottleService;
use Mra\Support\Clock;
use Mra\Support\SystemClock;
use PDO;

/** Wiring: the one place that knows how the services fit together. */
final class App
{
    public readonly UserRepository $users;
    public readonly AuditLogger $audit;
    public readonly SecurityLogger $security;
    public readonly ThrottleService $throttle;
    public readonly OtpRepository $otps;
    public readonly OtpService $otp;
    public readonly RegistrationService $registration;
    public readonly SessionService $sessions;
    public readonly AuthService $auth;
    public readonly PackRepository $packs;
    public readonly CommitmentService $commitments;
    public readonly NonceService $nonces;
    public readonly BundleRepository $bundles;
    public readonly ConsentSettingsRepository $consentSettings;
    public readonly ConsentBundleFactory $consentBundles;
    public readonly PasswordResetService $passwordReset;

    public function __construct(
        public readonly PDO $pdo,
        public readonly FieldEncryptor $cipher,
        public readonly BlindIndex $index,
        public readonly Clock $clock,
        public readonly MailerInterface $mailer,
        public readonly KeyStore $keys
    ) {
        $this->users = new UserRepository($pdo, $cipher, $index);
        $this->audit = new AuditLogger($pdo, $cipher);
        $this->security = new SecurityLogger($pdo, $cipher);
        $this->throttle = new ThrottleService($pdo, $index, $clock);
        $this->otps = new OtpRepository($pdo);
        $this->otp = new OtpService(
            $this->users,
            $this->otps,
            $this->throttle,
            $mailer,
            $this->audit,
            $this->security,
            $clock
        );
        $this->registration = new RegistrationService($this->users, $this->throttle, $this->audit, $this->security);
        $this->sessions = new SessionService(new SessionRepository($pdo), $clock);
        $this->auth = new AuthService(
            $this->users,
            $this->sessions,
            $this->throttle,
            $this->audit,
            $this->security,
            $clock
        );
        $this->packs = new PackRepository($pdo);
        $this->commitments = new CommitmentService(new Signer($keys), new CommitmentRepository($pdo), $clock);
        $this->nonces = new NonceService($pdo, $clock);
        $this->bundles = new BundleRepository($pdo);
        $this->consentSettings = new ConsentSettingsRepository($pdo);
        // The Attestor Module does not exist until Phase 3; its hash is a clearly marked placeholder until then.
        $this->consentBundles = new ConsentBundleFactory(
            new BundleBuilder(),
            Env::get('ATTESTOR_HASH', 'sha256:' . hash('sha256', 'attestor-pending')) ?? '',
            Env::get('ATTESTOR_VERSION', '0.0.0-pending') ?? '0.0.0-pending'
        );
        $this->passwordReset = new PasswordResetService(
            $this->users,
            new PasswordResetRepository($pdo),
            $this->sessions,
            $this->throttle,
            $mailer,
            $this->audit,
            $this->security,
            $clock,
            Env::get('APP_URL', 'http://localhost:5173') ?? 'http://localhost:5173'
        );
    }

    public static function fromEnv(): self
    {
        $crypto = CryptoFactory::fromConfig();
        return new self(
            Database::connection(DatabaseConfig::fromEnv(Env::get('APP_ENV') === 'test')),
            $crypto['cipher'],
            $crypto['index'],
            new SystemClock(),
            self::mailerFromEnv(),
            KeyStore::fromEnv()
        );
    }

    /** SMTP when configured, otherwise a development outbox. Delivery is deferred past the response. */
    public static function mailerFromEnv(): DeferredMailer
    {
        $host = Env::get('SMTP_HOST');
        $inner = $host === null
            ? new OutboxMailer(dirname(__DIR__) . '/var/outbox')
            : new SmtpMailer(
                $host,
                (int) (Env::get('SMTP_PORT', '587') ?? '587'),
                Env::require('SMTP_USER'),
                Env::require('SMTP_PASSWORD'),
                Env::get('SMTP_FROM', 'no-reply@localhost') ?? 'no-reply@localhost'
            );
        return new DeferredMailer($inner);
    }
}

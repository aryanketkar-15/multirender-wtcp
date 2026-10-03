<?php

declare(strict_types=1);

namespace Mra\Tests\Repository;

use Mra\Crypto\BlindIndex;
use Mra\Crypto\DecryptionException;
use Mra\Crypto\FieldCipher;
use Mra\Repository\DuplicateEmailException;
use Mra\Repository\UserRepository;
use Mra\Tests\TestCase;

final class UserRepositoryTest extends TestCase
{
    private FieldCipher $cipher;
    private BlindIndex $index;
    private UserRepository $users;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cipher = new FieldCipher(str_repeat("\x11", 32));
        $this->index = new BlindIndex(str_repeat("\x22", 32));
        $this->users = new UserRepository($this->pdo, $this->cipher, $this->index);
    }

    public function testLookupByEmailReturnsDecryptedUser(): void // T1.1.6
    {
        $id = $this->users->create('Alice@Example.com', 'Alice Ünal', 'hash-value');
        $user = $this->users->findByEmail('  alice@example.COM ');
        $this->assertNotNull($user);
        $this->assertSame($id, $user->id);
        $this->assertSame('Alice@Example.com', $user->email);
        $this->assertSame('Alice Ünal', $user->name);
        $this->assertFalse($user->isVerified());
    }

    public function testUnknownEmailReturnsNull(): void
    {
        $this->assertNull($this->users->findByEmail('nobody@example.com'));
    }

    public function testDuplicateEmailIsRejectedByTheUniqueIndex(): void // T1.1.7
    {
        $this->users->create('dup@example.com', 'One', 'h');
        $this->expectException(DuplicateEmailException::class);
        $this->users->create('DUP@example.com', 'Two', 'h');
    }

    public function testNoPlaintextPersonalDataAtRest(): void // T1.1.9
    {
        $this->users->create('visible@example.com', 'Visible Person', 'h');
        $rows = $this->pdo->query('SELECT * FROM users')->fetchAll();
        $raw = '';
        foreach ($rows as $row) {
            $raw .= $row['email_enc'] . $row['name_enc'] . $row['email_bidx'];
        }
        $this->assertStringNotContainsString('visible@example.com', $raw);
        $this->assertStringNotContainsString('Visible Person', $raw);
        $this->assertStringNotContainsString('example.com', $raw);
        $this->assertNotSame('', $raw);
    }

    public function testChangingThePepperBreaksLookup(): void
    {
        $this->users->create('pepper@example.com', 'P', 'h');
        $other = new UserRepository($this->pdo, $this->cipher, new BlindIndex(str_repeat("\x33", 32)));
        $this->assertNull($other->findByEmail('pepper@example.com'));
    }

    public function testWrongKeyFailsClosedOnRead(): void
    {
        $this->users->create('key@example.com', 'K', 'h');
        $other = new UserRepository($this->pdo, new FieldCipher(str_repeat("\x44", 32)), $this->index);
        $this->expectException(DecryptionException::class);
        $other->findByEmail('key@example.com');
    }

    public function testTamperedRowFailsClosed(): void
    {
        $id = $this->users->create('tamper@example.com', 'T', 'h');
        $this->pdo->prepare('UPDATE users SET name_enc = ? WHERE id = ?')->execute([random_bytes(60), $id]);
        $this->expectException(DecryptionException::class);
        $this->users->findById($id);
    }

    public function testEmailCiphertextCannotBeSwappedIntoTheNameColumn(): void
    {
        $id = $this->users->create('swap@example.com', 'S', 'h');
        $this->pdo->exec('UPDATE users SET name_enc = email_enc WHERE id = ' . $id);
        $this->expectException(DecryptionException::class);
        $this->users->findById($id);
    }

    public function testMarkVerifiedSetsTimestampOnce(): void
    {
        $id = $this->users->create('v@example.com', 'V', 'h');
        $this->users->markVerified($id);
        $first = $this->users->findById($id);
        $this->assertTrue($first->isVerified());
        usleep(2000);
        $this->users->markVerified($id);
        $this->assertSame($first->verifiedAt, $this->users->findById($id)->verifiedAt);
    }

    public function testPasswordHashIsStoredAsGivenNotEncrypted(): void
    {
        $hash = password_hash('correct horse battery', PASSWORD_ARGON2ID);
        $id = $this->users->create('h@example.com', 'H', $hash);
        $this->assertSame($hash, $this->users->findById($id)->passwordHash);
        $this->users->updatePasswordHash($id, 'new-hash');
        $this->assertSame('new-hash', $this->users->findById($id)->passwordHash);
    }
}

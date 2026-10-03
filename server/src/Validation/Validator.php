<?php

declare(strict_types=1);

namespace Mra\Validation;

use Mra\Validation\Rules\Rule;

/**
 * Runs a schema of field => [[Rule, message], ...]. The first failing rule per field supplies
 * that field's message. This is the enforcement boundary; the React forms mirror it for feedback.
 */
final class Validator
{
    /**
     * @param array<string,mixed> $data
     * @param array<string,list<array{0:Rule,1:string}>> $schema
     * @return array<string,string> errors keyed by field (empty when valid)
     */
    public static function check(array $data, array $schema): array
    {
        $errors = [];
        foreach ($schema as $field => $rules) {
            $value = $data[$field] ?? null;
            foreach ($rules as [$rule, $message]) {
                if (!$rule->passes($value, $data)) {
                    $errors[$field] = $message;
                    break;
                }
            }
        }
        return $errors;
    }

    /**
     * @param array<string,mixed> $data
     * @param array<string,list<array{0:Rule,1:string}>> $schema
     * @throws ValidationException
     */
    public static function assert(array $data, array $schema): void
    {
        $errors = self::check($data, $schema);
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
    }
}

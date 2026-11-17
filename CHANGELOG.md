# Changelog

## 0.2.0 - 2026-11-17

### Bug Fixes

- **lowercase/uppercase dual-purpose conflict:** `lowercase` and `uppercase` are now sanitizers only (they transform the value). Added `isLowercase` and `isUppercase` as validation-only checks that reject non-conforming values without transforming them.
- **null + required interaction:** `null` values now trigger a `required` error (not `nullable`) when `required: true` is set. Previously, `null` always gave a `nullable` error even when the field was required.
- **Custom validator false positives:** Custom validators must now return exactly `true` to pass. Previously, any truthy value (including `1`, `"yes"`, etc.) was treated as passing, and falsy-but-valid values like `0` caused false positives.
- **Object/Array reference leak:** `type: 'object'` without `properties` and `type: 'array'` without `items` now return deep clones instead of raw input references. This prevents mutation of the original input through the validated output.
- **Date reference leak:** Date objects in output are now cloned. Previously, the same Date reference was shared between input and output.
- **Email regex too loose:** Email validation now rejects consecutive dots in the address and requires a TLD of at least 2 characters.
- **numeric regex too restrictive:** The `numeric` string check now accepts decimal strings (`"3.14"`) and negative strings (`"-5"`), not just unsigned integers.
- **Integer coercion:** Integer coercion now only coerces strings that represent safe integers. `"3.5"` is no longer coerced to `3.5` (it stays as a string and fails the type check).
- **normalizeEmail improved:** `normalizeEmail` now performs real email normalization — for Gmail/Googlemail addresses, it removes dots and plus-addressing from the local part.
- **Properties without type:object:** Setting `properties` on a rule now automatically processes the value as an object, even without explicit `type: 'object'`.
- **rejectEmpty return value:** Fields rejected by `rejectEmpty` now return `present: false`, excluding them from output.
- **Custom error messages for enum/oneOf:** `enum` and `oneOf` rules now respect custom `message` values.
- **Double options validation:** Options are now validated once at middleware creation time (not again per-request inside `validateData`). This catches configuration errors early at app startup.
- **Transform returning undefined:** A `transform` function returning `undefined` now correctly excludes the field from output.
- **Middleware uses normalized options consistently:** The error handler now reads from pre-normalized options.

### New Features

- `isLowercase` — validation-only check that the string is already lowercase.
- `isUppercase` — validation-only check that the string is already uppercase.
- `minItems` — minimum number of items in an array.
- `maxItems` — maximum number of items in an array.

### Improvements

- Comprehensive test suite expanded from 11 to 117 tests.
- Improved inline documentation and JSDoc comments.
- README rewritten with complete API reference, tables, and usage examples.

## 0.1.0 - 2026-11-17

- Initial CommonJS validation engine and Express middleware.
- Added nested schemas, sanitization, coercion, defaults, custom async validators, cleanup policies, limits, tests, and documentation.

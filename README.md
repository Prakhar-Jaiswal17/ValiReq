# ValiReq

**Validate. Sanitize. Transform.**

ValiReq is a lightweight, production-quality request validation, sanitization and transformation toolkit for Express.js. It validates `body`, `query`, and `params` data, returns a new cleaned object (never mutating the original), and supports nested schemas, coercion, defaults, custom sync/async validators, and configurable unknown-field policies.

## Install

```sh
npm install valireq
```

## Quick Start

```js
const express = require('express');
const { validate } = require('valireq');

const app = express();
app.use(express.json());

app.post('/users', validate({
  email: { required: true, type: 'string', trim: true, lowercase: true, email: true },
  age: { type: 'number', coerce: true, min: 18 },
  active: { type: 'boolean', coerce: true, default: true }
}), (req, res) => res.json(req.validated));

app.listen(3000);
```

## Features

- **Request validation** — validate `req.body`, `req.query`, and `req.params`.
- **Type checking** — `string`, `number`, `integer`, `boolean`, `array`, `object`, `date`.
- **String validation** — `email`, `url`, `uuid`, `alphanumeric`, `numeric`, `alphabetic`, `isLowercase`, `isUppercase`, `startsWith`, `endsWith`, `contains`, `matches`.
- **Number validation** — `min`, `max`, `integer`, `positive`, `negative`, `finite`.
- **Length validation** — `minLength`, `maxLength`, `exactLength`.
- **Enum & equality** — `enum`, `oneOf`, `equals`, `notEquals`.
- **Sanitization** — `trim`, `lowercase`, `uppercase`, `removeExtraSpaces`, `stripHtml`, `removeNullBytes`, `normalizeEmail`, `escapeHtml`.
- **Coercion** — string to number/integer/boolean/date with `coerce: true`.
- **Defaults & transforms** — `default`, `transform(value)`.
- **Nested schemas** — `properties` for objects, `items` for arrays.
- **Array constraints** — `minItems`, `maxItems`.
- **Unknown field handling** — `strip` (default), `strict`, `passthrough`.
- **Custom validators** — sync and async `custom` functions.
- **Error handling** — structured errors with field paths, custom messages, `abortEarly`.
- **Security** — prototype pollution protection, depth/size limits, immutable input.

## API

### `validate(schema, options?)` — Express Middleware

Returns an Express middleware function.

```js
app.post('/register', validate(schema, options), handler);
```

Options are validated eagerly at middleware creation time (not per-request), so configuration errors are caught during app startup.

### `validateData(input, schema, options?)` — Standalone

Express-independent validation. Returns a `Promise<Object>`.

```js
const { validateData } = require('valireq');

const result = await validateData(
  { name: '  Prakhar  ', age: '20' },
  { name: { type: 'string', trim: true }, age: { type: 'number', coerce: true } }
);
// { name: 'Prakhar', age: 20 }
```

### `ValidationError`

Thrown when validation fails. Properties:

- `name` — `'ValidationError'`
- `message` — `'Validation failed'`
- `status` — `400`
- `errors` — `[{ field, rule, message }]`
- `toJSON()` — `{ success: false, message, errors }`

## Validation Rules Reference

### Basic Rules

| Rule | Type | Description |
|------|------|-------------|
| `required` | `boolean` | Field must be present (not `undefined`). Null values also trigger a required error unless `nullable` is set. |
| `nullable` | `boolean` | Allow `null` values. |
| `type` | `string` | Expected type: `'string'`, `'number'`, `'integer'`, `'boolean'`, `'array'`, `'object'`, `'date'`. |
| `enum` | `Array` | Value must be in the array (strict equality). |
| `oneOf` | `Array` | Alias for `enum`. |
| `equals` | `any` | Value must strictly equal this. |
| `notEquals` | `any` | Value must not strictly equal this. |

### String Rules

| Rule | Type | Description |
|------|------|-------------|
| `minLength` | `number` | Minimum string length. |
| `maxLength` | `number` | Maximum string length. |
| `exactLength` | `number` | Exact string length. |
| `email` | `boolean` | Must be a valid email address. Rejects consecutive dots and requires a 2+ char TLD. |
| `url` | `boolean` | Must be a valid URL (uses `new URL()`). |
| `uuid` | `boolean` | Must be a valid UUID (v1–v5). |
| `alphanumeric` | `boolean` | Letters and digits only. |
| `numeric` | `boolean` | Numeric string (integers, decimals, negatives). |
| `alphabetic` | `boolean` | Letters only. |
| `isLowercase` | `boolean` | Must already be lowercase (validation only, does not transform). |
| `isUppercase` | `boolean` | Must already be uppercase (validation only, does not transform). |
| `startsWith` | `string` | Must start with the given prefix. |
| `endsWith` | `string` | Must end with the given suffix. |
| `contains` | `string` | Must contain the given substring. |
| `matches` | `RegExp` | Must match the regular expression. |

### Number Rules

| Rule | Type | Description |
|------|------|-------------|
| `min` | `number` | Minimum value (inclusive). Works with `min: 0`. |
| `max` | `number` | Maximum value (inclusive). Works with `max: 0`. |
| `integer` | `boolean` | Must be an integer. |
| `positive` | `boolean` | Must be > 0. |
| `negative` | `boolean` | Must be < 0. |
| `finite` | `boolean` | Must be finite. |

### Array Rules

| Rule | Type | Description |
|------|------|-------------|
| `items` | `object` | Schema for validating each array item. |
| `minItems` | `number` | Minimum number of items. |
| `maxItems` | `number` | Maximum number of items. |

### Object Rules

| Rule | Type | Description |
|------|------|-------------|
| `properties` | `object` | Schema for validating object properties. When `properties` is set, the value is treated as an object even without `type: 'object'`. |

## Sanitization

Sanitization options transform string values. They only apply when explicitly enabled.

```js
validate({
  name: { type: 'string', trim: true, removeExtraSpaces: true },
  email: { type: 'string', trim: true, lowercase: true, email: true }
});
```

| Option | Description |
|--------|-------------|
| `trim` | Remove leading/trailing whitespace. |
| `lowercase` | Convert to lowercase. **This is a sanitizer** — it transforms the value. To validate that a string is already lowercase, use `isLowercase`. |
| `uppercase` | Convert to uppercase. **This is a sanitizer** — it transforms the value. To validate that a string is already uppercase, use `isUppercase`. |
| `removeExtraSpaces` | Collapse repeated whitespace to a single space. |
| `stripHtml` | Remove HTML tags. |
| `removeNullBytes` | Remove null bytes (`\0`). |
| `normalizeEmail` | Conservative email normalization: lowercases the entire address. For Gmail/Googlemail, also removes dots and plus-addressing from the local part. |
| `escapeHtml` | Escape `&`, `<`, `>`, `"`, `'` to HTML entities. |

> **Important:** Sanitization is not a substitute for parameterized SQL queries or context-aware output encoding.

### Order of Operations

Sanitization is applied in this order:
1. `removeNullBytes`
2. `trim`
3. `removeExtraSpaces`
4. `stripHtml`
5. `normalizeEmail`
6. `lowercase` / `uppercase`
7. `escapeHtml`

## Coercion & Transformation

### Type Coercion

Enable with `coerce: true`. Only coerces strings.

```js
validate({
  age: { type: 'number', coerce: true },     // "20" → 20
  count: { type: 'integer', coerce: true },   // "5" → 5, "3.5" → rejected
  active: { type: 'boolean', coerce: true },  // "true"/"1" → true, "false"/"0" → false
  when: { type: 'date', coerce: true }        // "2025-01-01" → Date object
});
```

Coercion rules:
- **Number:** Empty strings and non-numeric strings are not coerced (they remain as strings and fail the type check).
- **Integer:** Only strings representing safe integers are coerced. `"3.5"` is not coerced and fails the type check.
- **Boolean:** Only `"true"`, `"1"`, `"false"`, `"0"` are coerced.
- **Date:** Uses `new Date(value)`. Invalid dates are not coerced.

### Default Values

```js
validate({
  role: { type: 'string', default: 'user' },
  id: { type: 'string', default: () => crypto.randomUUID() },
  token: { type: 'string', default: async () => await generateToken() }
});
```

### Custom Transforms

```js
validate({
  tags: { type: 'string', transform: value => value.split(',') }
});
```

## Unknown Field Handling

Control what happens to fields not defined in the schema.

```js
validate(schema, { unknown: 'strip' });       // Default: remove unknown fields
validate(schema, { unknown: 'strict' });       // Reject requests with unknown fields
validate(schema, { unknown: 'passthrough' });  // Keep unknown fields in output
```

Unknown field handling also applies to nested objects inside `properties`.

## Nested Objects and Arrays

```js
validate({
  address: {
    type: 'object',
    properties: {
      city: { required: true, type: 'string' },
      pincode: { type: 'string', exactLength: 6 }
    }
  },
  hobbies: {
    type: 'array',
    items: { type: 'string' },
    minItems: 1,
    maxItems: 10
  },
  users: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { required: true, type: 'string' },
        email: { required: true, type: 'string', email: true }
      }
    }
  }
});
```

Error paths use dot notation for objects and bracket notation for arrays:
```
address.pincode
hobbies[1]
users[0].email
```

> **Tip:** Setting `properties` on a rule automatically treats the value as an object, so `type: 'object'` is optional when `properties` is present.

## Custom Validators

```js
validate({
  username: {
    required: true,
    custom: (value) => value !== 'admin',
    message: 'This username is not allowed.'
  }
});
```

Custom validators must return exactly `true` to pass. Any other return value (including other truthy values like `1`, `"yes"`, etc.) is treated as a validation failure.

### Async Validators

```js
validate({
  username: {
    required: true,
    custom: async (value) => {
      const exists = await checkDatabase(value);
      return !exists;
    },
    message: 'Username is already taken.'
  }
});
```

Exceptions thrown inside custom validators are caught and converted to validation errors. Internal error details are never exposed to clients.

## Empty String Handling

| Scenario | Behavior |
|----------|----------|
| Empty string, no rules | Excluded from output |
| `required: true` + empty string | Included in output (required checks for `undefined`/`null`, not empty) |
| `allowEmpty: true` | Included in output |
| `rejectEmpty: true` | Validation error |

If you need required fields to reject empty strings, combine `required: true` with `rejectEmpty: true` or `minLength: 1`.

## Express Integration

### Source Selection

```js
app.post('/users', validate(schema, { source: 'body' }), handler);     // Default
app.get('/search', validate(schema, { source: 'query' }), handler);
app.get('/users/:id', validate(schema, { source: 'params' }), handler);
```

### Output Modes

```js
// Default: req.validated = { ... }
app.post('/users', validate(schema), handler);

// By source: req.validated.body = { ... }
app.post('/users', validate(bodySchema, { source: 'body', output: 'bySource' }), handler);
app.post('/users', validate(querySchema, { source: 'query', output: 'bySource' }), handler);
// Access: req.validated.body, req.validated.query
```

### Custom Error Handler

```js
validate(schema, {
  onError: (error, req, res, next) => {
    res.status(422).json({ errors: error.errors });
  }
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `source` | `string` | `'body'` | Request source: `'body'`, `'query'`, `'params'`. |
| `output` | `string` | `'validated'` | Output mode: `'validated'` or `'bySource'`. |
| `unknown` | `string` | `'strip'` | Unknown field policy: `'strip'`, `'strict'`, `'passthrough'`. |
| `abortEarly` | `boolean` | `false` | Stop validation after the first error. |
| `maxDepth` | `number` | `20` | Maximum nested object depth. |
| `maxArrayLength` | `number` | `1000` | Maximum array length (DoS protection). |
| `maxObjectKeys` | `number` | `1000` | Maximum object keys (DoS protection). |
| `onError` | `function` | — | Custom error handler `(error, req, res, next)`. |

## Error Format

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Must be a valid email address.",
      "rule": "email"
    },
    {
      "field": "password",
      "message": "Must be at least 8 characters.",
      "rule": "minLength"
    }
  ]
}
```

## Security Considerations

- **Immutability:** Output is always a newly allocated object. The original `req.body`/`req.query`/`req.params` is never modified.
- **Prototype pollution:** `__proto__`, `prototype`, and `constructor` keys are ignored in input and schema.
- **Depth protection:** Configurable `maxDepth` prevents stack overflow from deeply nested input.
- **Size limits:** `maxArrayLength` and `maxObjectKeys` prevent DoS from large payloads.
- **Date cloning:** Date objects in output are cloned to prevent mutation through shared references.
- **Object cloning:** Objects and arrays without sub-schemas are deep-cloned in output.
- **Regex safety:** Stateful regexes (with `g` flag) are reset before and after each test.
- **Error isolation:** Exceptions from custom validators and transforms are caught; internal details are never exposed.

> **Note:** Sanitization (e.g., `escapeHtml`, `stripHtml`) is not a substitute for parameterized queries or context-aware output encoding. Application-supplied regular expressions should be reviewed for worst-case behavior.

## Limitations

- `lowercase`/`uppercase` are sanitizers (they transform the value). Use `isLowercase`/`isUppercase` for validation-only checks.
- UUID validation covers v1–v5 only (not v6/v7/v8 from RFC 9562).
- Email validation is intentionally basic — it checks format, rejects consecutive dots, and requires a 2+ char TLD, but does not fully validate per RFC 5322.
- Date coercion relies on the JavaScript `Date` constructor, which has platform-specific edge cases.
- `cloneInput` handles `Date`, `Array`, and plain objects. `RegExp`, `Map`, `Set`, `Buffer`, and other types are returned by reference (these are rare in JSON-parsed request bodies).

## Development

```sh
npm test          # Run all tests (Node.js built-in test runner)
npm run lint      # Syntax check
npm pack --dry-run  # Preview npm package contents
```

No Express dependency is bundled; install it in the consuming application. Node.js 18+ and CommonJS are required.

## License

MIT

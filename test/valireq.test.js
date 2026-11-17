'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateData, validate, ValidationError } = require('../src');

// ─────────────────────────────────────────────────────────────────────────────
// BASIC VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

test('required fields reject undefined', async () => {
  await assert.rejects(
    () => validateData({}, { name: { required: true } }),
    error => error instanceof ValidationError && error.errors[0].rule === 'required',
  );
});

test('required fields accept present values', async () => {
  const result = await validateData({ name: 'Ada' }, { name: { required: true, type: 'string' } });
  assert.equal(result.name, 'Ada');
});

test('optional fields are excluded from output when absent', async () => {
  const result = await validateData({}, { name: { type: 'string' } });
  assert.equal('name' in result, false);
});

test('nullable fields accept null', async () => {
  const result = await validateData({ name: null }, { name: { nullable: true } });
  assert.equal(result.name, null);
});

test('null with required gives required error (not nullable)', async () => {
  await assert.rejects(
    () => validateData({ name: null }, { name: { required: true, type: 'string' } }),
    error => error.errors[0].rule === 'required',
  );
});

test('null without required or nullable gives nullable error', async () => {
  await assert.rejects(
    () => validateData({ name: null }, { name: { type: 'string' } }),
    error => error.errors[0].rule === 'nullable',
  );
});

test('required + nullable + null = passes (returns null)', async () => {
  const result = await validateData({ name: null }, { name: { required: true, nullable: true } });
  assert.equal(result.name, null);
});

test('required + nullable + undefined = required error', async () => {
  await assert.rejects(
    () => validateData({}, { name: { required: true, nullable: true } }),
    error => error.errors[0].rule === 'required',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPE CHECKING
// ─────────────────────────────────────────────────────────────────────────────

test('type string rejects numbers', async () => {
  await assert.rejects(
    () => validateData({ val: 123 }, { val: { type: 'string' } }),
    error => error.errors[0].rule === 'type',
  );
});

test('type number rejects NaN', async () => {
  await assert.rejects(
    () => validateData({ val: NaN }, { val: { type: 'number' } }),
    error => error.errors[0].rule === 'type',
  );
});

test('type number rejects Infinity', async () => {
  await assert.rejects(
    () => validateData({ val: Infinity }, { val: { type: 'number' } }),
    error => error.errors[0].rule === 'type',
  );
});

test('type integer accepts safe integers', async () => {
  const result = await validateData({ val: 42 }, { val: { type: 'integer' } });
  assert.equal(result.val, 42);
});

test('type integer rejects floats', async () => {
  await assert.rejects(
    () => validateData({ val: 3.5 }, { val: { type: 'integer' } }),
    error => error.errors[0].rule === 'type',
  );
});

test('type boolean accepts true/false', async () => {
  const result = await validateData({ a: true, b: false }, {
    a: { type: 'boolean' },
    b: { type: 'boolean' },
  });
  assert.equal(result.a, true);
  assert.equal(result.b, false);
});

test('type date accepts valid Date objects', async () => {
  const d = new Date('2025-01-01');
  const result = await validateData({ when: d }, { when: { type: 'date' } });
  assert.ok(result.when instanceof Date);
  assert.equal(result.when.getTime(), d.getTime());
});

test('type date rejects invalid Date objects', async () => {
  await assert.rejects(
    () => validateData({ when: new Date('invalid') }, { when: { type: 'date' } }),
    error => error.errors[0].rule === 'type',
  );
});

test('unsupported type in schema throws TypeError', async () => {
  await assert.rejects(
    () => validateData({}, { val: { type: 'wat' } }),
    /Unsupported type/,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SANITIZATION
// ─────────────────────────────────────────────────────────────────────────────

test('sanitizes and coerces values without changing the input', async () => {
  const input = {
    name: '  Ada   Lovelace ',
    age: '36',
    active: 'true',
    extra: 'removed',
  };

  const result = await validateData(input, {
    name: { type: 'string', trim: true, removeExtraSpaces: true },
    age: { type: 'number', coerce: true },
    active: { type: 'boolean', coerce: true },
  });

  assert.deepEqual({ ...result }, { name: 'Ada Lovelace', age: 36, active: true });
  assert.equal(input.age, '36');
});

test('trim removes leading and trailing whitespace', async () => {
  const result = await validateData({ val: '  hello  ' }, { val: { type: 'string', trim: true } });
  assert.equal(result.val, 'hello');
});

test('removeExtraSpaces collapses whitespace', async () => {
  const result = await validateData({ val: 'a   b   c' }, { val: { type: 'string', removeExtraSpaces: true } });
  assert.equal(result.val, 'a b c');
});

test('stripHtml removes HTML tags', async () => {
  const result = await validateData(
    { val: '<script>alert("xss")</script>Hello<b>World</b>' },
    { val: { type: 'string', stripHtml: true } },
  );
  assert.equal(result.val, 'alert("xss")HelloWorld');
});

test('removeNullBytes strips null bytes', async () => {
  const result = await validateData(
    { val: 'hel\0lo' },
    { val: { type: 'string', removeNullBytes: true } },
  );
  assert.equal(result.val, 'hello');
});

test('escapeHtml escapes special characters', async () => {
  const result = await validateData(
    { val: '<b>a & "b"</b>' },
    { val: { type: 'string', escapeHtml: true } },
  );
  assert.equal(result.val, '&lt;b&gt;a &amp; &quot;b&quot;&lt;/b&gt;');
});

test('lowercase sanitizer converts to lowercase', async () => {
  const result = await validateData({ val: 'HELLO' }, { val: { type: 'string', lowercase: true } });
  assert.equal(result.val, 'hello');
});

test('uppercase sanitizer converts to uppercase', async () => {
  const result = await validateData({ val: 'hello' }, { val: { type: 'string', uppercase: true } });
  assert.equal(result.val, 'HELLO');
});

test('normalizeEmail strips gmail dots and plus addressing', async () => {
  const result = await validateData(
    { email: 'First.Last+spam@gmail.com' },
    { email: { type: 'string', normalizeEmail: true } },
  );
  assert.equal(result.email, 'firstlast@gmail.com');
});

test('normalizeEmail lowercases non-gmail addresses', async () => {
  const result = await validateData(
    { email: 'USER@Example.COM' },
    { email: { type: 'string', normalizeEmail: true } },
  );
  assert.equal(result.email, 'user@example.com');
});

// ─────────────────────────────────────────────────────────────────────────────
// STRING VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

test('minLength rejects short strings', async () => {
  await assert.rejects(
    () => validateData({ val: 'ab' }, { val: { type: 'string', minLength: 3 } }),
    error => error.errors[0].rule === 'minLength',
  );
});

test('maxLength rejects long strings', async () => {
  await assert.rejects(
    () => validateData({ val: 'abcde' }, { val: { type: 'string', maxLength: 3 } }),
    error => error.errors[0].rule === 'maxLength',
  );
});

test('exactLength rejects wrong-length strings', async () => {
  await assert.rejects(
    () => validateData({ val: 'ab' }, { val: { type: 'string', exactLength: 3 } }),
    error => error.errors[0].rule === 'exactLength',
  );
});

test('email accepts valid email addresses', async () => {
  const result = await validateData(
    { val: 'user@example.com' },
    { val: { type: 'string', email: true } },
  );
  assert.equal(result.val, 'user@example.com');
});

test('email rejects invalid emails', async () => {
  const invalid = ['', '@b.com', 'a@', 'a@b', 'a b@c.com', 'user@domain..com'];
  for (const email of invalid) {
    await assert.rejects(
      () => validateData({ val: email }, { val: { type: 'string', email: true } }),
      error => error instanceof ValidationError,
      `Expected "${email}" to be rejected`,
    );
  }
});

test('url accepts valid URLs', async () => {
  const result = await validateData(
    { val: 'https://example.com/path' },
    { val: { type: 'string', url: true } },
  );
  assert.equal(result.val, 'https://example.com/path');
});

test('url rejects invalid URLs', async () => {
  await assert.rejects(
    () => validateData({ val: 'not-a-url' }, { val: { type: 'string', url: true } }),
    error => error.errors[0].rule === 'url',
  );
});

test('uuid accepts valid UUIDs', async () => {
  const result = await validateData(
    { val: '550e8400-e29b-41d4-a716-446655440000' },
    { val: { type: 'string', uuid: true } },
  );
  assert.ok(result.val);
});

test('uuid rejects invalid UUIDs', async () => {
  await assert.rejects(
    () => validateData({ val: 'not-a-uuid' }, { val: { type: 'string', uuid: true } }),
    error => error.errors[0].rule === 'uuid',
  );
});

test('alphanumeric accepts alphanumeric strings', async () => {
  const result = await validateData({ val: 'abc123' }, { val: { type: 'string', alphanumeric: true } });
  assert.equal(result.val, 'abc123');
});

test('alphanumeric rejects non-alphanumeric strings', async () => {
  await assert.rejects(
    () => validateData({ val: 'abc-123' }, { val: { type: 'string', alphanumeric: true } }),
    error => error.errors[0].rule === 'alphanumeric',
  );
});

test('numeric accepts integer strings', async () => {
  const result = await validateData({ val: '123' }, { val: { type: 'string', numeric: true } });
  assert.equal(result.val, '123');
});

test('numeric accepts decimal strings', async () => {
  const result = await validateData({ val: '3.14' }, { val: { type: 'string', numeric: true } });
  assert.equal(result.val, '3.14');
});

test('numeric accepts negative strings', async () => {
  const result = await validateData({ val: '-5' }, { val: { type: 'string', numeric: true } });
  assert.equal(result.val, '-5');
});

test('numeric rejects non-numeric strings', async () => {
  await assert.rejects(
    () => validateData({ val: 'abc' }, { val: { type: 'string', numeric: true } }),
    error => error.errors[0].rule === 'numeric',
  );
});

test('alphabetic accepts letter-only strings', async () => {
  const result = await validateData({ val: 'abc' }, { val: { type: 'string', alphabetic: true } });
  assert.equal(result.val, 'abc');
});

test('alphabetic rejects strings with numbers', async () => {
  await assert.rejects(
    () => validateData({ val: 'abc123' }, { val: { type: 'string', alphabetic: true } }),
    error => error.errors[0].rule === 'alphabetic',
  );
});

test('isLowercase validates (does not transform)', async () => {
  const result = await validateData({ val: 'hello' }, { val: { type: 'string', isLowercase: true } });
  assert.equal(result.val, 'hello');

  await assert.rejects(
    () => validateData({ val: 'Hello' }, { val: { type: 'string', isLowercase: true } }),
    error => error.errors[0].rule === 'isLowercase',
  );
});

test('isUppercase validates (does not transform)', async () => {
  const result = await validateData({ val: 'HELLO' }, { val: { type: 'string', isUppercase: true } });
  assert.equal(result.val, 'HELLO');

  await assert.rejects(
    () => validateData({ val: 'Hello' }, { val: { type: 'string', isUppercase: true } }),
    error => error.errors[0].rule === 'isUppercase',
  );
});

test('startsWith validates prefix', async () => {
  await assert.rejects(
    () => validateData({ val: 'hello' }, { val: { type: 'string', startsWith: 'xyz' } }),
    error => error.errors[0].rule === 'startsWith',
  );
});

test('endsWith validates suffix', async () => {
  await assert.rejects(
    () => validateData({ val: 'hello' }, { val: { type: 'string', endsWith: 'xyz' } }),
    error => error.errors[0].rule === 'endsWith',
  );
});

test('contains validates substring', async () => {
  await assert.rejects(
    () => validateData({ val: 'hello' }, { val: { type: 'string', contains: 'xyz' } }),
    error => error.errors[0].rule === 'contains',
  );
});

test('matches validates regex', async () => {
  const result = await validateData(
    { val: 'abc123' },
    { val: { type: 'string', matches: /^[a-z]+\d+$/ } },
  );
  assert.equal(result.val, 'abc123');

  await assert.rejects(
    () => validateData({ val: '!!!' }, { val: { type: 'string', matches: /^[a-z]+$/ } }),
    error => error.errors[0].rule === 'matches',
  );
});

test('resets stateful regular expressions between validations', async () => {
  const schema = { code: { type: 'string', matches: /^a/g } };
  assert.equal((await validateData({ code: 'a' }, schema)).code, 'a');
  assert.equal((await validateData({ code: 'a' }, schema)).code, 'a');
});

// ─────────────────────────────────────────────────────────────────────────────
// NUMBER VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

test('min rejects too-small numbers', async () => {
  await assert.rejects(
    () => validateData({ val: 5 }, { val: { type: 'number', min: 10 } }),
    error => error.errors[0].rule === 'min',
  );
});

test('max rejects too-large numbers', async () => {
  await assert.rejects(
    () => validateData({ val: 15 }, { val: { type: 'number', max: 10 } }),
    error => error.errors[0].rule === 'max',
  );
});

test('min: 0 and max: 0 work correctly', async () => {
  const result = await validateData({ val: 0 }, { val: { type: 'number', min: 0, max: 0 } });
  assert.equal(result.val, 0);
});

test('positive rejects non-positive numbers', async () => {
  await assert.rejects(
    () => validateData({ val: -1 }, { val: { type: 'number', positive: true } }),
    error => error.errors[0].rule === 'positive',
  );
});

test('negative rejects non-negative numbers', async () => {
  await assert.rejects(
    () => validateData({ val: 1 }, { val: { type: 'number', negative: true } }),
    error => error.errors[0].rule === 'negative',
  );
});

test('integer rule on numbers', async () => {
  await assert.rejects(
    () => validateData({ val: 3.5 }, { val: { type: 'number', integer: true } }),
    error => error.errors[0].rule === 'integer',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// COERCION
// ─────────────────────────────────────────────────────────────────────────────

test('coerces string to number', async () => {
  const result = await validateData({ val: '42' }, { val: { type: 'number', coerce: true } });
  assert.equal(result.val, 42);
  assert.equal(typeof result.val, 'number');
});

test('coerces string to integer', async () => {
  const result = await validateData({ val: '42' }, { val: { type: 'integer', coerce: true } });
  assert.equal(result.val, 42);
});

test('integer coercion rejects non-integer strings', async () => {
  await assert.rejects(
    () => validateData({ val: '3.5' }, { val: { type: 'integer', coerce: true } }),
    error => error.errors[0].rule === 'type',
  );
});

test('coerces string to boolean', async () => {
  const trueResult = await validateData({ val: 'true' }, { val: { type: 'boolean', coerce: true } });
  assert.equal(trueResult.val, true);

  const oneResult = await validateData({ val: '1' }, { val: { type: 'boolean', coerce: true } });
  assert.equal(oneResult.val, true);

  const falseResult = await validateData({ val: 'false' }, { val: { type: 'boolean', coerce: true } });
  assert.equal(falseResult.val, false);

  const zeroResult = await validateData({ val: '0' }, { val: { type: 'boolean', coerce: true } });
  assert.equal(zeroResult.val, false);
});

test('coerces string to date', async () => {
  const result = await validateData({ val: '2025-01-01' }, { val: { type: 'date', coerce: true } });
  assert.ok(result.val instanceof Date);
});

test('rejects invalid date strings after coercion', async () => {
  await assert.rejects(
    () => validateData({ when: 'not a date' }, { when: { type: 'date', coerce: true } }),
    error => error.errors[0].rule === 'type',
  );
});

test('coercion of empty string does not produce NaN', async () => {
  await assert.rejects(
    () => validateData({ val: '' }, { val: { type: 'number', coerce: true } }),
    error => error.errors[0].rule === 'type',
  );
});

test('coercion of non-numeric string does not produce NaN', async () => {
  await assert.rejects(
    () => validateData({ val: 'abc' }, { val: { type: 'number', coerce: true } }),
    error => error.errors[0].rule === 'type',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULTS AND TRANSFORMS
// ─────────────────────────────────────────────────────────────────────────────

test('default values are applied for missing fields', async () => {
  const result = await validateData({}, { val: { type: 'number', default: 42 } });
  assert.equal(result.val, 42);
});

test('sync and async defaults and transforms', async () => {
  const result = await validateData({}, {
    first: { type: 'string', default: () => 'hello' },
    second: { type: 'number', default: async () => 4, transform: async value => value + 1 },
  });
  assert.equal(result.first, 'hello');
  assert.equal(result.second, 5);
});

test('transform returning undefined makes field absent', async () => {
  const result = await validateData(
    { name: 'hello' },
    { name: { transform: () => undefined } },
  );
  assert.equal('name' in result, false);
});

test('failed default produces error, not crash', async () => {
  await assert.rejects(
    () => validateData({}, { val: { required: true, default: () => { throw new Error('boom'); } } }),
    error => error instanceof ValidationError && error.errors[0].rule === 'default',
  );
});

test('failed transform produces error, not crash', async () => {
  await assert.rejects(
    () => validateData({ val: 1 }, { val: { transform: () => { throw new Error('boom'); } } }),
    error => error instanceof ValidationError && error.errors[0].rule === 'transform',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ENUM, ONEOF, EQUALS, NOTEQUALS
// ─────────────────────────────────────────────────────────────────────────────

test('enum rejects values not in the allowed list', async () => {
  await assert.rejects(
    () => validateData({ val: 'x' }, { val: { enum: ['a', 'b'] } }),
    error => error.errors[0].rule === 'enum',
  );
});

test('enum uses strict equality', async () => {
  await assert.rejects(
    () => validateData({ val: 1 }, { val: { enum: ['1'] } }),
    error => error.errors[0].rule === 'enum',
  );
});

test('enum supports custom error messages', async () => {
  await assert.rejects(
    () => validateData({ val: 'x' }, { val: { enum: ['a'], message: 'Pick valid!' } }),
    error => error.errors[0].message === 'Pick valid!',
  );
});

test('oneOf works like enum', async () => {
  const result = await validateData({ val: 'a' }, { val: { oneOf: ['a', 'b'] } });
  assert.equal(result.val, 'a');
});

test('equals checks exact match', async () => {
  await assert.rejects(
    () => validateData({ val: 'x' }, { val: { equals: 'y' } }),
    error => error.errors[0].rule === 'equals',
  );
});

test('notEquals rejects matching values', async () => {
  await assert.rejects(
    () => validateData({ val: 'x' }, { val: { notEquals: 'x' } }),
    error => error.errors[0].rule === 'notEquals',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// NESTED OBJECTS AND ARRAYS
// ─────────────────────────────────────────────────────────────────────────────

test('collects nested object and array item errors with precise paths', async () => {
  await assert.rejects(
    () => validateData(
      { address: { zip: '12' }, tags: ['ok', 3] },
      {
        address: {
          type: 'object',
          properties: { zip: { type: 'string', exactLength: 6, required: true } },
        },
        tags: { type: 'array', items: { type: 'string' } },
      },
    ),
    error => error instanceof ValidationError
      && error.errors.some(item => item.field === 'address.zip')
      && error.errors.some(item => item.field === 'tags[1]'),
  );
});

test('properties without explicit type:object validates nested object', async () => {
  const result = await validateData(
    { addr: { city: 'Delhi', extra: 'x' } },
    { addr: { properties: { city: { type: 'string' } } } },
  );
  assert.equal(result.addr.city, 'Delhi');
  assert.equal(result.addr.extra, undefined);
});

test('nested object strip mode removes nested unknown fields', async () => {
  const result = await validateData(
    { addr: { city: 'Delhi', extra: 'x' } },
    { addr: { type: 'object', properties: { city: { type: 'string' } } } },
  );
  assert.equal(result.addr.city, 'Delhi');
  assert.equal('extra' in result.addr, false);
});

test('nested array of objects strips unknown fields', async () => {
  const result = await validateData(
    { items: [{ name: 'a', extra: 1 }, { name: 'b', hack: 2 }] },
    { items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } } },
  );
  assert.equal(result.items[0].name, 'a');
  assert.equal('extra' in result.items[0], false);
  assert.equal(result.items[1].name, 'b');
  assert.equal('hack' in result.items[1], false);
});

test('type:object without properties returns cloned value', async () => {
  const input = { data: { a: 1 } };
  const result = await validateData(input, { data: { type: 'object' } });
  assert.equal(result.data.a, 1);
  result.data.a = 999;
  assert.equal(input.data.a, 1); // Not mutated
});

test('type:array without items returns cloned array', async () => {
  const input = { arr: [1, 2, 3] };
  const result = await validateData(input, { arr: { type: 'array' } });
  assert.deepEqual([...result.arr], [1, 2, 3]);
  result.arr.push(4);
  assert.equal(input.arr.length, 3); // Not mutated
});

test('minItems rejects too-small arrays', async () => {
  await assert.rejects(
    () => validateData({ arr: [1] }, { arr: { type: 'array', minItems: 2 } }),
    error => error.errors[0].rule === 'minItems',
  );
});

test('maxItems rejects too-large arrays', async () => {
  await assert.rejects(
    () => validateData({ arr: [1, 2, 3] }, { arr: { type: 'array', maxItems: 2 } }),
    error => error.errors[0].rule === 'maxItems',
  );
});

test('Date objects in output are cloned', async () => {
  const d = new Date('2025-01-01');
  const result = await validateData({ when: d }, { when: { type: 'date' } });
  assert.notEqual(result.when, d);
  assert.equal(result.when.getTime(), d.getTime());
});

// ─────────────────────────────────────────────────────────────────────────────
// UNKNOWN FIELD HANDLING
// ─────────────────────────────────────────────────────────────────────────────

test('supports strip, strict, passthrough, and default values', async () => {
  const schema = { known: { type: 'number', default: 2 } };

  assert.deepEqual({ ...(await validateData({ unknown: true }, schema)) }, { known: 2 });
  assert.deepEqual(
    { ...(await validateData({ unknown: true }, schema, { unknown: 'passthrough' })) },
    { known: 2, unknown: true },
  );
  await assert.rejects(
    () => validateData({ unknown: true }, schema, { unknown: 'strict' }),
    error => error instanceof ValidationError && error.errors[0].rule === 'unknown',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY VALUES
// ─────────────────────────────────────────────────────────────────────────────

test('rejectEmpty rejects empty strings', async () => {
  await assert.rejects(
    () => validateData({ val: '' }, { val: { type: 'string', rejectEmpty: true } }),
    error => error.errors[0].rule === 'empty',
  );
});

test('empty string without required/allowEmpty is excluded from output', async () => {
  const result = await validateData({ val: '' }, { val: { type: 'string' } });
  assert.equal('val' in result, false);
});

test('empty string with allowEmpty is included in output', async () => {
  const result = await validateData({ val: '' }, { val: { type: 'string', allowEmpty: true } });
  assert.equal(result.val, '');
});

test('empty string with required is included in output', async () => {
  const result = await validateData({ val: '' }, { val: { required: true, type: 'string' } });
  assert.equal(result.val, '');
});

test('0 and false are not treated as empty', async () => {
  const result = await validateData(
    { a: 0, b: false },
    { a: { type: 'number' }, b: { type: 'boolean' } },
  );
  assert.equal(result.a, 0);
  assert.equal(result.b, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

test('custom validator must return exactly true', async () => {
  // Truthy non-boolean should fail
  await assert.rejects(
    () => validateData({ val: 'hello' }, { val: { custom: v => v } }),
    error => error.errors[0].rule === 'custom',
  );
});

test('custom validator returning true passes', async () => {
  const result = await validateData(
    { val: 42 },
    { val: { custom: v => v === 42 } },
  );
  assert.equal(result.val, 42);
});

test('async custom validators and hidden exceptions', async () => {
  await assert.rejects(
    () => validateData({ username: 'taken' }, {
      username: { custom: async value => value !== 'taken', message: 'Already used.' },
    }),
    error => error.errors[0].message === 'Already used.',
  );
  await assert.rejects(
    () => validateData({ username: 'any' }, {
      username: { custom: async () => { throw new Error('private detail'); } },
    }),
    error => !error.errors[0].message.includes('private detail'),
  );
});

test('custom validator false positive for falsy return values is fixed', async () => {
  // value 0: custom returns v === 0 which is true — should pass
  const result = await validateData(
    { val: 0 },
    { val: { custom: v => v === 0 } },
  );
  assert.equal(result.val, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// ABORT EARLY
// ─────────────────────────────────────────────────────────────────────────────

test('abortEarly stops after first error', async () => {
  await assert.rejects(
    () => validateData(
      { a: 'x', b: 'y' },
      { a: { type: 'number' }, b: { type: 'number' } },
      { abortEarly: true },
    ),
    error => error.errors.length === 1,
  );
});

test('without abortEarly collects all errors', async () => {
  await assert.rejects(
    () => validateData(
      { a: 'x', b: 'y' },
      { a: { type: 'number' }, b: { type: 'number' } },
    ),
    error => error.errors.length === 2,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// LIMITS AND SECURITY
// ─────────────────────────────────────────────────────────────────────────────

test('enforces array length, object key, and nesting limits', async () => {
  await assert.rejects(
    () => validateData({ values: [1, 2] }, { values: { type: 'array' } }, { maxArrayLength: 1 }),
    error => error.errors[0].rule === 'maxArrayLength',
  );
  await assert.rejects(
    () => validateData({ a: 1, b: 2 }, {}, { maxObjectKeys: 1 }),
    error => error.errors[0].rule === 'maxObjectKeys',
  );
  await assert.rejects(
    () => validateData({ nested: { value: 1 } }, {
      nested: { type: 'object', properties: { value: { type: 'number' } } },
    }, { maxDepth: 0 }),
    error => error.errors.some(item => item.rule === 'maxDepth'),
  );
});

test('ignores dangerous keys and does not mutate nested input', async () => {
  const input = JSON.parse('{"safe":{"value":1},"__proto__":{"polluted":true}}');
  const result = await validateData(input, {
    safe: { type: 'object', properties: { value: { type: 'number' } } },
  }, { unknown: 'passthrough' });

  assert.equal(result.safe.value, 1);
  assert.equal({}.polluted, undefined);
  assert.equal(input.safe.value, 1);
});

test('prototype and constructor keys are excluded in passthrough', async () => {
  const result = await validateData(
    JSON.parse('{"name":"ok","prototype":{"hack":1},"constructor":{"hack":2}}'),
    { name: { type: 'string' } },
    { unknown: 'passthrough' },
  );
  assert.equal(result.name, 'ok');
  assert.equal('prototype' in result, false);
  assert.equal('constructor' in result, false);
});

test('original input is not mutated', async () => {
  const input = { name: '  hello  ', nested: { a: 1 }, arr: [1, 2] };
  const original = JSON.parse(JSON.stringify(input));
  await validateData(input, {
    name: { type: 'string', trim: true },
    nested: { type: 'object', properties: { a: { type: 'number' } } },
    arr: { type: 'array', items: { type: 'number' } },
  });
  assert.deepEqual(input, original);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

test('validates malformed schemas and options with useful errors', async () => {
  await assert.rejects(() => validateData({}, null), /Schema must be a plain object/);
  await assert.rejects(() => validateData({}, { value: { type: 'wat' } }), /Unsupported type/);
  await assert.rejects(() => validateData({}, {}, { maxDepth: -1 }), /maxDepth/);
  await assert.rejects(() => validateData({}, {}, { unknown: 'ignore' }), /unknown must/);
});

test('schema is not mutated during validation', async () => {
  const schema = { name: { required: true, type: 'string' } };
  const original = JSON.stringify(schema);
  await validateData({ name: 'hello' }, schema);
  assert.equal(JSON.stringify(schema), original);
});

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

test('middleware stores successful output and formats validation failures', async () => {
  let nextCalled = false;
  let response;
  const req = { body: { email: 'bad' } };
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { response = body; return this; },
  };

  await validate({ email: { type: 'string', email: true } })(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(response.success, false);

  const validRequest = { body: { count: '3' } };
  await validate({ count: { type: 'number', coerce: true } })(validRequest, res, () => { nextCalled = true; });
  assert.equal(validRequest.validated.count, 3);
  assert.equal(nextCalled, true);
});

test('middleware supports bySource output mode', async () => {
  const req = { body: { name: 'Ada' } };
  const res = {
    status() { return this; },
    json() { return this; },
  };
  let nextCalled = false;

  await validate(
    { name: { type: 'string' } },
    { output: 'bySource' },
  )(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.validated.body.name, 'Ada');
});

test('middleware supports query source', async () => {
  const req = { query: { page: '1' } };
  const res = {
    status() { return this; },
    json() { return this; },
  };
  let nextCalled = false;

  await validate(
    { page: { type: 'number', coerce: true } },
    { source: 'query' },
  )(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.validated.page, 1);
});

test('middleware supports params source', async () => {
  const req = { params: { id: '42' } };
  const res = {
    status() { return this; },
    json() { return this; },
  };
  let nextCalled = false;

  await validate(
    { id: { type: 'number', coerce: true } },
    { source: 'params' },
  )(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.validated.id, 42);
});

test('middleware calls next(error) for non-validation errors', async () => {
  let passedError;
  const req = { body: { val: 1 } };
  const res = {
    status() { return this; },
    json() { return this; },
  };

  // A schema that throws a TypeError (non-ValidationError)
  await validate(
    { val: { type: 'string', custom: 'not a function' } },
  )(req, res, err => { passedError = err; });

  assert.ok(passedError instanceof TypeError);
});

test('middleware supports custom onError handler', async () => {
  let customHandlerCalled = false;
  const req = { body: { val: 'bad' } };
  const res = {
    status() { return this; },
    json() { return this; },
  };

  await validate(
    { val: { type: 'number' } },
    { onError: (error, _req, _res, _next) => { customHandlerCalled = true; } },
  )(req, res, () => {});

  assert.equal(customHandlerCalled, true);
});

test('middleware validates options at creation time, not per-request', async () => {
  assert.throws(
    () => validate({}, { maxDepth: -1 }),
    /maxDepth/,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION ERROR
// ─────────────────────────────────────────────────────────────────────────────

test('ValidationError has correct structure', async () => {
  try {
    await validateData({}, { name: { required: true } });
    assert.fail('Should have thrown');
  } catch (error) {
    assert.ok(error instanceof ValidationError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'ValidationError');
    assert.equal(error.status, 400);
    assert.equal(error.message, 'Validation failed');
    assert.ok(Array.isArray(error.errors));
    assert.equal(error.errors[0].field, 'name');
    assert.equal(error.errors[0].rule, 'required');
    assert.equal(typeof error.errors[0].message, 'string');
  }
});

test('ValidationError.toJSON returns standardized format', async () => {
  try {
    await validateData({}, { name: { required: true } });
  } catch (error) {
    const json = error.toJSON();
    assert.equal(json.success, false);
    assert.equal(json.message, 'Validation failed');
    assert.ok(Array.isArray(json.errors));
  }
});

test('custom error messages are used', async () => {
  await assert.rejects(
    () => validateData({}, { name: { required: true, message: 'Name is needed!' } }),
    error => error.errors[0].message === 'Name is needed!',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPLEX INTEGRATION SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

test('complete user registration schema', async () => {
  const schema = {
    name: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 100 },
    email: { required: true, type: 'string', email: true, trim: true, lowercase: true },
    password: { required: true, type: 'string', minLength: 8, maxLength: 64 },
    age: { type: 'number', coerce: true, min: 18 },
    role: { type: 'string', enum: ['user', 'admin'], default: 'user' },
    address: {
      type: 'object',
      properties: {
        city: { required: true, type: 'string' },
        pincode: { type: 'string', exactLength: 6 },
      },
    },
    hobbies: { type: 'array', items: { type: 'string' } },
  };

  const result = await validateData({
    name: '  Prakhar  ',
    email: 'TEST@Example.COM',
    password: 'secure1234',
    age: '20',
    address: { city: 'Delhi', pincode: '110001' },
    hobbies: ['coding', 'reading'],
    extra: 'stripped',
  }, schema);

  assert.equal(result.name, 'Prakhar');
  assert.equal(result.email, 'test@example.com');
  assert.equal(result.password, 'secure1234');
  assert.equal(result.age, 20);
  assert.equal(result.role, 'user');
  assert.equal(result.address.city, 'Delhi');
  assert.equal(result.address.pincode, '110001');
  assert.deepEqual([...result.hobbies], ['coding', 'reading']);
  assert.equal('extra' in result, false);
});

test('malformed input is handled gracefully', async () => {
  // Null input
  const result1 = await validateData(null, { name: { type: 'string', default: 'anon' } });
  assert.equal(result1.name, 'anon');

  // Undefined input
  const result2 = await validateData(undefined, { name: { type: 'string', default: 'anon' } });
  assert.equal(result2.name, 'anon');
});

test('deeply nested schema with array of objects', async () => {
  const result = await validateData({
    users: [
      { name: 'Ada', addresses: [{ city: 'London' }] },
      { name: 'Bob', addresses: [{ city: 'NYC' }, { city: 'LA' }] },
    ],
  }, {
    users: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { required: true, type: 'string' },
          addresses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                city: { required: true, type: 'string' },
              },
            },
          },
        },
      },
    },
  });

  assert.equal(result.users[0].name, 'Ada');
  assert.equal(result.users[0].addresses[0].city, 'London');
  assert.equal(result.users[1].addresses[1].city, 'LA');
});

test('reusable schema works across multiple calls', async () => {
  const userSchema = {
    name: { required: true, type: 'string', trim: true },
    email: { required: true, type: 'string', email: true },
  };

  const result1 = await validateData(
    { name: ' Ada ', email: 'ada@example.com' },
    userSchema,
  );
  const result2 = await validateData(
    { name: ' Bob ', email: 'bob@example.com' },
    userSchema,
  );

  assert.equal(result1.name, 'Ada');
  assert.equal(result2.name, 'Bob');
});

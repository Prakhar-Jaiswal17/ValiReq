/**
 * ValiReq — Custom Validation Example
 *
 * Demonstrates:
 *  - Synchronous custom validators
 *  - Asynchronous custom validators
 *  - Custom error messages
 *  - Custom transforms
 *  - Custom onError handler (middleware)
 *
 * Run:
 *   node examples/custom-validation.js
 */

const { validateData, validate, ValidationError } = require('../src');

async function main() {
  // ── Sync custom validator ──
  console.log('--- Sync custom validator ---');

  try {
    await validateData(
      { username: 'admin' },
      {
        username: {
          required: true,
          type: 'string',
          custom: (value) => value !== 'admin',
          message: 'This username is not allowed.',
        },
      },
    );
  } catch (error) {
    console.log('Error:', error.errors[0].message);
    // Error: This username is not allowed.
  }

  // ── Async custom validator ──
  console.log('\n--- Async custom validator ---');

  // Simulates a database check.
  const takenUsernames = new Set(['alice', 'bob']);

  const result = await validateData(
    { username: 'prakhar' },
    {
      username: {
        required: true,
        type: 'string',
        isLowercase: true,
        minLength: 3,
        maxLength: 20,
        custom: async (value) => {
          // Simulate async DB lookup.
          await new Promise((resolve) => setTimeout(resolve, 10));
          return !takenUsernames.has(value);
        },
        message: 'Username is already taken.',
      },
    },
  );

  console.log('Valid username:', result.username);

  // ── Custom validators must return exactly `true` ──
  console.log('\n--- Custom validators must return true ---');

  try {
    await validateData(
      { count: 5 },
      {
        count: {
          // Returns 5 (truthy but not `true`), so this FAILS.
          custom: (value) => value,
          message: 'Custom must return exactly true, not just a truthy value.',
        },
      },
    );
  } catch (error) {
    console.log('Error:', error.errors[0].message);
  }

  // Fix: return a boolean comparison instead.
  const fixed = await validateData(
    { count: 5 },
    {
      count: {
        custom: (value) => value > 0, // Returns true.
      },
    },
  );
  console.log('Fixed result:', fixed.count);

  // ── Custom transform ──
  console.log('\n--- Custom transform ---');

  const transformed = await validateData(
    { tags: 'js,node,express' },
    {
      tags: {
        // No type constraint here — the transform converts a string to an array.
        transform: (value) =>
          typeof value === 'string'
            ? value.split(',').map((s) => s.trim())
            : value,
      },
    },
  );

  console.log('Transformed tags:', transformed.tags);
  // Transformed tags: ['js', 'node', 'express']

  // ── Validator exception handling ──
  console.log('\n--- Validator exception handling ---');

  try {
    await validateData(
      { value: 'test' },
      {
        value: {
          custom: () => {
            throw new Error('Internal DB connection failed');
          },
        },
      },
    );
  } catch (error) {
    // Internal details are never exposed to clients.
    console.log('Error message:', error.errors[0].message);
    console.log('Contains internal detail?', error.errors[0].message.includes('DB'));
    // Error message: Validation failed.
    // Contains internal detail? false
  }
}

main().catch(console.error);

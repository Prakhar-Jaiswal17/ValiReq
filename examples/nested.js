/**
 * ValiReq — Nested Object and Array Example
 *
 * Demonstrates:
 *  - Nested object schemas via `properties`
 *  - Array item validation via `items`
 *  - minItems / maxItems constraints
 *  - Precise error paths (address.pincode, hobbies[1])
 *  - Unknown-field stripping inside nested objects
 *
 * Run:
 *   node examples/nested.js
 */

const { validateData } = require('../src');

async function main() {
  // ── Successful validation ──
  const result = await validateData(
    {
      name: '  Prakhar  ',
      address: {
        city: 'Delhi',
        pincode: '110001',
        extra: 'this will be stripped',
      },
      hobbies: ['coding', 'reading'],
    },
    {
      name: { required: true, type: 'string', trim: true },

      address: {
        type: 'object',
        properties: {
          city: { required: true, type: 'string' },
          pincode: { required: true, type: 'string', exactLength: 6 },
        },
      },

      hobbies: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10,
      },
    },
  );

  console.log('Validated output:');
  console.log(JSON.stringify(result, null, 2));
  // {
  //   "name": "Prakhar",
  //   "address": { "city": "Delhi", "pincode": "110001" },
  //   "hobbies": ["coding", "reading"]
  // }
  // Note: address.extra was stripped.

  // ── Validation failure with nested error paths ──
  console.log('\n--- Validation errors demo ---');

  try {
    await validateData(
      {
        name: 'Ada',
        address: { pincode: '12' },
        hobbies: ['ok', 42],
      },
      {
        name: { required: true, type: 'string' },
        address: {
          type: 'object',
          properties: {
            city: { required: true, type: 'string' },
            pincode: { type: 'string', exactLength: 6 },
          },
        },
        hobbies: { type: 'array', items: { type: 'string' } },
      },
    );
  } catch (error) {
    console.log('Errors:');
    for (const err of error.errors) {
      console.log(`  ${err.field}: [${err.rule}] ${err.message}`);
    }
    // address.city: [required] This field is required.
    // address.pincode: [exactLength] Must be exactly 6 characters.
    // hobbies[1]: [type] Expected type string.
  }

  // ── Deeply nested: array of objects ──
  console.log('\n--- Deeply nested schema ---');

  const deepResult = await validateData(
    {
      users: [
        { name: 'Ada', addresses: [{ city: 'London' }] },
        { name: 'Bob', addresses: [{ city: 'NYC' }, { city: 'LA' }] },
      ],
    },
    {
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
    },
  );

  console.log(JSON.stringify(deepResult, null, 2));
}

main().catch(console.error);

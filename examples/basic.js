/**
 * ValiReq — Basic Express Middleware Example
 *
 * Demonstrates:
 *  - Required fields
 *  - Type checking and coercion
 *  - Sanitization (trim, lowercase)
 *  - Email validation
 *  - Default values
 *  - Unknown-field stripping (enabled by default)
 *
 * Run:
 *   npm install express
 *   node examples/basic.js
 *
 * Test with curl:
 *   curl -X POST http://localhost:3000/register \
 *     -H 'Content-Type: application/json' \
 *     -d '{"email":" TEST@Example.COM ","password":"secret1234","age":"25","extra":"stripped"}'
 */

const express = require('express');
const { validate } = require('../src');

const app = express();
app.use(express.json());

const registerSchema = {
  email: {
    required: true,
    type: 'string',
    email: true,
    trim: true,
    lowercase: true,
  },

  password: {
    required: true,
    type: 'string',
    minLength: 8,
    maxLength: 64,
  },

  age: {
    type: 'number',
    coerce: true,
    min: 18,
  },

  role: {
    type: 'string',
    enum: ['user', 'admin'],
    default: 'user',
  },
};

app.post('/register', validate(registerSchema), (req, res) => {
  // req.validated contains only the declared fields, sanitized and coerced.
  // Unknown fields (like "extra") are automatically stripped.
  res.json({ success: true, data: req.validated });
});

// Query parameter validation
app.get(
  '/search',
  validate(
    {
      q: { required: true, type: 'string', trim: true, minLength: 1 },
      page: { type: 'integer', coerce: true, min: 1, default: 1 },
      limit: { type: 'integer', coerce: true, min: 1, max: 100, default: 20 },
    },
    { source: 'query' },
  ),
  (req, res) => {
    res.json({ success: true, data: req.validated });
  },
);

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

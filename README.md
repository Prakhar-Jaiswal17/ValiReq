# ValiReq

Validate. Sanitize. Transform.

ValiReq is a small CommonJS request-validation and sanitization toolkit for Express. It validates body, query, and params data, returns a new cleaned object, and supports nested schemas, coercion, defaults, custom sync/async validators, and unknown-field policies.

## Install
```sh
npm install valireq
```

## Express quick start
```js
const { validate } = require('valireq');
app.post('/users', validate({
  email: { required: true, type: 'string', trim: true, lowercase: true, email: true },
  age: { type: 'number', coerce: true, min: 18 },
  active: { type: 'boolean', coerce: true, default: true }
}), (req, res) => res.json(req.validated));
```

Use `{ source: 'query' }` or `{ source: 'params' }`. With `{ output: 'bySource' }`, the result is stored at `req.validated.body`, `.query`, or `.params`.

## Rules and options

Rules include `required`, `nullable`, `type` (`string`, `number`, `integer`, `boolean`, `array`, `object`, `date`), `min`, `max`, `minLength`, `maxLength`, `exactLength`, `email`, `url`, `uuid`, `matches`, `enum`, `oneOf`, `equals`, `notEquals`, `integer`, `positive`, `negative`, `finite`, and `custom`.

String options are `trim`, `lowercase`, `uppercase`, `removeExtraSpaces`, `stripHtml`, `removeNullBytes`, `normalizeEmail`, and `escapeHtml`. Transform with `coerce`, `default`, or `transform(value)`. Nested objects use `properties`; arrays use `items`.

Unknown fields default to `strip`; set `unknown: 'strict'` to reject or `unknown: 'passthrough'` to retain them. Other options include `abortEarly`, `maxDepth`, `maxArrayLength`, `maxObjectKeys`, `allowEmpty`, and `rejectEmpty`.

`validateData(input, schema, options)` is Express-independent and returns a Promise. It throws `ValidationError` with `{ field, message, rule }` entries. `validate(schema, options)` is the Express adapter and returns status 400 by default; provide `onError(error, req, res, next)` for custom responses.

## Security and limitations

Output is newly allocated, dangerous prototype keys are ignored, and depth/collection limits are enforced. Sanitization is not a substitute for parameterized queries or context-aware output encoding. Application-supplied regular expressions should be reviewed for worst-case behavior. Date output is a `Date` instance.

## Development
```sh
npm test
npm run lint
npm pack --dry-run
```

No Express dependency is bundled; install it in the consuming application. Node.js 18+ and CommonJS are required.

## License
MIT

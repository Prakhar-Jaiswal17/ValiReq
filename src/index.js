'use strict';

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const VALID_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
  'date',
]);
const VALID_UNKNOWN_POLICIES = new Set(['strip', 'strict', 'passthrough']);
const VALID_SOURCES = new Set(['body', 'query', 'params']);

const DEFAULT_OPTIONS = Object.freeze({
  unknown: 'strip',
  maxDepth: 20,
  maxArrayLength: 1000,
  maxObjectKeys: 1000,
  abortEarly: false,
  source: 'body',
  output: 'validated',
});

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isPlainObject = value => {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const isSafeIntegerOption = value => Number.isSafeInteger(value) && value >= 0;

class ValidationError extends Error {
  constructor(errors, status = 400) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.errors = errors;
    this.status = status;
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      errors: this.errors,
    };
  }
}

function pathFor(parent, key) {
  if (!parent) return String(key);
  return /^\d+$/.test(String(key)) ? `${parent}[${key}]` : `${parent}.${key}`;
}

function addError(errors, field, rule, message) {
  errors.push({ field, rule, message });
}

function errorMessage(rule, fallback) {
  return typeof rule.message === 'string' && rule.message.length > 0
    ? rule.message
    : fallback;
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new TypeError('Validation options must be a plain object.');
  }

  const result = { ...DEFAULT_OPTIONS, ...options };
  if (!VALID_UNKNOWN_POLICIES.has(result.unknown)) {
    throw new TypeError('unknown must be "strip", "strict", or "passthrough".');
  }
  if (!isSafeIntegerOption(result.maxDepth)) {
    throw new TypeError('maxDepth must be a non-negative safe integer.');
  }
  if (!isSafeIntegerOption(result.maxArrayLength)) {
    throw new TypeError('maxArrayLength must be a non-negative safe integer.');
  }
  if (!isSafeIntegerOption(result.maxObjectKeys)) {
    throw new TypeError('maxObjectKeys must be a non-negative safe integer.');
  }
  if (typeof result.abortEarly !== 'boolean') {
    throw new TypeError('abortEarly must be a boolean.');
  }
  if (!VALID_SOURCES.has(result.source)) {
    throw new TypeError('source must be "body", "query", or "params".');
  }
  if (!['validated', 'bySource'].includes(result.output)) {
    throw new TypeError('output must be "validated" or "bySource".');
  }
  if (result.onError !== undefined && typeof result.onError !== 'function') {
    throw new TypeError('onError must be a function.');
  }

  return result;
}

/**
 * Deep-clone an input value safely. Prevents prototype pollution and enforces
 * depth limits. Returns a new value that shares no object references with the
 * original.
 */
function cloneInput(value, depth, maxDepth) {
  if (depth > maxDepth) {
    throw new ValidationError([
      {
        field: '',
        rule: 'maxDepth',
        message: 'Maximum object depth exceeded.',
      },
    ]);
  }

  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) {
    return value.map(item => cloneInput(item, depth + 1, maxDepth));
  }
  if (isPlainObject(value)) {
    const clone = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      if (!DANGEROUS_KEYS.has(key)) {
        clone[key] = cloneInput(child, depth + 1, maxDepth);
      }
    }
    return clone;
  }

  return value;
}

/**
 * Apply sanitization to a string value. Only modifies the string when the
 * developer explicitly enabled the corresponding option.
 *
 * Order of operations matters:
 * 1. removeNullBytes — strip dangerous bytes first
 * 2. trim — remove surrounding whitespace
 * 3. removeExtraSpaces — collapse internal whitespace
 * 4. stripHtml — remove HTML tags
 * 5. normalizeEmail — conservative email normalization
 * 6. lowercase / uppercase — case conversion
 * 7. escapeHtml — escape special characters (after all other transforms)
 */
function sanitizeString(value, rule) {
  if (typeof value !== 'string') return value;

  let result = value;
  if (rule.removeNullBytes) result = result.replace(/\0/g, '');
  if (rule.trim) result = result.trim();
  if (rule.removeExtraSpaces) result = result.replace(/\s+/g, ' ');
  if (rule.stripHtml) result = result.replace(/<[^>]*>/g, '');
  if (rule.normalizeEmail) {
    // Conservative normalization: trim, lowercase, and remove dots from the
    // local part for gmail/googlemail addresses. Does NOT modify other providers
    // beyond lowercasing, which is safe per RFC 5321 §2.4.
    result = result.trim().toLowerCase();
    const atIndex = result.lastIndexOf('@');
    if (atIndex > 0) {
      let local = result.slice(0, atIndex);
      const domain = result.slice(atIndex + 1);
      if (domain === 'gmail.com' || domain === 'googlemail.com') {
        // Remove dots and plus-addressing from Gmail local part.
        const plusIndex = local.indexOf('+');
        if (plusIndex >= 0) local = local.slice(0, plusIndex);
        local = local.replace(/\./g, '');
      }
      result = local + '@' + domain;
    }
  }
  // Apply case conversion only as sanitization. Validation checks for
  // isLowercase / isUppercase are separate rule keys (see addStringErrors).
  if (rule.lowercase) result = result.toLowerCase();
  if (rule.uppercase) result = result.toUpperCase();
  if (rule.escapeHtml) {
    result = result.replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);
  }
  return result;
}

/**
 * Coerce a string value to the expected type. Returns the original value
 * unchanged when coercion is not applicable or would be ambiguous.
 */
function coerceValue(value, type) {
  if (typeof value !== 'string') return value;

  if (type === 'number') {
    if (value.trim() === '') return value;
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }

  if (type === 'integer') {
    if (value.trim() === '') return value;
    const number = Number(value);
    // Only coerce if the result is a safe integer. "3.5" stays as a string
    // and will fail the type check, which is the documented behavior.
    return Number.isSafeInteger(number) ? number : value;
  }

  if (type === 'boolean') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }

  if (type === 'date') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return value;
}

function matchesType(value, type) {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isSafeInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return isPlainObject(value);
    case 'date': return value instanceof Date && !Number.isNaN(value.getTime());
    default: return false;
  }
}

function validateRule(rule, field) {
  if (!isPlainObject(rule)) {
    throw new TypeError(`Schema rule at "${field}" must be a plain object.`);
  }
  if (rule.type !== undefined && !VALID_TYPES.has(rule.type)) {
    throw new TypeError(`Unsupported type at "${field}": ${String(rule.type)}.`);
  }
  if (rule.transform !== undefined && typeof rule.transform !== 'function') {
    throw new TypeError(`transform at "${field}" must be a function.`);
  }
  if (rule.custom !== undefined && typeof rule.custom !== 'function') {
    throw new TypeError(`custom at "${field}" must be a function.`);
  }
  if (rule.matches !== undefined && !(rule.matches instanceof RegExp)) {
    throw new TypeError(`matches at "${field}" must be a RegExp.`);
  }
  if (rule.properties !== undefined && !isPlainObject(rule.properties)) {
    throw new TypeError(`properties at "${field}" must be a plain object.`);
  }
  if (rule.items !== undefined && !isPlainObject(rule.items)) {
    throw new TypeError(`items at "${field}" must be a plain object.`);
  }
  for (const key of ['enum', 'oneOf']) {
    if (rule[key] !== undefined && !Array.isArray(rule[key])) {
      throw new TypeError(`${key} at "${field}" must be an array.`);
    }
  }
}

/**
 * String-specific validation checks. These run AFTER sanitization, so values
 * have already been trimmed/lowered/etc. if the developer configured it.
 *
 * Note: `lowercase` and `uppercase` as rule keys are sanitizers (they convert
 * the value). For validation-only checks ("must already be lowercase"), use
 * `isLowercase: true` or `isUppercase: true`.
 */
function addStringErrors(value, rule, field, errors) {
  const lengthRules = [
    ['minLength', (length, limit) => length < limit, limit => `Must be at least ${limit} characters.`],
    ['maxLength', (length, limit) => length > limit, limit => `Must be at most ${limit} characters.`],
    ['exactLength', (length, limit) => length !== limit, limit => `Must be exactly ${limit} characters.`],
  ];

  for (const [key, fails, message] of lengthRules) {
    if (rule[key] !== undefined && fails(value.length, rule[key])) {
      addError(errors, field, key, errorMessage(rule, message(rule[key])));
    }
  }

  // Improved email regex: requires at least two chars in TLD, disallows
  // consecutive dots in domain, and limits overall length.
  const emailValid = rule.email
    ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
        && !/\.\./.test(value)
        && value.length <= 254
    : true;

  const checks = [
    ['email', emailValid, 'Must be a valid email address.'],
    ['url', !rule.url || isValidUrl(value), 'Must be a valid URL.'],
    ['uuid', !rule.uuid || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 'Must be a valid UUID.'],
    ['alphanumeric', !rule.alphanumeric || /^[a-z0-9]+$/i.test(value), 'Must be alphanumeric.'],
    ['numeric', !rule.numeric || /^-?\d+(\.\d+)?$/.test(value), 'Must be a numeric string.'],
    ['alphabetic', !rule.alphabetic || /^[a-z]+$/i.test(value), 'Must be alphabetic.'],
    // isLowercase / isUppercase are validation-only (do not transform).
    // lowercase / uppercase are sanitizers (transform the value).
    ['isLowercase', !rule.isLowercase || value === value.toLowerCase(), 'Must be lowercase.'],
    ['isUppercase', !rule.isUppercase || value === value.toUpperCase(), 'Must be uppercase.'],
    ['startsWith', rule.startsWith === undefined || value.startsWith(rule.startsWith), 'Has an invalid prefix.'],
    ['endsWith', rule.endsWith === undefined || value.endsWith(rule.endsWith), 'Has an invalid suffix.'],
    ['contains', rule.contains === undefined || value.includes(rule.contains), 'Does not contain the required value.'],
    ['matches', !rule.matches || testRegex(rule.matches, value), 'Has an invalid format.'],
  ];

  for (const [name, valid, message] of checks) {
    if (!valid) addError(errors, field, name, errorMessage(rule, message));
  }
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.hostname);
  } catch {
    return false;
  }
}

function testRegex(regex, value) {
  regex.lastIndex = 0;
  const result = regex.test(value);
  regex.lastIndex = 0;
  return result;
}

function addNumberErrors(value, rule, field, errors) {
  const checks = [
    ['min', value >= rule.min, `Must be at least ${rule.min}.`],
    ['max', value <= rule.max, `Must be at most ${rule.max}.`],
    ['integer', Number.isInteger(value), 'Must be an integer.'],
    ['positive', value > 0, 'Must be positive.'],
    ['negative', value < 0, 'Must be negative.'],
    ['finite', Number.isFinite(value), 'Must be finite.'],
  ];

  for (const [name, valid, message] of checks) {
    const enabled = name === 'min' || name === 'max'
      ? rule[name] !== undefined
      : Boolean(rule[name]);
    if (enabled && !valid) addError(errors, field, name, errorMessage(rule, message));
  }
}

function validateValueRules(value, rule, field, errors) {
  if (typeof value === 'string') addStringErrors(value, rule, field, errors);
  if (typeof value === 'number') addNumberErrors(value, rule, field, errors);

  if (rule.enum && !rule.enum.includes(value)) {
    addError(errors, field, 'enum', errorMessage(rule, 'Must be one of the allowed values.'));
  }
  if (rule.oneOf && !rule.oneOf.includes(value)) {
    addError(errors, field, 'oneOf', errorMessage(rule, 'Must be one of the allowed values.'));
  }
  if (rule.equals !== undefined && value !== rule.equals) {
    addError(errors, field, 'equals', errorMessage(rule, 'Has an unexpected value.'));
  }
  if (rule.notEquals !== undefined && value === rule.notEquals) {
    addError(errors, field, 'notEquals', errorMessage(rule, 'Has a disallowed value.'));
  }
}

/**
 * Run the user-defined custom validation function. The function MUST return
 * exactly `true` to pass. Any other value (including other truthy values like
 * 1, "yes", etc.) is treated as a validation failure. This prevents subtle bugs
 * where falsy-but-valid values (0, "") cause false positives.
 */
async function runCustom(value, rule, field, errors) {
  if (!rule.custom) return;
  try {
    const result = await rule.custom(value);
    if (result !== true) {
      addError(errors, field, 'custom', errorMessage(rule, 'Validation failed.'));
    }
  } catch {
    addError(errors, field, 'custom', errorMessage(rule, 'Validation failed.'));
  }
}

async function processArray(value, rule, options, field, errors, depth) {
  if (value.length > options.maxArrayLength) {
    addError(errors, field, 'maxArrayLength', 'Array is too large.');
    return [];
  }

  // Validate array-level constraints.
  if (rule.minItems !== undefined && value.length < rule.minItems) {
    addError(errors, field, 'minItems', `Array must have at least ${rule.minItems} items.`);
  }
  if (rule.maxItems !== undefined && value.length > rule.maxItems) {
    addError(errors, field, 'maxItems', `Array must have at most ${rule.maxItems} items.`);
  }

  if (!rule.items) {
    // No item schema: clone the array to prevent mutation of the input.
    return cloneInput(value, depth + 1, options.maxDepth);
  }

  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = pathFor(field, index);
    const itemResult = await processField(value[index], rule.items, options, itemPath, errors, depth + 1);
    // Always push the item to maintain correct indices. If an item fails
    // validation, errors are collected and the validated value (or undefined)
    // is placed at the correct index. The caller will check errors.length
    // to decide whether to use the output.
    output.push(itemResult.present ? itemResult.value : undefined);
    if (options.abortEarly && errors.length > 0) break;
  }
  return output;
}

async function processField(input, rule, options, field, errors, depth) {
  validateRule(rule, field);
  let value = input;

  // Apply default value when input is undefined.
  if (value === undefined && own(rule, 'default')) {
    try {
      value = typeof rule.default === 'function' ? await rule.default() : rule.default;
    } catch {
      addError(errors, field, 'default', 'Could not create the default value.');
      return { present: false };
    }
  }

  // Handle undefined (missing) values.
  if (value === undefined) {
    if (rule.required) {
      addError(errors, field, 'required', errorMessage(rule, 'This field is required.'));
    }
    return { present: false };
  }

  // Handle null values.
  if (value === null) {
    if (rule.nullable) return { present: true, value: null };
    if (rule.required) {
      addError(errors, field, 'required', errorMessage(rule, 'This field is required.'));
    } else {
      addError(errors, field, 'nullable', errorMessage(rule, 'This field cannot be null.'));
    }
    return { present: false };
  }

  // Sanitize string values.
  value = sanitizeString(value, rule);

  // Coerce string values to the target type.
  if (rule.coerce) value = coerceValue(value, rule.type);

  // Apply custom transform.
  if (rule.transform) {
    try {
      value = await rule.transform(value);
    } catch {
      addError(errors, field, 'transform', 'Transformation failed.');
      return { present: false };
    }
  }

  // Handle empty strings. Must come after sanitization/transform so that
  // trimming can produce an empty string.
  if (value === '' && rule.rejectEmpty) {
    addError(errors, field, 'empty', errorMessage(rule, 'Must not be empty.'));
    return { present: false };
  }

  // Type check.
  if (rule.type && !matchesType(value, rule.type)) {
    addError(errors, field, 'type', errorMessage(rule, `Expected type ${rule.type}.`));
    return { present: false };
  }

  // Process nested objects. If a rule has `properties`, it implies type object.
  if (rule.properties && isPlainObject(value)) {
    value = await processObject(value, rule.properties, options, field, errors, depth + 1);
  } else if (rule.type === 'object' && !rule.properties) {
    // Object type without properties: clone to prevent input mutation.
    value = cloneInput(value, depth + 1, options.maxDepth);
  }

  // Process arrays.
  if (rule.type === 'array') {
    value = await processArray(value, rule, options, field, errors, depth);
  }

  // Clone Date to prevent input mutation via the returned reference.
  if (value instanceof Date) {
    value = new Date(value.getTime());
  }

  // Validate value-level rules (string checks, number checks, enum, etc.).
  validateValueRules(value, rule, field, errors);
  await runCustom(value, rule, field, errors);

  // Determine whether the field should appear in the output.
  // - Empty strings are excluded unless `allowEmpty` or `required` is set.
  // - Transform returning undefined makes the field absent.
  if (value === undefined) {
    return { present: false };
  }
  const present = value !== '' || rule.allowEmpty === true || rule.required === true;

  return { present, value };
}

async function processObject(input, schema, options, basePath, errors, depth) {
  if (!isPlainObject(input)) {
    addError(errors, basePath, 'type', 'Expected an object.');
    return Object.create(null);
  }
  if (depth > options.maxDepth) {
    addError(errors, basePath, 'maxDepth', 'Maximum object depth exceeded.');
    return Object.create(null);
  }

  const inputKeys = Object.keys(input);
  if (inputKeys.length > options.maxObjectKeys) {
    addError(errors, basePath, 'maxObjectKeys', 'Too many object properties.');
    return Object.create(null);
  }

  const output = Object.create(null);
  if (options.unknown === 'strict') {
    for (const key of inputKeys) {
      if (!own(schema, key)) {
        addError(errors, pathFor(basePath, key), 'unknown', 'Unknown field.');
      }
    }
  }

  for (const key of Object.keys(schema)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const fieldPath = pathFor(basePath, key);
    const result = await processField(input[key], schema[key], options, fieldPath, errors, depth);
    if (result.present) output[key] = result.value;
    if (options.abortEarly && errors.length > 0) break;
  }

  if (options.unknown === 'passthrough') {
    for (const key of inputKeys) {
      if (!own(schema, key) && !DANGEROUS_KEYS.has(key)) {
        output[key] = cloneInput(input[key], depth + 1, options.maxDepth);
      }
    }
  }

  return output;
}

/**
 * Validate data against a schema. This is the Express-independent core API.
 *
 * @param {*} input - The data to validate.
 * @param {Object} schema - The validation schema.
 * @param {Object} [options] - Validation options.
 * @returns {Promise<Object>} The validated and cleaned output.
 * @throws {ValidationError} When validation fails.
 * @throws {TypeError} When the schema or options are malformed.
 */
async function validateData(input, schema, options = {}) {
  const normalizedOptions = validateOptions(options);
  if (!isPlainObject(schema)) {
    throw new TypeError('Schema must be a plain object.');
  }

  const source = input === undefined || input === null ? Object.create(null) : input;
  const errors = [];
  const output = await processObject(source, schema, normalizedOptions, '', errors, 0);
  if (errors.length > 0) throw new ValidationError(errors);
  return output;
}

/**
 * Express middleware factory. Returns an async middleware function that
 * validates request data against the given schema.
 *
 * @param {Object} schema - The validation schema.
 * @param {Object} [options] - Validation options.
 * @returns {Function} Express middleware function.
 */
function validate(schema, options = {}) {
  // Validate options eagerly at middleware creation time, not per-request.
  // This catches configuration errors early during app startup.
  const normalizedOptions = validateOptions(options);

  return async function valireqMiddleware(req, res, next) {
    try {
      const result = await validateData(req[normalizedOptions.source], schema, normalizedOptions);

      if (normalizedOptions.output === 'bySource') {
        req.validated = req.validated || {};
        req.validated[normalizedOptions.source] = result;
      } else {
        req.validated = result;
      }
      return next();
    } catch (error) {
      if (!(error instanceof ValidationError)) return next(error);
      if (typeof normalizedOptions.onError === 'function') {
        return normalizedOptions.onError(error, req, res, next);
      }
      return res.status(error.status).json(error.toJSON());
    }
  };
}

module.exports = {
  validate,
  validateData,
  ValidationError,
};

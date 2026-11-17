'use strict';

const SAFE = new Set(['__proto__', 'prototype', 'constructor']);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
const pathJoin = (base, key) => base ? (String(key).match(/^\d+$/) ? `${base}[${key}]` : `${base}.${key}`) : String(key);

class ValidationError extends Error {
  constructor(errors, status = 400) { super('Validation failed'); this.name = 'ValidationError'; this.errors = errors; this.status = status; }
  toJSON() { return { success: false, message: this.message, errors: this.errors }; }
}

function addError(errors, field, message, rule) { errors.push({ field, message, rule }); }
function htmlEscape(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sanitize(v, r) {
  if (typeof v !== 'string') return v;
  if (r.removeNullBytes) v = v.replace(/\0/g, '');
  if (r.trim) v = v.trim();
  if (r.removeExtraSpaces) v = v.replace(/\s+/g, ' ');
  if (r.stripHtml) v = v.replace(/<[^>]*>/g, '');
  if (r.lowercase) v = v.toLowerCase();
  if (r.uppercase) v = v.toUpperCase();
  if (r.normalizeEmail) v = v.trim().toLowerCase();
  if (r.escapeHtml) v = htmlEscape(v);
  return v;
}
function coerce(v, type) {
  if (typeof v !== 'string') return v;
  if (type === 'number' || type === 'integer') { if (v.trim() === '') return v; const n = Number(v); return Number.isFinite(n) ? n : v; }
  if (type === 'boolean') { if (v === 'true' || v === '1') return true; if (v === 'false' || v === '0') return false; }
  if (type === 'date') { const d = new Date(v); if (!Number.isNaN(d.getTime())) return d; }
  return v;
}
function clone(v, depth, maxDepth) {
  if (depth > maxDepth) throw new Error('Maximum object depth exceeded');
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(x => clone(x, depth + 1, maxDepth));
  if (isObject(v)) { const o = Object.create(null); for (const [k, x] of Object.entries(v)) if (!SAFE.has(k)) o[k] = clone(x, depth + 1, maxDepth); return o; }
  return v;
}

const defaults = { unknown: 'strip', maxDepth: 20, maxArrayLength: 1000, maxObjectKeys: 1000, abortEarly: false, source: 'body', output: 'validated' };
function checkType(v, type) {
  if (type === 'string') return typeof v === 'string';
  if (type === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (type === 'integer') return Number.isInteger(v);
  if (type === 'boolean') return typeof v === 'boolean';
  if (type === 'array') return Array.isArray(v);
  if (type === 'object') return isObject(v);
  if (type === 'date') return v instanceof Date && !Number.isNaN(v.getTime());
  return true;
}
function empty(v) { return v === '' || v === undefined; }

async function processObject(input, schema, options, base, errors, depth) {
  if (!isObject(input)) { addError(errors, base, 'Expected an object.', 'type'); return input; }
  if (depth > options.maxDepth) { addError(errors, base, 'Maximum object depth exceeded.', 'maxDepth'); return undefined; }
  const keys = Object.keys(input); if (keys.length > options.maxObjectKeys) { addError(errors, base, 'Too many object properties.', 'maxObjectKeys'); return undefined; }
  const out = {};
  if (options.unknown === 'strict') for (const k of keys) if (!own(schema, k)) addError(errors, pathJoin(base,k), 'Unknown field.', 'unknown');
  for (const key of Object.keys(schema)) {
    if (SAFE.has(key)) continue;
    const rule = schema[key] || {}; let v = input[key]; const p = pathJoin(base,key);
    if (v === undefined && own(rule, 'default')) v = typeof rule.default === 'function' ? rule.default() : rule.default;
    if (v === undefined) { if (rule.required) addError(errors,p,rule.message || 'This field is required.','required'); continue; }
    if (v === null) { if (rule.nullable) { out[key] = null; continue; } addError(errors,p,rule.message || 'This field cannot be null.','nullable'); continue; }
    v = sanitize(v, rule); if (rule.coerce) v = coerce(v, rule.type); if (rule.transform) { try { v = await rule.transform(v); } catch { addError(errors,p,'Transformation failed.','transform'); continue; } }
    if (rule.type && !checkType(v, rule.type)) { addError(errors,p,rule.message || `Expected type ${rule.type}.`,'type'); continue; }
    if (typeof v === 'string') { if (rule.minLength !== undefined && v.length < rule.minLength) addError(errors,p,rule.message || `Must be at least ${rule.minLength} characters.`,'minLength'); if (rule.maxLength !== undefined && v.length > rule.maxLength) addError(errors,p,rule.message || `Must be at most ${rule.maxLength} characters.`,'maxLength'); if (rule.exactLength !== undefined && v.length !== rule.exactLength) addError(errors,p,rule.message || `Must be exactly ${rule.exactLength} characters.`,'exactLength'); if (rule.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) addError(errors,p,'Must be a valid email address.','email'); if (rule.url) { try { new URL(v); } catch { addError(errors,p,'Must be a valid URL.','url'); } } if (rule.uuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) addError(errors,p,'Must be a valid UUID.','uuid'); if (rule.alphanumeric && !/^[a-z0-9]+$/i.test(v)) addError(errors,p,'Must be alphanumeric.','alphanumeric'); if (rule.numeric && !/^\d+$/.test(v)) addError(errors,p,'Must be numeric.','numeric'); if (rule.alphabetic && !/^[a-z]+$/i.test(v)) addError(errors,p,'Must be alphabetic.','alphabetic'); if (rule.lowercase && v !== v.toLowerCase()) addError(errors,p,'Must be lowercase.','lowercase'); if (rule.uppercase && v !== v.toUpperCase()) addError(errors,p,'Must be uppercase.','uppercase'); if (rule.startsWith && !v.startsWith(rule.startsWith)) addError(errors,p,'Has an invalid prefix.','startsWith'); if (rule.endsWith && !v.endsWith(rule.endsWith)) addError(errors,p,'Has an invalid suffix.','endsWith'); if (rule.contains && !v.includes(rule.contains)) addError(errors,p,'Does not contain the required value.','contains'); if (rule.matches && (!rule.matches.test || !rule.matches.test(v))) addError(errors,p,'Has an invalid format.','matches'); }
    if (typeof v === 'number') { if (!Number.isFinite(v)) addError(errors,p,'Must be finite.','finite'); if (rule.min !== undefined && v < rule.min) addError(errors,p,rule.message || `Must be at least ${rule.min}.`,'min'); if (rule.max !== undefined && v > rule.max) addError(errors,p,rule.message || `Must be at most ${rule.max}.`,'max'); if (rule.integer && !Number.isInteger(v)) addError(errors,p,'Must be an integer.','integer'); if (rule.positive && v <= 0) addError(errors,p,'Must be positive.','positive'); if (rule.negative && v >= 0) addError(errors,p,'Must be negative.','negative'); }
    if (rule.enum && !rule.enum.includes(v)) addError(errors,p,'Must be one of the allowed values.','enum'); if (rule.oneOf && !rule.oneOf.includes(v)) addError(errors,p,'Must be one of the allowed values.','oneOf'); if (rule.equals !== undefined && v !== rule.equals) addError(errors,p,'Has an unexpected value.','equals'); if (rule.notEquals !== undefined && v === rule.notEquals) addError(errors,p,'Has a disallowed value.','notEquals');
    if (rule.type === 'array') { if (v.length > options.maxArrayLength) addError(errors,p,'Array is too large.','maxArrayLength'); if (rule.items) { const a=[]; for (let i=0;i<v.length;i++) { const itemSchema=rule.items; const ip=pathJoin(p,i); if (itemSchema.properties || itemSchema.type === 'object') a.push(await processObject(v[i], itemSchema.properties || {}, options, ip, errors, depth+1)); else { let item=sanitize(v[i],itemSchema); if(itemSchema.coerce) item=coerce(item,itemSchema.type); if(itemSchema.type && !checkType(item,itemSchema.type)) addError(errors,ip,`Expected type ${itemSchema.type}.`,'type'); if(itemSchema.custom && !(await itemSchema.custom(item))) addError(errors,ip,itemSchema.message || 'Validation failed.','custom'); a.push(item); } } v=a; } }
    if (rule.type === 'object' && rule.properties) v = await processObject(v, rule.properties, options, p, errors, depth+1);
    if (rule.custom) { try { const ok = await rule.custom(v); if (!ok) addError(errors,p,rule.message || 'Validation failed.','custom'); } catch { addError(errors,p,rule.message || 'Validation failed.','custom'); } }
    if (!empty(v) || rule.allowEmpty || rule.required) out[key] = v; else if (rule.rejectEmpty) addError(errors,p,'Must not be empty.','empty');
    if (options.abortEarly && errors.length) break;
  }
  if (options.unknown === 'passthrough') for (const k of keys) if (!own(schema,k) && !SAFE.has(k)) out[k] = clone(input[k], depth+1, options.maxDepth);
  return out;
}
async function validateData(input, schema, options={}) { const opts={...defaults,...options}; const source = input == null ? {} : clone(input,0,opts.maxDepth); const errors=[]; const out=await processObject(source,schema,opts,'',errors,0); if (errors.length) throw new ValidationError(errors); return out; }
function validate(schema, options={}) { return async (req,res,next) => { try { const source=options.source || 'body'; const result=await validateData(req[source],schema,options); if (options.output === 'bySource') { req.validated=req.validated||{}; req.validated[source]=result; } else req.validated=result; next(); } catch (e) { if (!(e instanceof ValidationError)) return next(e); if (typeof options.onError === 'function') return options.onError(e,req,res,next); res.status(e.status || 400).json(e.toJSON()); } }; }
module.exports = { validate, validateData, ValidationError };

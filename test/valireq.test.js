const test = require('node:test');
const assert = require('node:assert/strict');
const { validateData, validate, ValidationError } = require('../src');

test('validates, sanitizes and coerces without mutating input', async () => {
  const input = { name: '  Ada   Lovelace ', age: '36', active: 'true', extra: 'drop' };
  const out = await validateData(input, { name: { type:'string', trim:true, removeExtraSpaces:true }, age:{type:'number',coerce:true}, active:{type:'boolean',coerce:true} });
  assert.deepEqual(out, { name:'Ada Lovelace', age:36, active:true }); assert.equal(input.age,'36');
});
test('reports nested paths and supports arrays', async () => {
  await assert.rejects(() => validateData({ address:{zip:'12'}, tags:['ok',3] }, { address:{type:'object',properties:{zip:{type:'string',exactLength:6,required:true}}}, tags:{type:'array',items:{type:'string'}} }), e => e instanceof ValidationError && e.errors.some(x=>x.field==='address.zip') && e.errors.some(x=>x.field==='tags[1]'));
});
test('supports strict, passthrough and defaults', async () => {
  await assert.rejects(() => validateData({x:1},{},{unknown:'strict'}), ValidationError);
  assert.equal((await validateData({x:1},{},{unknown:'passthrough'})).x,1);
  assert.equal((await validateData({}, {x:{type:'number',default:2}})).x,2);
});
test('supports async custom validators', async () => { await assert.rejects(() => validateData({name:'taken'},{name:{custom:async v=>v!=='taken',message:'Taken'}}), e=>e.errors[0].message==='Taken'); });
test('middleware writes validated output and formats errors', async () => {
  const req={body:{email:'bad'}}; let response; const res={status(n){this.code=n;return this;},json(v){response=v;}}; let next=()=>{};
  await validate({email:{type:'string',email:true}})(req,res,next); assert.equal(res.code,400); assert.equal(response.success,false);
});

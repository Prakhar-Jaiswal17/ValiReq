const { validateData } = require('../src');
validateData({ address:{ city:'Delhi' } }, { address:{ type:'object', properties:{ city:{ required:true, type:'string' } } } }).then(console.log);

const { validateData } = require('../src');
validateData({ username:'ada' }, { username:{ required:true, custom: async name => name !== 'admin' } }).then(console.log);

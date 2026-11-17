const express = require('express');
const { validate } = require('../src');
const app = express(); app.use(express.json());
app.post('/users', validate({ email: { required:true, type:'string', email:true } }), (req,res) => res.json(req.validated));
app.listen(3000);

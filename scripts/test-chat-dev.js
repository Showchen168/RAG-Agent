const http = require('http');
http.get('http://127.0.0.1:3000', (res) => {
  console.log('Status code:', res.statusCode);
  res.on('data', () => {});
  res.on('end', () => console.log('Successfully reached dev server on 3000'));
}).on('error', (e) => {
  console.error(`Error reaching dev server: ${e.message}`);
});

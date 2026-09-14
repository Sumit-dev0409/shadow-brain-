const https = require('https');
const data = JSON.stringify({ query: 'test' });
const options = {
  hostname: 'shadow-brain-u4ua.onrender.com',
  port: 443,
  path: '/api/conversations/search',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = https.request(options, (res) => {
  console.log('statusCode', res.statusCode);
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    console.log('body', body.slice(0, 2000));
  });
});
req.on('error', (err) => {
  console.error('error', err.message);
});
req.write(data);
req.end();

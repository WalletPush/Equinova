const https = require('https');

// You'll need to replace this with your actual service role key
const SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE';
const FUNCTION_URL = 'https://nzabewdpotnlttftimej.supabase.co/functions/v1/populate-ml-performance-data';

const options = {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  }
};

console.log('Calling populate-ml-performance-data function...');

const req = https.request(FUNCTION_URL, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response status:', res.statusCode);
    console.log('Response body:', data);
  });
});

req.on('error', (error) => {
  console.error('Error calling function:', error);
});

req.end();


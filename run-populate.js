const https = require('https');

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
  console.error('Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/populate-ml-performance-data`;

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


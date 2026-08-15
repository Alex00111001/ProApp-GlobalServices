const { Client } = require('pg');

// Load env vars
require('dotenv').config();

console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');

const client = new Client({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: true } 
});

async function test() {
  try {
    await client.connect();
    console.log('✅ PostgreSQL connection successful!');
    
    const res = await client.query('SELECT NOW()');
    console.log('Server time:', res.rows[0].now);
  } catch (e) {
    console.error('❌ Connection failed:', e.message);
  } finally {
    await client.end();
  }
}

test();

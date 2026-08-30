require('dotenv').config();
const env = require('./config/env');
const app = require('./app');

app.listen(env.port, () => {
  console.log(`Services Platform API listening on port ${env.port}`);
  console.log(`Environment: ${env.environment}`);
});

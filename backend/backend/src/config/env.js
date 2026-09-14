const path = require('path');
const dotenv = require('dotenv');

const loadEnv = () => {
  const backendEnvPath = path.resolve(__dirname, '../../.env');
  const rootEnvLocalPath = path.resolve(__dirname, '../../../../.env.local');
  const rootEnvPath = path.resolve(__dirname, '../../../../.env');

  dotenv.config({ path: backendEnvPath, quiet: true });
  dotenv.config({ path: rootEnvLocalPath, quiet: true });
  dotenv.config({ path: rootEnvPath, quiet: true });
};

module.exports = loadEnv;
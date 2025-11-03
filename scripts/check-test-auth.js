#!/usr/bin/env node
/**
 * Pre-test script to check if authentication credentials exist and are valid
 * If missing or expired, automatically runs test-cognito-auth.sh to generate them
 */

const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

const envPath = join(__dirname, '..', '.env');
const authScriptPath = join(__dirname, 'test-cognito-auth.sh');

function runAuthScript() {
  console.log('\n🔐 Generating authentication credentials...');
  console.log('   Running ./scripts/test-cognito-auth.sh\n');
  
  try {
    execSync('bash scripts/test-cognito-auth.sh', {
      stdio: 'inherit',
      cwd: join(__dirname, '..'),
    });
    console.log('\n✓ Credentials generated successfully\n');
    return true;
  } catch (error) {
    console.error('\n❌ Failed to generate credentials');
    console.error('   Please run ./scripts/test-cognito-auth.sh manually\n');
    process.exit(1);
  }
}

function checkCredentials() {
  let needsAuth = false;
  let reason = '';

  // Check if .env exists
  if (!existsSync(envPath)) {
    needsAuth = true;
    reason = '.env file not found';
  } else {
    // Read and parse .env file
    try {
      const content = readFileSync(envPath, 'utf8');
      const vars = {};
      
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const match = trimmed.match(/^([A-Z_]+)=(.+)$/);
          if (match) {
            vars[match[1]] = match[2].trim();
          }
        }
      });

      // Check required variables
      if (!vars.API_URL || !vars.ID_TOKEN) {
        needsAuth = true;
        reason = `Missing required credentials: ${!vars.API_URL ? 'API_URL' : 'ID_TOKEN'}`;
      } else {
        // Check if token looks valid (JWT tokens have 3 parts separated by dots)
        if (!vars.ID_TOKEN.includes('.') || vars.ID_TOKEN.split('.').length !== 3) {
          needsAuth = true;
          reason = 'ID_TOKEN appears to be invalid';
        } else {
          // Check if token is expired
          try {
            const parts = vars.ID_TOKEN.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
              const exp = payload.exp;
              if (exp) {
                const now = Math.floor(Date.now() / 1000);
                // Add 5 minute buffer (refresh if less than 5 min remaining)
                const timeUntilExpiry = exp - now;
                if (timeUntilExpiry < 300) { // 5 minutes
                  needsAuth = true;
                  if (timeUntilExpiry < 0) {
                    reason = 'ID_TOKEN is expired';
                  } else {
                    reason = `ID_TOKEN expires in ${Math.floor(timeUntilExpiry / 60)} minutes`;
                  }
                }
              }
            }
          } catch (e) {
            // If we can't decode the token, assume it's invalid
            needsAuth = true;
            reason = 'Unable to decode ID_TOKEN';
          }
        }
      }
    } catch (error) {
      needsAuth = true;
      reason = `Error reading .env file: ${error.message}`;
    }
  }

  if (needsAuth) {
    console.log(`\n⚠️  ${reason}`);
    runAuthScript();
    // Re-check after generating credentials
    return checkCredentials();
  }

  console.log('✓ Test credentials found and valid');
  return true;
}

checkCredentials();


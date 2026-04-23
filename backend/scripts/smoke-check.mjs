#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL || 'http://localhost:7001/api/v1').replace(/\/$/, '');
const adminEmail = process.env.ADMIN_EMAIL || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const bodyText = await response.text();

  let json = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }

  return { response, bodyText, json };
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`PASS: ${message}`);
}

async function run() {
  console.log(`Running smoke checks against ${baseUrl}`);

  const health = await requestJson(`${baseUrl}/health`);
  if (!health.response.ok) {
    fail(`Health endpoint failed with status ${health.response.status}`);
  }

  if (!health.json || health.json.ok !== true) {
    fail('Health endpoint did not return ok=true');
  }
  ok('Health endpoint is reachable');

  if (webhookVerifyToken) {
    const challenge = 'smoke_challenge_123';
    const webhookUrl = `${baseUrl}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(webhookVerifyToken)}&hub.challenge=${challenge}`;
    const verification = await requestJson(webhookUrl);

    if (!verification.response.ok) {
      fail(`Webhook verify failed with status ${verification.response.status}`);
    }

    if (verification.bodyText.trim() !== challenge) {
      fail('Webhook verify did not echo the challenge value');
    }

    ok('Webhook verification endpoint is configured correctly');
  } else {
    console.log('SKIP: Set WHATSAPP_WEBHOOK_VERIFY_TOKEN to check webhook verification');
  }

  if (adminEmail && adminPassword) {
    const login = await requestJson(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });

    if (!login.response.ok) {
      fail(`Admin login failed with status ${login.response.status}`);
    }

    const accessToken = login.json?.accessToken;
    if (!accessToken) {
      fail('Admin login succeeded but accessToken was missing');
    }

    ok('Admin login works');

    const ucmDashboard = await requestJson(`${baseUrl}/ucm/dashboard`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!ucmDashboard.response.ok) {
      fail(`UCM dashboard check failed with status ${ucmDashboard.response.status}`);
    }

    ok('UCM dashboard endpoint is reachable with admin auth');

    const catalogSettings = await requestJson(`${baseUrl}/settings/catalog`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!catalogSettings.response.ok) {
      fail(`Catalog settings check failed with status ${catalogSettings.response.status}`);
    }

    ok('Catalog settings endpoint is reachable with admin auth');
  } else {
    console.log('SKIP: Set ADMIN_EMAIL and ADMIN_PASSWORD to validate authenticated endpoints');
  }

  console.log('Smoke checks completed');
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : 'Unknown smoke-check failure');
});

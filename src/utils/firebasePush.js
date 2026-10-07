const fs = require('node:fs');
const crypto = require('node:crypto');

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const invalidTokenCodes = new Set(['UNREGISTERED']);
function createFirebaseSender({env = process.env, fetchImpl = fetch, now = Date.now} = {}) {
  let credentials, access, expires = 0, refreshing;
  function config() {
    if (credentials) return credentials;
    if (!env.FIREBASE_SERVICE_ACCOUNT_PATH && !env.FIREBASE_SERVICE_ACCOUNT_BASE64) return null;
    const raw = env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')
      : Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const value = JSON.parse(raw);
    if (!value.project_id || !value.client_email || !value.private_key || value.type !== 'service_account') throw new Error('Invalid Firebase service account configuration');
    if (env.FIREBASE_PROJECT_ID && value.project_id !== env.FIREBASE_PROJECT_ID) throw new Error('Firebase project does not match server configuration');
    return credentials = value;
  }
  async function bearer() {
    if (access && now() < expires) return access;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const c = config();
      if (!c) throw new Error('Firebase server credentials are not configured');
      const issued = Math.floor(now() / 1000);
      const unsigned = `${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:c.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:issued,exp:issued+3600})}`;
      const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), c.private_key).toString('base64url');
      const response = await fetchImpl('https://oauth2.googleapis.com/token', {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`}),
        signal:AbortSignal.timeout(10000)
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw new Error('Firebase OAuth authentication failed');
      access = data.access_token; expires = now() + Math.max(0, Number(data.expires_in || 3600) - 120) * 1000;
      return access;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function send(token, data, ttlSeconds) {
    const c = config();
    const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(c.project_id)}/messages:send`, {
      method:'POST', headers:{Authorization:`Bearer ${await bearer()}`,'Content-Type':'application/json'},
      body:JSON.stringify({message:{token,data,android:{priority:'HIGH',ttl:`${Math.max(1,Math.min(86400,Math.floor(ttlSeconds)))}s`}}}),
      signal:AbortSignal.timeout(10000)
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) { access = null; expires = 0; }
      const code = result.error?.details?.find(d => d['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode || result.error?.status || `HTTP_${response.status}`;
      const error = new Error(`Firebase send failed: ${code}`); error.code = code; error.invalidToken = invalidTokenCodes.has(code); throw error;
    }
    return result.name;
  }
  return {configured:() => Boolean(config()), send};
}
module.exports = {createFirebaseSender};

// Production is served through the hosting ingress. Local development is direct.
// Override with the verified ingress hop count when the deployment changes.
function trustProxyHops(nodeEnv, value) {
  const raw = value == null ? (nodeEnv === 'production' ? '1' : '0') : String(value).trim();
  if (!/^\d+$/.test(raw) || Number(raw) > 16) throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 16');
  return Number(raw);
}
module.exports = {trustProxyHops};

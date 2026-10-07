# Hosting proxy configuration

Express trusts one proxy hop by default when NODE_ENV=production; development/test defaults to zero. TRUST_PROXY_HOPS overrides this with an integer from 0 through 16. Set TRUST_PROXY_HOPS=1 explicitly for a deployment with one ingress proxy, including when NODE_ENV is not configured.

Verify the actual ingress hop count with the hosting provider. Do not increase it merely to suppress errors. All external requests must traverse the configured ingress path; the ingress must overwrite or append the real client address in X-Forwarded-For. If direct application access is possible or request paths have different lengths, use verified proxy address ranges instead of a hop count before exposing the service.

After deploying/restarting, test login/bidding from two separate networks and check new runtime logs for proxy validation errors. Requests from different public IPs should have separate IP-based limits. The change retains all existing limits and validations.

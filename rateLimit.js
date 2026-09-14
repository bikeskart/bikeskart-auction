const rateLimit = require("express-rate-limit");

// Auth endpoints get a tighter limit than the rest of the API,
// since they're the target of credential-stuffing / brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP per window across login+register
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

module.exports = { authLimiter };

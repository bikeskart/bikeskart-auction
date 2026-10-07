const userModel = require("../models/userModel");
const { hashPassword, verifyPassword } = require("../utils/password");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require("../utils/tokens");

// Cookie settings for the refresh token. httpOnly so client-side JS
// (and any injected script from an XSS bug) can't read it; the
// access token, by contrast, is returned in the JSON body and kept
// in memory on the frontend, not in a cookie or localStorage.
const REFRESH_COOKIE_NAME = "bk_refresh";
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // requires HTTPS in prod
  sameSite: "strict",
  path: "/api/auth",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days, keep in sync with JWT_REFRESH_EXPIRES_IN
};

function publicUser(user) {
  // Never send password_hash (or other internal fields) to the client.
  const { password_hash, ...safe } = user;
  return safe;
}

async function register(req, res, next) {
  try {
    const { role, fullName, email, phone, password, businessName, gstNumber } = req.body;

    const existing = await userModel.findByEmail(email);
    if (existing) {
      // Generic message — don't reveal whether the email exists to
      // an unauthenticated caller beyond what's necessary.
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const user = await userModel.createUser({
      role,
      fullName,
      email,
      phone,
      passwordHash,
      businessName: role === "dealer" ? businessName : null,
      gstNumber: role === "dealer" ? gstNumber : null,
    });

    // Dealers/bidders can't log in until an admin verifies them.
    return res.status(201).json({
      message:
        "Account created. An admin will review and approve your account before you can log in.",
      user: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    let user = await userModel.findByEmail(req.loginEmailExact || email);
    if (!user && req.loginEmailExact && req.loginEmailExact !== email) user = await userModel.findByEmail(email);
    // Same error for "no such user" and "wrong password" — don't let
    // an attacker enumerate which emails are registered.
    const invalidCreds = () =>
      res.status(401).json({ error: "Invalid email or password" });

    if (!user) return invalidCreds();

    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) return invalidCreds();

    if (!user.is_active) {
      return res.status(403).json({ error: "This account has been disabled" });
    }
    if (!user.is_verified) {
      return res
        .status(403)
        .json({ error: "This account is pending admin approval" });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    const decoded = verifyRefreshToken(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);
    await userModel.storeRefreshToken(user.id, hashToken(refreshToken), expiresAt);
    await userModel.updateLastLogin(user.id);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTS);
    return res.json({ accessToken, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: "No refresh token provided" });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const tokenHash = hashToken(token);
    const stored = await userModel.findValidRefreshToken(tokenHash);
    if (!stored) {
      // Token isn't in our DB as "valid" — either already used/revoked
      // or forged. Treat as a possible theft and clear the cookie.
      res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
      return res.status(401).json({ error: "Refresh token no longer valid" });
    }

    const user = await userModel.findById(decoded.sub);
    if (!user || !user.is_active || !user.is_verified) {
      return res.status(403).json({ error: "Account is not active" });
    }

    // Rotate: revoke the used refresh token and issue a new one.
    // This limits the damage if a refresh token is ever stolen.
    await userModel.revokeRefreshToken(tokenHash);
    const newRefreshToken = signRefreshToken(user);
    const newDecoded = verifyRefreshToken(newRefreshToken);
    await userModel.storeRefreshToken(
      user.id,
      hashToken(newRefreshToken),
      new Date(newDecoded.exp * 1000)
    );

    const accessToken = signAccessToken(user);
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, REFRESH_COOKIE_OPTS);
    return res.json({ accessToken });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (token) {
      await userModel.revokeRefreshToken(hashToken(token));
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await userModel.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, logout, me };

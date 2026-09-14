const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const { registerValidators, loginValidators } = require("../middleware/validators");
const { requireAuth } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");

router.post("/register", authLimiter, registerValidators, authController.register);
router.post("/login", authLimiter, loginValidators, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);

module.exports = router;

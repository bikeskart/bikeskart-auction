const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middleware/auth");

// Every route in this file requires a valid access token AND the
// 'admin' role. Stage 2 (add bikes, create auctions, etc.) hangs
// its routes off this same pattern.
router.use(requireAuth, require("../middleware/adminPermissions").requireAdminScope());

router.get("/ping", (req, res) => {
  res.json({ ok: true, message: `Hello admin #${req.user.sub}` });
});

module.exports = router;

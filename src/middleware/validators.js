const { body, validationResult } = require("express-validator");

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

const registerValidators = [
  body("role")
    .isIn(["dealer", "bidder"])
    .withMessage("role must be 'dealer' or 'bidder' (admins are not self-registered)"),
  body("fullName").trim().isLength({ min: 2, max: 150 }).withMessage("fullName is required"),
  body("email").trim().isEmail().normalizeEmail().withMessage("valid email is required"),
  body("phone")
    .if(body("role").equals("dealer"))
    .notEmpty().withMessage("Mobile number is required for dealers").bail()
    .trim()
    .isMobilePhone("any")
    .withMessage("phone must be a valid phone number"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("password must be at least 8 characters")
    .matches(/\d/)
    .withMessage("password must contain at least one number"),
  body("businessName")
    .if(body("role").equals("dealer"))
    .trim()
    .isLength({ min: 2, max: 190 })
    .withMessage("businessName is required for dealers"),
  handleValidationErrors,
];

const loginValidators = [
  body("email").trim().isEmail().customSanitizer((email,{req})=>{req.loginEmailExact=email.toLowerCase();return email;}).normalizeEmail().withMessage("valid email is required"),
  body("password").notEmpty().withMessage("password is required"),
  handleValidationErrors,
];

module.exports = { registerValidators, loginValidators };

/**
 * Authentication Routes
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authValidation } = require('../middleware/validation.middleware');

// Public routes
router.post('/register', authValidation.register, authController.register);
router.post('/login', authValidation.login, authController.login);
router.post('/send-otp', authController.sendOtp);
router.post('/forgot-password', authValidation.forgotPassword, authController.forgotPassword);
router.put('/reset-password/:token', authValidation.resetPassword, authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.put('/password', authenticate, authValidation.changePassword, authController.updatePassword);
router.post('/logout', authenticate, authController.logout);

module.exports = router;

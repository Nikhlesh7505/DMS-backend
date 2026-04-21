/**
 * Authentication Controller
 * Handles user registration, login, and password management
 */

const User = require('../models/User');
const { generateToken } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone, organization, location } = req.body;

  // Check if user already exists
  const userExists = await User.findOne({ email: email.toLowerCase() });
  if (userExists) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email'
    });
  }

  // Create user
  const userData = {
    name,
    email: email.toLowerCase(),
    password,
    role: role || 'citizen',
    phone,
    location
  };

  // Add organization details for NGOs and rescue teams
  if ((role === 'ngo' || role === 'rescue_team') && organization) {
    userData.organization = organization;
  }

  // All non-admin roles require admin approval before login
  userData.approvalStatus = (role === 'admin') ? 'approved' : 'pending';

  const user = await User.create(userData);

  res.status(201).json({
    success: true,
    message: 'Registration successful. Your account is pending admin approval. You will be able to log in once an admin approves your account.',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus
      }
    }
  });
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user with password
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account has been deactivated. Please contact administrator.'
    });
  }

  // Check password
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  }

  // Check approval status for all non-admin roles
  if (user.role !== 'admin' && user.approvalStatus !== 'approved') {
    return res.status(403).json({
      success: false,
      message: `Your account is ${user.approvalStatus}. Please wait for admin approval before logging in.`
    });
  }

  // Update last login
  await user.updateLastLogin();

  // Generate token
  const token = generateToken(user._id);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        organization: user.organization,
        location: user.location,
        approvalStatus: user.approvalStatus
      },
      token
    }
  });
});

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        organization: user.organization,
        location: user.location,
        specialization: user.specialization,
        availabilityStatus: user.availabilityStatus,
        notifications: user.notifications,
        approvalStatus: user.approvalStatus,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    }
  });
});

/**
 * @desc    Update password
 * @route   PUT /api/auth/password
 * @access  Private
 */
const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  const isMatch = await user.comparePassword(currentPassword);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Password updated successfully'
  });
});

/**
 * @desc    Forgot password
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found with this email'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and save to user
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour

  await user.save({ validateBeforeSave: false });

  // TODO: Send email with reset token
  // For now, just return the token (in production, send via email)

  res.json({
    success: true,
    message: 'Password reset token generated',
    data: {
      resetToken // Remove this in production, send via email only
    }
  });
});

/**
 * @desc    Reset password
 * @route   PUT /api/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  // Hash token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }

  // Update password
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  res.json({
    success: true,
    message: 'Password reset successful'
  });
});

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  // In a more complex implementation, you might want to invalidate the token
  // For now, we just return success (client should remove token)

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @desc    Verify email
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const user = await User.findOne({ verificationToken: token });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid verification token'
    });
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Email verified successfully'
  });
});

/**
 * @desc    Send Registration OTP via Email
 * @route   POST /api/auth/send-otp
 * @access  Public
 */
const sendOtp = asyncHandler(async (req, res) => {
  const { email, otp, name } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: 'Please provide email and OTP' });
  }

  // Create transporter
  if (!process.env.SMTP_HOST) {
    console.warn('⚠️ SMTP_HOST not configured. Email will not be sent! Proceeding with mock success.');
    return res.status(200).json({ success: true, message: 'Mock email sent since SMTP is not configured', messageId: 'mock-123' });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: `"Disaster Management System" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your Account Verification Code',
    text: `Hello ${name || 'User'},\n\nYour 6-digit verification code is: ${otp}\n\nDo not share this code with anyone.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Verify Your Identity</h2>
        <p>Hello ${name || ''},</p>
        <p>Your 6-digit verification code is:</p>
        <h1 style="background: #f4f4f4; padding: 10px; display: inline-block; letter-spacing: 5px;">${otp}</h1>
        <p>Please enter this code in the registration form to complete your setup.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  res.status(200).json({ success: true, message: 'OTP sent to email', messageId: info.messageId });
});

module.exports = {
  register,
  login,
  sendOtp,
  getMe,
  updatePassword,
  forgotPassword,
  resetPassword,
  logout,
  verifyEmail
};

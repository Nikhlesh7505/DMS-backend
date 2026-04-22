/**
 * Authentication Controller
 * Handles user registration, login, and password management
 */

const User = require('../models/User');
const { generateToken } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const createMailTransporter = () => {
  if (!process.env.SMTP_HOST) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const normalizePhoneDigits = (value = '') => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(-10);
  }
  return digits.slice(-10);
};

const normalizeRecoveryUsername = (value = '') =>
  String(value || '').trim().replace(/^@+/, '').toLowerCase();

const sanitizeUsernameSeed = (value = '') => {
  let seed = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/[._]{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '');

  if (!seed) seed = 'user';
  if (seed.length < 3) seed = `${seed}user`;
  return seed.slice(0, 30);
};

const generateUniqueUsername = async (seed) => {
  const base = sanitizeUsernameSeed(seed);
  let candidate = base;
  let attempt = 0;

  while (await User.exists({ username: candidate })) {
    attempt += 1;
    const suffix = String(attempt);
    candidate = `${base.slice(0, Math.max(3, 30 - suffix.length))}${suffix}`;
  }

  return candidate;
};

const ensureUserHasUsername = async (user) => {
  if (user.username) return user.username;

  const preferredSeed = user.email?.split('@')[0] || user.name || 'user';
  const generatedUsername = await generateUniqueUsername(preferredSeed);

  user.username = generatedUsername;
  await user.save({ validateBeforeSave: false });

  return generatedUsername;
};

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  const { name, username, email, password, role, phone, organization, location } = req.body;

  // Check if user already exists
  const userExists = await User.findOne({ email: email.toLowerCase() });
  if (userExists) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email'
    });
  }

  if (username) {
    const usernameExists = await User.findOne({ username: username.toLowerCase() });
    if (usernameExists) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
  }

  const finalUsername = username
    ? username.toLowerCase()
    : await generateUniqueUsername(email.split('@')[0] || name);

  // Create user
  const userData = {
    name,
    username: finalUsername,
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
        username: user.username,
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
  const identifier = String(email || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const query = emailRegex.test(identifier)
    ? { email: identifier }
    : { username: identifier };

  // Find user with password
  const user = await User.findOne(query).select('+password');

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Wrong email or username'
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
      message: 'Wrong password'
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

  // Backfill legacy accounts created before username support.
  await ensureUserHasUsername(user);

  // Generate token
  const token = generateToken(user._id);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        organization: user.organization,
        location: user.location,
        approvalStatus: user.approvalStatus,
        isActive: user.isActive,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
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
  await ensureUserHasUsername(user);

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
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
        isActive: user.isActive,
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

  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  const genericMessage = 'If an account with this email exists, an OTP has been sent.';

  // Keep response generic to avoid exposing whether an email is registered.
  if (!user) {
    return res.json({
      success: true,
      message: genericMessage
    });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  user.passwordResetOtpHash = otpHash;
  user.passwordResetOtpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  user.passwordResetOtpAttempts = 0;
  await user.save({ validateBeforeSave: false });

  const transporter = createMailTransporter();
  if (!transporter) {
    return res.json({
      success: true,
      message: `${genericMessage} SMTP is not configured, so OTP is returned for development.`,
      data: {
        devOtp: otp
      }
    });
  }

  await transporter.sendMail({
    from: `"Disaster Management System" <${process.env.SMTP_USER}>`,
    to: user.email,
    subject: 'Password Reset OTP',
    text: `Hello ${user.name || 'User'},\n\nYour password reset OTP is: ${otp}\n\nIt is valid for 10 minutes. Do not share this code with anyone.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name || 'User'},</p>
        <p>Your OTP to reset password is:</p>
        <h1 style="background: #f4f4f4; padding: 10px; display: inline-block; letter-spacing: 5px;">${otp}</h1>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `
  });

  res.json({
    success: true,
    message: genericMessage
  });
});

/**
 * @desc    Recover email using phone or username
 * @route   POST /api/auth/recover-email
 * @access  Public
 */
const recoverEmail = asyncHandler(async (req, res) => {
  const { phone, username } = req.body;

  let user = null;

  if (phone) {
    const normalizedPhone = normalizePhoneDigits(phone);
    user = await User.findOne({
      phone: new RegExp(`${normalizedPhone}$`)
    });
  } else if (username) {
    const normalizedUsername = normalizeRecoveryUsername(username);
    user = await User.findOne({ username: normalizedUsername });
  }

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No account found with that phone number or username.'
    });
  }

  await ensureUserHasUsername(user);

  res.json({
    success: true,
    message: 'Account email recovered successfully.',
    data: {
      email: user.email,
      username: user.username,
      name: user.name
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
 * @desc    Reset password using OTP
 * @route   POST /api/auth/reset-password-otp
 * @access  Public
 */
const resetPasswordWithOtp = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpire) {
    return res.status(400).json({
      success: false,
      message: 'OTP not requested or already used. Please request a new OTP.'
    });
  }

  if (user.passwordResetOtpExpire < Date.now()) {
    user.passwordResetOtpHash = undefined;
    user.passwordResetOtpExpire = undefined;
    user.passwordResetOtpAttempts = 0;
    await user.save({ validateBeforeSave: false });

    return res.status(400).json({
      success: false,
      message: 'OTP has expired. Please request a new OTP.'
    });
  }

  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  if (otpHash !== user.passwordResetOtpHash) {
    user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1;

    // Lock this OTP after repeated failures.
    if (user.passwordResetOtpAttempts >= 5) {
      user.passwordResetOtpHash = undefined;
      user.passwordResetOtpExpire = undefined;
      user.passwordResetOtpAttempts = 0;
      await user.save({ validateBeforeSave: false });

      return res.status(429).json({
        success: false,
        message: 'Too many invalid attempts. Please request a new OTP.'
      });
    }

    await user.save({ validateBeforeSave: false });

    return res.status(400).json({
      success: false,
      message: 'Invalid OTP. Please try again.'
    });
  }

  user.password = password;
  user.passwordResetOtpHash = undefined;
  user.passwordResetOtpExpire = undefined;
  user.passwordResetOtpAttempts = 0;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password reset successful. Please log in with your new password.'
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

  const transporter = createMailTransporter();

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
  recoverEmail,
  resetPassword,
  resetPasswordWithOtp,
  logout,
  verifyEmail
};

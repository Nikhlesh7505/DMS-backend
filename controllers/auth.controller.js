const crypto = require('crypto')
const User = require('../models/User')
const { generateToken } = require('../middleware/auth.middleware')

const buildSafeUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  email: user.email,
  username: user.username,
  phone: user.phone,
  role: user.role,
  avatar: user.avatar,
  isActive: user.isActive,
  isVerified: user.isVerified,
  approvalStatus: user.approvalStatus,
  organization: user.organization,
  location: user.location,
  availabilityStatus: user.availabilityStatus,
  notifications: user.notifications,
  lastLogin: user.lastLogin
})

const findUserForLogin = async (identifier) => {
  const value = String(identifier || '').trim()
  if (!value) return null

  const normalizedEmail = value.toLowerCase()
  const normalizedPhone = value.replace(/\D/g, '')

  return User.findOne({
    $or: [
      { email: normalizedEmail },
      { username: normalizedEmail },
      ...(normalizedPhone ? [{ phone: new RegExp(`${normalizedPhone}$`) }] : [])
    ]
  }).select('+password')
}

const register = async (req, res) => {
  try {
    const user = await User.create({
      ...req.body,
      username: req.body.username?.toLowerCase?.() || req.body.username
    })

    res.status(201).json({
      success: true,
      message: 'Registration successful. Your account is pending admin approval.',
      data: { user: buildSafeUser(user) }
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(400).json({
      success: false,
      message: error.message || 'Registration failed'
    })
  }
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await findUserForLogin(email)

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      })
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact administrator.'
      })
    }

    if (user.role !== 'admin' && user.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.approvalStatus}. Please wait for admin approval.`
      })
    }

    user.lastLogin = new Date()
    await user.save({ validateBeforeSave: false })

    const token = generateToken(user._id)

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: buildSafeUser(user)
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({
      success: false,
      message: 'Login failed'
    })
  }
}

const sendOtp = async (req, res) => {
  try {
    const otp = String(req.body.otp || '').trim()

    if (!req.body.email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      })
    }

    res.json({
      success: true,
      message: 'OTP sent successfully.',
      data: {
        devOtp: otp || '123456'
      }
    })
  } catch (error) {
    console.error('Send OTP error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    })
  }
}

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email: email?.toLowerCase?.() })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with that email.'
      })
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000))
    user.passwordResetOtpHash = crypto.createHash('sha256').update(otp).digest('hex')
    user.passwordResetOtpExpire = new Date(Date.now() + 10 * 60 * 1000)
    user.passwordResetOtpAttempts = 0
    await user.save({ validateBeforeSave: false })

    res.json({
      success: true,
      message: 'OTP sent to your email.',
      data: {
        devOtp: otp
      }
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.'
    })
  }
}

const recoverEmail = async (req, res) => {
  try {
    const { phone, username } = req.body
    let user = null

    if (phone) {
      const normalizedPhone = String(phone).replace(/\D/g, '')
      user = await User.findOne({ phone: new RegExp(`${normalizedPhone}$`) })
    } else if (username) {
      user = await User.findOne({ username: String(username).trim().toLowerCase() })
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found for the provided details.'
      })
    }

    res.json({
      success: true,
      message: 'Email recovered successfully.',
      data: {
        email: user.email
      }
    })
  } catch (error) {
    console.error('Recover email error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to recover email.'
    })
  }
}

const resetPasswordWithOtp = async (req, res) => {
  try {
    const { email, otp, password, confirmPassword } = req.body
    const user = await User.findOne({ email: email?.toLowerCase?.() }).select('+password')

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with that email.'
      })
    }

    const hashedOtp = crypto.createHash('sha256').update(String(otp || '')).digest('hex')
    const otpMatches = user.passwordResetOtpHash && user.passwordResetOtpHash === hashedOtp
    const otpValid = user.passwordResetOtpExpire && user.passwordResetOtpExpire > new Date()

    if (!otpMatches || !otpValid) {
      user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1
      await user.save({ validateBeforeSave: false })

      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP.'
      })
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.'
      })
    }

    user.password = password
    user.passwordResetOtpHash = undefined
    user.passwordResetOtpExpire = undefined
    user.passwordResetOtpAttempts = 0
    await user.save()

    res.json({
      success: true,
      message: 'Password reset successful.'
    })
  } catch (error) {
    console.error('Reset password with OTP error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to reset password.'
    })
  }
}

const resetPassword = async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Token-based password reset is not enabled. Please use OTP reset.'
  })
}

const verifyEmail = async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Email verification is not enabled in this build.'
  })
}

const getMe = async (req, res) => {
  res.json({
    success: true,
    data: {
      user: buildSafeUser(req.user)
    }
  })
}

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user.id).select('+password')

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    const passwordMatches = await user.comparePassword(currentPassword)
    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.'
      })
    }

    user.password = newPassword
    await user.save()

    res.json({
      success: true,
      message: 'Password changed successfully.'
    })
  } catch (error) {
    console.error('Update password error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update password.'
    })
  }
}

const logout = async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully.'
  })
}

module.exports = {
  register,
  login,
  sendOtp,
  forgotPassword,
  recoverEmail,
  resetPasswordWithOtp,
  resetPassword,
  verifyEmail,
  getMe,
  updatePassword,
  logout
}

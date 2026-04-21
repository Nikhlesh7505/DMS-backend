/**
 * User Model
 * Supports multiple roles: admin, ngo, rescue_team, citizen, volunteer
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  phone: {
    type: String,
    trim: true,
    match: [
      /^[\d\s\-+()]{10,20}$/,
      'Please provide a valid phone number'
    ]
  },
  
  // Role-based access control
  role: {
    type: String,
    enum: ['admin', 'ngo', 'rescue_team', 'citizen', 'volunteer'],
    default: 'citizen',
    required: true
  },
  
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // For NGOs, Rescue Teams, Citizens and Volunteers - approval status
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Organization details (for NGOs and Rescue Teams)
  organization: {
    name: {
      type: String,
      trim: true
    },
    type: {
      type: String,
      enum: ['ngo', 'government', 'private', 'volunteer', 'other']
    },
    registrationNumber: {
      type: String,
      trim: true
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'India' }
    },
    website: String,
    description: String
  },
  
  // Location (for citizens and field teams)
  location: {
    address: String,
    city: String,
    state: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Profile information
  avatar: {
    type: String,
    default: null
  },
  
  // For rescue teams - specialization
  specialization: [{
    type: String,
    enum: ['medical', 'search_rescue', 'firefighting', 'evacuation', 'logistics', 'communication', 'other']
  }],
  
  // Availability status (for rescue teams)
  availabilityStatus: {
    type: String,
    enum: ['available', 'busy', 'offline', 'on_leave'],
    default: 'available'
  },
  
  // Emergency contact
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  
  // Notification preferences
  notifications: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    push: { type: Boolean, default: true }
  },
  
  // Last login
  lastLogin: {
    type: Date,
    default: null
  },
  
  // Password reset token
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // Verification token
  verificationToken: String,
  
  // Created by (for tracking who created NGO/rescue accounts)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
userSchema.index({ role: 1 });
userSchema.index({ approvalStatus: 1 });
userSchema.index({ 'location.city': 1 });
userSchema.index({ isActive: 1 });

// Virtual for user's full profile
userSchema.virtual('profile').get(function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    avatar: this.avatar,
    isVerified: this.isVerified,
    organization: this.organization
  };
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update last login
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  await this.save({ validateBeforeSave: false });
};

// Check if user has required role
userSchema.methods.hasRole = function(...roles) {
  return roles.includes(this.role);
};

// Check if user is approved (required for all non-admin roles)
userSchema.methods.isApproved = function() {
  if (this.role === 'admin') {
    return true;
  }
  return this.approvalStatus === 'approved';
};

// Static method to find by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);

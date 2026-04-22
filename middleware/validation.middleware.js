/**
 * Validation Middleware
 * Input validation using express-validator
 */

const { body, param, query, validationResult } = require('express-validator');
const User = require('../models/User');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    console.error('Validation Errors for Route:', req.originalUrl, errors.array());
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

/**
 * Auth validation rules
 */
const authValidation = {
  register: [
    body('name')
      .trim()
      .escape()
      .notEmpty().withMessage('Name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Please provide a valid RFC-compliant email')
      .normalizeEmail()
      .custom(async (value) => {
        const user = await User.findOne({ email: value });
        if (user) {
          throw new Error('Email already in use');
        }
        return true;
      }),

    body('username')
      .trim()
      .notEmpty().withMessage('Username is required')
      .matches(/^(?=.{3,30}$)[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/)
      .withMessage('Username must be 3-30 characters and use only lowercase letters, numbers, dots, or underscores')
      .custom(async (value) => {
        const user = await User.findOne({ username: value.toLowerCase() });
        if (user) {
          throw new Error('Username already in use');
        }
        return true;
      }),
    
    body('password')
      .notEmpty().withMessage('Password is required')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
      }).withMessage('Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('role')
      .optional()
      .isIn(['citizen', 'ngo', 'rescue_team', 'volunteer']).withMessage('Invalid role'),
    
    body('phone')
      .trim()
      .notEmpty().withMessage('Phone number is required')
      .matches(/^(\+91[\-\s]?)?[6789]\d{9}$/)
      .withMessage('Please provide a valid Indian phone number (+91 optionally followed by 10 digits starting with 6-9)')
      .custom(async (value) => {
        const normalized = value.replace(/\+91|\s|-/g, '');
        const user = await User.findOne({ phone: new RegExp(normalized + '$') });
        if (user) {
          throw new Error('Phone number already in use');
        }
        return true;
      }),
    
    body('organization.name')
      .if(body('role').isIn(['ngo', 'rescue_team']))
      .trim()
      .escape()
      .notEmpty().withMessage('Organization name is required for NGOs and Rescue Teams'),
    
    body('location.address')
      .optional({ values: 'falsy' })
      .trim()
      .escape(),
    
    body('location.city')
      .optional({ values: 'falsy' })
      .trim()
      .escape(),
    
    body('location.state')
      .optional({ values: 'falsy' })
      .trim()
      .escape(),

    body('location.coordinates.latitude')
      .optional({ values: 'falsy' })
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),

    body('location.coordinates.longitude')
      .optional({ values: 'falsy' })
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    
    handleValidationErrors
  ],
  
  login: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Password is required'),
    handleValidationErrors
  ],
  
  forgotPassword: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Please provide a valid email')
      .normalizeEmail(),
    handleValidationErrors
  ],

  recoverEmail: [
    body('phone')
      .optional({ values: 'falsy' })
      .trim()
      .matches(/^(\+91[\-\s]?)?[6789]\d{9}$/)
      .withMessage('Please provide a valid Indian phone number'),
    body('username')
      .optional({ values: 'falsy' })
      .trim(),
    body().custom((value) => {
      if (!value?.phone && !value?.username) {
        throw new Error('Phone number or username is required');
      }
      return true;
    }),
    handleValidationErrors
  ],
  
  resetPassword: [
    body('password')
      .notEmpty().withMessage('Password is required')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
      }).withMessage('New password must be at least 8 characters and contain uppercase, lowercase, number, and symbol'),
    body('confirmPassword')
      .notEmpty().withMessage('Confirm password is required')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Passwords do not match');
        }
        return true;
      }),
    handleValidationErrors
  ],

  resetPasswordWithOtp: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('otp')
      .trim()
      .notEmpty().withMessage('OTP is required')
      .matches(/^\d{6}$/).withMessage('OTP must be a 6-digit number'),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
      }).withMessage('New password must be at least 8 characters and contain uppercase, lowercase, number, and symbol'),
    body('confirmPassword')
      .notEmpty().withMessage('Confirm password is required')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Passwords do not match');
        }
        return true;
      }),
    handleValidationErrors
  ],
  
  changePassword: [
    body('currentPassword')
      .notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .notEmpty().withMessage('New password is required')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
      }).withMessage('New password must be at least 8 characters and contain uppercase, lowercase, number, and symbol'),
    handleValidationErrors
  ]
};

/**
 * User validation rules
 */
const userValidation = {
  updateProfile: [
    body('name')
      .optional()
      .trim()
      .escape()
      .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('username')
      .optional()
      .trim()
      .matches(/^(?=.{3,30}$)[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/)
      .withMessage('Username must be 3-30 characters and use only lowercase letters, numbers, dots, or underscores')
      .custom(async (value, { req }) => {
        if (!value) return true;
        const user = await User.findOne({ username: value.toLowerCase() });
        if (user && user._id.toString() !== req.user.id) {
          throw new Error('Username already in use');
        }
        return true;
      }),
    body('phone')
      .optional()
      .trim()
      .matches(/^(\+91[\-\s]?)?[6789]\d{9}$/)
      .withMessage('Please provide a valid Indian phone number'),
    body('location')
      .optional()
      .isObject().withMessage('Location must be an object'),
    body('location.coordinates.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('location.coordinates.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    handleValidationErrors
  ],
  
  updateOrganization: [
    body('organization.name')
      .optional()
      .trim()
      .escape()
      .notEmpty().withMessage('Organization name cannot be empty'),
    body('organization.type')
      .optional()
      .isIn(['ngo', 'government', 'private', 'volunteer', 'other'])
      .withMessage('Invalid organization type'),
    handleValidationErrors
  ],
  
  approveUser: [
    param('id')
      .notEmpty().withMessage('User ID is required')
      .isMongoId().withMessage('Invalid user ID'),
    body('status')
      .notEmpty().withMessage('Status is required')
      .isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),
    body('reason')
      .optional()
      .trim()
      .escape(),
    handleValidationErrors
  ]
};

/**
 * Weather validation rules
 */
const weatherValidation = {
  getWeather: [
    query('city')
      .optional()
      .trim()
      .escape()
      .notEmpty().withMessage('City cannot be empty'),
    query('lat')
      .optional()
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    query('lon')
      .optional()
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    handleValidationErrors
  ],
  
  addWeatherData: [
    body('location.city')
      .trim()
      .escape()
      .notEmpty().withMessage('City is required'),
    body('location.state')
      .trim()
      .escape()
      .notEmpty().withMessage('State is required'),
    body('location.coordinates.latitude')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('location.coordinates.longitude')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    body('data.temperature.current')
      .optional()
      .isFloat().withMessage('Temperature must be a number'),
    body('data.humidity')
      .optional()
      .isFloat({ min: 0, max: 100 }).withMessage('Humidity must be between 0 and 100'),
    handleValidationErrors
  ]
};

/**
 * Disaster validation rules
 */
const disasterValidation = {
  createDisaster: [
    body('name')
      .trim()
      .escape()
      .notEmpty().withMessage('Disaster name is required'),
    body('type')
      .notEmpty().withMessage('Disaster type is required')
      .isIn([
        'flood', 'cyclone', 'earthquake', 'tsunami', 'drought',
        'heatwave', 'wildfire', 'landslide', 'storm', 'pandemic',
        'chemical', 'industrial', 'other'
      ]).withMessage('Invalid disaster type'),
    body('severity')
      .notEmpty().withMessage('Severity is required')
      .isIn(['low', 'moderate', 'high', 'severe', 'catastrophic'])
      .withMessage('Invalid severity level'),
    body('description')
      .trim()
      .escape()
      .notEmpty().withMessage('Description is required'),
    body('location.city')
      .trim()
      .escape()
      .notEmpty().withMessage('City is required'),
    body('location.state')
      .trim()
      .escape()
      .notEmpty().withMessage('State is required'),
    body('location.coordinates.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('location.coordinates.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    handleValidationErrors
  ],
  
  updateDisaster: [
    param('id')
      .notEmpty().withMessage('Disaster ID is required')
      .isMongoId().withMessage('Invalid disaster ID'),
    body('status')
      .optional()
      .isIn(['monitoring', 'active', 'contained', 'resolved'])
      .withMessage('Invalid status'),
    handleValidationErrors
  ],
  
  addUpdate: [
    param('id')
      .notEmpty().withMessage('Disaster ID is required')
      .isMongoId().withMessage('Invalid disaster ID'),
    body('content')
      .trim()
      .escape()
      .notEmpty().withMessage('Update content is required'),
    body('type')
      .optional()
      .isIn(['general', 'situation', 'response', 'evacuation', 'relief', 'weather'])
      .withMessage('Invalid update type'),
    handleValidationErrors
  ]
};

/**
 * Alert validation rules
 */
const alertValidation = {
  createAlert: [
    body('title')
      .trim()
      .escape()
      .notEmpty().withMessage('Alert title is required'),
    body('message')
      .trim()
      .escape()
      .notEmpty().withMessage('Alert message is required'),
    body('type')
      .notEmpty().withMessage('Alert type is required')
      .isIn([
        'flood_warning', 'cyclone_alert', 'earthquake_warning',
        'tsunami_warning', 'heatwave_warning', 'storm_warning',
        'wildfire_warning', 'landslide_warning', 'evacuation_notice',
        'safety_advisory', 'all_clear', 'test'
      ]).withMessage('Invalid alert type'),
    body('severity')
      .notEmpty().withMessage('Severity is required')
      .isIn(['info', 'watch', 'warning', 'danger', 'emergency'])
      .withMessage('Invalid severity level'),
    body('targetLocation.city')
      .trim()
      .escape()
      .notEmpty().withMessage('Target city is required'),
    body('timeline.expiresAt')
      .notEmpty().withMessage('Expiry date is required')
      .isISO8601().withMessage('Invalid expiry date format'),
    handleValidationErrors
  ],
  
  updateAlert: [
    param('id')
      .notEmpty().withMessage('Alert ID is required')
      .isMongoId().withMessage('Invalid alert ID'),
    body('status')
      .optional()
      .isIn(['active', 'acknowledged', 'resolved', 'cancelled'])
      .withMessage('Invalid status'),
    handleValidationErrors
  ]
};

/**
 * Emergency request validation rules
 */
const emergencyValidation = {
  createRequest: [
    body('type')
      .notEmpty().withMessage('Request type is required')
      .isIn([
        'medical_emergency', 'rescue_request', 'food_water',
        'shelter', 'evacuation', 'fire', 'trapped', 'injured',
        'missing_person', 'animal_rescue', 'supply_request',
        'information', 'other'
      ]).withMessage('Invalid request type'),
    body('description')
      .trim()
      .escape()
      .notEmpty().withMessage('Description is required')
      .isLength({ min: 15, max: 1000 }).withMessage('Description must be between 15 and 1000 characters'),
    body('location.address')
      .trim()
      .escape()
      .notEmpty().withMessage('Address is required')
      .isLength({ min: 5, max: 200 }).withMessage('Address must be between 5 and 200 characters'),
    body('location.city')
      .trim()
      .escape()
      .notEmpty().withMessage('City is required')
      .isLength({ min: 2, max: 100 }).withMessage('City must be between 2 and 100 characters'),
    body('location.state')
      .trim()
      .escape()
      .notEmpty().withMessage('State is required')
      .isLength({ min: 2, max: 100 }).withMessage('State must be between 2 and 100 characters'),
    body('location.coordinates.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('location.coordinates.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    body('peopleAffected')
      .notEmpty().withMessage('People affected is required')
      .isInt({ min: 1, max: 1000 }).withMessage('People affected must be between 1 and 1000'),
    body('citizenInfo.alternativeContact')
      .optional({ values: 'falsy' })
      .trim()
      .matches(/^(\+91[\-\s]?)?[6789]\d{9}$/).withMessage('Alternative contact must be a valid Indian phone number'),
    body('specialRequirements.language.preferred')
      .optional()
      .isIn(['en', 'hi', 'bn', 'ta', 'te', 'mr', 'other']).withMessage('Invalid preferred language'),
    body('specialRequirements.medical.injuryDetails')
      .custom((value, { req }) => {
        if (!req.body?.specialRequirements?.medical?.hasInjuries) {
          return true;
        }

        if (!value || !value.trim()) {
          throw new Error('Please describe the injuries');
        }

        if (value.trim().length < 5 || value.trim().length > 500) {
          throw new Error('Injury details must be between 5 and 500 characters');
        }

        return true;
      }),
    body('specialRequirements.accessibility.details')
      .custom((value, { req }) => {
        if (!req.body?.specialRequirements?.accessibility?.hasMobilityIssues) {
          return true;
        }

        if (!value || !value.trim()) {
          throw new Error('Please describe the accessibility need');
        }

        if (value.trim().length < 5 || value.trim().length > 500) {
          throw new Error('Accessibility details must be between 5 and 500 characters');
        }

        return true;
      }),
    body('specialRequirements.other')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 500 }).withMessage('Other requirements cannot exceed 500 characters'),
    handleValidationErrors
  ],

  requestId: [
    param('id')
      .notEmpty().withMessage('Request ID is required')
      .isMongoId().withMessage('Invalid request ID'),
    handleValidationErrors
  ],
  
  updateStatus: [
    param('id')
      .notEmpty().withMessage('Request ID is required')
      .isMongoId().withMessage('Invalid request ID'),
    body('status')
      .notEmpty().withMessage('Status is required')
      .isIn([
        'acknowledged', 'assigned', 'in_progress', 'en_route',
        'on_scene', 'resolved', 'cancelled', 'escalated'
      ]).withMessage('Invalid status'),
    handleValidationErrors
  ]
};

/**
 * Resource validation rules
 */
const resourceValidation = {
  createResource: [
    body('name')
      .trim()
      .escape()
      .notEmpty().withMessage('Resource name is required'),
    body('category')
      .notEmpty().withMessage('Category is required')
      .isIn([
        'medical', 'rescue_equipment', 'vehicle', 'communication',
        'food_water', 'shelter', 'clothing', 'fuel', 'power',
        'personnel', 'financial', 'other'
      ]).withMessage('Invalid category'),
    body('type')
      .trim()
      .escape()
      .notEmpty().withMessage('Type is required'),
    body('quantity.total')
      .notEmpty().withMessage('Total quantity is required')
      .isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
    body('quantity.unit')
      .notEmpty().withMessage('Unit is required'),
    body('location.city')
      .trim()
      .escape()
      .notEmpty().withMessage('City is required'),
    body('location.coordinates.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('location.coordinates.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    handleValidationErrors
  ],
  
  allocateResource: [
    param('id')
      .notEmpty().withMessage('Resource ID is required')
      .isMongoId().withMessage('Invalid resource ID'),
    body('quantity')
      .notEmpty().withMessage('Quantity is required')
      .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    handleValidationErrors
  ]
};

/**
 * Rescue task validation rules
 */
const rescueTaskValidation = {
  createTask: [
    body('title')
      .trim()
      .escape()
      .notEmpty().withMessage('Task title is required'),
    body('description')
      .trim()
      .escape()
      .notEmpty().withMessage('Description is required'),
    body('type')
      .notEmpty().withMessage('Task type is required')
      .isIn([
        'search_rescue', 'medical_evacuation', 'food_distribution',
        'water_supply', 'shelter_setup', 'evacuation', 'debris_clearance',
        'animal_rescue', 'body_recovery', 'relief_distribution',
        'infrastructure_repair', 'communication_setup', 'assessment', 'other'
      ]).withMessage('Invalid task type'),
    body('disaster')
      .notEmpty().withMessage('Disaster ID is required')
      .isMongoId().withMessage('Invalid disaster ID'),
    body('location.address')
      .trim()
      .escape()
      .notEmpty().withMessage('Address is required'),
    body('location.city')
      .trim()
      .escape()
      .notEmpty().withMessage('City is required'),
    body('assignment.team')
      .notEmpty().withMessage('Assigned team is required')
      .isMongoId().withMessage('Invalid team ID'),
    handleValidationErrors
  ],
  
  updateTask: [
    param('id')
      .notEmpty().withMessage('Task ID is required')
      .isMongoId().withMessage('Invalid task ID'),
    body('status')
      .optional()
      .isIn([
        'assigned', 'in_progress', 'en_route', 'on_site',
        'completed', 'on_hold', 'cancelled'
      ]).withMessage('Invalid status'),
    handleValidationErrors
  ]
};

module.exports = {
  handleValidationErrors,
  authValidation,
  userValidation,
  weatherValidation,
  disasterValidation,
  alertValidation,
  emergencyValidation,
  resourceValidation,
  rescueTaskValidation
};

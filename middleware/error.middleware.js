/**
 * Error Handling Middleware
 * Centralized error handling for the application
 */

const mongoose = require('mongoose');

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(message, statusCode, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle Mongoose validation errors
 */
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map(val => val.message);
  return {
    message: 'Validation Error',
    statusCode: 400,
    errors
  };
};

/**
 * Handle Mongoose duplicate key errors
 */
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return {
    message: `Duplicate field value: ${field}. Please use another value.`,
    statusCode: 400,
    errors: [`${field} already exists`]
  };
};

/**
 * Handle Mongoose cast errors (invalid ObjectId)
 */
const handleCastError = (err) => {
  return {
    message: `Invalid ${err.path}: ${err.value}`,
    statusCode: 400,
    errors: [`Resource not found with id: ${err.value}`]
  };
};

/**
 * Handle JWT errors
 */
const handleJWTError = () => {
  return {
    message: 'Invalid token. Please log in again.',
    statusCode: 401,
    errors: ['Authentication failed']
  };
};

/**
 * Handle JWT expiration errors
 */
const handleJWTExpiredError = () => {
  return {
    message: 'Your token has expired. Please log in again.',
    statusCode: 401,
    errors: ['Token expired']
  };
};

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    name: err.name,
    code: err.code
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const validationError = handleValidationError(err);
    error = { ...validationError };
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const duplicateError = handleDuplicateKeyError(err);
    error = { ...duplicateError };
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    const castError = handleCastError(err);
    error = { ...castError };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const jwtError = handleJWTError();
    error = { ...jwtError };
  }

  if (err.name === 'TokenExpiredError') {
    const jwtExpiredError = handleJWTExpiredError();
    error = { ...jwtExpiredError };
  }

  // Default error values
  const statusCode = error.statusCode || err.statusCode || 500;
  const message = error.message || err.message || 'Internal Server Error';

  // Send response
  res.status(statusCode).json({
    success: false,
    message,
    errors: error.errors || [],
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error: err
    })
  });
};

/**
 * Async handler wrapper to catch errors in async functions
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
const notFound = (req, res, next) => {
  const error = new ApiError(`Not Found - ${req.originalUrl}`, 404);
  next(error);
};

module.exports = {
  ApiError,
  errorHandler,
  asyncHandler,
  notFound
};

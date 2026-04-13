/**
 * Disaster Management System - Main Server Entry Point
 * MERN Stack Backend with Express.js and MongoDB
 */

const express = require('express');

const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

require('dotenv').config();
const connectDatabase = require('./config/database');
const { setSocketServer } = require('./config/socket');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const weatherRoutes = require('./routes/weather.routes');
const disasterRoutes = require('./routes/disaster.routes');
const alertRoutes = require('./routes/alert.routes');
const emergencyRoutes = require('./routes/emergency.routes');
const resourceRoutes = require('./routes/resource.routes');
const rescueTaskRoutes = require('./routes/rescueTask.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const shelterRoutes = require('./routes/shelter.routes');
const notificationRoutes = require('./routes/notification.routes');
const chatRoutes = require('./routes/chat.Routes');

// Import services
const weatherService = require('./services/weather.service');
const predictionService = require('./services/prediction.service');
const alertService = require('./services/alert.service');

// Import middleware
const { errorHandler } = require('./middleware/error.middleware');
const { createRateLimiter } = require('./middleware/rateLimit.middleware');
const { requestLogger } = require('./middleware/requestLogger.middleware');


// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
  next();
});

// CORS configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

const io = new Server(server, {
  cors: corsOptions
});

setSocketServer(io);

io.on('connection', (socket) => {
  const { userId, role } = socket.handshake.auth || {};

  if (userId) {
    socket.join(`user:${userId}`);
  }

  if (role) {
    socket.join(`role:${role}`);
  }

  socket.on('join:user', ({ userId: joinedUserId }) => {
    if (joinedUserId) {
      socket.join(`user:${joinedUserId}`);
    }
  });

  socket.on('join:role', ({ role: joinedRole }) => {
    if (joinedRole) {
      socket.join(`role:${joinedRole}`);
    }
  });
});

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Disaster Management System API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', createRateLimiter({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10),
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '120', 10),
  message: 'Too many authentication requests. Please try again shortly.',
  keyPrefix: 'auth'
}), authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/disasters', disasterRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/emergency', createRateLimiter({
  windowMs: parseInt(process.env.EMERGENCY_RATE_LIMIT_WINDOW_MS || `${5 * 60 * 1000}`, 10),
  max: parseInt(process.env.EMERGENCY_RATE_LIMIT_MAX || '180', 10),
  message: 'Emergency request rate limit exceeded. Please wait a moment before retrying.',
  keyPrefix: 'emergency'
}), emergencyRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/rescue-tasks', rescueTaskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/shelters', shelterRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', chatRoutes);
// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Disaster Management System API',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use(errorHandler);

// MongoDB connection and startup
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set. Create backend/.env before starting the API.');
    }

    await connectDatabase();

    // Initialize default admin user
    await require('./utils/initAdmin')();

    // Start weather monitoring service
    weatherService.startWeatherMonitoring();

    // Start prediction engine
    predictionService.startPredictionEngine();

    // Start alert service
    alertService.startAlertService();

    console.log('All services initialized successfully');
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`API URL: http://localhost:${PORT}`);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.message);
  // Close server & exit process
  // server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});

module.exports = app;

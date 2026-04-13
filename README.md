# Disaster Management System - Backend

A production-ready Node.js/Express backend for the Disaster Management System with MongoDB integration, weather API integration, rule-based disaster prediction, and automated alert generation.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Weather Integration**: Real-time weather data from OpenWeatherMap and WeatherAPI
- **Disaster Prediction**: Rule-based engine for flood, heatwave, storm, cyclone prediction
- **Alert System**: Automated alert generation with email notifications
- **RESTful APIs**: Complete CRUD operations for all entities
- **Real-time Monitoring**: Scheduled weather polling and prediction engine

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: express-validator
- **Scheduling**: node-cron
- **Email**: nodemailer
- **HTTP Client**: axios

## Project Structure

```
backend/
├── config/           # Configuration files
│   └── database.js   # MongoDB connection
├── controllers/      # Route controllers
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── weather.controller.js
│   ├── disaster.controller.js
│   ├── alert.controller.js
│   ├── emergency.controller.js
│   ├── resource.controller.js
│   ├── rescueTask.controller.js
│   └── dashboard.controller.js
├── middleware/       # Express middleware
│   ├── auth.middleware.js
│   ├── error.middleware.js
│   └── validation.middleware.js
├── models/           # Mongoose models
│   ├── User.js
│   ├── WeatherData.js
│   ├── Disaster.js
│   ├── Alert.js
│   ├── EmergencyRequest.js
│   ├── Resource.js
│   ├── RescueTask.js
│   └── index.js
├── routes/           # API routes
│   ├── auth.routes.js
│   ├── user.routes.js
│   ├── weather.routes.js
│   ├── disaster.routes.js
│   ├── alert.routes.js
│   ├── emergency.routes.js
│   ├── resource.routes.js
│   ├── rescueTask.routes.js
│   └── dashboard.routes.js
├── services/         # Business logic
│   ├── weather.service.js
│   ├── prediction.service.js
│   └── alert.service.js
├── utils/            # Utility functions
│   ├── initAdmin.js
│   └── emailTemplates.js
├── server.js         # Main entry point
├── package.json
└── .env.example
```

## Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment setup**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start MongoDB**:
   Make sure MongoDB is running locally or use MongoDB Atlas

4. **Run the server**:
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/disaster_management

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d

# Weather APIs
OPENWEATHER_API_KEY=your_openweather_key
WEATHERAPI_KEY=your_weatherapi_key

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Admin credentials
ADMIN_EMAIL=admin@disaster.gov
ADMIN_PASSWORD=admin123

# Client URL
CLIENT_URL=http://localhost:3000
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/password` - Update password

### Users
- `GET /api/users` - Get all users (Admin)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/profile` - Update profile
- `GET /api/users/pending-approvals` - Get pending approvals (Admin)

### Weather
- `GET /api/weather/current?city=Mumbai` - Get current weather
- `GET /api/weather/all` - Get all cities weather
- `GET /api/weather/history/:city` - Get weather history

### Disasters
- `GET /api/disasters` - Get all disasters
- `GET /api/disasters/active` - Get active disasters
- `POST /api/disasters` - Create disaster (Admin)
- `PUT /api/disasters/:id/status` - Update disaster status

### Alerts
- `GET /api/alerts` - Get all alerts
- `GET /api/alerts/active` - Get active alerts
- `POST /api/alerts` - Create alert (Admin)
- `GET /api/alerts/my-alerts` - Get user's alerts

### Emergency Requests
- `GET /api/emergency` - Get all requests (Admin)
- `POST /api/emergency` - Create request
- `GET /api/emergency/my-requests` - Get my requests
- `PUT /api/emergency/:id/status` - Update status

### Resources
- `GET /api/resources` - Get all resources
- `POST /api/resources` - Create resource
- `GET /api/resources/my-resources` - Get my resources

### Rescue Tasks
- `GET /api/rescue-tasks` - Get all tasks
- `POST /api/rescue-tasks` - Create task (Admin)
- `GET /api/rescue-tasks/my-tasks` - Get my tasks

### Dashboard
- `GET /api/dashboard/public` - Public dashboard data
- `GET /api/dashboard/admin` - Admin dashboard (Admin)
- `GET /api/dashboard/responder` - Responder dashboard
- `GET /api/dashboard/citizen` - Citizen dashboard

## User Roles

- **admin**: Full access to all features
- **ngo**: Manage resources, view tasks
- **rescue_team**: Update tasks, manage availability
- **citizen**: Submit emergency requests, view alerts

## Services

### Weather Service
- Automatic weather polling every 30 minutes
- Supports OpenWeatherMap and WeatherAPI
- Stores weather snapshots in MongoDB
- Configurable city list

### Prediction Service
- Rule-based disaster prediction
- Risk levels: SAFE, WATCH, WARNING, DANGER
- Disaster types: flood, heatwave, storm, cyclone, drought, landslide
- Consecutive readings tracking

### Alert Service
- Automated alert generation from predictions
- Email notifications via nodemailer
- Alert templates for each disaster type
- Delivery tracking

## License

MIT

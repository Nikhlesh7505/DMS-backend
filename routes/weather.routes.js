/**
 * Weather Routes
 */

const express = require('express');
const router = express.Router();
const weatherController = require('../controllers/weather.controller');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');
const { weatherValidation } = require('../middleware/validation.middleware');

// Public routes
router.get('/current', weatherValidation.getWeather, weatherController.getCurrentWeather);
router.get('/all', weatherController.getAllCitiesWeather);
router.get('/cities', weatherController.getMonitoredCities);
router.get('/history/:city', weatherController.getWeatherHistory);

// Protected routes (Admin only)
router.get('/extreme', authenticate, isAdmin, weatherController.getExtremeWeather);
router.get('/statistics', authenticate, isAdmin, weatherController.getWeatherStatistics);
router.get('/status', authenticate, isAdmin, weatherController.getMonitoringStatus);
router.post('/fetch', authenticate, isAdmin, weatherController.fetchWeather);
router.post('/manual', authenticate, isAdmin, weatherController.addManualWeatherData);
router.post('/monitoring', authenticate, isAdmin, weatherController.controlMonitoring);

module.exports = router;

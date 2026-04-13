/**
 * Weather Controller
 * Handles weather data retrieval and management
 */

const WeatherData = require('../models/WeatherData');
const weatherService = require('../services/weather.service');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @desc    Get current weather for a city
 * @route   GET /api/weather/current
 * @access  Public
 */
const getCurrentWeather = asyncHandler(async (req, res) => {
  const { city, lat, lon } = req.query;

  let weather;

  if (city) {
    weather = await weatherService.getLatestWeather(city);
  } else if (lat && lon) {
    // Fetch weather for coordinates
    const weatherData = await weatherService.fetchFromOpenWeather(lat, lon);
    return res.json({
      success: true,
      data: { weather: weatherData }
    });
  } else {
    return res.status(400).json({
      success: false,
      message: 'Please provide city or coordinates (lat, lon)'
    });
  }

  if (!weather) {
    return res.status(404).json({
      success: false,
      message: 'Weather data not found for this location'
    });
  }

  res.json({
    success: true,
    data: { weather }
  });
});

/**
 * @desc    Get weather history for a city
 * @route   GET /api/weather/history/:city
 * @access  Public
 */
const getWeatherHistory = asyncHandler(async (req, res) => {
  const { city } = req.params;
  const { hours = 24 } = req.query;

  const history = await weatherService.getWeatherHistory(city, parseInt(hours));

  res.json({
    success: true,
    data: {
      city,
      hours: parseInt(hours),
      records: history.length,
      history
    }
  });
});

/**
 * @desc    Get weather for all monitored cities
 * @route   GET /api/weather/all
 * @access  Public
 */
const getAllCitiesWeather = asyncHandler(async (req, res) => {
  const cities = weatherService.getMonitoredCities();
  const cityNames = cities.map(c => c.name);
  
  const weatherData = await weatherService.getWeatherForCities(cityNames);

  res.json({
    success: true,
    data: {
      count: weatherData.length,
      cities: weatherData
    }
  });
});

/**
 * @desc    Get monitored cities list
 * @route   GET /api/weather/cities
 * @access  Public
 */
const getMonitoredCities = asyncHandler(async (req, res) => {
  const cities = weatherService.getMonitoredCities();

  res.json({
    success: true,
    data: { cities }
  });
});

/**
 * @desc    Get extreme weather conditions
 * @route   GET /api/weather/extreme
 * @access  Private/Admin
 */
const getExtremeWeather = asyncHandler(async (req, res) => {
  const extremeConditions = await weatherService.getExtremeWeather();

  res.json({
    success: true,
    data: extremeConditions
  });
});

/**
 * @desc    Get weather statistics
 * @route   GET /api/weather/statistics
 * @access  Private/Admin
 */
const getWeatherStatistics = asyncHandler(async (req, res) => {
  const stats = await weatherService.getWeatherStatistics();

  res.json({
    success: true,
    data: { statistics: stats }
  });
});

/**
 * @desc    Manually fetch weather for a city
 * @route   POST /api/weather/fetch
 * @access  Private/Admin
 */
const fetchWeather = asyncHandler(async (req, res) => {
  const { city, lat, lon, state } = req.body;

  if (!city || !lat || !lon) {
    return res.status(400).json({
      success: false,
      message: 'Please provide city name, latitude, and longitude'
    });
  }

  const cityInfo = { name: city, state: state || 'Unknown', lat, lon };
  const weather = await weatherService.fetchWeatherForCity(cityInfo);

  res.json({
    success: true,
    message: 'Weather data fetched successfully',
    data: { weather }
  });
});

/**
 * @desc    Add manual weather data
 * @route   POST /api/weather/manual
 * @access  Private/Admin
 */
const addManualWeatherData = asyncHandler(async (req, res) => {
  const weatherData = req.body;

  const weather = await WeatherData.create({
    ...weatherData,
    source: {
      api: 'manual',
      apiResponse: null
    }
  });

  res.status(201).json({
    success: true,
    message: 'Weather data added successfully',
    data: { weather }
  });
});

/**
 * @desc    Get weather monitoring status
 * @route   GET /api/weather/status
 * @access  Private/Admin
 */
const getMonitoringStatus = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      isMonitoring: weatherService.isMonitoring(),
      monitoredCities: weatherService.getMonitoredCities().length,
      pollInterval: 30 // minutes
    }
  });
});

/**
 * @desc    Start/stop weather monitoring
 * @route   POST /api/weather/monitoring
 * @access  Private/Admin
 */
const controlMonitoring = asyncHandler(async (req, res) => {
  const { action } = req.body;

  if (action === 'start') {
    weatherService.startWeatherMonitoring();
    res.json({
      success: true,
      message: 'Weather monitoring started'
    });
  } else if (action === 'stop') {
    weatherService.stopWeatherMonitoring();
    res.json({
      success: true,
      message: 'Weather monitoring stopped'
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Invalid action. Use "start" or "stop"'
    });
  }
});

module.exports = {
  getCurrentWeather,
  getWeatherHistory,
  getAllCitiesWeather,
  getMonitoredCities,
  getExtremeWeather,
  getWeatherStatistics,
  fetchWeather,
  addManualWeatherData,
  getMonitoringStatus,
  controlMonitoring
};

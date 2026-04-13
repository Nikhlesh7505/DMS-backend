/**
 * Weather Service
 * Handles weather data fetching from external APIs and storage
 */

const axios = require('axios');
const WeatherData = require('../models/WeatherData');
const cron = require('node-cron');

// Configuration
const config = {
  // Primary weather API (OpenWeatherMap)
  openWeather: {
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    apiKey: process.env.OPENWEATHER_API_KEY,
    enabled: !!process.env.OPENWEATHER_API_KEY
  },
  
  // Backup weather API (WeatherAPI)
  weatherAPI: {
    baseUrl: 'https://api.weatherapi.com/v1',
    apiKey: process.env.WEATHERAPI_KEY,
    enabled: !!process.env.WEATHERAPI_KEY
  },
  
  // Default cities to monitor
  defaultCities: [
    { name: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lon: 72.8777 },
    { name: 'Delhi', state: 'Delhi', lat: 28.6139, lon: 77.2090 },
    { name: 'Bangalore', state: 'Karnataka', lat: 12.9716, lon: 77.5946 },
    { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lon: 80.2707 },
    { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lon: 88.3639 },
    { name: 'Hyderabad', state: 'Telangana', lat: 17.3850, lon: 78.4867 },
    { name: 'Pune', state: 'Maharashtra', lat: 18.5204, lon: 73.8567 },
    { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lon: 72.5714 },
    { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lon: 75.7873 },
    { name: 'Surat', state: 'Gujarat', lat: 21.1702, lon: 72.8311 },
    { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
    { name: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lon: 80.3319 },
    { name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lon: 79.0882 },
    { name: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lon: 75.8577 },
    { name: 'Thane', state: 'Maharashtra', lat: 19.2183, lon: 72.9781 },
    { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lon: 77.4126 },
    { name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lon: 83.2185 },
    { name: 'Vadodara', state: 'Gujarat', lat: 22.3072, lon: 73.1812 },
    { name: 'Firozabad', state: 'Uttar Pradesh', lat: 27.1591, lon: 78.3957 },
    { name: 'Ludhiana', state: 'Punjab', lat: 30.9010, lon: 75.8573 }
  ],
  
  // Polling interval (in minutes)
  pollInterval: 30,
  
  // Is monitoring active
  isMonitoring: false
};

// Store cron job reference
let weatherCronJob = null;

/**
 * Fetch weather data from OpenWeatherMap API
 */
const fetchFromOpenWeather = async (lat, lon) => {
  try {
    if (!config.openWeather.enabled) {
      throw new Error('OpenWeather API key not configured');
    }
    
    const response = await axios.get(
      `${config.openWeather.baseUrl}/weather`,
      {
        params: {
          lat,
          lon,
          appid: config.openWeather.apiKey,
          units: 'metric'
        },
        timeout: 10000
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('OpenWeather API error:', error.message);
    throw error;
  }
};

/**
 * Fetch weather data from WeatherAPI
 */
const fetchFromWeatherAPI = async (lat, lon) => {
  try {
    if (!config.weatherAPI.enabled) {
      throw new Error('WeatherAPI key not configured');
    }
    
    const response = await axios.get(
      `${config.weatherAPI.baseUrl}/current.json`,
      {
        params: {
          q: `${lat},${lon}`,
          key: config.weatherAPI.apiKey
        },
        timeout: 10000
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('WeatherAPI error:', error.message);
    throw error;
  }
};

/**
 * Transform OpenWeather data to our schema
 */
const transformOpenWeatherData = (apiData, cityInfo) => {
  return {
    location: {
      city: cityInfo.name,
      state: cityInfo.state,
      country: apiData.sys?.country || 'IN',
      coordinates: {
        latitude: apiData.coord?.lat || cityInfo.lat,
        longitude: apiData.coord?.lon || cityInfo.lon
      }
    },
    data: {
      temperature: {
        current: apiData.main?.temp,
        feelsLike: apiData.main?.feels_like,
        min: apiData.main?.temp_min,
        max: apiData.main?.temp_max
      },
      humidity: apiData.main?.humidity,
      pressure: apiData.main?.pressure,
      wind: {
        speed: apiData.wind?.speed,
        direction: apiData.wind?.deg,
        gust: apiData.wind?.gust
      },
      rainfall: {
        last1h: apiData.rain?.['1h'] || 0,
        last3h: apiData.rain?.['3h'] || 0,
        daily: 0
      },
      visibility: apiData.visibility,
      clouds: apiData.clouds?.all,
      condition: {
        main: apiData.weather?.[0]?.main,
        description: apiData.weather?.[0]?.description,
        icon: apiData.weather?.[0]?.icon
      },
      sunrise: apiData.sys?.sunrise,
      sunset: apiData.sys?.sunset
    },
    stormIndicators: {
      isStorm: ['Thunderstorm', 'Squall', 'Tornado'].includes(apiData.weather?.[0]?.main),
      stormSeverity: apiData.wind?.speed > 20 ? 'severe' : 
                     apiData.wind?.speed > 15 ? 'moderate' : 'minor',
      cycloneAlert: apiData.wind?.speed > 25 || apiData.wind?.gust > 30
    },
    source: {
      api: 'openweathermap',
      apiResponse: apiData
    },
    fetchedAt: new Date()
  };
};

/**
 * Transform WeatherAPI data to our schema
 */
const transformWeatherAPIData = (apiData, cityInfo) => {
  const current = apiData.current;
  
  return {
    location: {
      city: cityInfo.name,
      state: cityInfo.state,
      country: apiData.location?.country || 'IN',
      coordinates: {
        latitude: apiData.location?.lat || cityInfo.lat,
        longitude: apiData.location?.lon || cityInfo.lon
      }
    },
    data: {
      temperature: {
        current: current?.temp_c,
        feelsLike: current?.feelslike_c,
        min: null,
        max: null
      },
      humidity: current?.humidity,
      pressure: current?.pressure_mb,
      wind: {
        speed: current?.wind_kph / 3.6, // Convert to m/s
        direction: current?.wind_degree,
        gust: current?.gust_kph / 3.6
      },
      rainfall: {
        last1h: current?.precip_mm || 0,
        last3h: 0,
        daily: 0
      },
      visibility: current?.vis_km * 1000, // Convert to meters
      clouds: current?.cloud,
      condition: {
        main: current?.condition?.text,
        description: current?.condition?.text,
        icon: current?.condition?.icon
      },
      uvIndex: current?.uv,
      sunrise: null,
      sunset: null
    },
    stormIndicators: {
      isStorm: current?.condition?.text?.toLowerCase().includes('storm') ||
               current?.condition?.text?.toLowerCase().includes('thunder'),
      stormSeverity: current?.wind_kph > 70 ? 'severe' :
                     current?.wind_kph > 50 ? 'moderate' : 'minor',
      cycloneAlert: current?.wind_kph > 90 || current?.gust_kph > 100
    },
    source: {
      api: 'weatherapi',
      apiResponse: apiData
    },
    fetchedAt: new Date()
  };
};

/**
 * Fetch and store weather data for a city
 */
const fetchWeatherForCity = async (cityInfo) => {
  try {
    let weatherData = null;
    let apiUsed = null;
    
    // Try OpenWeather first
    if (config.openWeather.enabled) {
      try {
        const apiData = await fetchFromOpenWeather(cityInfo.lat, cityInfo.lon);
        weatherData = transformOpenWeatherData(apiData, cityInfo);
        apiUsed = 'openweathermap';
      } catch (error) {
        console.warn(`OpenWeather failed for ${cityInfo.name}, trying backup...`);
      }
    }
    
    // Try WeatherAPI as backup
    if (!weatherData && config.weatherAPI.enabled) {
      try {
        const apiData = await fetchFromWeatherAPI(cityInfo.lat, cityInfo.lon);
        weatherData = transformWeatherAPIData(apiData, cityInfo);
        apiUsed = 'weatherapi';
      } catch (error) {
        console.warn(`WeatherAPI failed for ${cityInfo.name}`);
      }
    }
    
    if (!weatherData) {
      throw new Error(`Failed to fetch weather data for ${cityInfo.name}`);
    }
    
    // Save to database
    const savedData = await WeatherData.create(weatherData);
    console.log(`Weather data saved for ${cityInfo.name} (API: ${apiUsed})`);
    
    return savedData;
  } catch (error) {
    console.error(`Error fetching weather for ${cityInfo.name}:`, error.message);
    throw error;
  }
};

/**
 * Fetch weather for all monitored cities
 */
const fetchAllCitiesWeather = async () => {
  console.log('Starting weather fetch for all cities...');
  const results = {
    successful: [],
    failed: []
  };
  
  for (const city of config.defaultCities) {
    try {
      const data = await fetchWeatherForCity(city);
      results.successful.push({
        city: city.name,
        id: data._id
      });
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.failed.push({
        city: city.name,
        error: error.message
      });
    }
  }
  
  console.log(`Weather fetch complete. Success: ${results.successful.length}, Failed: ${results.failed.length}`);
  return results;
};

/**
 * Get latest weather for a city
 */
const getLatestWeather = async (city) => {
  return await WeatherData.getLatestForCity(city);
};

/**
 * Get weather history for a city
 */
const getWeatherHistory = async (city, hours = 24) => {
  return await WeatherData.getHistoryForCity(city, hours);
};

/**
 * Get weather for multiple cities
 */
const getWeatherForCities = async (cities) => {
  const results = [];
  
  for (const city of cities) {
    const weather = await getLatestWeather(city);
    if (weather) {
      results.push(weather);
    }
  }
  
  return results;
};

/**
 * Start weather monitoring service
 */
const startWeatherMonitoring = () => {
  if (config.isMonitoring) {
    console.log('Weather monitoring is already running');
    return;
  }
  
  // Check if API keys are configured
  if (!config.openWeather.enabled && !config.weatherAPI.enabled) {
    console.warn('No weather API keys configured. Weather monitoring disabled.');
    console.warn('Please set OPENWEATHER_API_KEY or WEATHERAPI_KEY in your .env file');
    return;
  }
  
  console.log('Starting weather monitoring service...');
  console.log(`Poll interval: ${config.pollInterval} minutes`);
  
  // Fetch immediately on start
  fetchAllCitiesWeather();
  
  // Schedule periodic fetching
  // Cron format: minute hour day month day-of-week
  // Every 30 minutes
  weatherCronJob = cron.schedule(`*/${config.pollInterval} * * * *`, async () => {
    console.log('Running scheduled weather fetch...');
    await fetchAllCitiesWeather();
  });
  
  config.isMonitoring = true;
  console.log('Weather monitoring service started successfully');
};

/**
 * Stop weather monitoring service
 */
const stopWeatherMonitoring = () => {
  if (weatherCronJob) {
    weatherCronJob.stop();
    weatherCronJob = null;
    config.isMonitoring = false;
    console.log('Weather monitoring service stopped');
  }
};

/**
 * Check if monitoring is active
 */
const isMonitoring = () => {
  return config.isMonitoring;
};

/**
 * Get monitored cities list
 */
const getMonitoredCities = () => {
  return config.defaultCities;
};

/**
 * Add a city to monitoring list
 */
const addMonitoredCity = (cityInfo) => {
  const exists = config.defaultCities.find(c => 
    c.name.toLowerCase() === cityInfo.name.toLowerCase()
  );
  
  if (!exists) {
    config.defaultCities.push(cityInfo);
    return true;
  }
  
  return false;
};

/**
 * Get weather statistics
 */
const getWeatherStatistics = async () => {
  const stats = await WeatherData.aggregate([
    {
      $group: {
        _id: '$location.city',
        latestRecord: { $max: '$fetchedAt' },
        recordCount: { $sum: 1 },
        avgTemp: { $avg: '$data.temperature.current' },
        maxTemp: { $max: '$data.temperature.current' },
        minTemp: { $min: '$data.temperature.current' },
        avgHumidity: { $avg: '$data.humidity' },
        totalRainfall: { $sum: '$data.rainfall.last1h' }
      }
    },
    { $sort: { latestRecord: -1 } }
  ]);
  
  return stats;
};

/**
 * Get extreme weather conditions
 */
const getExtremeWeather = async () => {
  const latestData = await WeatherData.find()
    .sort({ fetchedAt: -1 })
    .limit(config.defaultCities.length);
  
  const extremeConditions = {
    highTemp: [],
    heavyRain: [],
    highWind: [],
    storms: []
  };
  
  for (const data of latestData) {
    const temp = data.data.temperature.current;
    const rain = data.data.rainfall.last1h;
    const wind = data.data.wind.speed;
    
    if (temp > 40) {
      extremeConditions.highTemp.push({
        city: data.location.city,
        value: temp,
        unit: '°C'
      });
    }
    
    if (rain > 10) {
      extremeConditions.heavyRain.push({
        city: data.location.city,
        value: rain,
        unit: 'mm/h'
      });
    }
    
    if (wind > 15) {
      extremeConditions.highWind.push({
        city: data.location.city,
        value: wind,
        unit: 'm/s'
      });
    }
    
    if (data.stormIndicators.isStorm || data.stormIndicators.cycloneAlert) {
      extremeConditions.storms.push({
        city: data.location.city,
        severity: data.stormIndicators.stormSeverity,
        cycloneAlert: data.stormIndicators.cycloneAlert
      });
    }
  }
  
  return extremeConditions;
};

module.exports = {
  // Core functions
  fetchWeatherForCity,
  fetchAllCitiesWeather,
  getLatestWeather,
  getWeatherHistory,
  getWeatherForCities,
  
  // Monitoring control
  startWeatherMonitoring,
  stopWeatherMonitoring,
  isMonitoring,
  
  // Configuration
  getMonitoredCities,
  addMonitoredCity,
  
  // Analytics
  getWeatherStatistics,
  getExtremeWeather,
  
  // Raw API access
  fetchFromOpenWeather,
  fetchFromWeatherAPI
};

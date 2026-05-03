/**
 * Prediction Service
 * Rule-based disaster prediction engine
 * Analyzes weather parameters to determine risk levels
 * Architecture designed to support future AI/ML integration
 */

const WeatherData = require('../models/WeatherData');
const Disaster = require('../models/Disaster');
const Alert = require('../models/Alert');
const cron = require('node-cron');

// Risk levels
const RISK_LEVELS = {
  SAFE: 'SAFE',
  WATCH: 'WATCH',
  WARNING: 'WARNING',
  DANGER: 'DANGER'
};

// Disaster types
const DISASTER_TYPES = {
  FLOOD: 'flood',
  HEATWAVE: 'heatwave',
  STORM: 'storm',
  CYCLONE: 'cyclone',
  DROUGHT: 'drought',
  LANDSLIDE: 'landslide'
};

// Prediction rules configuration
const predictionRules = {
  // Flood prediction rules
  flood: {
    name: 'Flood Risk',
    parameters: ['rainfall', 'humidity', 'pressure'],
    thresholds: {
      [RISK_LEVELS.SAFE]: {
        rainfall: { max: 7.5 }, // mm/hour
        humidity: { max: 70 },
        pressure: { min: 1013 }
      },
      [RISK_LEVELS.WATCH]: {
        rainfall: { min: 7.5, max: 15 },
        humidity: { min: 70, max: 80 },
        pressure: { min: 1008, max: 1013 }
      },
      [RISK_LEVELS.WARNING]: {
        rainfall: { min: 15, max: 30 },
        humidity: { min: 80, max: 90 },
        pressure: { min: 1000, max: 1008 }
      },
      [RISK_LEVELS.DANGER]: {
        rainfall: { min: 30 },
        humidity: { min: 90 },
        pressure: { max: 1000 }
      }
    },
    // Consecutive readings required for escalation
    consecutiveReadings: {
      [RISK_LEVELS.WATCH]: 2,
      [RISK_LEVELS.WARNING]: 3,
      [RISK_LEVELS.DANGER]: 3
    }
  },
  
  // Heatwave prediction rules
  heatwave: {
    name: 'Heatwave Risk',
    parameters: ['temperature', 'humidity'],
    thresholds: {
      [RISK_LEVELS.SAFE]: {
        temperature: { max: 35 },
        heatIndex: { max: 40 }
      },
      [RISK_LEVELS.WATCH]: {
        temperature: { min: 35, max: 40 },
        heatIndex: { min: 40, max: 45 }
      },
      [RISK_LEVELS.WARNING]: {
        temperature: { min: 40, max: 45 },
        heatIndex: { min: 45, max: 54 }
      },
      [RISK_LEVELS.DANGER]: {
        temperature: { min: 45 },
        heatIndex: { min: 54 }
      }
    },
    consecutiveReadings: {
      [RISK_LEVELS.WATCH]: 2,
      [RISK_LEVELS.WARNING]: 3,
      [RISK_LEVELS.DANGER]: 3
    }
  },
  
  // Storm prediction rules
  storm: {
    name: 'Storm Risk',
    parameters: ['windSpeed', 'pressure', 'rainfall'],
    thresholds: {
      [RISK_LEVELS.SAFE]: {
        windSpeed: { max: 10 }, // m/s
        pressure: { min: 1010 },
        rainfall: { max: 5 }
      },
      [RISK_LEVELS.WATCH]: {
        windSpeed: { min: 10, max: 17 },
        pressure: { min: 1005, max: 1010 },
        rainfall: { min: 5, max: 10 }
      },
[RISK_LEVELS.WARNING]: {
        windSpeed: { min: 17, max: 24 },
        pressure: { min: 990, max: 1005 },
        rainfall: { min: 10, max: 20 }
      },
      [RISK_LEVELS.DANGER]: {
        windSpeed: { min: 24 },
        pressure: { max: 990 },
        rainfall: { min: 20 }
      }
    },
    consecutiveReadings: {
      [RISK_LEVELS.WATCH]: 1,
      [RISK_LEVELS.WARNING]: 2,
      [RISK_LEVELS.DANGER]: 2
    }
  },
  
  // Cyclone prediction rules
  cyclone: {
    name: 'Cyclone Risk',
    parameters: ['windSpeed', 'pressure', 'windGust'],
    thresholds: {
      [RISK_LEVELS.SAFE]: {
        windSpeed: { max: 17 },
        pressure: { min: 1000 },
        windGust: { max: 25 }
      },
      [RISK_LEVELS.WATCH]: {
        windSpeed: { min: 17, max: 24 },
        pressure: { min: 995, max: 1000 },
        windGust: { min: 25, max: 35 }
      },
      [RISK_LEVELS.WARNING]: {
        windSpeed: { min: 1, max: 32 },
        pressure: { min: 980, max: 1100 },
        windGust: { min: 1, max: 50 }
      },
      [RISK_LEVELS.DANGER]: {
        windSpeed: { min: 32 },
        pressure: { max: 980 },
        windGust: { min: 50 }
      }
    },
    consecutiveReadings: {
      [RISK_LEVELS.WATCH]: 1,
      [RISK_LEVELS.WARNING]: 1,
      [RISK_LEVELS.DANGER]: 1
    }
  },
  
  // Drought prediction rules
  drought: {
    name: 'Drought Risk',
    parameters: ['rainfall', 'humidity', 'temperature'],
    thresholds: {
      [RISK_LEVELS.SAFE]: {
        rainfall: { min: 2 },
        humidity: { min: 40 },
        temperature: { max: 35 }
      },
      [RISK_LEVELS.WATCH]: {
        rainfall: { min: 0.5, max: 2 },
        humidity: { min: 30, max: 40 },
        temperature: { min: 35, max: 38 }
      },
      [RISK_LEVELS.WARNING]: {
        rainfall: { min: 0.1, max: 0.5 },
        humidity: { min: 20, max: 30 },
        temperature: { min: 38, max: 42 }
      },
      [RISK_LEVELS.DANGER]: {
        rainfall: { max: 0.1 },
        humidity: { max: 20 },
        temperature: { min: 42 }
      }
    },
    // Drought requires longer periods
    consecutiveReadings: {
      [RISK_LEVELS.WATCH]: 7,  // 7 days
      [RISK_LEVELS.WARNING]: 14, // 14 days
      [RISK_LEVELS.DANGER]: 30  // 30 days
    }
  },
  
  // Landslide prediction rules
  landslide: {
    name: 'Landslide Risk',
    parameters: ['rainfall', 'humidity'],
    thresholds: {
      [RISK_LEVELS.SAFE]: {
        rainfall: { max: 10 },
        humidity: { max: 75 }
      },
      [RISK_LEVELS.WATCH]: {
        rainfall: { min: 10, max: 20 },
        humidity: { min: 75, max: 85 }
      },
      [RISK_LEVELS.WARNING]: {
        rainfall: { min: 20, max: 30 },
        humidity: { min: 85, max: 90 }
      },
      [RISK_LEVELS.DANGER]: {
        rainfall: { min: 30 },
        humidity: { min: 90 }
      }
    },
    consecutiveReadings: {
      [RISK_LEVELS.WATCH]: 3,
      [RISK_LEVELS.WARNING]: 4,
      [RISK_LEVELS.DANGER]: 5
    }
  }
};

// Store prediction history for consecutive readings tracking
const predictionHistory = new Map();

// Store cron job reference
let predictionCronJob = null;
let isRunning = false;

/**
 * Calculate heat index from temperature and humidity
 */
const calculateHeatIndex = (temp, humidity) => {
  if (temp < 27) return temp;
  
  // Simplified heat index calculation
  const T = temp;
  const R = humidity;
  
  const heatIndex = -8.784694755 + 
    1.61139411 * T + 
    2.338548839 * R + 
    -0.14611605 * T * R + 
    -0.012308094 * Math.pow(T, 2) + 
    -0.016424828 * Math.pow(R, 2) + 
    0.002211732 * Math.pow(T, 2) * R + 
    0.00072546 * T * Math.pow(R, 2) + 
    -0.000003582 * Math.pow(T, 2) * Math.pow(R, 2);
  
  return Math.round(heatIndex * 10) / 10;
};

/**
 * Extract parameters from weather data
 */
const extractParameters = (weatherData) => {
  const data = weatherData.data;
  
  return {
    temperature: data.temperature?.current,
    humidity: data.humidity,
    pressure: data.pressure,
    windSpeed: data.wind?.speed,
    windGust: data.wind?.gust,
    rainfall: data.rainfall?.last1h || 0,
    heatIndex: calculateHeatIndex(
      data.temperature?.current,
      data.humidity
    )
  };
};

/**
 * Check if parameter meets threshold condition
 */
const meetsThreshold = (value, threshold) => {
  if (value === undefined || value === null) return false;
  
  if (threshold.min !== undefined && value < threshold.min) return false;
  if (threshold.max !== undefined && value > threshold.max) return false;
  
  return true;
};

/**
 * Evaluate single rule against weather parameters
 */
const evaluateRule = (rule, parameters) => {
  const results = {};
  let matchCount = 0;
  let totalParameters = 0;
  
  for (const [param, threshold] of Object.entries(rule)) {
    const value = parameters[param];
    totalParameters++;
    
    if (meetsThreshold(value, threshold)) {
      matchCount++;
      results[param] = {
        value,
        threshold,
        met: true
      };
    } else {
      results[param] = {
        value,
        threshold,
        met: false
      };
    }
  }
  
  // Rule matches if at least 2/3 of parameters meet thresholds
  const matchRatio = matchCount / totalParameters;
  const isMatch = matchRatio >= 0.66;
  
  return {
    isMatch,
    matchRatio,
    matchCount,
    totalParameters,
    details: results
  };
};

/**
 * Get risk level for a disaster type based on weather data
 */
const assessRisk = (disasterType, weatherData) => {
  const config = predictionRules[disasterType];
  if (!config) return null;
  
  const parameters = extractParameters(weatherData);
  const riskAssessment = {
    type: disasterType,
    name: config.name,
    currentLevel: RISK_LEVELS.SAFE,
    parameters,
    rules: {}
  };
  
  // Check each risk level from highest to lowest
  const riskLevels = [RISK_LEVELS.DANGER, RISK_LEVELS.WARNING, RISK_LEVELS.WATCH];
  
  for (const level of riskLevels) {
    const rule = config.thresholds[level];
    const evaluation = evaluateRule(rule, parameters);
    
    riskAssessment.rules[level] = evaluation;
    
    if (evaluation.isMatch) {
      riskAssessment.currentLevel = level;
      break;
    }
  }
  
  return riskAssessment;
};

/**
 * Check consecutive readings for risk escalation
 */
const checkConsecutiveReadings = (city, disasterType, riskLevel) => {
  const config = predictionRules[disasterType];
  const requiredReadings = config.consecutiveReadings[riskLevel] || 1;
  
  const key = `${city}_${disasterType}`;
  const history = predictionHistory.get(key) || [];
  
  // Add current reading
  history.push({
    riskLevel,
    timestamp: new Date()
  });
  
  // Keep only recent history (last 50 readings)
  if (history.length > 50) {
    history.shift();
  }
  
  predictionHistory.set(key, history);
  
  // Count consecutive readings at or above this risk level
  let consecutiveCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const reading = history[i];
    const readingLevel = reading.riskLevel;
    
    // Check if reading is at or above current risk level
    const levelOrder = [RISK_LEVELS.SAFE, RISK_LEVELS.WATCH, RISK_LEVELS.WARNING, RISK_LEVELS.DANGER];
    const currentIndex = levelOrder.indexOf(riskLevel);
    const readingIndex = levelOrder.indexOf(readingLevel);
    
    if (readingIndex >= currentIndex) {
      consecutiveCount++;
    } else {
      break;
    }
  }
  
  return {
    consecutiveCount,
    requiredReadings,
    canEscalate: consecutiveCount >= requiredReadings
  };
};

/**
 * Predict disasters for a city based on weather data
 */
const predictForCity = async (weatherData) => {
  const city = weatherData.location.city;
  const predictions = [];
  
  for (const disasterType of Object.keys(predictionRules)) {
    const assessment = assessRisk(disasterType, weatherData);
    
    if (assessment && assessment.currentLevel !== RISK_LEVELS.SAFE) {
      // Check consecutive readings
      const consecutiveCheck = checkConsecutiveReadings(
        city,
        disasterType,
        assessment.currentLevel
      );
      
      if (consecutiveCheck.canEscalate) {
        predictions.push({
          ...assessment,
          city,
          consecutiveReadings: consecutiveCheck.consecutiveCount,
          timestamp: new Date()
        });
      }
    }
  }
  
  return predictions;
};

/**
 * Run prediction for all cities
 */
const runPrediction = async () => {
  console.log('Running disaster prediction engine...');
  
  try {
    // Get latest weather data for all cities
    const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 
                    'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Surat'];
    
    const allPredictions = [];
    
    for (const city of cities) {
      const weatherData = await WeatherData.getLatestForCity(city);
      
      if (weatherData) {
        const predictions = await predictForCity(weatherData);
        allPredictions.push(...predictions);
      }
    }
    
    console.log(`Prediction complete. Found ${allPredictions.length} risk assessments.`);
    
    // Return predictions for alert generation
    return allPredictions;
  } catch (error) {
    console.error('Prediction error:', error);
    throw error;
  }
};

/**
 * Get current risk status for a city
 */
const getCityRiskStatus = async (city) => {
  const weatherData = await WeatherData.getLatestForCity(city);
  
  if (!weatherData) {
    return null;
  }
  
  const risks = {};
  
  for (const disasterType of Object.keys(predictionRules)) {
    const assessment = assessRisk(disasterType, weatherData);
    if (assessment) {
      risks[disasterType] = {
        level: assessment.currentLevel,
        parameters: assessment.parameters
      };
    }
  }
  
  return {
    city,
    timestamp: new Date(),
    risks,
    overallRisk: calculateOverallRisk(risks)
  };
};

/**
 * Calculate overall risk level from individual risks
 */
const calculateOverallRisk = (risks) => {
  const levels = Object.values(risks).map(r => r.level);
  
  if (levels.includes(RISK_LEVELS.DANGER)) return RISK_LEVELS.DANGER;
  if (levels.includes(RISK_LEVELS.WARNING)) return RISK_LEVELS.WARNING;
  if (levels.includes(RISK_LEVELS.WATCH)) return RISK_LEVELS.WATCH;
  
  return RISK_LEVELS.SAFE;
};

/**
 * Get all cities risk status
 */
const getAllCitiesRiskStatus = async () => {
  const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata',
                  'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Surat',
                  'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane'];
  
  const results = [];
  
  for (const city of cities) {
    const status = await getCityRiskStatus(city);
    if (status) {
      results.push(status);
    }
  }
  
  return results.sort((a, b) => {
    const riskOrder = { [RISK_LEVELS.DANGER]: 4, [RISK_LEVELS.WARNING]: 3, 
                        [RISK_LEVELS.WATCH]: 2, [RISK_LEVELS.SAFE]: 1 };
    return riskOrder[b.overallRisk] - riskOrder[a.overallRisk];
  });
};

/**
 * Get prediction rules (for admin configuration)
 */
const getPredictionRules = () => {
  return predictionRules;
};

/**
 * Update prediction rule (for admin configuration)
 */
const updatePredictionRule = (disasterType, riskLevel, thresholds) => {
  if (predictionRules[disasterType] && predictionRules[disasterType].thresholds[riskLevel]) {
    predictionRules[disasterType].thresholds[riskLevel] = {
      ...predictionRules[disasterType].thresholds[riskLevel],
      ...thresholds
    };
    return true;
  }
  return false;
};

/**
 * Get prediction statistics
 */
const getPredictionStatistics = async () => {
  const allStatuses = await getAllCitiesRiskStatus();
  
  const stats = {
    totalCities: allStatuses.length,
    safe: allStatuses.filter(s => s.overallRisk === RISK_LEVELS.SAFE).length,
    watch: allStatuses.filter(s => s.overallRisk === RISK_LEVELS.WATCH).length,
    warning: allStatuses.filter(s => s.overallRisk === RISK_LEVELS.WARNING).length,
    danger: allStatuses.filter(s => s.overallRisk === RISK_LEVELS.DANGER).length,
    byDisasterType: {}
  };
  
  // Count by disaster type
  for (const status of allStatuses) {
    for (const [type, risk] of Object.entries(status.risks)) {
      if (!stats.byDisasterType[type]) {
        stats.byDisasterType[type] = { 
          [RISK_LEVELS.SAFE]: 0, 
          [RISK_LEVELS.WATCH]: 0, 
          [RISK_LEVELS.WARNING]: 0, 
          [RISK_LEVELS.DANGER]: 0 
        };
      }
      stats.byDisasterType[type][risk.level]++;
    }
  }
  
  return stats;
};

/**
 * Start prediction engine
 */
const startPredictionEngine = () => {
  if (isRunning) {
    console.log('Prediction engine is already running');
    return;
  }
  
  console.log('Starting disaster prediction engine...');
  
  // Run immediately
  runPrediction();
  
  // Schedule to run every 30 minutes
  predictionCronJob = cron.schedule('*/30 * * * *', async () => {
    console.log('Running scheduled prediction...');
    await runPrediction();
  });
  
  isRunning = true;
  console.log('Prediction engine started successfully');
};

/**
 * Stop prediction engine
 */
const stopPredictionEngine = () => {
  if (predictionCronJob) {
    predictionCronJob.stop();
    predictionCronJob = null;
    isRunning = false;
    console.log('Prediction engine stopped');
  }
};

/**
 * Check if engine is running
 */
const isEngineRunning = () => {
  return isRunning;
};

module.exports = {
  // Core prediction functions
  assessRisk,
  predictForCity,
  runPrediction,
  
  // Status queries
  getCityRiskStatus,
  getAllCitiesRiskStatus,
  
  // Configuration
  getPredictionRules,
  updatePredictionRule,
  RISK_LEVELS,
  DISASTER_TYPES,
  
  // Analytics
  getPredictionStatistics,
  
  // Engine control
  startPredictionEngine,
  stopPredictionEngine,
  isEngineRunning,
  
  // Utilities
  calculateHeatIndex,
  calculateOverallRisk
};

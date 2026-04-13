/**
 * Weather Data Model
 * Stores weather snapshots from external APIs
 */

const mongoose = require('mongoose');

const weatherDataSchema = new mongoose.Schema({
  // Location information
  location: {
    city: {
      type: String,
      required: true,
      index: true
    },
    state: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: 'India'
    },
    coordinates: {
      latitude: {
        type: Number,
        required: true
      },
      longitude: {
        type: Number,
        required: true
      }
    }
  },
  
  // Weather data from API
  data: {
    // Temperature in Celsius
    temperature: {
      current: Number,
      feelsLike: Number,
      min: Number,
      max: Number
    },
    
    // Humidity percentage
    humidity: {
      type: Number,
      min: 0,
      max: 100
    },
    
    // Pressure in hPa
    pressure: {
      type: Number
    },
    
    // Wind data
    wind: {
      speed: Number, // m/s
      direction: Number, // degrees
      gust: Number // m/s
    },
    
    // Rainfall (mm in last 1h or 3h)
    rainfall: {
      last1h: { type: Number, default: 0 },
      last3h: { type: Number, default: 0 },
      daily: { type: Number, default: 0 }
    },
    
    // Visibility in meters
    visibility: {
      type: Number
    },
    
    // Cloud coverage percentage
    clouds: {
      type: Number,
      min: 0,
      max: 100
    },
    
    // Weather condition
    condition: {
      main: String, // e.g., 'Rain', 'Clouds', 'Clear'
      description: String, // e.g., 'light rain'
      icon: String // Weather icon code
    },
    
    // UV Index
    uvIndex: {
      type: Number
    },
    
    // Sunrise and sunset (Unix timestamps)
    sunrise: Number,
    sunset: Number
  },
  
  // Storm/Cyclone indicators
  stormIndicators: {
    isStorm: {
      type: Boolean,
      default: false
    },
    stormSeverity: {
      type: String,
      enum: ['none', 'minor', 'moderate', 'severe', 'extreme'],
      default: 'none'
    },
    cycloneAlert: {
      type: Boolean,
      default: false
    },
    cycloneName: String,
    cycloneCategory: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  
  // Source information
  source: {
    api: {
      type: String,
      enum: ['openweathermap', 'weatherapi', 'accuweather', 'manual'],
      default: 'openweathermap'
    },
    apiResponse: {
      type: mongoose.Schema.Types.Mixed,
      select: false // Don't include in normal queries
    }
  },
  
  // Timestamp when data was fetched
  fetchedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Data freshness (calculated)
  isStale: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
weatherDataSchema.index({ 'location.city': 1, fetchedAt: -1 });
weatherDataSchema.index({ 'stormIndicators.isStorm': 1 });
weatherDataSchema.index({ 'stormIndicators.cycloneAlert': 1 });

// TTL index to auto-delete old data (keep for 30 days)
weatherDataSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Static method to get latest weather for a city
weatherDataSchema.statics.getLatestForCity = async function(city) {
  return this.findOne({ 'location.city': city })
    .sort({ fetchedAt: -1 })
    .limit(1);
};

// Static method to get weather history for a city
weatherDataSchema.statics.getHistoryForCity = async function(city, hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.find({
    'location.city': city,
    fetchedAt: { $gte: cutoffTime }
  }).sort({ fetchedAt: 1 });
};

// Method to check if data is stale (older than 1 hour)
weatherDataSchema.methods.checkIfStale = function() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  this.isStale = this.fetchedAt < oneHourAgo;
  return this.isStale;
};

// Virtual for heat index calculation
weatherDataSchema.virtual('heatIndex').get(function() {
  const T = this.data.temperature.current;
  const R = this.data.humidity;
  
  if (T === undefined || R === undefined) return null;
  
  // Simplified heat index formula
  // Only valid for temperatures >= 27°C
  if (T < 27) return T;
  
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
});

module.exports = mongoose.model('WeatherData', weatherDataSchema);

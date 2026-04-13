const Alert = require('../models/Alert');
const EmergencyRequest = require('../models/EmergencyRequest');
const Resource = require('../models/Resource');
const Shelter = require('../models/Shelter');
const WeatherData = require('../models/WeatherData');
const { MemoryCache } = require('../utils/cache');

const analyticsCache = new MemoryCache();

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getSystemOverview = async (days = 30) => analyticsCache.remember(`system-overview:${days}`, 60 * 1000, async () => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [alerts, requests, resources, shelters] = await Promise.all([
    Alert.countDocuments({ createdAt: { $gte: since } }),
    EmergencyRequest.countDocuments({ createdAt: { $gte: since } }),
    Resource.countDocuments(),
    Shelter.countDocuments({ status: 'active' })
  ]);

  return {
    days,
    alertsCreated: alerts,
    emergencyRequests: requests,
    totalResources: resources,
    activeShelters: shelters
  };
});

const getWeatherTrendSummary = async (city, days = 7) => {
  const since = startOfDay(Date.now() - days * 24 * 60 * 60 * 1000);

  return WeatherData.aggregate([
    {
      $match: {
        'location.city': city,
        fetchedAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$fetchedAt' },
          month: { $month: '$fetchedAt' },
          day: { $dayOfMonth: '$fetchedAt' }
        },
        avgTemp: { $avg: '$data.temperature.current' },
        avgHumidity: { $avg: '$data.humidity' },
        rainfall: { $avg: '$data.rainfall.daily' }
      }
    },
    {
      $sort: {
        '_id.year': 1,
        '_id.month': 1,
        '_id.day': 1
      }
    }
  ]);
};

module.exports = {
  getSystemOverview,
  getWeatherTrendSummary
};

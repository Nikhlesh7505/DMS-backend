/**
 * Dashboard Controller
 * Handles dashboard data aggregation and analytics
 */

const User = require('../models/User');
const Disaster = require('../models/Disaster');
const Alert = require('../models/Alert');
const Shelter = require('../models/Shelter');
const EmergencyRequest = require('../models/EmergencyRequest');
const Resource = require('../models/Resource');
const RescueTask = require('../models/RescueTask');
const WeatherData = require('../models/WeatherData');
const Donation = require('../models/Donation');
const predictionService = require('../services/prediction.service');
const alertService = require('../services/alert.service');
const analyticsService = require('../services/analytics.service');
const notificationService = require('../services/notification.service');
const { asyncHandler } = require('../middleware/error.middleware');

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/**
 * @desc    Get admin dashboard data
 * @route   GET /api/dashboard/admin
 * @access  Private/Admin
 */
const getAdminDashboard = asyncHandler(async (req, res) => {
  // Get counts
  const [
    totalUsers,
    pendingApprovals,
    activeDisasters,
    activeAlerts,
    pendingRequests,
    activeTasks,
    totalResources,
    lowStockResources,
    totalDonations
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ approvalStatus: 'pending' }),
    Disaster.countDocuments({ status: { $in: ['monitoring', 'active', 'contained'] } }),
    Alert.countDocuments({ status: 'active', 'timeline.expiresAt': { $gt: new Date() } }),
    EmergencyRequest.countDocuments({ status: { $in: ['pending', 'acknowledged'] } }),
    RescueTask.countDocuments({ status: { $in: ['assigned', 'in_progress', 'en_route', 'on_site'] } }),
    Resource.countDocuments(),
    Resource.countDocuments({ 'quantity.available': { $lte: 10, $gt: 0 } }),
    Donation.countDocuments()
  ]);

  // Get recent data
  const [
    recentAlerts,
    recentDisasters,
    recentRequests,
    riskStatus,
    weatherStats
  ] = await Promise.all([
    Alert.find({ status: 'active' })
      .sort({ 'timeline.issuedAt': -1 })
      .limit(5)
      .populate('issuedBy', 'name'),
    Disaster.find({ status: { $in: ['monitoring', 'active'] } })
      .sort({ 'timeline.detectedAt': -1 })
      .limit(5),
    EmergencyRequest.find()
      .sort({ 'timeline.reportedAt': -1 })
      .limit(5)
      .populate('citizen', 'name'),
    predictionService.getAllCitiesRiskStatus(),
    WeatherData.aggregate([
      { $sort: { fetchedAt: -1 } },
      { $group: { _id: '$location.city', latest: { $first: '$$ROOT' } } },
      { $limit: 10 }
    ])
  ]);

  // Get statistics
  const disasterStats = await Disaster.getStatistics();
  const requestStats = await EmergencyRequest.getStatistics();
  const resourceStats = await Resource.getStatistics();
  const overview = await analyticsService.getSystemOverview(30);

  res.json({
    success: true,
    data: {
      counts: {
        totalUsers,
        pendingApprovals,
        activeDisasters,
        activeAlerts,
        pendingRequests,
        activeTasks,
        totalResources,
        lowStockResources,
        totalDonations
      },
      recent: {
        alerts: recentAlerts,
        disasters: recentDisasters,
        requests: recentRequests
      },
      riskStatus: riskStatus.slice(0, 5),
      weather: weatherStats.map(w => w.latest),
      overview,
      statistics: {
        disasters: disasterStats,
        requests: requestStats,
        resources: resourceStats
      }
    }
  });
});

/**
 * @desc    Get NGO/Rescue Team dashboard data
 * @route   GET /api/dashboard/responder
 * @access  Private/Responder
 */
const getResponderDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get assigned tasks
  const myTasks = await RescueTask.getPendingForTeam(userId)
    .populate('disaster', 'name type location');

  const activeTasks = await RescueTask.find({
    'assignment.team': userId,
    status: { $in: ['in_progress', 'en_route', 'on_site'] }
  }).populate('disaster', 'name type');

  // Get all pending requests that have not been accepted by another responder
  const pendingRequests = await EmergencyRequest.find({
    status: 'pending',
    $or: [
      { 'assignment.assignedTo': { $exists: false } },
      { 'assignment.assignedTo': null }
    ]
  })
    .populate('citizen', 'name phone')
    .sort({ priority: -1, 'timeline.reportedAt': 1 });

  // Get assigned emergency requests
  const assignedRequests = await EmergencyRequest.getAssignedTo(userId)
    .populate('citizen', 'name phone');

  // Get my resources
  const myResources = await Resource.getByOwner(userId);

  const relevantAlerts = await alertService.getActiveAlertsForUser(userId);
  const notifications = await notificationService.getUserNotifications(userId, { limit: 5 });

  // Get active disasters
  const activeDisasters = await Disaster.getActive();

  res.json({
    success: true,
    data: {
      tasks: {
        pending: myTasks,
        active: activeTasks,
        total: myTasks.length + activeTasks.length
      },
      requests: [...assignedRequests, ...pendingRequests],
      resources: myResources,
      alerts: relevantAlerts,
      notifications,
      disasters: activeDisasters
    }
  });
});

/**
 * @desc    Get citizen dashboard data
 * @route   GET /api/dashboard/citizen
 * @access  Private
 */
const getCitizenDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userCity = req.user.location?.city;

  // Get my emergency requests
  const myRequests = await EmergencyRequest.getByCitizen(userId);

  // Get alerts for my city
  const myAlerts = await alertService.getActiveAlertsForUser(userId);

  // Get active disasters in my area
  const myDisasters = userCity
    ? await Disaster.getByCity(userCity)
    : await Disaster.getActive().limit(5);

  // Get current weather for my city
  const currentWeather = userCity
    ? await WeatherData.getLatestForCity(userCity)
    : null;

  // Get risk status for my city
  const myRiskStatus = userCity
    ? await predictionService.getCityRiskStatus(userCity)
    : null;

  const notifications = await notificationService.getUserNotifications(userId, { limit: 5 });

  let nearbyShelters = [];
  const longitude = toFiniteNumber(req.user.location?.coordinates?.longitude);
  const latitude = toFiniteNumber(req.user.location?.coordinates?.latitude);

  if (typeof longitude === 'number' && typeof latitude === 'number') {
    nearbyShelters = await Shelter.findNearby(
      longitude,
      latitude,
      50000,
      { status: 'active' }
    );
  } else if (userCity) {
    nearbyShelters = await Shelter.find({
      'address.city': userCity,
      status: 'active'
    })
      .sort({ 'capacity.available': -1, name: 1 })
      .limit(5);
  }

  res.json({
    success: true,
    data: {
      requests: myRequests,
      alerts: myAlerts,
      disasters: myDisasters,
      weather: currentWeather,
      riskStatus: myRiskStatus,
      notifications,
      nearbyShelters
    }
  });
});

/**
 * @desc    Get public dashboard data
 * @route   GET /api/dashboard/public
 * @access  Public
 */
const getPublicDashboard = asyncHandler(async (req, res) => {
  // Get active alerts
  const activeAlerts = await Alert.getActive()
    .limit(10);

  // Get active disasters
  const activeDisasters = await Disaster.getActive()
    .limit(5);

  // Get weather for major cities
  const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata'];
  const weatherData = [];
  
  for (const city of cities) {
    const weather = await WeatherData.getLatestForCity(city);
    if (weather) weatherData.push(weather);
  }

  // Get risk status summary
  const riskSummary = await predictionService.getPredictionStatistics();

  // Get statistics
  const stats = {
    activeDisasters: await Disaster.countDocuments({ 
      status: { $in: ['monitoring', 'active', 'contained'] } 
    }),
    activeAlerts: await Alert.countDocuments({ 
      status: 'active',
      'timeline.expiresAt': { $gt: new Date() }
    }),
    totalResponses: await EmergencyRequest.countDocuments({ 
      status: 'resolved' 
    }),
    monitoredCities: cities.length
  };

  res.json({
    success: true,
    data: {
      alerts: activeAlerts,
      disasters: activeDisasters,
      weather: weatherData,
      riskSummary,
      statistics: stats
    }
  });
});

/**
 * @desc    Get analytics data
 * @route   GET /api/dashboard/analytics
 * @access  Private/Admin
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Requests over time
  const requestsOverTime = await EmergencyRequest.aggregate([
    {
      $match: {
        'timeline.reportedAt': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$timeline.reportedAt' },
          month: { $month: '$timeline.reportedAt' },
          day: { $dayOfMonth: '$timeline.reportedAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);

  // Disasters by type
  const disastersByType = await Disaster.aggregate([
    {
      $match: {
        'timeline.detectedAt': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);

  // Response time analysis
  const responseTimes = await EmergencyRequest.aggregate([
    {
      $match: {
        status: 'resolved',
        'timeline.resolvedAt': { $gte: startDate }
      }
    },
    {
      $project: {
        responseTime: {
          $divide: [
            { $subtract: ['$timeline.resolvedAt', '$timeline.reportedAt'] },
            1000 * 60 * 60 // Convert to hours
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        avgResponseTime: { $avg: '$responseTime' },
        minResponseTime: { $min: '$responseTime' },
        maxResponseTime: { $max: '$responseTime' }
      }
    }
  ]);

  // Resource utilization
  const resourceUtilization = await Resource.aggregate([
    {
      $project: {
        name: 1,
        category: 1,
        utilizationRate: {
          $multiply: [
            {
              $divide: [
                { $add: ['$quantity.deployed', '$quantity.reserved'] },
                { $cond: [{ $eq: ['$quantity.total', 0] }, 1, '$quantity.total'] }
              ]
            },
            100
          ]
        }
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      requestsOverTime,
      disastersByType,
      responseTimes: responseTimes[0] || {},
      resourceUtilization
    }
  });
});

/**
 * @desc    Get map data
 * @route   GET /api/dashboard/map-data
 * @access  Public
 */
const getMapData = asyncHandler(async (req, res) => {
  // Get active disasters with coordinates
  const disasters = await Disaster.find({
    status: { $in: ['monitoring', 'active', 'contained'] },
    'location.coordinates.latitude': { $exists: true }
  }).select('name type severity location status');

  // Get active alerts
  const alerts = await Alert.find({
    status: 'active',
    'targetLocation.coordinates.latitude': { $exists: true }
  }).select('title type severity targetLocation');

  // Get active emergency requests
  const requests = await EmergencyRequest.find({
    status: { $in: ['pending', 'acknowledged', 'assigned', 'in_progress'] },
    'location.coordinates.latitude': { $exists: true }
  }).select('type priority status location');

  // Get rescue team locations
  const rescueTeams = await User.find({
    role: 'rescue_team',
    approvalStatus: 'approved',
    availabilityStatus: 'available',
    'location.coordinates.latitude': { $exists: true }
  }).select('name organization location availabilityStatus');

  res.json({
    success: true,
    data: {
      disasters,
      alerts,
      requests,
      rescueTeams
    }
  });
});

/**
 * @desc    Get recent donors for landing page (public)
 * @route   GET /api/dashboard/recent-donors
 * @access  Public
 */
const getRecentDonors = asyncHandler(async (req, res) => {
  // Fetch recent donations that have been accepted/completed — show donor generosity
  const donations = await Donation.find({
    status: { $in: ['Accepted', 'Assigned', 'In Process', 'In-Progress', 'Completed'] }
  })
    .populate('userId', 'name')
    .sort({ createdAt: -1 })
    .limit(12)
    .select('userId category city quantity unit description createdAt status');

  // Map to safe public data (first name only for privacy)
  const donors = donations.map(d => ({
    name: d.userId?.name?.split(' ')[0] || 'Anonymous',
    city: d.city || 'India',
    category: d.category,
    quantity: d.quantity,
    unit: d.unit,
    description: d.description?.substring(0, 60),
    time: d.createdAt,
    status: d.status
  }));

  // Also get total count and total completed for stats
  const [totalDonations, completedDonations] = await Promise.all([
    Donation.countDocuments(),
    Donation.countDocuments({ status: 'Completed' })
  ]);

  res.json({
    success: true,
    data: {
      donors,
      stats: {
        total: totalDonations,
        completed: completedDonations
      }
    }
  });
});

module.exports = {
  getAdminDashboard,
  getResponderDashboard,
  getCitizenDashboard,
  getPublicDashboard,
  getAnalytics,
  getMapData,
  getRecentDonors
};

/**
 * Alert Service
 * Automated alert generation and notification delivery
 */

const Alert = require('../models/Alert');
const Disaster = require('../models/Disaster');
const Notification = require('../models/Notification');
const User = require('../models/User');
const WeatherData = require('../models/WeatherData');
const predictionService = require('./prediction.service');
const notificationService = require('./notification.service');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

// Alert configuration
const alertConfig = {
  // Auto-generate alerts from predictions
  autoGenerate: true,
  
  // Minimum severity to auto-generate alert
  minSeverity: 'WARNING',
  
  // Default alert expiry (hours)
  defaultExpiryHours: 24,
  
  // Notification channels
  channels: {
    dashboard: true,
    email: !!process.env.SMTP_HOST,
    sms: false, // Requires Twilio setup
    push: false // Requires Firebase setup
  },
  
  // Alert templates
  templates: {
    flood: {
      title: 'Flood Warning - {city}',
      message: 'Heavy rainfall detected in {city}. Risk level: {riskLevel}. Please take necessary precautions.',
      instructions: {
        before: ['Move to higher ground', 'Prepare emergency kit', 'Monitor local news'],
        during: ['Avoid flood waters', 'Do not drive through flooded roads', 'Stay indoors'],
        after: ['Wait for all-clear', 'Check for damage', 'Report emergencies']
      }
    },
    heatwave: {
      title: 'Heatwave Alert - {city}',
      message: 'Extreme heat conditions in {city}. Temperature: {temperature}°C. Risk level: {riskLevel}.',
      instructions: {
        before: ['Stay hydrated', 'Avoid outdoor activities', 'Keep cool'],
        during: ['Stay indoors during peak hours', 'Drink plenty of water', 'Check on elderly and children'],
        after: ['Continue hydration', 'Seek medical help if feeling unwell']
      }
    },
    storm: {
      title: 'Storm Warning - {city}',
      message: 'Severe storm approaching {city}. Wind speed: {windSpeed} m/s. Risk level: {riskLevel}.',
      instructions: {
        before: ['Secure loose objects', 'Stay indoors', 'Charge emergency devices'],
        during: ['Stay away from windows', 'Avoid outdoor activities', 'Listen to weather updates'],
        after: ['Check for damage', 'Report fallen power lines', 'Stay clear of damaged areas']
      }
    },
    cyclone: {
      title: 'CYCLONE ALERT - {city}',
      message: 'CYCLONE WARNING for {city}. Immediate action required. Risk level: {riskLevel}.',
      instructions: {
        before: ['Evacuate if instructed', 'Secure property', 'Prepare emergency supplies'],
        during: ['Stay in safe location', 'Do not venture outside', 'Listen to official updates'],
        after: ['Wait for all-clear', 'Avoid damaged areas', 'Report emergencies']
      }
    },
    landslide: {
      title: 'Landslide Warning - {city}',
      message: 'Landslide risk in {city} due to heavy rainfall. Risk level: {riskLevel}.',
      instructions: {
        before: ['Move away from slopes', 'Evacuate if in risk area', 'Monitor local alerts'],
        during: ['Move to safe location immediately', 'Avoid valleys and low areas'],
        after: ['Stay away from affected areas', 'Watch for further slides']
      }
    },
    drought: {
      title: 'Drought Advisory - {city}',
      message: 'Drought conditions in {city}. Water conservation advised. Risk level: {riskLevel}.',
      instructions: {
        before: ['Conserve water', 'Report water shortages', 'Follow water restrictions'],
        during: ['Minimize water usage', 'Collect rainwater if possible'],
        after: ['Continue conservation', 'Report any issues']
      }
    }
  }
};

// Email transporter
let emailTransporter = null;

// Store cron job reference
let alertCronJob = null;
let isRunning = false;

// Recent alerts cache (to prevent duplicates)
const recentAlerts = new Map();
const manualAlertTypeMap = {
  flood: 'flood_warning',
  Flood: 'flood_warning',
  cyclone: 'cyclone_alert',
  Cyclone: 'cyclone_alert',
  earthquake: 'earthquake_warning',
  Earthquake: 'earthquake_warning',
  tsunami: 'tsunami_warning',
  Tsunami: 'tsunami_warning',
  heatwave: 'heatwave_warning',
  Heatwave: 'heatwave_warning',
  storm: 'storm_warning',
  Storm: 'storm_warning',
  wildfire: 'wildfire_warning',
  Wildfire: 'wildfire_warning',
  landslide: 'landslide_warning',
  Landslide: 'landslide_warning',
  advisory: 'safety_advisory',
  Advisory: 'safety_advisory'
};

const alertTypeToDisasterTypeMap = {
  flood_warning: 'flood',
  cyclone_alert: 'cyclone',
  earthquake_warning: 'earthquake',
  tsunami_warning: 'tsunami',
  heatwave_warning: 'heatwave',
  storm_warning: 'storm',
  wildfire_warning: 'wildfire',
  landslide_warning: 'landslide',
  evacuation_notice: null,
  safety_advisory: null,
  all_clear: null,
  test: null,
  flood: 'flood',
  cyclone: 'cyclone',
  earthquake: 'earthquake',
  tsunami: 'tsunami',
  drought: 'drought',
  heatwave: 'heatwave',
  wildfire: 'wildfire',
  landslide: 'landslide',
  storm: 'storm',
  advisory: null
};

const alertSeverityToDisasterSeverityMap = {
  info: 'low',
  watch: 'moderate',
  warning: 'high',
  danger: 'severe',
  emergency: 'catastrophic'
};

const disasterSeverityRank = {
  low: 0,
  moderate: 1,
  high: 2,
  severe: 3,
  catastrophic: 4
};

const ACTIVE_DISASTER_STATUSES = ['monitoring', 'active', 'contained'];

const normalizeDisasterType = (alert) => {
  const rawType = (alert?.disasterType || alert?.type || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (!rawType) {
    return null;
  }

  return alertTypeToDisasterTypeMap[rawType] || null;
};

const getAlertIssuedById = (alert, fallbackUserId = null) => {
  const issuedBy = alert?.issuedBy?._id || alert?.issuedBy;
  return issuedBy || fallbackUserId || null;
};

const getDisasterStatusForAlert = (alert) => {
  if (alert?.status === 'resolved') {
    return 'resolved';
  }

  if (alert?.status === 'cancelled' || alert?.type === 'all_clear') {
    return 'contained';
  }

  return ['danger', 'emergency'].includes(alert?.severity) ? 'active' : 'monitoring';
};

const getDisasterSourceForAlert = (alert) => {
  if (alert?.liveSource) {
    return 'weather_service';
  }

  if (!alert?.source || /^admin$/i.test(alert.source)) {
    return 'manual';
  }

  return 'weather_service';
};

const pickHigherDisasterSeverity = (currentSeverity, incomingSeverity) => {
  const currentRank = disasterSeverityRank[currentSeverity] ?? 0;
  const incomingRank = disasterSeverityRank[incomingSeverity] ?? 0;

  return incomingRank > currentRank ? incomingSeverity : currentSeverity;
};

const buildDisasterPayloadFromAlert = (alert, fallbackUserId = null) => {
  const disasterType = normalizeDisasterType(alert);
  const issuedBy = getAlertIssuedById(alert, fallbackUserId);

  if (!disasterType || !issuedBy) {
    return null;
  }

  const issuedAt = new Date(alert?.timeline?.issuedAt || alert?.createdAt || Date.now());
  const expiresAt = alert?.timeline?.expiresAt
    ? new Date(alert.timeline.expiresAt)
    : undefined;
  const city = alert?.targetLocation?.city || 'Unknown';
  const state = alert?.targetLocation?.state || city;
  const affectedAreaDescription = Array.isArray(alert?.targetLocation?.affectedAreas)
    ? alert.targetLocation.affectedAreas.join(', ')
    : alert?.targetLocation?.affectedAreas;

  return {
    type: disasterType,
    name: alert?.title || `${disasterType} alert`,
    description: alert?.message || 'Alert issued by authorities.',
    severity: alertSeverityToDisasterSeverityMap[alert?.severity] || 'moderate',
    status: getDisasterStatusForAlert(alert),
    location: {
      address: affectedAreaDescription || alert?.targetLocation?.city || '',
      city,
      state,
      coordinates: alert?.targetLocation?.coordinates
    },
    timeline: {
      detectedAt: issuedAt,
      startedAt: issuedAt,
      expectedEndAt: expiresAt
    },
    source: {
      type: getDisasterSourceForAlert(alert),
      reportedBy: issuedBy,
      externalSource: alert?.source || alert?.issuingAuthority || 'Alert'
    },
    createdBy: issuedBy,
    alerts: alert?._id ? [alert._id] : []
  };
};

const buildActiveDisasterLookup = (payload) => ({
  type: payload.type,
  'location.city': payload.location.city,
  status: { $in: ACTIVE_DISASTER_STATUSES },
  'timeline.detectedAt': {
    $gte: new Date(payload.timeline.detectedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
  }
});

const ensureAlertLinkedDisaster = async (alert, fallbackUserId = null) => {
  if (!alert) {
    return alert;
  }

  if (alert.disaster) {
    const disasterId = alert.disaster._id || alert.disaster;
    if (disasterId) {
      await Disaster.findByIdAndUpdate(
        disasterId,
        { $addToSet: { alerts: alert._id } },
        { new: false }
      );
    }
    return alert;
  }

  const payload = buildDisasterPayloadFromAlert(alert, fallbackUserId);
  if (!payload) {
    return alert;
  }

  let disaster = await Disaster.findOne(buildActiveDisasterLookup(payload))
    .sort({ 'timeline.detectedAt': -1 });

  if (disaster) {
    disaster.name = disaster.name || payload.name;
    disaster.description = disaster.description || payload.description;
    disaster.severity = pickHigherDisasterSeverity(disaster.severity, payload.severity);

    if (payload.status === 'active' && disaster.status === 'monitoring') {
      disaster.status = 'active';
    }

    if (payload.timeline.expectedEndAt) {
      disaster.timeline.expectedEndAt = payload.timeline.expectedEndAt;
    }

    if (!disaster.location?.state && payload.location.state) {
      disaster.location.state = payload.location.state;
    }

    if (
      payload.location.coordinates?.latitude !== undefined &&
      payload.location.coordinates?.longitude !== undefined &&
      disaster.location?.coordinates?.latitude === undefined &&
      disaster.location?.coordinates?.longitude === undefined
    ) {
      disaster.location.coordinates = payload.location.coordinates;
    }

    if (!Array.isArray(disaster.alerts)) {
      disaster.alerts = [];
    }

    if (!disaster.alerts.some((entry) => entry.toString() === alert._id.toString())) {
      disaster.alerts.push(alert._id);
    }

    await disaster.save();
  } else {
    disaster = await Disaster.create(payload);
  }

  alert.disaster = disaster._id;
  await alert.save();

  return alert;
};

const getNotifiedAlertIdsForUser = async (userId) => {
  const alertIds = await Notification.find({
    user: userId,
    type: 'alert',
    'source.module': 'alerts',
    'source.entityId': { $exists: true, $ne: null }
  }).distinct('source.entityId');

  return alertIds.filter(Boolean);
};

const buildUserAlertQuery = (user, notifiedAlertIds = []) => {
  const orConditions = [
    ...buildAlertAudienceQuery(user),
    { 'delivery.sentTo.user': user._id }
  ];

  if (notifiedAlertIds.length > 0) {
    orConditions.push({ _id: { $in: notifiedAlertIds } });
  }

  return {
    status: { $in: ['active', 'acknowledged'] },
    'timeline.expiresAt': { $gt: new Date() },
    $or: orConditions
  };
};

const repairLegacyAlertTimelinesForUser = async (user, notifiedAlertIds = []) => {
  const repairCandidates = await Alert.find({
    status: { $in: ['active', 'acknowledged'] },
    liveSource: true,
    createdAt: {
      $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    },
    $or: [
      ...buildAlertAudienceQuery(user),
      { 'delivery.sentTo.user': user._id },
      ...(notifiedAlertIds.length > 0 ? [{ _id: { $in: notifiedAlertIds } }] : [])
    ]
  })
    .select('_id createdAt timeline')
    .limit(100);

  for (const alert of repairCandidates) {
    const createdAt = alert.createdAt ? new Date(alert.createdAt) : null;
    const expiresAt = parseAlertDate(alert.timeline?.expiresAt);

    if (!createdAt || !expiresAt || expiresAt >= createdAt) {
      continue;
    }

    alert.timeline.issuedAt = createdAt;
    alert.timeline.effectiveFrom = createdAt;
    alert.timeline.expiresAt = new Date(
      createdAt.getTime() + alertConfig.defaultExpiryHours * 60 * 60 * 1000
    );

    await alert.save();
  }
};

const buildAlertRecipientSignature = (alert) => {
  if (alert.sentToAll) {
    return 'all-users';
  }

  if (Array.isArray(alert.sentToUsers) && alert.sentToUsers.length > 0) {
    return alert.sentToUsers
      .map((user) => (user?._id || user || '').toString())
      .filter(Boolean)
      .sort()
      .join(',');
  }

  return [
    alert.targetLocation?.city || '',
    alert.targetLocation?.state || ''
  ].join('|');
};

const buildDuplicateFingerprint = (alert) => {
  const issuedBy = (alert.issuedBy?._id || alert.issuedBy || '').toString();
  const normalizedParts = [
    issuedBy,
    alert.title,
    alert.message,
    alert.type,
    alert.disasterType,
    alert.severity,
    alert.source,
    alert.liveSource ? 'live' : 'manual',
    alert.targetLocation?.city,
    alert.targetLocation?.state,
    buildAlertRecipientSignature(alert)
  ];

  return normalizedParts
    .map((part) => (part || '').toString().trim().toLowerCase())
    .join('::');
};

const deleteOrphanedDisasterIfSafe = async (disasterId) => {
  if (!disasterId) {
    return false;
  }

  const disaster = await Disaster.findById(disasterId)
    .select('alerts emergencyRequests rescueTasks updates media');

  if (!disaster) {
    return false;
  }

  const hasRelatedAlerts = Array.isArray(disaster.alerts) && disaster.alerts.length > 0;
  const hasEmergencyRequests = Array.isArray(disaster.emergencyRequests) && disaster.emergencyRequests.length > 0;
  const hasRescueTasks = Array.isArray(disaster.rescueTasks) && disaster.rescueTasks.length > 0;
  const hasUpdates = Array.isArray(disaster.updates) && disaster.updates.length > 0;
  const hasMedia = Array.isArray(disaster.media) && disaster.media.length > 0;

  if (hasRelatedAlerts || hasEmergencyRequests || hasRescueTasks || hasUpdates || hasMedia) {
    return false;
  }

  await disaster.deleteOne();
  return true;
};

const buildRecipientQuery = (alert) => {
  if (alert.sentToAll) {
    return { isActive: true };
  }

  if (Array.isArray(alert.sentToUsers) && alert.sentToUsers.length > 0) {
    return {
      _id: { $in: alert.sentToUsers },
      isActive: true
    };
  }

  if (alert.targetLocation?.city) {
    return {
      'location.city': alert.targetLocation.city,
      isActive: true
    };
  }

  return { _id: { $exists: false } };
};

const buildAlertAudienceQuery = (user) => {
  const orConditions = [
    { sentToAll: true },
    { sentToUsers: user._id }
  ];

  if (user.location?.city) {
    orConditions.push({ 'targetLocation.city': user.location.city });
  }

  return orConditions;
};

const isAlertReadByUser = (alert, userId) => {
  if (!alert?.delivery?.sentTo?.length) {
    return false;
  }

  return alert.delivery.sentTo.some((entry) =>
    entry?.user &&
    entry.user.toString() === userId.toString() &&
    entry.read
  );
};

const parseAlertDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeManualAlert = (alertData, userId) => {
  const now = new Date();
  const requestedIssuedAt = parseAlertDate(alertData.timeline?.issuedAt || alertData.issuedAt);
  const requestedEffectiveFrom = parseAlertDate(alertData.timeline?.effectiveFrom);
  const requestedExpiresAt = parseAlertDate(alertData.timeline?.expiresAt);

  // Manual/admin sends should go live when the admin presses send, not when the
  // external disaster source originally reported the event.
  const issuedAt = now;
  const effectiveFrom = requestedEffectiveFrom && requestedEffectiveFrom > now
    ? requestedEffectiveFrom
    : issuedAt;
  const expiresAt = requestedExpiresAt && requestedExpiresAt > effectiveFrom
    ? requestedExpiresAt
    : new Date(effectiveFrom.getTime() + alertConfig.defaultExpiryHours * 60 * 60 * 1000);
  const targetCity = alertData.targetLocation?.city || alertData.location || 'Targeted Users';
  const targetState = alertData.targetLocation?.state || targetCity;

  return {
    title: alertData.title,
    message: alertData.message,
    type: alertData.type || manualAlertTypeMap[alertData.disasterType] || 'safety_advisory',
    disasterType: alertData.disasterType || alertData.type || 'Advisory',
    source: alertData.source || 'Admin',
    liveSource: Boolean(alertData.liveSource),
    severity: alertData.severity || 'info',
    targetLocation: {
      city: targetCity,
      state: targetState,
      coordinates: alertData.targetLocation?.coordinates,
      radius: alertData.targetLocation?.radius || 0,
      affectedAreas: alertData.targetLocation?.affectedAreas || [targetCity]
    },
    disaster: alertData.disaster,
    timeline: {
      issuedAt,
      effectiveFrom,
      expiresAt
    },
    issuedBy: userId,
    sentToAll: Boolean(alertData.sentToAll),
    sentToUsers: alertData.sentToAll ? [] : (alertData.sentToUsers || []),
    issuingAuthority: alertData.issuingAuthority,
    instructions: alertData.instructions || {},
    safetyGuidelines: alertData.safetyGuidelines || [],
    media: alertData.media || [],
    delivery: {
      channels: alertData.delivery?.channels?.length
        ? alertData.delivery.channels
        : ['dashboard', ...(alertConfig.channels.email ? ['email'] : [])],
      totalRecipients: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0
    }
  };
};

/**
 * Initialize email transporter
 */
const initEmailTransporter = () => {
  if (process.env.SMTP_HOST) {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    console.log('Email transporter initialized');
  }
};

/**
 * Generate alert message from template
 */
const generateAlertMessage = (templateKey, data) => {
  const template = alertConfig.templates[templateKey];
  if (!template) return null;
  
  let title = template.title;
  let message = template.message;
  
  // Replace placeholders
  for (const [key, value] of Object.entries(data)) {
    title = title.replace(`{${key}}`, value);
    message = message.replace(`{${key}}`, value);
  }
  
  return {
    title,
    message,
    instructions: template.instructions
  };
};

/**
 * Check if similar alert was recently created
 */
const isDuplicateAlert = (city, type, severity) => {
  const key = `${city}_${type}_${severity}`;
  const lastAlert = recentAlerts.get(key);
  
  if (!lastAlert) return false;
  
  // Check if last alert was within 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return lastAlert > sixHoursAgo;
};

/**
 * Mark alert as recently created
 */
const markRecentAlert = (city, type, severity) => {
  const key = `${city}_${type}_${severity}`;
  recentAlerts.set(key, new Date());
  
  // Clean old entries (older than 12 hours)
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  for (const [k, v] of recentAlerts.entries()) {
    if (v < twelveHoursAgo) {
      recentAlerts.delete(k);
    }
  }
};

/**
 * Create alert from prediction
 */
const createAlertFromPrediction = async (prediction, adminId) => {
  try {
    // Check for duplicates
    if (isDuplicateAlert(prediction.city, prediction.type, prediction.currentLevel)) {
      console.log(`Duplicate alert prevented for ${prediction.city} - ${prediction.type}`);
      return null;
    }
    
    // Generate alert content
    const alertContent = generateAlertMessage(prediction.type, {
      city: prediction.city,
      riskLevel: prediction.currentLevel,
      temperature: prediction.parameters?.temperature,
      windSpeed: prediction.parameters?.windSpeed,
      rainfall: prediction.parameters?.rainfall
    });
    
    if (!alertContent) {
      console.warn(`No template found for disaster type: ${prediction.type}`);
      return null;
    }
    
    // Map prediction severity to alert severity
    const severityMap = {
      [predictionService.RISK_LEVELS.SAFE]: 'info',
      [predictionService.RISK_LEVELS.WATCH]: 'watch',
      [predictionService.RISK_LEVELS.WARNING]: 'warning',
      [predictionService.RISK_LEVELS.DANGER]: 'danger'
    };
    
    // Map prediction type to alert type
    const typeMap = {
      flood: 'flood_warning',
      heatwave: 'heatwave_warning',
      storm: 'storm_warning',
      cyclone: 'cyclone_alert',
      landslide: 'landslide_warning',
      drought: 'safety_advisory'
    };
    
    // Create alert object
    const alertData = {
      title: alertContent.title,
      message: alertContent.message,
      type: typeMap[prediction.type] || 'safety_advisory',
      severity: severityMap[prediction.currentLevel] || 'warning',
      targetLocation: {
        city: prediction.city,
        state: prediction.city, // Will be updated with actual state
        affectedAreas: [prediction.city]
      },
      timeline: {
        issuedAt: new Date(),
        effectiveFrom: new Date(),
        expiresAt: new Date(Date.now() + alertConfig.defaultExpiryHours * 60 * 60 * 1000)
      },
      issuedBy: adminId,
      instructions: alertContent.instructions,
      delivery: {
        channels: ['dashboard', 'email'],
        totalRecipients: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0
      },
      triggeredRules: Object.entries(prediction.rules[prediction.currentLevel]?.details || {})
        .filter(([_, detail]) => detail.met)
        .map(([param, detail]) => ({
          ruleName: `${prediction.type}_${param}`,
          parameter: param,
          threshold: detail.threshold,
          actualValue: detail.value,
          condition: 'exceeded'
        }))
    };
    
    // Create alert in database
    const alert = await Alert.create(alertData);
    
    await ensureAlertLinkedDisaster(alert, adminId);

    // Mark as recent
    markRecentAlert(prediction.city, prediction.type, prediction.currentLevel);
    
    console.log(`Alert created: ${alert.alertCode} for ${prediction.city}`);
    
    // Send notifications
    await sendAlertNotifications(alert);
    
    return alert;
  } catch (error) {
    console.error('Error creating alert from prediction:', error);
    throw error;
  }
};

/**
 * Send alert notifications
 */
const sendAlertNotifications = async (alert) => {
  try {
    const users = await User.find(buildRecipientQuery(alert))
      .select('_id email notifications isActive');

    if (!alert.delivery) {
      alert.delivery = {
        channels: ['dashboard'],
        totalRecipients: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0
      };
    }

    alert.delivery.totalRecipients = users.length;
    console.log(`Sending alert to ${users.length} users (sentToAll: ${alert.sentToAll})`);
    await notificationService.notifyAlertRecipients(alert, users);

    // Email notifications
    if (alertConfig.channels.email && emailTransporter) {
      for (const user of users) {
        // Respect user's notification preference
        if (user.notifications?.email !== false && user.email) {
          try {
            await sendEmailAlert(user.email, alert)
            await alert.trackDelivery(user._id, 'email', true)
          } catch (error) {
            console.error(`Email failed for ${user.email}:`, error.message)
            await alert.trackDelivery(user._id, 'email', false)
          }
        }
      }
    }

    await alert.save()
    console.log(
      `Notifications: ${alert.delivery.successfulDeliveries} sent, ` +
      `${alert.delivery.failedDeliveries} failed`
    )
  } catch (error) {
    console.error('sendAlertNotifications error:', error)
  }
}

/**
 * Send email alert
 */
const sendEmailAlert = async (email, alert) => {
  if (!emailTransporter) return;
  
  const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: ${getSeverityColor(alert.severity)}; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">${alert.title}</h1>
        <p style="margin: 10px 0 0 0; font-size: 18px;">Severity: ${alert.severity.toUpperCase()}</p>
      </div>
      
      <div style="padding: 20px; background-color: #f9f9f9;">
        <p style="font-size: 16px; line-height: 1.6;">${alert.message}</p>
        
        <div style="margin-top: 20px;">
          <h3 style="color: #333;">Instructions:</h3>
          
          ${alert.instructions?.before?.length ? `
            <div style="margin: 10px 0;">
              <h4 style="color: #666; margin-bottom: 5px;">Before:</h4>
              <ul style="margin: 0; padding-left: 20px;">
                ${alert.instructions.before.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          ${alert.instructions?.during?.length ? `
            <div style="margin: 10px 0;">
              <h4 style="color: #666; margin-bottom: 5px;">During:</h4>
              <ul style="margin: 0; padding-left: 20px;">
                ${alert.instructions.during.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          ${alert.instructions?.after?.length ? `
            <div style="margin: 10px 0;">
              <h4 style="color: #666; margin-bottom: 5px;">After:</h4>
              <ul style="margin: 0; padding-left: 20px;">
                ${alert.instructions.after.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px;">
          <p>Alert Code: ${alert.alertCode}</p>
          <p>Issued: ${alert.timeline.issuedAt.toLocaleString()}</p>
          <p>Expires: ${alert.timeline.expiresAt.toLocaleString()}</p>
          <p>This is an automated alert from the Disaster Management System.</p>
        </div>
      </div>
    </div>
  `;
  
  await emailTransporter.sendMail({
    from: `"Disaster Management System" <${process.env.SMTP_USER}>`,
    to: email,
    subject,
    html
  });
};

/**
 * Get color for severity level
 */
const getSeverityColor = (severity) => {
  const colors = {
    info: '#3498db',
    watch: '#f39c12',
    warning: '#e67e22',
    danger: '#e74c3c',
    emergency: '#c0392b'
  };
  return colors[severity] || colors.info;
};

/**
 * Process predictions and generate alerts
 */
const processPredictions = async () => {
  try {
    // Get admin user for alert creation
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.warn('No admin user found for alert creation');
      return;
    }
    
    // Get predictions
    const predictions = await predictionService.runPrediction();
    
    // Filter predictions that meet minimum severity
    const severityOrder = { 
      [predictionService.RISK_LEVELS.SAFE]: 0,
      [predictionService.RISK_LEVELS.WATCH]: 1,
      [predictionService.RISK_LEVELS.WARNING]: 2,
      [predictionService.RISK_LEVELS.DANGER]: 3
    };
    
    const minSeverityLevel = severityOrder[alertConfig.minSeverity];
    
    const alertsToCreate = predictions.filter(p => 
      severityOrder[p.currentLevel] >= minSeverityLevel
    );
    
    console.log(`Processing ${alertsToCreate.length} predictions for alert generation`);
    
    // Create alerts
    const createdAlerts = [];
    for (const prediction of alertsToCreate) {
      try {
        const alert = await createAlertFromPrediction(prediction, admin._id);
        if (alert) {
          createdAlerts.push(alert);
        }
      } catch (error) {
        console.error('Error creating alert:', error);
      }
    }
    
    console.log(`Created ${createdAlerts.length} alerts from predictions`);
    return createdAlerts;
  } catch (error) {
    console.error('Error processing predictions:', error);
    throw error;
  }
};

/**
 * Create manual alert
 */
const createManualAlert = async (alertData, userId) => {
  try {
    const alert = await Alert.create(normalizeManualAlert(alertData, userId));

    try {
      await ensureAlertLinkedDisaster(alert, userId);
    } catch (linkError) {
      // Disaster-link backfill should not block alert delivery to end users.
      console.error('Alert created but disaster linking failed:', linkError);
    }
    
    // Send notifications
    await sendAlertNotifications(alert);
    
    return alert;
  } catch (error) {
    console.error('Error creating manual alert:', error);
    throw error;
  }
};

/**
 * Get active alerts for a user
 */
const getActiveAlertsForUser = async (userId) => {
  const [user, notifiedAlertIds] = await Promise.all([
    User.findById(userId),
    getNotifiedAlertIdsForUser(userId)
  ]);

  if (!user) return [];

  await repairLegacyAlertTimelinesForUser(user, notifiedAlertIds);

  const alerts = await Alert.find(buildUserAlertQuery(user, notifiedAlertIds))
  .sort({ 'timeline.issuedAt': -1 })
  .limit(50)
  .populate('issuedBy', 'name')
  .populate('disaster', 'name type severity status location timeline');

  return Promise.all(alerts.map(async (alert) => {
    let syncedAlert = alert;

    try {
      syncedAlert = await ensureAlertLinkedDisaster(alert, userId);
    } catch (linkError) {
      console.error('Alert fetch continued without disaster link:', linkError);
    }

    if (syncedAlert.disaster && !syncedAlert.populated('disaster')) {
      await syncedAlert.populate('disaster', 'name type severity status location timeline');
    }

    const alertObject = syncedAlert.toObject();
    alertObject.read = isAlertReadByUser(syncedAlert, userId);
    return alertObject;
  }));
}

/**
 * Get unread alert count for user
 */
const getUnreadAlertCount = async (userId) => {
  const [user, notifiedAlertIds] = await Promise.all([
    User.findById(userId),
    getNotifiedAlertIdsForUser(userId)
  ]);

  if (!user) return 0;

  await repairLegacyAlertTimelinesForUser(user, notifiedAlertIds);

  // Unread = alert was sent to this user but not in their delivery.sentTo as read
  return await Alert.countDocuments({
    ...buildUserAlertQuery(user, notifiedAlertIds),
    'delivery.sentTo': {
      $not: {
        $elemMatch: { user: userId, read: true }
      }
    }
  });
}

/**
 * Mark alert as read for a specific user
 */
const markAlertAsRead = async (alertId, userId) => {
  const [user, notifiedAlertIds] = await Promise.all([
    User.findById(userId),
    getNotifiedAlertIdsForUser(userId)
  ]);

  if (!user) {
    throw new Error('User not found');
  }

  await repairLegacyAlertTimelinesForUser(user, notifiedAlertIds);

  const alert = await Alert.findOne({
    _id: alertId,
    ...buildUserAlertQuery(user, notifiedAlertIds)
  });

  if (!alert) {
    throw new Error('Alert not found');
  }

  if (!alert.delivery) {
    alert.delivery = {
      channels: ['dashboard'],
      sentTo: [],
      totalRecipients: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0
    };
  }

  if (!Array.isArray(alert.delivery.sentTo)) {
    alert.delivery.sentTo = [];
  }

  const existingDelivery = alert.delivery.sentTo.find(
    (entry) => entry?.user && entry.user.toString() === userId.toString()
  );

  if (existingDelivery) {
    existingDelivery.channel = existingDelivery.channel || 'dashboard';
    existingDelivery.delivered = true;
    existingDelivery.deliveredAt = existingDelivery.deliveredAt || new Date();
    existingDelivery.read = true;
    existingDelivery.readAt = new Date();
  } else {
    alert.delivery.sentTo.push({
      user: userId,
      channel: 'dashboard',
      sentAt: alert.timeline?.issuedAt || new Date(),
      delivered: true,
      deliveredAt: new Date(),
      read: true,
      readAt: new Date()
    });
  }

  await alert.save();

  try {
    await ensureAlertLinkedDisaster(alert, userId);
  } catch (linkError) {
    console.error('Alert read succeeded but disaster link failed:', linkError);
  }

  await Notification.updateMany(
    {
      user: userId,
      type: 'alert',
      'source.module': 'alerts',
      'source.entityId': alert._id
    },
    {
      $set: {
        read: true,
        readAt: new Date()
      }
    }
  );

  const alertObject = alert.toObject();
  alertObject.read = true;
  return alertObject;
};

/**
 * Cancel alert
 */
const cancelAlert = async (alertId, reason, notes, userId) => {
  const alert = await Alert.findById(alertId);
  if (!alert) {
    throw new Error('Alert not found');
  }
  
  await alert.cancel(reason, notes);
  
  // Notify recipients of cancellation
  // TODO: Send cancellation notifications
  
  return alert;
};

const deleteAlertById = async (alertId) => {
  const alert = await Alert.findById(alertId);
  if (!alert) {
    throw new Error('Alert not found');
  }

  const disasterId = alert.disaster?._id || alert.disaster || null;

  const notificationResult = await Notification.deleteMany({
    type: 'alert',
    'source.module': 'alerts',
    'source.entityId': alert._id
  });

  const disasterPullResult = await Disaster.updateMany(
    { alerts: alert._id },
    { $pull: { alerts: alert._id } }
  );

  await alert.deleteOne();

  let orphanedDisasterDeleted = false;
  if (disasterId) {
    orphanedDisasterDeleted = await deleteOrphanedDisasterIfSafe(disasterId);
  }

  return {
    alertId: alert._id,
    notificationCount: notificationResult.deletedCount || 0,
    disasterReferenceCount: disasterPullResult.modifiedCount || 0,
    orphanedDisasterDeleted
  };
};

const cleanupDuplicateAlerts = async (userId, { windowHours = 6 } = {}) => {
  const duplicateWindowHours = Number.isFinite(Number(windowHours))
    ? Math.max(1, Number(windowHours))
    : 6;
  const duplicateWindowMs = duplicateWindowHours * 60 * 60 * 1000;

  const alerts = await Alert.find({
    issuedBy: userId,
    $or: [
      { sentToAll: true },
      { sentToUsers: { $exists: true, $ne: [] } },
      { liveSource: true }
    ]
  })
    .select(
      '_id title message type disasterType severity source liveSource ' +
      'targetLocation sentToAll sentToUsers issuedBy createdAt'
    )
    .sort({ createdAt: -1 });

  const latestClusterByFingerprint = new Map();
  const duplicateAlerts = [];

  for (const alert of alerts) {
    const fingerprint = buildDuplicateFingerprint(alert);
    const lastClusterAlert = latestClusterByFingerprint.get(fingerprint);

    if (!lastClusterAlert) {
      latestClusterByFingerprint.set(fingerprint, alert);
      continue;
    }

    const createdAt = new Date(alert.createdAt).getTime();
    const lastClusterCreatedAt = new Date(lastClusterAlert.createdAt).getTime();

    if (lastClusterCreatedAt - createdAt <= duplicateWindowMs) {
      duplicateAlerts.push(alert);
      continue;
    }

    latestClusterByFingerprint.set(fingerprint, alert);
  }

  const deletedAlertIds = [];
  let deletedNotifications = 0;
  let cleanedDisasterReferences = 0;
  let deletedOrphanDisasters = 0;

  for (const duplicateAlert of duplicateAlerts) {
    const result = await deleteAlertById(duplicateAlert._id);
    deletedAlertIds.push(result.alertId);
    deletedNotifications += result.notificationCount;
    cleanedDisasterReferences += result.disasterReferenceCount;
    if (result.orphanedDisasterDeleted) {
      deletedOrphanDisasters += 1;
    }
  }

  return {
    scannedCount: alerts.length,
    removedCount: duplicateAlerts.length,
    keptCount: alerts.length - duplicateAlerts.length,
    duplicateWindowHours,
    deletedAlertIds,
    deletedNotifications,
    cleanedDisasterReferences,
    deletedOrphanDisasters
  };
};

/**
 * Get alert statistics
 */
const getAlertStatistics = async () => {
  const now = new Date();
  
  const stats = await Alert.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const severityStats = await Alert.aggregate([
    {
      $match: { status: 'active', 'timeline.expiresAt': { $gt: now } }
    },
    {
      $group: {
        _id: '$severity',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const typeStats = await Alert.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Delivery statistics
  const deliveryStats = await Alert.aggregate([
    {
      $group: {
        _id: null,
        totalSent: { $sum: '$delivery.successfulDeliveries' },
        totalFailed: { $sum: '$delivery.failedDeliveries' }
      }
    }
  ]);
  
  return {
    byStatus: stats,
    bySeverity: severityStats,
    byType: typeStats,
    delivery: deliveryStats[0] || { totalSent: 0, totalFailed: 0 }
  };
};

/**
 * Start alert service
 */
const startAlertService = () => {
  if (isRunning) {
    console.log('Alert service is already running');
    return;
  }
  
  console.log('Starting alert service...');
  
  // Initialize email
  initEmailTransporter();
  
  // Schedule alert processing (every 30 minutes)
  alertCronJob = cron.schedule('*/30 * * * *', async () => {
    console.log('Running scheduled alert processing...');
    await processPredictions();
  });
  
  isRunning = true;
  console.log('Alert service started successfully');
};

/**
 * Stop alert service
 */
const stopAlertService = () => {
  if (alertCronJob) {
    alertCronJob.stop();
    alertCronJob = null;
    isRunning = false;
    console.log('Alert service stopped');
  }
};

/**
 * Check if service is running
 */
const isServiceRunning = () => {
  return isRunning;
};

module.exports = {
  // Core functions
  createAlertFromPrediction,
  createManualAlert,
  processPredictions,
  sendAlertNotifications,
  
  // User alerts
  getActiveAlertsForUser,
  getUnreadAlertCount,
  markAlertAsRead,
  
  // Alert management
  cancelAlert,
  deleteAlertById,
  cleanupDuplicateAlerts,
  
  // Analytics
  getAlertStatistics,
  
  // Service control
  startAlertService,
  stopAlertService,
  isServiceRunning,
  
  // Configuration
  alertConfig,
  
  // Utilities
  generateAlertMessage
};

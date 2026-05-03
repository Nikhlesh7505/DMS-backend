/**
 * One-time backfill script
 * Creates missing Disaster records from existing Alerts that have a
 * disasterType field but were never linked to a Disaster document.
 *
 * Usage:  node scripts/backfill-disasters.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Disaster = require('../models/Disaster');
const User = require('../models/User');

// ── Same normalizer as alert.service.js ────────────────────────────────────
const alertTypeToDisasterTypeMap = {
  flood_warning: 'flood', cyclone_alert: 'cyclone',
  earthquake_warning: 'earthquake', tsunami_warning: 'tsunami',
  heatwave_warning: 'heatwave', storm_warning: 'storm',
  wildfire_warning: 'wildfire', landslide_warning: 'landslide',
  flood: 'flood', cyclone: 'cyclone', earthquake: 'earthquake',
  tsunami: 'tsunami', drought: 'drought', heatwave: 'heatwave',
  wildfire: 'wildfire', landslide: 'landslide', storm: 'storm',
  pandemic: 'pandemic', chemical: 'chemical', industrial: 'industrial',
  other: 'other',
  heat_wave: 'heatwave', 'heat wave': 'heatwave', extreme_heat: 'heatwave',
  thunderstorm: 'storm', thunderstorms: 'storm', severe_thunderstorm: 'storm',
  thunder_storm: 'storm', 'severe thunderstorm': 'storm',
  tropical_storm: 'cyclone', tropical_cyclone: 'cyclone',
  hurricane: 'cyclone', typhoon: 'cyclone',
  dust_storm: 'storm', blizzard: 'storm', snowstorm: 'storm', wind_storm: 'storm',
  heavy_rain: 'flood', 'heavy rain': 'flood', heavy_rainfall: 'flood',
  flash_flood: 'flood', 'flash flood': 'flood', river_flood: 'flood', flooding: 'flood',
  'moderate earthquake': 'earthquake', 'light earthquake': 'earthquake',
  'strong earthquake': 'earthquake', seismic: 'earthquake',
  forest_fire: 'wildfire', bush_fire: 'wildfire',
  'forest fire': 'wildfire', 'bush fire': 'wildfire',
  mudslide: 'landslide', mud_slide: 'landslide', rockslide: 'landslide',
  tidal_wave: 'tsunami', 'tidal wave': 'tsunami',
  drought_advisory: 'drought', water_shortage: 'drought',
  natural_disaster: 'other',
};

const ACTIVE_STATUSES = ['monitoring', 'active', 'contained'];
const SEVERITY_MAP = { info: 'low', watch: 'moderate', warning: 'high', danger: 'severe', emergency: 'catastrophic' };

function normalizeType(alert) {
  const raw = ((alert.disasterType || alert.type || '')).toString().trim().toLowerCase().replace(/\s+/g, '_');
  return alertTypeToDisasterTypeMap[raw.replace(/_/g, ' ')] ||
         alertTypeToDisasterTypeMap[raw] ||
         null;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('✅ MongoDB connected');

  // Get a fallback admin user ID for createdBy
  const adminUser = await User.findOne({ role: 'admin' }).select('_id').lean();
  if (!adminUser) {
    console.error('❌ No admin user found. Cannot create disaster records without createdBy.');
    process.exit(1);
  }
  const fallbackUserId = adminUser._id;

  // Fetch all alerts that don't already have a disaster linked
  const alerts = await Alert.find({ disaster: { $exists: false } })
    .select('_id title message type disasterType severity status targetLocation timeline issuedBy source liveSource createdAt')
    .lean();

  console.log(`\n📋 Found ${alerts.length} alerts without a linked disaster.\n`);

  let created = 0, updated = 0, skipped = 0;

  for (const alert of alerts) {
    const disasterType = normalizeType(alert);
    if (!disasterType) {
      skipped++;
      continue;
    }

    const issuedBy = alert.issuedBy || fallbackUserId;
    const issuedAt = new Date(alert.timeline?.issuedAt || alert.createdAt || Date.now());
    const city = alert.targetLocation?.city || 'Unknown';
    const state = alert.targetLocation?.state || city;
    const severity = SEVERITY_MAP[alert.severity] || 'moderate';
    const status = ['danger', 'emergency'].includes(alert.severity) ? 'active' : 'monitoring';

    // Check if an active disaster of same type+city exists within 7 days
    const existing = await Disaster.findOne({
      type: disasterType,
      'location.city': city,
      status: { $in: ACTIVE_STATUSES },
      'timeline.detectedAt': { $gte: new Date(issuedAt.getTime() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ 'timeline.detectedAt': -1 });

    if (existing) {
      // Link this alert to the existing disaster
      if (!existing.alerts?.some(a => a.toString() === alert._id.toString())) {
        existing.alerts = existing.alerts || [];
        existing.alerts.push(alert._id);
        await existing.save();
      }
      await Alert.findByIdAndUpdate(alert._id, { disaster: existing._id });
      updated++;
      process.stdout.write(`  ↗ Linked to existing [${disasterType}] @ ${city}\n`);
    } else {
      // Create a new Disaster record
      try {
        const disaster = await Disaster.create({
          type: disasterType,
          name: alert.title || `${disasterType} — ${city}`,
          description: alert.message || 'Auto-created from alert backfill.',
          severity,
          status,
          location: {
            city,
            state,
            coordinates: alert.targetLocation?.coordinates
          },
          timeline: {
            detectedAt: issuedAt,
            startedAt: issuedAt,
            expectedEndAt: alert.timeline?.expiresAt ? new Date(alert.timeline.expiresAt) : undefined
          },
          source: {
            type: alert.liveSource ? 'weather_service' : 'manual',
            reportedBy: issuedBy,
            externalSource: alert.source || 'Alert backfill'
          },
          createdBy: issuedBy,
          alerts: [alert._id]
        });
        await Alert.findByIdAndUpdate(alert._id, { disaster: disaster._id });
        created++;
        process.stdout.write(`  ✅ Created [${disasterType}] "${disaster.name}" @ ${city}\n`);
      } catch (err) {
        process.stdout.write(`  ❌ Failed for alert ${alert._id}: ${err.message}\n`);
      }
    }
  }

  console.log(`\n──────────────────────────────────────`);
  console.log(`✅ Created : ${created} new Disaster records`);
  console.log(`↗  Linked  : ${updated} alerts to existing disasters`);
  console.log(`⏭  Skipped : ${skipped} alerts (no mappable disasterType)`);
  console.log(`──────────────────────────────────────\n`);

  await mongoose.disconnect();
  console.log('MongoDB disconnected. Done!');
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});

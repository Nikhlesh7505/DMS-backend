/**
 * Models Index
 * Central export for all MongoDB models
 */

const User = require('./User');
const WeatherData = require('./WeatherData');
const Disaster = require('./Disaster');
const Alert = require('./Alert');
const Notification = require('./Notification');
const Shelter = require('./Shelter');
const AuditLog = require('./AuditLog');
const EmergencyRequest = require('./EmergencyRequest');
const Resource = require('./Resource');
const RescueTask = require('./RescueTask');

module.exports = {
  User,
  WeatherData,
  Disaster,
  Alert,
  Notification,
  Shelter,
  AuditLog,
  EmergencyRequest,
  Resource,
  RescueTask
};

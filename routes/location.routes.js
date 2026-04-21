const express = require('express');
const router = express.Router();
const { getCountries, getCities } = require('../controllers/location.controller');

// Public routes — no auth required
router.get('/countries', getCountries);
router.get('/cities', getCities);

module.exports = router;

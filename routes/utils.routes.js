const express = require('express');
const router = express.Router();
const { getCountries, getStates, getCities } = require('../controllers/utils.controller');

router.get('/geo/countries', getCountries);
router.post('/geo/states', getStates);
router.post('/geo/cities', getCities);

module.exports = router;

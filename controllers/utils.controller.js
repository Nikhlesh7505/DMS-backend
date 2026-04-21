const axios = require('axios');
const { asyncHandler } = require('../middleware/error.middleware');

const COUNTRIES_NOW_BASE_URL = 'https://countriesnow.space/api/v0.1/countries';

/**
 * @desc    Get all countries with positions
 * @route   GET /api/utils/geo/countries
 * @access  Public
 */
const getCountries = asyncHandler(async (req, res) => {
  try {
    const response = await axios.get(`${COUNTRIES_NOW_BASE_URL}/positions`);
    res.json({
      success: true,
      data: response.data.data
    });
  } catch (err) {
    console.error('Error fetching countries:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch countries' });
  }
});

/**
 * @desc    Get states for a country
 * @route   POST /api/utils/geo/states
 * @access  Public
 */
const getStates = asyncHandler(async (req, res) => {
  const { country } = req.body;
  if (!country) return res.status(400).json({ success: false, message: 'Country is required' });

  try {
    const response = await axios.post(`${COUNTRIES_NOW_BASE_URL}/states`, { country });
    res.json({
      success: true,
      data: response.data.data.states
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch states' });
  }
});

/**
 * @desc    Get cities for a state
 * @route   POST /api/utils/geo/cities
 * @access  Public
 */
const getCities = asyncHandler(async (req, res) => {
  const { country, state } = req.body;
  if (!country || !state) return res.status(400).json({ success: false, message: 'Country and state are required' });

  try {
    const response = await axios.post(`${COUNTRIES_NOW_BASE_URL}/state/cities`, { country, state });
    res.json({
      success: true,
      data: response.data.data
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch cities' });
  }
});

module.exports = {
  getCountries,
  getStates,
  getCities
};

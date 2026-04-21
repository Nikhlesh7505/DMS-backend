/**
 * Location Controller
 * Serves country and city data for donation form dropdowns
 */

const countryCity = require('../data/countryCity.json');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @desc    Get list of all countries
 * @route   GET /api/locations/countries
 * @access  Public
 */
const getCountries = asyncHandler(async (req, res) => {
  const countries = Object.keys(countryCity).sort();

  res.json({
    success: true,
    data: { countries }
  });
});

/**
 * @desc    Get cities for a specific country
 * @route   GET /api/locations/cities?country=India
 * @access  Public
 */
const getCities = asyncHandler(async (req, res) => {
  const { country } = req.query;

  if (!country) {
    return res.status(400).json({
      success: false,
      message: 'Country query parameter is required'
    });
  }

  const cities = countryCity[country];

  if (!cities) {
    return res.status(404).json({
      success: false,
      message: `No cities found for country: ${country}`
    });
  }

  res.json({
    success: true,
    data: { cities: cities.sort() }
  });
});

module.exports = {
  getCountries,
  getCities
};

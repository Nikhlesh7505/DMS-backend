const axios = require('axios');

/**
 * Geocoding Service
 * Uses Nominatim (OpenStreetMap) for Reverse Geocoding
 */
class GeocodingService {
  /**
   * Get address from coordinates (Reverse Geocoding)
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} - Address details
   */
  async getAddressFromCoords(lat, lon) {
    try {
      if (!lat || !lon) {
        throw new Error('Latitude and longitude are required');
      }

      // Nominatim requires a User-Agent header
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat,
          lon,
          format: 'json',
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'DisasterManagementSystem/1.0'
        }
      });

      if (response.data && response.data.address) {
        const addr = response.data.address;
        return {
          fullAddress: response.data.display_name,
          city: addr.city || addr.town || addr.village || addr.suburb,
          state: addr.state,
          country: addr.country,
          postcode: addr.postcode,
          road: addr.road,
          neighbourhood: addr.neighbourhood
        };
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error.message);
      // Return null rather than failing completely to allow graceful fallback
      return null;
    }
  }

  /**
   * Verify if coordinates are valid
   * @param {number} lat 
   * @param {number} lon 
   * @returns {boolean}
   */
  isValidCoordinates(lat, lon) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    
    return (
      !isNaN(latNum) && 
      !isNaN(lonNum) && 
      latNum >= -90 && 
      latNum <= 90 && 
      lonNum >= -180 && 
      lonNum <= 180
    );
  }
}

module.exports = new GeocodingService();

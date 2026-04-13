const Shelter = require('../models/Shelter');
const { asyncHandler } = require('../middleware/error.middleware');

const getShelters = asyncHandler(async (req, res) => {
  const { city, status, minAvailableBeds = 0, page = 1, limit = 20 } = req.query;

  const query = {};
  if (city) query['address.city'] = city;
  if (status) query.status = status;
  query['capacity.available'] = { $gte: parseInt(minAvailableBeds, 10) || 0 };

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const shelters = await Shelter.find(query)
    .sort({ 'capacity.available': -1, name: 1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Shelter.countDocuments(query);

  res.json({
    success: true,
    data: {
      shelters,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    }
  });
});

const getNearbyShelters = asyncHandler(async (req, res) => {
  const { longitude, latitude, maxDistance = 50000 } = req.query;

  if (longitude === undefined || latitude === undefined) {
    return res.status(400).json({
      success: false,
      message: 'longitude and latitude are required'
    });
  }

  const shelters = await Shelter.findNearby(
    parseFloat(longitude),
    parseFloat(latitude),
    parseInt(maxDistance, 10),
    { status: 'active' }
  );

  res.json({
    success: true,
    data: { shelters }
  });
});

const getShelter = asyncHandler(async (req, res) => {
  const shelter = await Shelter.findById(req.params.id).populate('managedBy', 'name email phone');

  if (!shelter) {
    return res.status(404).json({
      success: false,
      message: 'Shelter not found'
    });
  }

  res.json({
    success: true,
    data: { shelter }
  });
});

const createShelter = asyncHandler(async (req, res) => {
  const shelter = await Shelter.create({
    ...req.body,
    managedBy: req.body.managedBy || req.user.id
  });

  res.status(201).json({
    success: true,
    message: 'Shelter created successfully',
    data: { shelter }
  });
});

const updateShelter = asyncHandler(async (req, res) => {
  const shelter = await Shelter.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (!shelter) {
    return res.status(404).json({
      success: false,
      message: 'Shelter not found'
    });
  }

  res.json({
    success: true,
    message: 'Shelter updated successfully',
    data: { shelter }
  });
});

const deleteShelter = asyncHandler(async (req, res) => {
  const shelter = await Shelter.findById(req.params.id);

  if (!shelter) {
    return res.status(404).json({
      success: false,
      message: 'Shelter not found'
    });
  }

  await shelter.deleteOne();

  res.json({
    success: true,
    message: 'Shelter deleted successfully'
  });
});

module.exports = {
  getShelters,
  getNearbyShelters,
  getShelter,
  createShelter,
  updateShelter,
  deleteShelter
};

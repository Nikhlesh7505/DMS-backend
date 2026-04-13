/**
 * Resource Controller
 * Handles resource management operations
 */

const Resource = require('../models/Resource');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @desc    Get all resources
 * @route   GET /api/resources
 * @access  Public
 */
const getResources = asyncHandler(async (req, res) => {
  const { category, city, status, owner, page = 1, limit = 20 } = req.query;

  // Build query
  const query = {};
  if (category) query.category = category;
  if (city) query['location.city'] = city;
  if (status) query.status = status;
  if (owner) query.owner = owner;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const resources = await Resource.find(query)
    .populate('owner', 'name organization')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ category: 1, name: 1 });

  const total = await Resource.countDocuments(query);

  res.json({
    success: true,
    data: {
      resources,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Get single resource
 * @route   GET /api/resources/:id
 * @access  Public
 */
const getResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id)
    .populate('owner', 'name email phone organization')
    .populate('deployments.disaster', 'name type');

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: 'Resource not found'
    });
  }

  res.json({
    success: true,
    data: { resource }
  });
});

/**
 * @desc    Create new resource
 * @route   POST /api/resources
 * @access  Private/Admin/NGO
 */
const createResource = asyncHandler(async (req, res) => {
  const resourceData = {
    ...req.body,
    owner: req.user.id
  };

  const resource = await Resource.create(resourceData);

  res.status(201).json({
    success: true,
    message: 'Resource created successfully',
    data: { resource }
  });
});

/**
 * @desc    Update resource
 * @route   PUT /api/resources/:id
 * @access  Private/Owner/Admin
 */
const updateResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: 'Resource not found'
    });
  }

  // Check ownership
  if (resource.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this resource'
    });
  }

  const updatedResource = await Resource.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Resource updated successfully',
    data: { resource: updatedResource }
  });
});

/**
 * @desc    Allocate resource
 * @route   POST /api/resources/:id/allocate
 * @access  Private/Admin
 */
const allocateResource = asyncHandler(async (req, res) => {
  const { quantity, disasterId, notes } = req.body;

  const resource = await Resource.findById(req.params.id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: 'Resource not found'
    });
  }

  await resource.allocate(quantity, disasterId, notes);

  res.json({
    success: true,
    message: 'Resource allocated successfully',
    data: { resource }
  });
});

/**
 * @desc    Deploy resource
 * @route   POST /api/resources/:id/deploy
 * @access  Private/Admin
 */
const deployResource = asyncHandler(async (req, res) => {
  const { quantity, disasterId, location, notes } = req.body;

  const resource = await Resource.findById(req.params.id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: 'Resource not found'
    });
  }

  await resource.deploy(quantity, disasterId, location, notes);

  res.json({
    success: true,
    message: 'Resource deployed successfully',
    data: { resource }
  });
});

/**
 * @desc    Return resource
 * @route   POST /api/resources/:id/return
 * @access  Private/Admin
 */
const returnResource = asyncHandler(async (req, res) => {
  const { quantity, disasterId, notes } = req.body;

  const resource = await Resource.findById(req.params.id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: 'Resource not found'
    });
  }

  await resource.return(quantity, disasterId, notes);

  res.json({
    success: true,
    message: 'Resource returned successfully',
    data: { resource }
  });
});

/**
 * @desc    Add stock to resource
 * @route   POST /api/resources/:id/add-stock
 * @access  Private/Owner/Admin
 */
const addStock = asyncHandler(async (req, res) => {
  const { quantity, notes } = req.body;

  const resource = await Resource.findById(req.params.id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: 'Resource not found'
    });
  }

  // Check ownership
  if (resource.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this resource'
    });
  }

  await resource.addStock(quantity, notes);

  res.json({
    success: true,
    message: 'Stock added successfully',
    data: { resource }
  });
});

/**
 * @desc    Get my resources
 * @route   GET /api/resources/my-resources
 * @access  Private
 */
const getMyResources = asyncHandler(async (req, res) => {
  const resources = await Resource.getByOwner(req.user.id);

  res.json({
    success: true,
    data: { resources }
  });
});

/**
 * @desc    Get available resources by category
 * @route   GET /api/resources/available/:category
 * @access  Public
 */
const getAvailableByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;
  const { city } = req.query;

  const resources = await Resource.getAvailableByCategory(category, city);

  res.json({
    success: true,
    data: { resources }
  });
});

/**
 * @desc    Get low stock resources
 * @route   GET /api/resources/low-stock
 * @access  Private/Admin
 */
const getLowStock = asyncHandler(async (req, res) => {
  const { threshold = 10 } = req.query;

  const resources = await Resource.getLowStock(parseInt(threshold));

  res.json({
    success: true,
    data: { resources }
  });
});

/**
 * @desc    Get resource statistics
 * @route   GET /api/resources/statistics/overview
 * @access  Private/Admin
 */
const getStatistics = asyncHandler(async (req, res) => {
  const stats = await Resource.getStatistics();

  // Additional stats
  const totalResources = await Resource.countDocuments();
  const availableResources = await Resource.countDocuments({
    'quantity.available': { $gt: 0 }
  });
  const deployedResources = await Resource.countDocuments({
    'quantity.deployed': { $gt: 0 }
  });

  res.json({
    success: true,
    data: {
      byCategory: stats,
      summary: {
        totalResources,
        availableResources,
        deployedResources
      }
    }
  });
});

/**
 * @desc    Delete resource
 * @route   DELETE /api/resources/:id
 * @access  Private/Owner/Admin
 */
const deleteResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: 'Resource not found'
    });
  }

  // Check ownership
  if (resource.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this resource'
    });
  }

  await resource.deleteOne();

  res.json({
    success: true,
    message: 'Resource deleted successfully'
  });
});

module.exports = {
  getResources,
  getResource,
  createResource,
  updateResource,
  allocateResource,
  deployResource,
  returnResource,
  addStock,
  getMyResources,
  getAvailableByCategory,
  getLowStock,
  getStatistics,
  deleteResource
};

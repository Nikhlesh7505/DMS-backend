/**
 * Rescue Task Controller
 * Handles rescue task management operations
 */

const RescueTask = require('../models/RescueTask');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @desc    Get all rescue tasks
 * @route   GET /api/rescue-tasks
 * @access  Private
 */
const getTasks = asyncHandler(async (req, res) => {
  const { status, type, disaster, team, priority, page = 1, limit = 20 } = req.query;

  // Build query
  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;
  if (disaster) query.disaster = disaster;
  if (team) query['assignment.team'] = team;
  if (priority) query.priority = priority;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const tasks = await RescueTask.find(query)
    .populate('disaster', 'name type location')
    .populate('assignment.team', 'name organization')
    .populate('assignment.teamLead', 'name phone')
    .populate('emergencyRequest', 'type status')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ priority: -1, 'timeline.createdAt': -1 });

  const total = await RescueTask.countDocuments(query);

  res.json({
    success: true,
    data: {
      tasks,
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
 * @desc    Get active tasks
 * @route   GET /api/rescue-tasks/active
 * @access  Private
 */
const getActiveTasks = asyncHandler(async (req, res) => {
  const tasks = await RescueTask.getActive()
    .populate('disaster', 'name type')
    .populate('assignment.team', 'name organization');

  res.json({
    success: true,
    data: { tasks }
  });
});

/**
 * @desc    Get single task
 * @route   GET /api/rescue-tasks/:id
 * @access  Private
 */
const getTask = asyncHandler(async (req, res) => {
  const task = await RescueTask.findById(req.params.id)
    .populate('disaster', 'name type status location')
    .populate('assignment.team', 'name organization phone')
    .populate('assignment.teamLead', 'name phone email')
    .populate('assignment.assignedBy', 'name')
    .populate('teamMembers.member', 'name phone specialization')
    .populate('resources.resource', 'name category')
    .populate('emergencyRequest', 'type description status')
    .populate('updates.updatedBy', 'name')
    .populate('createdBy', 'name');

  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Task not found'
    });
  }

  res.json({
    success: true,
    data: { task }
  });
});

/**
 * @desc    Create new task
 * @route   POST /api/rescue-tasks
 * @access  Private/Admin
 */
const createTask = asyncHandler(async (req, res) => {
  const taskData = {
    ...req.body,
    createdBy: req.user.id
  };

  const task = await RescueTask.create(taskData);

  // Populate for response
  await task.populate('disaster', 'name type');
  await task.populate('assignment.team', 'name organization');

  res.status(201).json({
    success: true,
    message: 'Task created successfully',
    data: { task }
  });
});

/**
 * @desc    Update task
 * @route   PUT /api/rescue-tasks/:id
 * @access  Private
 */
const updateTask = asyncHandler(async (req, res) => {
  const task = await RescueTask.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Task not found'
    });
  }

  res.json({
    success: true,
    message: 'Task updated successfully',
    data: { task }
  });
});

/**
 * @desc    Update task status
 * @route   PUT /api/rescue-tasks/:id/status
 * @access  Private
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const task = await RescueTask.findById(req.params.id);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Task not found'
    });
  }

  // Check authorization
  const isAssigned = task.assignment.team.toString() === req.user.id ||
                     task.assignment.teamLead?.toString() === req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!isAssigned && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this task'
    });
  }

  await task.updateStatus(status, note, req.user.id);

  res.json({
    success: true,
    message: 'Status updated successfully',
    data: { task }
  });
});

/**
 * @desc    Add progress update
 * @route   POST /api/rescue-tasks/:id/progress
 * @access  Private
 */
const addProgress = asyncHandler(async (req, res) => {
  const { percentage, note } = req.body;

  const task = await RescueTask.findById(req.params.id);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Task not found'
    });
  }

  await task.addProgress(percentage, note, req.user.id);

  res.json({
    success: true,
    message: 'Progress updated successfully',
    data: { task }
  });
});

/**
 * @desc    Add team member
 * @route   POST /api/rescue-tasks/:id/team-members
 * @access  Private/Admin
 */
const addTeamMember = asyncHandler(async (req, res) => {
  const { memberId, role } = req.body;

  const task = await RescueTask.findById(req.params.id);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Task not found'
    });
  }

  await task.addTeamMember(memberId, role);

  res.json({
    success: true,
    message: 'Team member added successfully',
    data: { task }
  });
});

/**
 * @desc    Complete task
 * @route   PUT /api/rescue-tasks/:id/complete
 * @access  Private
 */
const completeTask = asyncHandler(async (req, res) => {
  const { outcome, summary } = req.body;

  const task = await RescueTask.findById(req.params.id);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Task not found'
    });
  }

  await task.complete(outcome, summary, req.user.id);

  res.json({
    success: true,
    message: 'Task completed successfully',
    data: { task }
  });
});

/**
 * @desc    Get my tasks (for rescue teams)
 * @route   GET /api/rescue-tasks/my-tasks
 * @access  Private
 */
const getMyTasks = asyncHandler(async (req, res) => {
  const tasks = await RescueTask.getByTeam(req.user.id)
    .populate('disaster', 'name type');

  res.json({
    success: true,
    data: { tasks }
  });
});

/**
 * @desc    Get pending tasks for team
 * @route   GET /api/rescue-tasks/pending-for-me
 * @access  Private
 */
const getPendingTasks = asyncHandler(async (req, res) => {
  const tasks = await RescueTask.getPendingForTeam(req.user.id)
    .populate('disaster', 'name type location');

  res.json({
    success: true,
    data: { tasks }
  });
});

/**
 * @desc    Get tasks by disaster
 * @route   GET /api/rescue-tasks/disaster/:disasterId
 * @access  Private
 */
const getTasksByDisaster = asyncHandler(async (req, res) => {
  const { disasterId } = req.params;

  const tasks = await RescueTask.getByDisaster(disasterId)
    .populate('assignment.team', 'name organization');

  res.json({
    success: true,
    data: { tasks }
  });
});

/**
 * @desc    Get task statistics
 * @route   GET /api/rescue-tasks/statistics/overview
 * @access  Private/Admin
 */
const getStatistics = asyncHandler(async (req, res) => {
  const stats = await RescueTask.getStatistics();

  // Additional stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTasks = await RescueTask.countDocuments({
    'timeline.createdAt': { $gte: today }
  });

  const completedToday = await RescueTask.countDocuments({
    'timeline.completedAt': { $gte: today }
  });

  res.json({
    success: true,
    data: {
      ...stats,
      todayTasks,
      completedToday
    }
  });
});

/**
 * @desc    Delete task
 * @route   DELETE /api/rescue-tasks/:id
 * @access  Private/Admin
 */
const deleteTask = asyncHandler(async (req, res) => {
  const task = await RescueTask.findById(req.params.id);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Task not found'
    });
  }

  await task.deleteOne();

  res.json({
    success: true,
    message: 'Task deleted successfully'
  });
});

module.exports = {
  getTasks,
  getActiveTasks,
  getTask,
  createTask,
  updateTask,
  updateStatus,
  addProgress,
  addTeamMember,
  completeTask,
  getMyTasks,
  getPendingTasks,
  getTasksByDisaster,
  getStatistics,
  deleteTask
};

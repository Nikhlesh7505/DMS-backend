const express = require('express');
const router = express.Router();
const shelterController = require('../controllers/shelter.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { auditAction } = require('../middleware/audit.middleware');

router.get('/', shelterController.getShelters);
router.get('/nearby', shelterController.getNearbyShelters);
router.get('/:id', shelterController.getShelter);

router.post(
  '/',
  authenticate,
  authorize('admin', 'ngo', 'rescue_team'),
  auditAction({ action: 'create_shelter', module: 'shelters', entityType: 'Shelter' }),
  shelterController.createShelter
);

router.put(
  '/:id',
  authenticate,
  authorize('admin', 'ngo', 'rescue_team'),
  auditAction({
    action: 'update_shelter',
    module: 'shelters',
    entityType: 'Shelter',
    entityIdResolver: (req) => req.params.id
  }),
  shelterController.updateShelter
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'ngo', 'rescue_team'),
  auditAction({
    action: 'delete_shelter',
    module: 'shelters',
    entityType: 'Shelter',
    entityIdResolver: (req) => req.params.id
  }),
  shelterController.deleteShelter
);

module.exports = router;

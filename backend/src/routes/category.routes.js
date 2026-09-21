const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');
const { responseContract } = require('../shared/http/response-contract');
const { catalogResponses } = require('../contracts/catalog.responses');

// Rutas públicas
router.get('/', responseContract(catalogResponses.getCategories), categoryController.getCategories);
router.get('/services/:id', responseContract(catalogResponses.getServiceById), categoryController.getServiceById);
router.get('/:id', responseContract(catalogResponses.getCategoryById), categoryController.getCategoryById);

// Rutas protegidas (solo admin)
router.post('/', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), responseContract(catalogResponses.createCategory), categoryController.createCategory);
router.put('/:id', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), responseContract(catalogResponses.updateCategory), categoryController.updateCategory);
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), responseContract(catalogResponses.deleteCategory), categoryController.deleteCategory);

module.exports = router;

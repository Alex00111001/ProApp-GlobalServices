const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');

// Rutas públicas
router.get('/', categoryController.getCategories);
router.get('/services/:id', categoryController.getServiceById);
router.get('/:id', categoryController.getCategoryById);

// Rutas protegidas (solo admin)
router.post('/', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), categoryController.createCategory);
router.put('/:id', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), categoryController.updateCategory);
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), categoryController.deleteCategory);

module.exports = router;

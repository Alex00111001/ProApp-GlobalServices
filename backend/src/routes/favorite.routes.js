const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favorite.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener favoritos del usuario
router.get('/', favoriteController.getFavorites);

// Agregar profesional a favoritos
router.post('/', favoriteController.addFavorite);

// Remover profesional de favoritos
router.delete('/:professionalId', favoriteController.removeFavorite);

// Verificar si un profesional está en favoritos
router.get('/check/:professionalId', favoriteController.checkFavorite);

module.exports = router;

const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favorite.controller');
const { authenticate } = require('../middleware/auth');
const { responseContract } = require('../shared/http/response-contract');
const { favoriteResponses } = require('../contracts/favorite.responses');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener favoritos del usuario
router.get('/', responseContract(favoriteResponses.list), favoriteController.getFavorites);

// Agregar profesional a favoritos
router.post('/', responseContract(favoriteResponses.add), favoriteController.addFavorite);

router.post('/toggle', responseContract(favoriteResponses.toggle), favoriteController.toggleFavorite);

// Remover profesional de favoritos
router.delete('/:professionalId', responseContract(favoriteResponses.remove), favoriteController.removeFavorite);

// Verificar si un profesional está en favoritos
router.get('/check/:professionalId', responseContract(favoriteResponses.check), favoriteController.checkFavorite);

module.exports = router;

const prisma = require('../lib/prisma');

/**
 * Obtener favoritos del usuario
 */
exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      skip: (page - 1) * limit,
      take: parseInt(limit),
      include: {
        professional: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            rating: true,
            reviewCount: true,
            city: true,
            services: {
              select: {
                id: true,
                name: true,
                price: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.favorite.count({
      where: { userId }
    });

    res.json({
      success: true,
      favorites: favorites.map(fav => fav.professional),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo favoritos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo favoritos',
      error: error.message 
    });
  }
};

/**
 * Agregar profesional a favoritos
 */
exports.addFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionalId } = req.body;

    if (!professionalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'El ID del profesional es requerido' 
      });
    }

    // Verificar que el profesional existe
    const professional = await prisma.professional.findUnique({
      where: { id: professionalId }
    });

    if (!professional) {
      return res.status(404).json({ 
        success: false, 
        message: 'Profesional no encontrado' 
      });
    }

    // Verificar si ya está en favoritos
    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_professionalId: {
          userId,
          professionalId
        }
      }
    });

    if (existingFavorite) {
      return res.status(400).json({ 
        success: false, 
        message: 'El profesional ya está en favoritos' 
      });
    }

    const favorite = await prisma.favorite.create({
      data: {
        userId,
        professionalId
      },
      include: {
        professional: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            rating: true,
            reviewCount: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Profesional agregado a favoritos',
      favorite: favorite.professional
    });

  } catch (error) {
    console.error('Error agregando favorito:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error agregando favorito',
      error: error.message 
    });
  }
};

/**
 * Remover profesional de favoritos
 */
exports.removeFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionalId } = req.params;

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_professionalId: {
          userId,
          professionalId
        }
      }
    });

    if (!favorite) {
      return res.status(404).json({ 
        success: false, 
        message: 'Favorito no encontrado' 
      });
    }

    await prisma.favorite.delete({
      where: {
        userId_professionalId: {
          userId,
          professionalId
        }
      }
    });

    res.json({
      success: true,
      message: 'Profesional removido de favoritos'
    });

  } catch (error) {
    console.error('Error removiendo favorito:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error removiendo favorito',
      error: error.message 
    });
  }
};

/**
 * Verificar si un profesional está en favoritos
 */
exports.checkFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionalId } = req.params;

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_professionalId: {
          userId,
          professionalId
        }
      }
    });

    res.json({
      success: true,
      isFavorite: !!favorite
    });

  } catch (error) {
    console.error('Error verificando favorito:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error verificando favorito',
      error: error.message 
    });
  }
};

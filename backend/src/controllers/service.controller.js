const prisma = require('../config/prisma');

// Obtener todos los servicios activos
exports.getServices = async (req, res) => {
  try {
    const { categoryId, subcategoryId, professionalId, isActive } = req.query;

    // Construir el filtro where dinámicamente
    const where = {};

    // Filtrar por isActive (por defecto true si no se especifica)
    if (isActive !== undefined) {
      // Convertir string a boolean si es necesario
      where.isActive = isActive === 'true' ? true : isActive === 'false' ? false : true;
    } else {
      where.isActive = true;
    }

    // Filtrar por categoría
    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Filtrar por subcategoría
    if (subcategoryId) {
      where.subcategoryId = subcategoryId;
    }

    // Filtrar por profesional
    if (professionalId) {
      where.professionalId = professionalId;
    }

    console.log('Services query where:', JSON.stringify(where));

    const services = await prisma.service.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            iconUrl: true,
          },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        professional: {
          select: {
            id: true,
            bio: true,
            yearsOfExperience: true,
            averageRating: true,
            totalReviews: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`Found ${services.length} services`);
    res.json({ services });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener un servicio por ID
exports.getServiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            iconUrl: true,
          },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        professional: {
          select: {
            id: true,
            bio: true,
            yearsOfExperience: true,
            averageRating: true,
            totalReviews: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json({ service });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener servicios de un profesional específico
exports.getProfessionalServices = async (req, res) => {
  try {
    const { professionalId } = req.params;

    const services = await prisma.service.findMany({
      where: {
        professionalId,
        isActive: true,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ services });
  } catch (error) {
    console.error('Get professional services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Crear servicio (solo profesionales o admin)
exports.createService = async (req, res) => {
  try {
    const { name, description, basePrice, duration, categoryId, subcategoryId } = req.body;
    const professionalId = req.user?.professionalProfile?.id;

    if (!professionalId) {
      return res.status(403).json({ error: 'Professional profile required' });
    }

    const service = await prisma.service.create({
      data: {
        name,
        description,
        basePrice: parseFloat(basePrice),
        duration: parseInt(duration),
        categoryId,
        subcategoryId,
        professionalId,
      },
      include: {
        category: true,
        subcategory: true,
      },
    });

    res.status(201).json({
      message: 'Service created successfully',
      service,
    });
  } catch (error) {
    console.error('Create service error:', error);
    
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        error: 'Service with this name already exists for this professional' 
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
};

// Actualizar servicio
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, basePrice, duration, categoryId, subcategoryId, isActive } = req.body;
    const professionalId = req.user?.professionalProfile?.id;

    // Verificar que el servicio pertenezca al profesional
    const existingService = await prisma.service.findUnique({
      where: { id },
      select: { professionalId: true },
    });

    if (!existingService) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Solo el dueño del servicio puede actualizarlo (o admin)
    if (existingService.professionalId !== professionalId && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const service = await prisma.service.update({
      where: { id },
      data: {
        name,
        description,
        basePrice: basePrice ? parseFloat(basePrice) : undefined,
        duration: duration ? parseInt(duration) : undefined,
        categoryId,
        subcategoryId,
        isActive,
      },
    });

    res.json({
      message: 'Service updated successfully',
      service,
    });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Eliminar servicio (soft delete)
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const professionalId = req.user?.professionalProfile?.id;

    // Verificar que el servicio pertenezca al profesional
    const existingService = await prisma.service.findUnique({
      where: { id },
      select: { professionalId: true },
    });

    if (!existingService) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Solo el dueño del servicio puede eliminarlo (o admin)
    if (existingService.professionalId !== professionalId && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.service.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: 'Service deactivated successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;

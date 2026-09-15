const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');

exports.getServiceById = async (req, res, next) => {
  try {
    const service = await prisma.service.findFirst({
      where: {
        id: req.params.id,
        isActive: true,
        OR: [{ professionalId: null }, { professional: { status: 'APPROVED' } }],
      },
      include: {
        category: true,
        subcategory: true,
        professional: {
          include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
        },
      },
    });
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ service });
  } catch (error) {
    logError(req, error, 'Service lookup failed');
    next(error);
  }
};

// Obtener todas las categorías activas
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: {
        subcategories: {
          where: { isActive: true },
        },
        _count: {
          select: { professionals: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ categories });
  } catch (error) {
    logError(req, error, 'Category list query failed');
    next(error);
  }
};

// Obtener una categoría por ID
exports.getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        subcategories: {
          where: { isActive: true },
        },
        professionals: {
          where: { professional: { status: 'APPROVED' } },
          include: {
            professional: {
              include: {
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
        },
        services: {
          where: { isActive: true },
          take: 10,
        },
      },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ category });
  } catch (error) {
    logError(req, error, 'Category lookup failed');
    next(error);
  }
};

// Crear categoría (solo admin)
exports.createCategory = async (req, res, next) => {
  try {
    const { name, slug, description, iconUrl } = req.body;

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
        iconUrl,
      },
    });

    res.status(201).json({
      message: 'Category created successfully',
      category,
    });
  } catch (error) {
    logError(req, error, 'Category creation failed');
    
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        error: 'Category with this name or slug already exists' 
      });
    }

    next(error);
  }
};

// Actualizar categoría (solo admin)
exports.updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, description, iconUrl, isActive } = req.body;

    const category = await prisma.category.update({
      where: { id },
      data: {
        name,
        slug,
        description,
        iconUrl,
        isActive,
      },
    });

    res.json({
      message: 'Category updated successfully',
      category,
    });
  } catch (error) {
    logError(req, error, 'Category update failed');
    next(error);
  }
};

// Eliminar categoría (solo admin - soft delete)
exports.deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: 'Category deactivated successfully' });
  } catch (error) {
    logError(req, error, 'Category deletion failed');
    next(error);
  }
};

module.exports = exports;

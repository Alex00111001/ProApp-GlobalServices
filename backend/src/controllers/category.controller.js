const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');

exports.getServiceById = async (req, res) => {
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener todas las categorías activas
exports.getCategories = async (req, res) => {
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Obtener una categoría por ID
exports.getCategoryById = async (req, res) => {
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Crear categoría (solo admin)
exports.createCategory = async (req, res) => {
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

    res.status(500).json({ error: 'Internal server error' });
  }
};

// Actualizar categoría (solo admin)
exports.updateCategory = async (req, res) => {
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Eliminar categoría (solo admin - soft delete)
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: 'Category deactivated successfully' });
  } catch (error) {
    logError(req, error, 'Category deletion failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = exports;

const prisma = require('../config/prisma');
const { logError } = require('../modules/observability/safe-log');

const professionalInclude = {
  user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  categories: { include: { category: true } },
  services: { where: { isActive: true } },
};

const getClient = (req, res) => {
  if (req.user.clientProfile) return req.user.clientProfile;
  res.status(403).json({ error: 'Client profile required' });
  return null;
};

exports.getFavorites = async (req, res) => {
  try {
    const client = getClient(req, res);
    if (!client) return;
    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10), 1), 100);
    const where = { clientId: client.id };
    const [favorites, total] = await prisma.$transaction([
      prisma.favoriteProfessional.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { professional: { include: professionalInclude } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.favoriteProfessional.count({ where }),
    ]);
    res.json({
      favorites: favorites.map((favorite) => favorite.professional),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logError(req, error, 'Favorite list query failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.addFavorite = async (req, res) => {
  try {
    const client = getClient(req, res);
    if (!client) return;
    const { professionalId } = req.body;
    if (!professionalId) return res.status(400).json({ error: 'professionalId is required' });
    const professional = await prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      include: professionalInclude,
    });
    if (!professional) return res.status(404).json({ error: 'Professional not found' });
    await prisma.favoriteProfessional.upsert({
      where: { clientId_professionalId: { clientId: client.id, professionalId } },
      update: {},
      create: { clientId: client.id, professionalId },
    });
    return res.status(201).json({ favorite: professional, isFavorite: true });
  } catch (error) {
    logError(req, error, 'Favorite creation failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    const client = getClient(req, res);
    if (!client) return;
    await prisma.favoriteProfessional.deleteMany({
      where: { clientId: client.id, professionalId: req.params.professionalId },
    });
    return res.json({ isFavorite: false });
  } catch (error) {
    logError(req, error, 'Favorite deletion failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.checkFavorite = async (req, res) => {
  try {
    const client = getClient(req, res);
    if (!client) return;
    const favorite = await prisma.favoriteProfessional.findUnique({
      where: {
        clientId_professionalId: {
          clientId: client.id,
          professionalId: req.params.professionalId,
        },
      },
    });
    return res.json({ isFavorite: Boolean(favorite) });
  } catch (error) {
    logError(req, error, 'Favorite status query failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.toggleFavorite = async (req, res) => {
  try {
    const client = getClient(req, res);
    if (!client) return;
    const { professionalId } = req.body;
    if (!professionalId) return res.status(400).json({ error: 'professionalId is required' });
    const key = { clientId_professionalId: { clientId: client.id, professionalId } };
    const existing = await prisma.favoriteProfessional.findUnique({ where: key });
    if (existing) {
      await prisma.favoriteProfessional.delete({ where: { id: existing.id } });
      return res.json({ isFavorite: false });
    }
    const professional = await prisma.professionalProfile.findUnique({ where: { id: professionalId } });
    if (!professional) return res.status(404).json({ error: 'Professional not found' });
    await prisma.favoriteProfessional.create({ data: { clientId: client.id, professionalId } });
    return res.status(201).json({ isFavorite: true });
  } catch (error) {
    logError(req, error, 'Favorite toggle failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

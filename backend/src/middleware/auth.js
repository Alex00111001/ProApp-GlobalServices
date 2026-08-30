const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const env = require('../config/env');

const JWT_SECRET = env.jwtSecret;
const JWT_EXPIRES_IN = env.jwtExpiresIn;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}

// Generar token JWT
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Verificar token JWT
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

// Middleware para autenticar usuario
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    // Buscar usuario en la base de datos
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        clientProfile: true,
        professionalProfile: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'Invalid token or user inactive.' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ 
      error: 'Invalid or expired token.' 
    });
  }
};

// Middleware para verificar roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden. Insufficient permissions.' 
      });
    }

    next();
  };
};

const requireApprovedProfessional = (req, res, next) => {
  if (req.user?.role !== 'PROFESSIONAL') {
    return res.status(403).json({ error: 'Professional account required.' });
  }
  if (req.user.professionalProfile?.status !== 'APPROVED') {
    return res.status(403).json({ error: 'Professional verification is required for this action.' });
  }
  next();
};

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  authorize,
  requireApprovedProfessional,
  JWT_SECRET,
};

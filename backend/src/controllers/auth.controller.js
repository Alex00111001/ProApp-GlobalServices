const prisma = require('../config/prisma');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken } = require('../middleware/auth');
const { registerSchema, loginSchema } = require('../validators/auth.validators');

// Registrar usuario
exports.register = async (req, res) => {
  try {
    // Validar datos de entrada
    const validatedData = registerSchema.parse(req.body);

    // Verificar si el email o teléfono ya existen
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: validatedData.email },
          { phone: validatedData.phone },
        ],
      },
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: 'Email or phone already registered' 
      });
    }

    // Hashear contraseña
    const passwordHash = await hashPassword(validatedData.password);

    // Crear usuario
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        phone: validatedData.phone,
        passwordHash,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: validatedData.role,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    // Crear perfil según el rol
    if (validatedData.role === 'CLIENT') {
      await prisma.clientProfile.create({
        data: { userId: user.id },
      });
    } else if (validatedData.role === 'PROFESSIONAL') {
      await prisma.professionalProfile.create({
        data: { 
          userId: user.id,
          status: 'PENDING_REVIEW',
        },
      });
    }

    // Generar token JWT
    const token = generateToken({ userId: user.id, role: user.role });

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token,
    });
  } catch (error) {
    console.error('Register error:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }

    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    // Validar datos de entrada
    const validatedData = loginSchema.parse(req.body);

    // Buscar usuario por email
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
      include: {
        clientProfile: true,
        professionalProfile: true,
      },
    });

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Verificar si el usuario está activo
    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Account is deactivated' 
      });
    }

    // Verificar contraseña
    const isValidPassword = await comparePassword(
      validatedData.password, 
      user.passwordHash
    );

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Actualizar último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generar token JWT
    const token = generateToken({ userId: user.id, role: user.role });

    // Eliminar passwordHash de la respuesta
    const { passwordHash, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }

    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
};

// Obtener perfil del usuario autenticado
exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        clientProfile: {
          include: {
            favoriteProfessionals: {
              include: { professional: true },
            },
          },
        },
        professionalProfile: {
          include: {
            categories: { include: { category: true } },
            services: true,
            portfolio: true,
            certifications: true,
            availability: true,
          },
        },
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Actualizar perfil
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, avatarUrl } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        firstName,
        lastName,
        avatarUrl,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        updatedAt: true,
      },
    });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Cambiar contraseña
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'New password must be at least 8 characters' 
      });
    }

    // Obtener usuario con passwordHash
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    // Verificar contraseña actual
    const isValidPassword = await comparePassword(
      currentPassword, 
      user.passwordHash
    );

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Current password is incorrect' 
      });
    }

    // Hashear nueva contraseña
    const passwordHash = await hashPassword(newPassword);

    // Actualizar contraseña
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

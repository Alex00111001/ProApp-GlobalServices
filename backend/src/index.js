require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de Health Check & DB Test
app.get('/api/health', async (req, res) => {
  try {
    // Verificar conexión a DB contando usuarios
    const userCount = await prisma.user.count();

    res.json({
      status: 'OK',
      message: 'Server is running and connected to Database',
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        userCount: userCount
      }
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'API de Servicios a Domicilio v1.0',
    endpoints: {
      health: '/api/health'
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🚀 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
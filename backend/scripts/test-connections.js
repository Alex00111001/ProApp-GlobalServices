/**
 * Script de Verificación de Conexiones
 * 
 * Este script prueba las conexiones a los servicios externos
 * sin exponer las credenciales reales.
 * 
 * Uso: node scripts/test-connections.js
 */

require('dotenv').config();

const testConnections = async () => {
  console.log('🔍 Iniciando pruebas de conexión...\n');
  
  const results = {
    database: { status: '⏳ Pendiente', message: '' },
    cloudinary: { status: '⏳ Pendiente', message: '' },
    jwt: { status: '⏳ Pendiente', message: '' },
    stripe: { status: '⏳ Pendiente', message: '' }
  };

  // 1. Prueba de Base de Datos (Prisma)
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    await prisma.$connect();
    
    // Verificar si podemos hacer una consulta simple
    const count = await prisma.user.count();
    
    results.database = {
      status: '✅ Conectado',
      message: `PostgreSQL conectado exitosamente. Usuarios en BD: ${count}`
    };
    
    await prisma.$disconnect();
  } catch (error) {
    results.database = {
      status: '❌ Error',
      message: error.message.split('\n')[0]
    };
  }

  // 2. Prueba de Cloudinary
  try {
    const cloudinary = require('cloudinary').v2;
    
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    
    // Test de ping a Cloudinary
    const result = await cloudinary.api.ping();
    
    results.cloudinary = {
      status: '✅ Conectado',
      message: `Cloudinary conectado. Estado: ${result.status}`
    };
  } catch (error) {
    results.cloudinary = {
      status: '❌ Error',
      message: error.message
    };
  }

  // 3. Prueba de configuración JWT
  try {
    const jwt = require('jsonwebtoken');
    
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET es muy corto o no está configurado');
    }
    
    // Crear y verificar un token de prueba
    const testPayload = { id: 'test', role: 'CLIENT' };
    const token = jwt.sign(testPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    results.jwt = {
      status: '✅ Configurado',
      message: `JWT configurado correctamente. Expiración: ${process.env.JWT_EXPIRES_IN}`
    };
  } catch (error) {
    results.jwt = {
      status: '❌ Error',
      message: error.message
    };
  }

  // 4. Prueba de Stripe (solo validación de configuración)
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY no configurada');
    }
    
    // Validar formato de la clave
    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') && 
        !process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
      throw new Error('Formato de STRIPE_SECRET_KEY inválido');
    }
    
    results.stripe = {
      status: '✅ Configurado',
      message: 'Stripe configurado (modo prueba)'
    };
  } catch (error) {
    results.stripe = {
      status: '❌ Error',
      message: error.message
    };
  }

  // Mostrar resultados
  console.log('═'.repeat(60));
  console.log('📊 RESULTADOS DE CONEXIÓN');
  console.log('═'.repeat(60));
  
  Object.entries(results).forEach(([service, result]) => {
    console.log(`\n${service.toUpperCase()}:`);
    console.log(`  Estado: ${result.status}`);
    console.log(`  Detalle: ${result.message}`);
  });
  
  console.log('\n' + '═'.repeat(60));
  
  // Resumen
  const allOk = Object.values(results).every(r => r.status.includes('✅'));
  
  if (allOk) {
    console.log('🎉 ¡Todas las conexiones están funcionando correctamente!');
    console.log('\n📝 Para compartir estos resultados:');
    console.log('   Copia este output y pégalo en tu conversación.');
    console.log('   ⚠️  NUNCA compartas el archivo .env real.');
  } else {
    console.log('⚠️  Algunas conexiones fallaron. Revisa tu configuración .env');
  }
  
  console.log('═'.repeat(60));
  
  process.exit(allOk ? 0 : 1);
};

testConnections().catch(console.error);

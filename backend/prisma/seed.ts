// 1. Cargar variables de entorno EXPLÍCITAMENTE antes de nada
import * as dotenv from 'dotenv';
import * as path from 'path';
import bcrypt from 'bcryptjs';
// Carga el .env desde la carpeta backend
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Verificación temprana para depuración
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR CRÍTICO: No se encontró DATABASE_URL en el .env');
  console.error('📂 Ruta buscando .env:', path.resolve(__dirname, '../.env'));
  console.error('📄 Contenido del proceso env:', Object.keys(process.env));
  process.exit(1);
}

// 2. Imports normales después de cargar dotenv
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Configuración de conexión
const connectionString = process.env.DATABASE_URL;

console.log('🔗 Conectando a la base de datos...');

const pool = new pg.Pool({
  connectionString,
  max: 5, // Limitar conexiones para evitar saturar el pooler de Supabase
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');
  
  const categoriesData = [
    {
      name: 'Limpieza',
      slug: 'limpieza',
      description: 'Servicios de limpieza para hogar y oficinas',
      iconUrl: 'sparkles-outline',
      subcategories: [
        {
          name: 'Limpieza del Hogar',
          slug: 'limpieza-hogar',
          services: [
            { name: 'Limpieza General', description: 'Limpieza completa de rooms, bathrooms y kitchen', basePrice: 50, duration: 120 },
            { name: 'Limpieza Profunda', description: 'Limpieza detallada incluyendo ventanas y alfombras', basePrice: 80, duration: 180 },
            { name: 'Limpieza Post-Evento', description: 'Limpieza después de fiestas o eventos', basePrice: 60, duration: 90 },
          ],
        },
        {
          name: 'Limpieza de Oficinas',
          slug: 'limpieza-oficinas',
          services: [
            { name: 'Limpieza Regular', description: 'Limpieza periódica de espacios de trabajo', basePrice: 70, duration: 120 },
            { name: 'Limpieza de Alfombras', description: 'Limpieza especializada de alfombras', basePrice: 100, duration: 180 },
          ],
        },
      ],
    },
    {
      name: 'Electricidad',
      slug: 'electricidad',
      description: 'Servicios eléctricos residenciales y comerciales',
      iconUrl: 'flash-outline',
      subcategories: [
        {
          name: 'Instalaciones Eléctricas',
          slug: 'instalaciones-electricas',
          services: [
            { name: 'Instalación Completa', description: 'Cableado completo para viviendas', basePrice: 150, duration: 240 },
            { name: 'Instalación de Tomacorrientes', description: 'Instalación de puntos eléctricos', basePrice: 30, duration: 30 },
            { name: 'Instalación de Iluminación', description: 'Instalación de luminarias interiores/exteriores', basePrice: 50, duration: 60 },
          ],
        },
        {
          name: 'Reparaciones Eléctricas',
          slug: 'reparaciones-electricas',
          services: [
            { name: 'Diagnóstico de Fallas', description: 'Identificación de problemas eléctricos', basePrice: 60, duration: 60 },
            { name: 'Reparación de Cortocircuitos', description: 'Solución de cortos y fallas', basePrice: 80, duration: 90 },
            { name: 'Cambio de Breakers', description: 'Reemplazo de interruptores', basePrice: 40, duration: 30 },
          ],
        },
      ],
    },
    {
      name: 'Plomería',
      slug: 'plomeria',
      description: 'Servicios de plomería y tuberías',
      iconUrl: 'water-outline',
      subcategories: [
        {
          name: 'Reparaciones',
          slug: 'reparaciones-plomeria',
          services: [
            { name: 'Reparación de Fugas', description: 'Detección y reparación de fugas de agua', basePrice: 80, duration: 90 },
            { name: 'Destape de Drenajes', description: 'Limpieza de tuberías obstruidas', basePrice: 70, duration: 60 },
            { name: 'Reparación de Grifos', description: 'Cambio de empaques y grifos', basePrice: 50, duration: 45 },
          ],
        },
        {
          name: 'Instalaciones',
          slug: 'instalaciones-plomeria',
          services: [
            { name: 'Instalación de Baño', description: 'Instalación completa de sanitarios', basePrice: 150, duration: 180 },
            { name: 'Instalación de Calentador', description: 'Colocación de calentadores de agua', basePrice: 200, duration: 120 },
            { name: 'Instalación de Lavabo', description: 'Montaje de lavabos y mesones', basePrice: 100, duration: 90 },
          ],
        },
      ],
    },
    {
      name: 'Carpintería',
      slug: 'carpinteria',
      description: 'Trabajos en madera y muebles',
      iconUrl: 'hammer-outline',
      subcategories: [
        {
          name: 'Muebles a Medida',
          slug: 'muebles-medida',
          services: [
            { name: 'Diseño y Fabricación', description: 'Creación de muebles personalizados', basePrice: 300, duration: 480 },
            { name: 'Restauración de Muebles', description: 'Renovación de muebles antiguos', basePrice: 150, duration: 240 },
          ],
        },
        {
          name: 'Reparaciones',
          slug: 'reparaciones-carpinteria',
          services: [
            { name: 'Reparación de Puertas', description: 'Ajuste y reparación de puertas', basePrice: 80, duration: 90 },
            { name: 'Reparación de Ventanas', description: 'Arreglo de marcos y cristales', basePrice: 100, duration: 120 },
          ],
        },
      ],
    },
    {
      name: 'Pintura',
      slug: 'pintura',
      description: 'Servicios de pintura interior y exterior',
      iconUrl: 'color-palette-outline',
      subcategories: [
        {
          name: 'Pintura Interior',
          slug: 'pintura-interior',
          services: [
            { name: 'Pintura de Rooms', description: 'Pintado de habitaciones completas', basePrice: 120, duration: 240 },
            { name: 'Pintura de Techos', description: 'Aplicación de pintura en techos', basePrice: 100, duration: 180 },
          ],
        },
        {
          name: 'Pintura Exterior',
          slug: 'pintura-exterior',
          services: [
            { name: 'Fachadas', description: 'Pintado de exteriores de edificios', basePrice: 200, duration: 360 },
            { name: 'Impermeabilización', description: 'Aplicación de impermeabilizante', basePrice: 180, duration: 300 },
          ],
        },
      ],
    },
    {
      name: 'Jardinería',
      slug: 'jardineria',
      description: 'Mantenimiento de jardines y áreas verdes',
      iconUrl: 'leaf-outline',
      subcategories: [
        {
          name: 'Mantenimiento',
          slug: 'mantenimiento-jardines',
          services: [
            { name: 'Corte de Césped', description: 'Poda y mantenimiento de pasto', basePrice: 60, duration: 90 },
            { name: 'Poda de Árboles', description: 'Trimming de árboles y arbustos', basePrice: 80, duration: 120 },
          ],
        },
        {
          name: 'Diseño de Jardines',
          slug: 'diseno-jardines',
          services: [
            { name: 'Diseño Paisajístico', description: 'Planificación de jardines', basePrice: 200, duration: 180 },
            { name: 'Instalación de Riego', description: 'Sistemas de riego automático', basePrice: 250, duration: 240 },
          ],
        },
      ],
    },
    {
      name: 'Climatización',
      slug: 'climatizacion',
      description: 'Aire acondicionado y calefacción',
      iconUrl: 'thermometer-outline',
      subcategories: [
        {
          name: 'Aire Acondicionado',
          slug: 'aire-acondicionado',
          services: [
            { name: 'Instalación de AC', description: 'Montaje de unidades de aire', basePrice: 200, duration: 180 },
            { name: 'Mantenimiento de AC', description: 'Limpieza y revisión de equipos', basePrice: 80, duration: 90 },
            { name: 'Reparación de AC', description: 'Diagnóstico y reparación de fallas', basePrice: 120, duration: 120 },
          ],
        },
        {
          name: 'Calefacción',
          slug: 'calefaccion',
          services: [
            { name: 'Instalación de Calefactor', description: 'Colocación de sistemas de calor', basePrice: 180, duration: 180 },
            { name: 'Mantenimiento de Caldera', description: 'Revisión anual de calderas', basePrice: 100, duration: 90 },
          ],
        },
      ],
    },
    {
      name: 'Tecnología',
      slug: 'tecnologia',
      description: 'Servicios técnicos y de instalación',
      iconUrl: 'tv-outline',
      subcategories: [
        {
          name: 'Instalaciones',
          slug: 'instalaciones-tech',
          services: [
            { name: 'Instalación de TV', description: 'Montaje de televisores en pared', basePrice: 50, duration: 60 },
            { name: 'Redes WiFi', description: 'Configuración de redes domésticas', basePrice: 80, duration: 90 },
            { name: 'Cámaras de Seguridad', description: 'Instalación de sistemas CCTV', basePrice: 150, duration: 180 },
          ],
        },
        {
          name: 'Reparación de Equipos',
          slug: 'reparacion-equipos',
          services: [
            { name: 'Reparación de PC', description: 'Diagnóstico y reparación de computadoras', basePrice: 80, duration: 120 },
            { name: 'Recuperación de Datos', description: 'Rescate de información perdida', basePrice: 120, duration: 180 },
          ],
        },
      ],
    },
  ];

  for (const catData of categoriesData) {
    const category = await prisma.category.upsert({
      where: { slug: catData.slug },
      update: {},
      create: {
        name: catData.name,
        slug: catData.slug,
        description: catData.description,
        iconUrl: catData.iconUrl,
        isActive: true,
      },
    });

    console.log(`✓ Created category: ${category.name}`);

    for (const subcatData of catData.subcategories) {
      const subcategory = await prisma.subcategory.upsert({
        where: { slug: subcatData.slug },
        update: {},
        create: {
          categoryId: category.id,
          name: subcatData.name,
          slug: subcatData.slug,
          isActive: true,
        },
      });

      console.log(`  ✓ Created subcategory: ${subcategory.name}`);

      for (const serviceData of subcatData.services) {
        const existingService = await prisma.service.findFirst({
          where: { 
            name: serviceData.name,
            categoryId: category.id 
          }
        });

        if (!existingService) {
          await prisma.service.create({
            data: {
              categoryId: category.id,
              subcategoryId: subcategory.id,
              name: serviceData.name,
              description: serviceData.description,
              basePrice: serviceData.basePrice,
              duration: serviceData.duration,
              isActive: true,
            },
          });
          console.log(`    ✓ Created service: ${serviceData.name}`);
        }
      }
    }
  }

  const adminPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@servicepro.com' },
    update: {},
    create: {
      email: 'admin@servicepro.com',
      passwordHash: adminPassword,
      firstName: 'Administrador',
      lastName: 'ServicePro',
      phone: '+525512345678',
      role: 'ADMIN',
    },
  });

  console.log('✓ Created admin user');

  const professionalPassword = await bcrypt.hash('professional123', 10);
  
  const professionalsData = [
    {
      email: 'juan.electricista@example.com',
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '+525511111111',
      bio: 'Electricista certificado con 15 años de experiencia.',
      hourlyRate: 45,
      yearsOfExperience: 15,
      serviceRadius: 25,
      categorySlug: 'electricidad',
    },
    {
      email: 'maria.plomera@example.com',
      firstName: 'María',
      lastName: 'González',
      phone: '+525522222222',
      bio: 'Plomera profesional con certificación en instalaciones hidráulicas.',
      hourlyRate: 40,
      yearsOfExperience: 10,
      serviceRadius: 20,
      categorySlug: 'plomeria',
    },
    {
      email: 'carlos.carpintero@example.com',
      firstName: 'Carlos',
      lastName: 'Rodríguez',
      phone: '+525533333333',
      bio: 'Carpintero artesano especializado en muebles a medida.',
      hourlyRate: 50,
      yearsOfExperience: 20,
      serviceRadius: 30,
      categorySlug: 'carpinteria',
    },
    {
      email: 'ana.limpieza@example.com',
      firstName: 'Ana',
      lastName: 'Martínez',
      phone: '+525544444444',
      bio: 'Servicio de limpieza profesional para hogares y oficinas.',
      hourlyRate: 35,
      yearsOfExperience: 8,
      serviceRadius: 15,
      categorySlug: 'limpieza',
    },
    {
      email: 'luis.pintor@example.com',
      firstName: 'Luis',
      lastName: 'Hernández',
      phone: '+525555555555',
      bio: 'Pintor profesional con experiencia en acabados de alta calidad.',
      hourlyRate: 42,
      yearsOfExperience: 12,
      serviceRadius: 25,
      categorySlug: 'pintura',
    },
  ];

  for (const profData of professionalsData) {
    const user = await prisma.user.upsert({
      where: { email: profData.email },
      update: {},
      create: {
        email: profData.email,
        passwordHash: professionalPassword,
        firstName: profData.firstName,
        lastName: profData.lastName,
        phone: profData.phone,
        role: 'PROFESSIONAL',
      },
    });

    const category = await prisma.category.findUnique({
      where: { slug: profData.categorySlug },
    });

    const professional = await prisma.professionalProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        bio: profData.bio,
        hourlyRate: profData.hourlyRate,
        yearsOfExperience: profData.yearsOfExperience,
        serviceRadius: profData.serviceRadius,
        status: 'APPROVED',
        averageRating: 4.5 + Math.random() * 0.5,
        totalReviews: Math.floor(Math.random() * 100),
        totalBookings: Math.floor(Math.random() * 200),
      },
    });

    if (category) {
      await prisma.professionalCategory.create({
        data: {
          professionalId: professional.id,
          categoryId: category.id,
          verified: true,
        },
      });
    }

    console.log(`✓ Created professional: ${profData.firstName} ${profData.lastName}`);
  }

  await prisma.systemSetting.upsert({
    where: { key: 'PLATFORM_FEE_PERCENTAGE' },
    update: {},
    create: {
      key: 'PLATFORM_FEE_PERCENTAGE',
      value: { percentage: 10 },
      description: 'Porcentaje de comisión de la plataforma',
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'MINIMUM_BOOKING_AMOUNT' },
    update: {},
    create: {
      key: 'MINIMUM_BOOKING_AMOUNT',
      value: { amount: 50 },
      description: 'Monto mínimo para reservas',
    },
  });

  console.log('✓ Created system settings');

  console.log('\n✅ Database seeding completed successfully!');
  console.log(`\n   - ${categoriesData.length} categories created`);
  console.log(`   - ${professionalsData.length} sample professionals created`);
  console.log('   - Admin: admin@servicepro.com / admin123');
  console.log('   - Professional password: professional123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

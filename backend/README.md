# Backend - Plataforma de Servicios a Domicilio

## 📋 Descripción
Backend API para la plataforma global de servicios a domicilio (limpieza, plomería, jardinería, etc.)

## 🏗️ Arquitectura
- **Runtime:** Node.js
- **ORM:** Prisma
- **Base de Datos:** PostgreSQL (Supabase)
- **Almacenamiento:** Cloudinary
- **Autenticación:** JWT

## 🚀 Inicio Rápido

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Edita .env con tus credenciales reales
```

### 3. Configurar base de datos
```bash
# Generar cliente de Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate dev --name init

# (Opcional) Seed inicial
npx prisma db seed
```

### 4. Iniciar servidor
```bash
npm run dev
```

## 📁 Estructura del Proyecto

```
backend/
├── prisma/
│   ├── schema.prisma      # Modelo de datos
│   └── migrations/        # Migraciones de BD
├── src/
│   ├── controllers/       # Controladores de rutas
│   ├── services/          # Lógica de negocio
│   ├── middleware/        # Middleware (auth, validación)
│   ├── routes/            # Definición de rutas
│   ├── utils/             # Utilidades
│   └── index.js           # Punto de entrada
├── .env.example           # Variables de entorno de ejemplo
└── package.json
```

## 🔑 Modelos Principales

- **User:** Usuarios (Clientes, Profesionales, Admins)
- **ClientProfile:** Perfiles de clientes
- **ProfessionalProfile:** Perfiles de profesionales
- **Category/Subcategory:** Categorías de servicios
- **Service:** Servicios ofrecidos
- **Booking:** Reservas de servicios
- **Payment:** Pagos y transacciones
- **Review:** Calificaciones y reseñas
- **Document:** Documentos verificados (antecedentes, IDs)
- **Portfolio:** Portafolio de trabajos del profesional

## 🔧 Scripts Disponibles

```bash
npm run dev          # Desarrollo con hot-reload
npm run build        # Compilar para producción
npm start            # Iniciar en producción
npm run prisma:gen   # Generar cliente Prisma
npm run prisma:migrate # Ejecutar migraciones
npm run prisma:studio # Abrir Prisma Studio
```

## 📝 Notas Importantes

1. **Cloudinary:** Configurar credenciales para almacenamiento de imágenes
2. **Supabase:** Obtener URL de conexión PostgreSQL desde el dashboard
3. **Seguridad:** Cambiar JWT_SECRET en producción
4. **Pagos:** Integrar Stripe/PayPal según región

## 🌐 Endpoints Principales (API v1)

- `POST /api/v1/auth/register` - Registro de usuarios
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/services` - Listar servicios
- `POST /api/v1/bookings` - Crear reserva
- `GET /api/v1/professionals` - Buscar profesionales
- `POST /api/v1/documents/upload` - Subir documentos (Cloudinary)

## 📚 Documentación

Para más detalles, consulta la documentación completa en `/docs`

# Backend - Plataforma de Servicios a Domicilio

API RESTful construida con Node.js, Express y Prisma para una plataforma global de servicios a domicilio (tipo Uber/iFood para limpieza, plomería, jardinería, etc.).

## 📋 Requisitos Previos

- Node.js >= 18.x
- PostgreSQL (Supabase)
- npm o yarn

## 🚀 Instalación

```bash
# Instalar dependencias
npm install

# Copiar archivo de entorno
cp .env.example .env

# Configurar variables de entorno en .env

# Generar cliente de Prisma
npm run prisma:gen

# Sincronizar schema con la base de datos
npm run prisma:push

# Iniciar servidor en modo desarrollo
npm run dev
```

## 📁 Estructura del Proyecto

```
backend/
├── src/
│   ├── config/          # Configuraciones (Prisma, Cloudinary)
│   ├── controllers/     # Lógica de negocio
│   ├── middleware/      # Auth, upload, validaciones
│   ├── routes/          # Definición de rutas
│   ├── services/        # Servicios reutilizables
│   ├── utils/           # Funciones utilitarias
│   ├── validators/      # Validaciones con Zod
│   └── index.js         # Punto de entrada
├── prisma/
│   └── schema.prisma    # Schema de base de datos
├── .env.example         # Variables de entorno de ejemplo
└── package.json
```

## 🔑 Endpoints de la API

### Estado del servicio
- `GET /health` - Comprueba que la API y la base de datos están disponibles.

### Autenticación (`/api/auth`)
- `POST /register` - Registrar nuevo usuario
- `POST /login` - Login de usuario
- `GET /profile` - Obtener perfil (autenticado)
- `PUT /profile` - Actualizar perfil (autenticado)
- `POST /change-password` - Cambiar contraseña (autenticado)

### Categorías (`/api/categories`)
- `GET /` - Listar categorías activas
- `GET /:id` - Obtener categoría por ID
- `POST /` - Crear categoría (admin)
- `PUT /:id` - Actualizar categoría (admin)
- `DELETE /:id` - Eliminar categoría (admin)

### Profesionales (`/api/professionals`)
- `GET /` - Listar profesionales con filtros
- `GET /:id` - Obtener profesional por ID
- `PUT /:id` - Actualizar perfil (profesional/admin)
- `POST /:id/approve` - Aprobar profesional (admin)
- `POST /:id/reject` - Rechazar profesional (admin)

### Reservas (`/api/bookings`)
- `POST /` - Crear reserva (cliente)
- `GET /client/my-bookings` - Reservas del cliente
- `GET /professional/my-bookings` - Reservas del profesional
- `POST /:id/confirm` - Confirmar reserva (profesional)
- `POST /:id/complete` - Completar reserva (profesional)
- `POST /:id/cancel` - Cancelar reserva (cliente/profesional)

### Upload (`/api/upload`)
- `POST /upload` - Subir archivo individual
- `POST /upload-multiple` - Subir múltiples archivos
- `POST /professional/document` - Subir documento profesional
- `POST /professional/portfolio` - Subir foto al portafolio
- `DELETE /delete/:publicId` - Eliminar archivo (admin)

### Admin (`/api/admin`)
- `GET /dashboard` - Dashboard con KPIs
- `GET /documents/pending` - Documentos pendientes
- `POST /documents/:id/approve` - Aprobar documento
- `POST /documents/:id/reject` - Rechazar documento
- `GET /audit-logs` - Logs de auditoría

## 🔐 Autenticación

La API utiliza JWT para autenticación. Incluir el token en el header:

```
Authorization: Bearer <token>
```

## 📊 Roles de Usuario

- **CLIENT**: Puede crear reservas, ver profesionales, dejar reviews
- **PROFESSIONAL**: Puede recibir reservas, actualizar perfil, subir documentos
- **ADMIN**: Puede aprobar/rechazar profesionales y documentos, ver dashboard

## 💾 Base de Datos

El schema incluye modelos para:
- Usuarios (Clientes, Profesionales, Admins)
- Categorías y Subcategorías de servicios
- Reservas (Bookings)
- Pagos y Ganancias
- Reviews y Calificaciones
- Portafolios y Certificaciones
- Disponibilidad de profesionales
- Notificaciones
- Logs de auditoría

## ☁️ Integraciones

- **Cloudinary**: Almacenamiento de imágenes y documentos
- **Stripe/PayPal**: Procesamiento de pagos (pendiente implementación completa)
- **Supabase**: Base de datos PostgreSQL alojada

## 🧪 Scripts Disponibles

```bash
npm run dev              # Desarrollo con nodemon
npm start               # Producción
npm run prisma:gen      # Generar cliente Prisma
npm run prisma:migrate  # Crear migración
npm run prisma:push     # Push directo del schema
npm run prisma:studio   # Abrir Prisma Studio
```

## 📝 Notas Importantes

1. Configurar correctamente las variables de entorno antes de ejecutar
2. El secreto JWT debe ser cambiado en producción
3. Las credenciales de Cloudinary y Stripe son requeridas para upload y pagos
4. La base de datos debe estar configurada en Supabase antes de usar Prisma

## 🚧 Próximas Implementaciones

- Webhooks de Stripe para pagos
- Notificaciones push en tiempo real
- Sistema de mensajería entre cliente y profesional
- Geolocalización y búsqueda por proximidad
- Panel administrativo web completo

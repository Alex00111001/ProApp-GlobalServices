# 📚 Documentación Completa de la API

## Base URL
```
http://localhost:3000/api
```

## 🔐 Autenticación

Todas las rutas protegidas requieren un header `Authorization`:
```
Authorization: Bearer <jwt_token>
```

---

## 1. AUTH - Autenticación y Usuarios

### POST /auth/register
Registrar nuevo usuario

**Body:**
```json
{
  "email": "usuario@email.com",
  "phone": "5512345678",
  "password": "password123",
  "firstName": "Juan",
  "lastName": "Pérez",
  "role": "CLIENT" // o "PROFESSIONAL"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "email": "usuario@email.com",
    "firstName": "Juan",
    "lastName": "Pérez",
    "role": "CLIENT"
  },
  "token": "jwt_token"
}
```

### POST /auth/login
Login de usuario

**Body:**
```json
{
  "email": "usuario@email.com",
  "password": "password123"
}
```

### GET /auth/profile
Obtener perfil del usuario autenticado

**Headers:** `Authorization: Bearer <token>`

### PUT /auth/profile
Actualizar perfil

**Body:**
```json
{
  "firstName": "Juan Carlos",
  "lastName": "Pérez López",
  "avatarUrl": "https://cloudinary.com/..."
}
```

### POST /auth/change-password
Cambiar contraseña

**Body:**
```json
{
  "currentPassword": "password123",
  "newPassword": "newpassword456"
}
```

---

## 2. CATEGORIES - Categorías de Servicios

### GET /categories
Listar categorías activas

**Query Params:** opcionales

**Response:**
```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "Limpieza",
      "slug": "limpieza",
      "description": "Servicios de limpieza...",
      "iconUrl": "https://...",
      "subcategories": [...],
      "_count": { "professionals": 15 }
    }
  ]
}
```

### GET /categories/:id
Obtener categoría por ID con profesionales y servicios

---

## 3. PROFESSIONALS - Profesionales

### GET /professionals
Listar profesionales con filtros

**Query Params:**
- `categoryId` - Filtrar por categoría
- `city` - Filtrar por ciudad
- `minRating` - Rating mínimo
- `page` - Página (default: 1)
- `limit` - Items por página (default: 10)
- `sortBy` - Campo para ordenar
- `sortOrder` - asc/desc

**Response:**
```json
{
  "professionals": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50
  }
}
```

### GET /professionals/:id
Obtener profesional por ID

### POST /professionals/:id/approve
Aprobar profesional (ADMIN)

### POST /professionals/:id/reject
Rechazar profesional (ADMIN)

**Body:**
```json
{
  "reason": "No cumple con los requisitos"
}
```

---

## 4. BOOKINGS - Reservas

### POST /bookings
Crear reserva (CLIENT)

**Body:**
```json
{
  "professionalId": "uuid",
  "scheduledDate": "2024-01-15T10:00:00Z",
  "address": "Calle Principal 123",
  "city": "Ciudad de México",
  "state": "CDMX",
  "postalCode": "11000",
  "latitude": 19.4326,
  "longitude": -99.1332,
  "notes": "Timbre no funciona",
  "services": [
    {
      "serviceId": "uuid",
      "quantity": 1
    }
  ]
}
```

**Response (201):**
```json
{
  "message": "Booking created successfully",
  "booking": {
    "id": "uuid",
    "status": "PENDING",
    "totalPrice": 500.00,
    "platformFee": 75.00,
    "professionalEarnings": 425.00,
    ...
  }
}
```

### GET /bookings/client/my-bookings
Obtener reservas del cliente

**Query Params:** `status`, `page`, `limit`

### GET /bookings/professional/my-bookings
Obtener reservas del profesional

### POST /bookings/:id/confirm
Confirmar reserva (PROFESSIONAL)

### POST /bookings/:id/complete
Completar reserva (PROFESSIONAL)

### POST /bookings/:id/cancel
Cancelar reserva (CLIENT o PROFESSIONAL)

**Body:**
```json
{
  "reason": "El cliente canceló"
}
```

---

## 5. UPLOAD - Subida de Archivos

### POST /upload
Subir archivo individual

**FormData:**
- `file` - Archivo a subir
- `folder` - Carpeta en Cloudinary (opcional)

**Response:**
```json
{
  "message": "File uploaded successfully",
  "url": "https://res.cloudinary.com/...",
  "publicId": "folder/filename",
  "format": "jpg"
}
```

### POST /upload/upload-multiple
Subir múltiples archivos

**FormData:**
- `files` - Array de archivos (max 10)
- `folder` - Carpeta (opcional)

### POST /upload/professional/document
Subir documento de profesional

**FormData:**
- `document` - Archivo PDF/JPG
- `type` - Tipo: "BACKGROUND_CHECK", "ID", "CERTIFICATION"

### POST /upload/professional/portfolio
Subir foto al portafolio

**FormData:**
- `image` - Imagen
- `title` - Título (opcional)
- `description` - Descripción (opcional)
- `categoryId` - Categoría (opcional)
- `displayOrder` - Orden (opcional)

---

## 6. ADMIN - Panel Administrativo

### GET /admin/dashboard
Dashboard con KPIs generales

**Response:**
```json
{
  "kpis": {
    "totalUsers": 150,
    "totalClients": 120,
    "totalProfessionals": 30,
    "approvedProfessionals": 25,
    "pendingProfessionals": 5,
    "totalBookings": 500,
    "completedBookings": 450,
    "pendingBookings": 10,
    "totalRevenue": 125000.00
  },
  "bookingsByStatus": [...],
  "professionalsByCategory": [...],
  "topProfessionals": [...],
  "recentBookings": [...]
}
```

### GET /admin/documents/pending
Documentos pendientes de revisión

### POST /admin/documents/:id/approve
Aprobar documento

### POST /admin/documents/:id/reject
Rechazar documento

**Body:**
```json
{
  "reason": "Documento ilegible"
}
```

### GET /admin/audit-logs
Logs de auditoría

**Query Params:** `page`, `limit`, `adminId`, `entityType`

---

## 📊 Estados y Enums

### BookingStatus
- `PENDING` - Esperando confirmación
- `CONFIRMED` - Confirmada por profesional
- `IN_PROGRESS` - En progreso
- `COMPLETED` - Completada
- `CANCELLED` - Cancelada
- `NO_SHOW` - No se presentó

### ProfessionalStatus
- `PENDING_REVIEW` - Pendiente de revisión
- `APPROVED` - Aprobado
- `REJECTED` - Rechazado
- `SUSPENDED` - Suspendido
- `ACTIVE` - Activo
- `INACTIVE` - Inactivo

### PaymentStatus
- `PENDING` - Pendiente
- `PROCESSING` - Procesando
- `COMPLETED` - Completado
- `FAILED` - Fallido
- `REFUNDED` - Reembolsado

---

## ⚠️ Códigos de Error

| Código | Significado |
|--------|-------------|
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - Token inválido o faltante |
| 403 | Forbidden - Permisos insuficientes |
| 404 | Not Found - Recurso no encontrado |
| 500 | Internal Server Error |

---

## 🧪 Ejemplos con cURL

### Registrar usuario
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@email.com",
    "phone": "5512345678",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User",
    "role": "CLIENT"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@email.com",
    "password": "password123"
  }'
```

### Obtener profesionales
```bash
curl -X GET "http://localhost:3000/api/professionals?categoryId=uuid&page=1&limit=10"
```

### Crear reserva
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "professionalId": "uuid",
    "scheduledDate": "2024-01-15T10:00:00Z",
    "address": "Calle 123",
    "city": "CDMX",
    "state": "CDMX",
    "postalCode": "11000",
    "services": [{"serviceId": "uuid", "quantity": 1}]
  }'
```

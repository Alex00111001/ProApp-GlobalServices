# 📊 Esquema de Base de Datos - Plataforma de Servicios

## ✅ Completado: `prisma/schema.prisma`

### 🔑 Modelos Principales (20 entidades)

#### 1. **Usuarios y Autenticación**
- `User`: Usuarios base (Clientes, Profesionales, Admins)
- `ClientProfile`: Perfil detallado de clientes
- `ProfessionalProfile`: Perfil de profesionales con verificación

#### 2. **Catálogo de Servicios**
- `Category`: Categorías principales (Limpieza, Plomería, etc.)
- `Subcategory`: Subcategorías especializadas
- `Service`: Servicios específicos con precios

#### 3. **Reservas y Pagos**
- `Booking`: Reservas de servicios
- `BookingService`: Servicios dentro de cada reserva
- `Payment`: Transacciones y pagos
- `Earning`: Ganancias de profesionales

#### 4. **Verificación y Confianza**
- `Document`: Documentos verificados (antecedentes, IDs)
- `Certification`: Certificaciones profesionales
- `Portfolio`: Portafolio de trabajos (Cloudinary)
- `Review`: Calificaciones y reseñas

#### 5. **Operaciones**
- `ProfessionalAvailability`: Disponibilidad por horario
- `FavoriteProfessional`: Profesionales favoritos
- `Notification`: Notificaciones push/in-app
- `AdminAuditLog`: Auditoría administrativa
- `SystemSetting`: Configuración del sistema

### 📈 Enums Implementados
- `UserRole`: CLIENT, PROFESSIONAL, ADMIN
- `ProfessionalStatus`: PENDING_REVIEW, APPROVED, REJECTED, etc.
- `BookingStatus`: PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, etc.
- `PaymentStatus`: PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED
- `PaymentMethod`: CREDIT_CARD, DEBIT_CARD, PAYPAL, STRIPE, CASH
- `NotificationType`: 7 tipos de notificaciones

### 🔗 Relaciones Clave
- User → ClientProfile / ProfessionalProfile (1:1)
- Professional → Categories (N:M)
- Professional → Services (1:N)
- Client → Bookings (1:N)
- Booking → Payment (1:1)
- Booking → Review (1:1)
- Professional → Portfolio (1:N) [Cloudinary URLs]
- Professional → Documents (1:N) [Cloudinary URLs]

### 📁 Siguientes Pasos Recomendados

1. **Configurar Supabase:**
   - Crear proyecto PostgreSQL
   - Obtener DATABASE_URL
   - Copiar `.env.example` a `.env`

2. **Configurar Cloudinary:**
   - Crear cuenta en cloudinary.com
   - Obtener credenciales
   - Actualizar `.env`

3. **Generar Prisma Client:**
   ```bash
   cd backend
   npx prisma generate
   npx prisma db push  # Para desarrollo
   ```

4. **Continuar con:**
   - Middleware de autenticación JWT
   - Controladores de Auth (registro/login)
   - Integración con Cloudinary para uploads
   - Rutas de la API

## 🎯 Características del Diseño

✅ **Escalable**: Índices en campos de búsqueda frecuente  
✅ **Seguro**: Hash de contraseñas, roles bien definidos  
✅ **Auditable**: Logs de administración incluidos  
✅ **Multi-tenant**: Soporte para múltiples países/monedas  
✅ **Cloud-ready**: URLs de Cloudinary para todos los archivos  
✅ **Flexible**: Campos JSON para datos extensibles  

---

**Estado**: ✅ Schema de base de datos completado  
**Siguiente**: Configurar entorno y comenzar con auth

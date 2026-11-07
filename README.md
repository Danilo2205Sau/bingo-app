# 🎱 Bingo App — Sistema de Venta de Cartones

Sistema web completo para venta de boletas de bingo y sorteos.  
Los compradores pagan, suben comprobante y reciben su cartón PDF por WhatsApp.

---

## 📋 Requisitos previos

- Node.js 24 LTS
- PostgreSQL 14+
- Cuenta en [Cloudinary](https://cloudinary.com) (gratis)
- Cuenta en meta con WhatsApp habilitado
- Cuenta en [Railway](https://railway.app) o [Render](https://render.com) para despliegue

---

## 🚀 Instalación local

### 1. Clonar e instalar dependencias

```bash
cd bingo-app/backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales reales
```

### 3. Crear la base de datos

```bash
# Crear la base en PostgreSQL
createdb bingo_db

# Aplicar todas las migraciones registradas
npm run migrate

# Crear el primer administrador desde ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD
npm run admin:create
```

### 4. Iniciar el servidor

```bash
npm run dev     # Desarrollo con nodemon
npm start       # Producción
```

El servidor queda en: `http://localhost:3000`

### 5. Abrir el frontend

Abre `frontend/public/index.html` en tu navegador  
(o usa Live Server en VS Code para recarga automática)

La página usa `http://localhost:3000/api` si la abres desde `localhost`, `127.0.0.1` o `file://`. Para otro entorno, configura `window.BINGO_API_URL` antes de cargar `js/api.js`.

Panel admin: `frontend/public/admin/index.html`
No hay credenciales administrativas predeterminadas. Crea la primera cuenta con `npm run admin:create`.

---

## 🌐 Despliegue en Railway (recomendado)

### Backend

1. Crear proyecto en [railway.app](https://railway.app)
2. Agregar servicio PostgreSQL y mantenerlo en la red privada del proyecto
3. Conectar tu repo de GitHub
4. Configurar secretos para `DATABASE_URL`, `JWT_SECRET`, Cloudinary y WhatsApp; definir `NODE_ENV=production` y `FRONTEND_URL`.
5. Ejecutar `npm run migrate` una sola vez como tarea previa al despliegue y usar `npm start` para iniciar cada instancia de la API.
6. Configurar `/api/health/ready` como comprobación de disponibilidad y mantener una instancia lista durante los despliegues.

Mantén PostgreSQL en la red privada, habilita copias de seguridad y recuperación a un punto en el tiempo, y vigila conexiones, latencia, CPU, memoria y antigüedad de trabajos pendientes. Antes de añadir réplicas, calcula que `réplicas × PG_POOL_MAX` quede por debajo del máximo de conexiones de la base, dejando espacio para migraciones y tareas operativas. Railway documenta [red privada](https://docs.railway.com/networking/private-networking), [réplicas](https://docs.railway.com/deployments/scaling) y [recuperación PITR](https://docs.railway.com/volumes/point-in-time-recovery).

El rate limit actual permite 100 solicitudes por IP cada 15 minutos y vive en memoria de cada proceso. Para varias réplicas, usa un límite compartido en un proxy/WAF o un almacén como Redis; calibra el umbral con tráfico de staging para evitar bloquear compradores que comparten una red.

### Frontend

**Opción A — Netlify (más fácil):**
1. Arrastrar la carpeta `frontend/public` a [netlify.com/drop](https://app.netlify.com/drop)
2. Copiar la URL que te da Netlify
3. Actualizar `FRONTEND_URL` en el backend con esa URL
4. Configurar `window.BINGO_API_URL` con la URL del backend antes de cargar `frontend/public/js/api.js`

**Opción B — GitHub Pages:**
```bash
# Desde la raíz del repo
git subtree push --prefix frontend/public origin gh-pages
```

---

## 📱 Configurar WhatsApp con meta

1. Crear una app en Meta for Developers y añadir el producto WhatsApp.
2. Configurar un número de WhatsApp Business y crear/aprobar la plantilla de confirmación.
3. Copiar el token y el identificador del número a `META_ACCESS_TOKEN` y `META_PHONE_NUMBER_ID` en `backend/.env`.
4. Configurar `WHATSAPP_TEMPLATE_NOMBRE` y `WHATSAPP_TEMPLATE_IDIOMA`; para boletas extraídas por administración se puede definir `WHATSAPP_TEMPLATE_DIRECTA`.

---

## 🎴 Flujo para crear un sorteo desde cero

1. Entrar al panel admin → **Crear nuevo sorteo**
2. Llenar nombre, premio, fecha, precio y cantidad de boletas
3. Ir a **Cartones** → Generar cartones automáticos O subir PDFs propios
4. Cambiar el estado del sorteo a **Activo**
5. Compartir el link de `index.html` con los compradores
6. Revisar pagos desde el panel y aprobar — los cartones se envían solos por WhatsApp

---

## 🗂️ Estructura del proyecto

```
bingo-app/
├── backend/
│   ├── src/
│   │   ├── config/db.js          # Conexión PostgreSQL
│   │   ├── routes/               # Endpoints REST
│   │   │   ├── admin.js          # Auth + dashboard + aprobar pagos
│   │   │   ├── sorteos.js        # CRUD sorteos
│   │   │   ├── ventas.js         # Comprar boletas
│   │   │   ├── cartones.js       # Generar / subir PDFs
│   │   │   └── consulta.js       # Buscar boleta pública
│   │   ├── services/
│   │   │   ├── whatsapp.js       # Meta WhatsApp Cloud API
│   │   │   ├── pdfGenerator.js   # PDFKit — generar cartones
│   │   │   └── cloudinary.js     # Subir archivos
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT verificación
│   │   │   └── upload.js         # Multer + Cloudinary
│   │   ├── migrations/
│   │   │   └── 001_init.sql      # Esquema completo PostgreSQL
│   │   └── app.js                # Servidor Express
│   ├── .env.example
│   └── package.json
│
└── frontend/
    └── public/
        ├── index.html            # Página comprador
        ├── consulta.html         # Consultar boleta
        ├── admin/
        │   └── index.html        # Panel administración
        ├── css/main.css          # Estilos globales
        └── js/
            ├── api.js            # Cliente HTTP
            ├── compra.js         # Flujo de compra
            └── admin.js          # Lógica del panel
```

---

## 🔌 Endpoints de la API

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | `/api/sorteos/activo` | Sorteo activo público | No |
| POST | `/api/ventas` | Crear compra + subir comprobante | No |
| GET | `/api/consulta?q=` | Consultar con código privado o código exacto de boleta | No |
| POST | `/api/admin/login` | Autenticar admin | No |
| GET | `/api/admin/dashboard` | Métricas generales | JWT |
| GET | `/api/admin/ventas-pendientes` | Pagos por aprobar | JWT |
| PATCH | `/api/admin/ventas/:id/aprobar` | Aprobar + enviar WhatsApp | JWT |
| PATCH | `/api/admin/ventas/:id/rechazar` | Rechazar pago | JWT |
| POST | `/api/sorteos` | Crear sorteo | JWT |
| PATCH | `/api/sorteos/:id/estado` | Cambiar estado sorteo | JWT |
| POST | `/api/cartones/generar` | Generar cartones automáticos | JWT |
| POST | `/api/cartones/subir` | Subir PDF de cartón | JWT |

---

## 🔒 Seguridad y operación

- Contraseñas hasheadas con bcrypt (12 rounds)
- Tokens JWT con expiración de 7 días
- Rate limiting por IP, con límite adicional en el inicio de sesión; en producción con varias réplicas usa un almacén compartido.
- Helmet.js para headers de seguridad
- CORS limitado a `FRONTEND_URL` en producción
- Transacciones de base de datos para asignación de cartones (evita duplicados)
- Comprobantes y nuevos PDFs protegidos; enlaces firmados se entregan al panel, al comprador con código privado y a WhatsApp
- Reservas vinculadas a tokens aleatorios temporales; códigos privados de consulta almacenados como hashes
- Historial de migraciones registrado en PostgreSQL. Configura `MIGRATION_BASELINE` solo después de verificar el esquema existente.
- Los pagos pendientes se entregan al panel en páginas de 50 registros.
- Los envíos de boletas se guardan en una cola PostgreSQL con reintentos tras reinicios o errores del proveedor.

### Docker local

1. Copia `.env.example` a `.env` en la raíz y define una contraseña PostgreSQL propia.
2. Copia `backend/.env.example` a `backend/.env` y configura las credenciales de Cloudinary, WhatsApp y el secreto JWT.
3. Ejecuta `docker compose up --build`. La base de datos solo escucha en la interfaz local; el backend espera a que PostgreSQL esté listo y aplica migraciones.

### Pruebas

`npm test` requiere PostgreSQL con las migraciones aplicadas mediante `npm run migrate`. `capacity.smoke.test.js` crea 5.105 ventas y verifica contadores, métricas y paginación del panel. `cartones.consulta.test.js` genera 1.000 cartones mediante lotes. Estos escenarios prueban volumen almacenado y generación por lotes; una prueba de miles de compras concurrentes requiere staging con límites de producción.

---

## 📞 Soporte

Ante cualquier problema técnico, revisar primero los logs del servidor:
```bash
railway logs   # En Railway
# o
npm run dev    # Localmente — los errores aparecen en consola
```

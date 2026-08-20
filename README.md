# 🎱 Bingo App — Sistema de Venta de Cartones

Sistema web completo para venta de boletas de bingo y sorteos.  
Los compradores pagan, suben comprobante y reciben su cartón PDF por WhatsApp.

---

## 📋 Requisitos previos

- Node.js 18+
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

# Ejecutar migración (crea todas las tablas)
psql bingo_db -f src/migrations/001_init.sql
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

Panel admin: `frontend/public/admin/index.html`  
Credenciales iniciales: `admin@bingo.com` / `admin123`

> ⚠️ **Cambia la contraseña del admin antes de salir a producción**

---

## 🌐 Despliegue en Railway (recomendado)

### Backend

1. Crear proyecto en [railway.app](https://railway.app)
2. Agregar servicio PostgreSQL (Railway lo provee gratis)
3. Conectar tu repo de GitHub
4. Configurar variables de entorno en Railway (las mismas del `.env`)
5. Railway detecta el `package.json` y despliega automáticamente

### Frontend

**Opción A — Netlify (más fácil):**
1. Arrastrar la carpeta `frontend/public` a [netlify.com/drop](https://app.netlify.com/drop)
2. Copiar la URL que te da Netlify
3. Actualizar `FRONTEND_URL` en el backend con esa URL
4. Actualizar `API_URL` en `frontend/public/js/api.js` con la URL del backend en Railway

**Opción B — GitHub Pages:**
```bash
# Desde la raíz del repo
git subtree push --prefix frontend/public origin gh-pages
```

---

## 📱 Configurar WhatsApp con meta

1. Crear cuenta en 
2. Activar el **Sandbox de WhatsApp** (gratis para pruebas)
3. Copiar `` y `AUTH_TOKEN` al `.env`
4. Para producción: solicitar número de WhatsApp Business 

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
│   │   │   ├── whatsapp.js       # Twilio — enviar PDF
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
| GET | `/api/consulta?q=` | Buscar boleta por tel o código | No |
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

## 🔒 Seguridad

- Contraseñas hasheadas con bcrypt (12 rounds)
- Tokens JWT con expiración de 7 días
- Rate limiting: 100 requests / 15 minutos por IP
- Helmet.js para headers de seguridad
- CORS configurado solo para el dominio del frontend
- Transacciones de base de datos para asignación de cartones (evita duplicados)

---

## 📞 Soporte

Ante cualquier problema técnico, revisar primero los logs del servidor:
```bash
railway logs   # En Railway
# o
npm run dev    # Localmente — los errores aparecen en consola
```

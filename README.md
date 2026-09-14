# Catálogo Digital — Plataforma de Pedidos por WhatsApp + Panel Admin

Sistema web de catálogo/carta digital para cualquier tipo de negocio.
Cada negocio = 1 instancia de este proyecto (Netlify) + 1 hoja de Google Sheets PRIVADA + 1 Apps Script propio.

Flujos:
- Cliente: catálogo → detalle → carrito → checkout → WhatsApp.
- Backend: cada pedido queda registrado en la hoja `orders`.
- Dueño: panel `/admin.html` para gestionar productos, categorías, pedidos e identidad.

## Cómo funciona

- Frontend 100% en Netlify (HTML + CSS + JavaScript Vanilla). Sin frameworks ni servicios pagos.
- Google Apps Script como backend: lecturas públicas con lista blanca (doGet) y escrituras autenticadas (doPost).
- Google Sheets PRIVADA como base de datos (solo el script la lee y escribe).
- El tema visual y los datos del negocio se leen de la hoja `config`.

Diagrama:

Cliente (navegador)                 Dueño (navegador)
     |                                     |
     v                                     v
 index.html                          admin.html (contraseña)
     |                                     |
     +----------------+--------------------+
                      v
        Apps Script (backend en Google)
        doGet: config/categories/products (público)
        doPost: pedidos, login, CRUD (token/sesión)
                      v
        Google Sheets (PRIVADA) = base de datos

## Tecnologías

- HTML5, CSS3 (mobile-first, variables CSS para temas)
- JavaScript Vanilla (ES6+, cero dependencias)
- Google Sheets + Google Apps Script (backend)
- Netlify (hosting estático)

## Estructura de carpetas

/
├── index.html          ← catálogo público
├── admin.html          ← panel del dueño (con login)
├── netlify.toml
├── .env.example
├── README.md
├── css/
│   ├── main.css        ← estilos del catálogo + tema dinámico
│   └── admin.css       ← estilos del panel
└── js/
    ├── config.js       ← sheetId, appsScriptUrl, orderToken (único archivo a editar al clonar)
    ├── utils.js        ← helpers (escapeHTML, formatPrice, color WCAG)
    ├── data.js         ← lecturas vía backend + registro de pedidos
    ├── components.js   ← componentes visuales del catálogo
    ├── app.js          ← estado y flujos del catálogo
    └── admin.js        ← estado y flujos del panel

## Ejecutar localmente

1. Terminal en la carpeta del proyecto: `python -m http.server 8000` (o Live Server).
2. Abrir http://localhost:8000 (catálogo) y http://localhost:8000/admin.html (panel).

NO abrir index.html con doble clic: el protocolo file:// falla.

## Google Sheets (base de datos PRIVADA)

Hoja con 4 pestañas: config, categories, products, orders.
Compartir: "Con restricciones" (NO "cualquier persona con el enlace": el backend lee con permiso propio).

### config (key | value | description)
business_name, business_description, logo_url, primary_color, secondary_color,
background_color, whatsapp (formato 549XXXXXXXXXX, 13 dígitos), instagram, address,
opening_hours, delivery_enabled (TRUE/FALSE), delivery_cost, business_status (open/closed)

### categories (id | name | description | image | order | active)

### products
(id | category_id | name | description | image | base_price | active | featured | is_new | order | variant_name | variant_options)
- Variantes: `6 porciones:12000,8 porciones:18000` (opción:precio, separadas por coma).
- Sin variantes: base_price cargado y variant_* vacíos.
- Sin precio: base_price vacío → muestra "Consultar precio".

### orders
La escribe el sistema con cada pedido. No editar a mano.

## Backend Apps Script

En la hoja: Extensiones → Apps Script. Funciones:
- doGet: lectura pública con lista blanca (config, categories, products; nunca orders).
- doPost: acciones `order` (token de pedidos), `login`/`logout`/`ping` (sesión),
  `saveProduct`, `deleteProduct`, `saveCategory`, `deleteCategory`,
  `getProductsRaw`, `getCategoriesRaw`, `getOrders`, `setOrderStatus`, `saveConfig`.
- configurarSecrets(): ejecutar UNA vez desde el editor para guardar ADMIN_PASSWORD
  y ORDER_TOKEN en ScriptProperties (secretos fuera del código).

Despliegue: Desplegar → Nueva implementación → Aplicación web →
Ejecutar como: yo · Quién tiene acceso: cualquier persona.
Tras cambios de código: Administrar despliegues → lápiz → Nueva versión.

## Configuración local (js/config.js)

- dataSource.sheetId → ID de la hoja (entre /d/ y /edit de la URL).
- dataSource.appsScriptUrl → URL /exec de la aplicación web.
- dataSource.orderToken → el mismo ORDER_TOKEN guardado en ScriptProperties.

## Panel de administración

- URL: https://TU-SITIO.netlify.app/admin.html
- Contraseña: ADMIN_PASSWORD (ScriptProperties). Sesión de 7 días; "Salir" invalida en el servidor.
- Secciones: Dashboard, Productos (CRUD), Categorías (CRUD con protección si tienen productos),
  Pedidos (estados pending/completed/cancelled + WhatsApp al cliente),
  Personalización (identidad, colores con contraste WCAG, contacto, delivery, estado) con preview en vivo.
- Los cambios impactan en el catálogo al recargar (la hoja es la fuente de verdad).

## Seguridad (Fase 12.7)

- Hoja PRIVADA: los datos de clientes no son legibles por URL.
- Token de pedidos (secreto compartido) para el endpoint público de orders.
- Sesión admin con token UUID, expiración 7 días, logout real y barrido de sesiones vencidas.
- Rate-limit de login: 5 intentos fallidos → bloqueo 10 minutos (CacheService).
- Sanitización de inyección de fórmulas (=, +, -, @) en toda escritura desde el frontend.
- Secretos en ScriptProperties: el código fuente se puede versionar sin secretos.

## Despliegue en Netlify

1. Repositorio en GitHub con el proyecto.
2. Netlify → Add new site → Import an existing project → elegir repo.
3. netlify.toml ya define build y publish. NO requiere variables de entorno.

Cada push a GitHub redespliega automáticamente.

## Clonar para un negocio nuevo (10 minutos)

1. GitHub → duplicar el repositorio.
2. Crear hoja NUEVA y PRIVADA con pestañas config, categories, products.
3. Extensiones → Apps Script: pegar el código del backend y desplegar como
   aplicación web (Ejecutar como: yo · Acceso: cualquier persona).
4. En el editor: ejecutar `configurarSecrets()` con contraseña y token del negocio nuevo.
5. En el repo nuevo, editar js/config.js: sheetId, appsScriptUrl y orderToken nuevos.
6. Netlify → New site from Git → repo nuevo → cambiar nombre del sitio.

Listo: identidad, datos, pedidos y panel propios.

## Mantenimiento diario (dueño, sin código)

Todo desde el panel /admin.html: productos, categorías, pedidos, colores y estado.
Alternativa de respaldo: la hoja directamente.

## Historial

- v0.1–v0.11: catálogo, carrito, checkout, WhatsApp, registro de pedidos, tema dinámico, responsive, deploy.
- v0.12.1: backend seguro (hoja privada + tokens + lista blanca).
- v0.12.2–v0.12.6: panel admin (login/dashboard, productos, categorías, pedidos, personalización).
- v0.12.7: hardening de seguridad (inyección de fórmulas, sesiones, rate-limit, secretos).

## Limitaciones y próximos pasos

- Sin pagos online (el pedido cierra por WhatsApp).
- Sin cuentas de clientes ni historial público de pedidos.
- Futuro posible: zonas de delivery con costo por zona, PWA instalable, cupones, multi-sucursal.
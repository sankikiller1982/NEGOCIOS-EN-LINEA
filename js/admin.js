/* ==========================================================================
   PLATAFORMA DE CATÁLOGO - admin.js
   Versión 12.8: login, dashboard, CRUD de productos y categorías,
   pedidos con estados, personalización con preview en vivo,
   logout real, canal doble POST/GET y drag & drop de categorías.
   La contraseña se valida en el servidor (Apps Script), nunca en el navegador.
   ========================================================================== */

const ADMIN_STATE = {
    token: '',
    view: 'dashboard',   // 'dashboard' | 'productos' | 'producto-form' | 'categorias' | 'categoria-form' | 'pedidos' | 'personalizacion'
    orderFilter: 'todos',
    editingProduct: null,
    editingCategory: null,
    business: null,
    categories: [],       // activas normalizadas → catálogo/dashboard
    categoriesRaw: [],    // filas crudas → gestión
    products: [],         // activos normalizados → dashboard
    productsRaw: [],      // filas crudas → gestión
    orders: []
};

document.addEventListener('DOMContentLoaded', initAdmin);

/* --------------------------------------------------------------------------
   INICIO Y SESIÓN
   -------------------------------------------------------------------------- */
function adminTokenKey() {
    return 'admin-token-' + APP_CONFIG.dataSource.sheetId;
}

function initAdmin() {
    const app = getElement('#admin-app');

    if (!app) {
        console.error('[Admin] No se encontró el contenedor #admin-app');
        return;
    }

    app.addEventListener('submit', handleAdminSubmit);
    app.addEventListener('click', handleAdminClick);
    app.addEventListener('input', handleAdminInput);
    app.addEventListener('pointerdown', handleCategoryDragStart);

    startAdmin(app);
}

async function startAdmin(app) {
    ADMIN_STATE.token = localStorage.getItem(adminTokenKey()) || '';

    if (ADMIN_STATE.token) {
        const valid = await adminPost({ action: 'ping', token: ADMIN_STATE.token })
            .then(function (res) { return res.ok === true; })
            .catch(function () { return false; });

        if (valid) {
            await loadAdminData();
            renderAdminView(app);
            return;
        }

        clearAdminToken();
    }

    renderAdminLogin(app, '');
}

function clearAdminToken() {
    ADMIN_STATE.token = '';
    localStorage.removeItem(adminTokenKey());
}

/* --------------------------------------------------------------------------
   BACKEND: CANAL DOBLE (POST primero, GET de respaldo)
   -------------------------------------------------------------------------- */
async function adminPost(payload) {
    /* Intento 1: POST normal */
    try {
        const response = await fetch(APP_CONFIG.dataSource.appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const parsed = tryParseJson_(await response.text());
        if (parsed) return parsed;
    } catch (error) {
        /* cae al respaldo */
    }

    /* Intento 2: GET con payload en base64 (inmune al redirect roto del POST).
       En login, la contraseña viaja como hash SHA-256, nunca en texto plano. */
    let send = payload;
    if (payload.action === 'login' && payload.password) {
        send = { action: 'login', passwordHash: await sha256HexBrowser_(payload.password) };
    }

    const encoded = btoa(encodeURIComponent(JSON.stringify(send)));
    const url = APP_CONFIG.dataSource.appsScriptUrl +
        '?action=' + encodeURIComponent(send.action) +
        '&payload=' + encodeURIComponent(encoded);

    const response = await fetch(url);
    return response.json();
}

function tryParseJson_(text) {
    try {
        const value = JSON.parse(text);
        return (value && typeof value === 'object') ? value : null;
    } catch (error) {
        return null;
    }
}

async function sha256HexBrowser_(str) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buffer)).map(function (b) {
        return b.toString(16).padStart(2, '0');
    }).join('');
}

async function loadAdminData() {
    const results = await Promise.all([
        getBusinessData(),
        getCategories(),
        getProducts(),
        adminPost({ action: 'getOrders', token: ADMIN_STATE.token }).catch(function () { return null; }),
        adminPost({ action: 'getProductsRaw', token: ADMIN_STATE.token }).catch(function () { return null; }),
        adminPost({ action: 'getCategoriesRaw', token: ADMIN_STATE.token }).catch(function () { return null; })
    ]);

    ADMIN_STATE.business = results[0];
    ADMIN_STATE.categories = results[1];
    ADMIN_STATE.products = results[2];
    ADMIN_STATE.orders = (results[3] && results[3].ok) ? results[3].rows : [];
    ADMIN_STATE.productsRaw = (results[4] && results[4].ok) ? results[4].rows : [];
    ADMIN_STATE.categoriesRaw = (results[5] && results[5].ok) ? results[5].rows : [];
}

/* --------------------------------------------------------------------------
   EVENTOS
   -------------------------------------------------------------------------- */
function handleAdminInput(event) {
    if (event.target.closest('#config-form')) {
        updatePreview();
    }
}

async function handleAdminSubmit(event) {
    const app = getElement('#admin-app');

    /* Login */
    if (event.target.id === 'login-form') {
        event.preventDefault();
        const passwordInput = getElement('#login-password');
        const password = passwordInput ? passwordInput.value : '';

        const res = await adminPost({ action: 'login', password: password })
            .catch(function () { return { ok: false, error: 'Error de conexión con el servidor' }; });

        if (res.ok && res.token) {
            ADMIN_STATE.token = res.token;
            localStorage.setItem(adminTokenKey(), res.token);
            await loadAdminData();
            renderAdminView(app);
            return;
        }

        renderAdminLogin(app, res.error || 'Contraseña incorrecta');
        return;
    }

    /* Guardar producto */
    if (event.target.id === 'product-form') {
        event.preventDefault();

        const name = getElement('#pf-name').value.trim();
        if (!name) {
            showToast('El producto necesita un nombre');
            return;
        }

        const priceRaw = getElement('#pf-price').value.trim();
        const orderRaw = getElement('#pf-order').value.trim();

        const product = {
            id: (ADMIN_STATE.editingProduct || {}).id || '',
            category_id: getElement('#pf-category').value,
            name: name,
            description: getElement('#pf-description').value.trim(),
            image: getElement('#pf-image').value.trim(),
            base_price: priceRaw === '' ? '' : Number(priceRaw),
            active: getElement('#pf-active').checked,
            featured: getElement('#pf-featured').checked,
            is_new: getElement('#pf-new').checked,
            order: orderRaw === '' ? 0 : Number(orderRaw),
            variant_name: getElement('#pf-variant-name').value.trim(),
            variant_options: getElement('#pf-variant-options').value.trim()
        };

        const res = await adminPost({ action: 'saveProduct', token: ADMIN_STATE.token, product: product })
            .catch(function () { return { ok: false, error: 'Error de conexión con el servidor' }; });

        if (res.ok) {
            showToast('✓ Producto guardado');
            await loadAdminData();
            ADMIN_STATE.view = 'productos';
            ADMIN_STATE.editingProduct = null;
            renderAdminView(app);
            return;
        }

        showToast('Error: ' + (res.error || 'no se pudo guardar'));
        return;
    }

    /* Guardar categoría */
    if (event.target.id === 'category-form') {
        event.preventDefault();

        const name = getElement('#cf-name').value.trim();
        if (!name) {
            showToast('La categoría necesita un nombre');
            return;
        }

        const orderRaw = getElement('#cf-order').value.trim();

        const category = {
            id: (ADMIN_STATE.editingCategory || {}).id || '',
            name: name,
            description: getElement('#cf-description').value.trim(),
            image: getElement('#cf-image').value.trim(),
            order: orderRaw === '' ? 0 : Number(orderRaw),
            active: getElement('#cf-active').checked
        };

        const res = await adminPost({ action: 'saveCategory', token: ADMIN_STATE.token, category: category })
            .catch(function () { return { ok: false, error: 'Error de conexión con el servidor' }; });

        if (res.ok) {
            showToast('✓ Categoría guardada');
            await loadAdminData();
            ADMIN_STATE.view = 'categorias';
            ADMIN_STATE.editingCategory = null;
            renderAdminView(app);
            return;
        }

        showToast('Error: ' + (res.error || 'no se pudo guardar'));
    }

    /* Guardar personalización */
    if (event.target.id === 'config-form') {
        event.preventDefault();

        const config = {
            business_name: adminVal('cz-business_name'),
            business_description: adminVal('cz-business_description'),
            logo_url: adminVal('cz-logo_url'),
            primary_color: adminVal('cz-primary_color'),
            secondary_color: adminVal('cz-secondary_color'),
            background_color: adminVal('cz-background_color'),
            whatsapp: adminVal('cz-whatsapp'),
            instagram: adminVal('cz-instagram'),
            address: adminVal('cz-address'),
            opening_hours: adminVal('cz-opening_hours'),
            delivery_enabled: getElement('#cz-delivery_enabled').checked,
            delivery_cost: Number(adminVal('cz-delivery_cost')) || 0,
            business_status: getElement('#cz-business_status').value
        };

        if (!config.business_name) {
            showToast('El nombre del negocio es obligatorio');
            return;
        }

        const res = await adminPost({ action: 'saveConfig', token: ADMIN_STATE.token, config: config })
            .catch(function () { return { ok: false, error: 'Error de conexión con el servidor' }; });

        if (res.ok) {
            showToast('✓ Configuración guardada. El catálogo la aplica al recargar.');
            await loadAdminData();
            renderAdminView(app);
            return;
        }

        showToast('Error: ' + (res.error || 'no se pudo guardar'));
    }
}

function handleAdminClick(event) {
    const action = event.target.closest('[data-action]');
    if (!action) return;

    const app = getElement('#admin-app');
    const type = action.getAttribute('data-action');

    /* Logout: invalida la sesión en el servidor (no solo en el navegador) */
    if (type === 'logout') {
        adminPost({ action: 'logout', token: ADMIN_STATE.token }).catch(function () {});
        clearAdminToken();
        ADMIN_STATE.view = 'dashboard';
        renderAdminLogin(app, '');
        return;
    }

    /* Navegación */
    if (type === 'nav') {
        const target = action.getAttribute('data-target');

        if (target === 'dashboard' || target === 'productos' || target === 'categorias' || target === 'pedidos' || target === 'personalizacion') {
            ADMIN_STATE.view = target;
            ADMIN_STATE.editingProduct = null;
            ADMIN_STATE.editingCategory = null;
            renderAdminView(app);
            return;
        }

        showToast('Sección no disponible todavía');
        return;
    }

    /* Productos */
    if (type === 'new-product') {
        ADMIN_STATE.editingProduct = null;
        ADMIN_STATE.view = 'producto-form';
        renderAdminView(app);
        return;
    }

    if (type === 'back-to-products') {
        ADMIN_STATE.view = 'productos';
        ADMIN_STATE.editingProduct = null;
        renderAdminView(app);
        return;
    }

    if (type === 'edit-product') {
        const id = action.getAttribute('data-id');
        ADMIN_STATE.editingProduct = ADMIN_STATE.productsRaw.find(function (p) {
            return String(p.id) === id;
        }) || null;
        ADMIN_STATE.view = 'producto-form';
        renderAdminView(app);
        return;
    }

    if (type === 'toggle-product') {
        toggleProduct(action.getAttribute('data-id'), app);
        return;
    }

    if (type === 'delete-product') {
        deleteProduct(action.getAttribute('data-id'), app);
        return;
    }

    /* Categorías */
    if (type === 'new-category') {
        ADMIN_STATE.editingCategory = null;
        ADMIN_STATE.view = 'categoria-form';
        renderAdminView(app);
        return;
    }

    if (type === 'back-to-categories') {
        ADMIN_STATE.view = 'categorias';
        ADMIN_STATE.editingCategory = null;
        renderAdminView(app);
        return;
    }

    if (type === 'edit-category') {
        const id = action.getAttribute('data-id');
        ADMIN_STATE.editingCategory = ADMIN_STATE.categoriesRaw.find(function (c) {
            return String(c.id) === id;
        }) || null;
        ADMIN_STATE.view = 'categoria-form';
        renderAdminView(app);
        return;
    }

    if (type === 'toggle-category') {
        toggleCategory(action.getAttribute('data-id'), app);
        return;
    }

    if (type === 'delete-category') {
        deleteCategory(action.getAttribute('data-id'), app);
        return;
    }

    /* Pedidos */
    if (type === 'order-filter') {
        ADMIN_STATE.orderFilter = action.getAttribute('data-filter');
        renderAdminView(app);
        return;
    }

    if (type === 'set-order-status') {
        setOrderStatus(action.getAttribute('data-id'), action.getAttribute('data-status'), app);
        return;
    }
}

/* --- Productos --- */
async function toggleProduct(id, app) {
    const row = ADMIN_STATE.productsRaw.find(function (p) { return String(p.id) === id; });
    if (!row) return;

    const product = {
        id: row.id,
        category_id: row.category_id,
        name: row.name,
        description: row.description,
        image: row.image,
        base_price: row.base_price,
        active: !toBoolean(row.active),
        featured: toBoolean(row.featured),
        is_new: toBoolean(row.is_new),
        order: row.order,
        variant_name: row.variant_name,
        variant_options: row.variant_options
    };

    const res = await adminPost({ action: 'saveProduct', token: ADMIN_STATE.token, product: product })
        .catch(function () { return { ok: false }; });

    if (res.ok) {
        showToast(product.active ? '✓ Producto visible en el catálogo' : '✓ Producto oculto');
        await loadAdminData();
        renderAdminView(app);
    } else {
        showToast('Error: no se pudo cambiar el estado');
    }
}

async function deleteProduct(id, app) {
    const row = ADMIN_STATE.productsRaw.find(function (p) { return String(p.id) === id; });
    if (!row) return;

    if (!confirm('¿Eliminar definitivamente "' + row.name + '"? Esta acción no se puede deshacer.')) return;

    const res = await adminPost({ action: 'deleteProduct', token: ADMIN_STATE.token, id: id })
        .catch(function () { return { ok: false }; });

    if (res.ok) {
        showToast('✓ Producto eliminado');
        await loadAdminData();
        renderAdminView(app);
    } else {
        showToast('Error: no se pudo eliminar');
    }
}

/* --- Categorías --- */
async function toggleCategory(id, app) {
    const row = ADMIN_STATE.categoriesRaw.find(function (c) { return String(c.id) === id; });
    if (!row) return;

    const category = {
        id: row.id,
        name: row.name,
        description: row.description,
        image: row.image,
        order: row.order,
        active: !toBoolean(row.active)
    };

    const res = await adminPost({ action: 'saveCategory', token: ADMIN_STATE.token, category: category })
        .catch(function () { return { ok: false }; });

    if (res.ok) {
        showToast(category.active ? '✓ Categoría visible en el catálogo' : '✓ Categoría oculta (y sus productos)');
        await loadAdminData();
        renderAdminView(app);
    } else {
        showToast('Error: no se pudo cambiar el estado');
    }
}

async function deleteCategory(id, app) {
    const row = ADMIN_STATE.categoriesRaw.find(function (c) { return String(c.id) === id; });
    if (!row) return;

    if (!confirm('¿Eliminar definitivamente la categoría "' + row.name + '"?')) return;

    const res = await adminPost({ action: 'deleteCategory', token: ADMIN_STATE.token, id: id })
        .catch(function () { return { ok: false }; });

    if (res.ok) {
        showToast('✓ Categoría eliminada');
        await loadAdminData();
        renderAdminView(app);
    } else {
        showToast('Error: ' + (res.error || 'no se pudo eliminar'));
    }
}

/* --- Pedidos --- */
function orderStatusLabel(status) {
    const labels = { pending: 'Pendiente', completed: 'Completado', cancelled: 'Cancelado' };
    return labels[status] || status;
}

function orderDateLabel(timestamp) {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return String(timestamp || '');
    return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function setOrderStatus(id, status, app) {
    const res = await adminPost({ action: 'setOrderStatus', token: ADMIN_STATE.token, id: id, status: status })
        .catch(function () { return { ok: false }; });

    if (res.ok) {
        showToast('✓ Pedido marcado como ' + orderStatusLabel(status));
        await loadAdminData();
        renderAdminView(app);
    } else {
        showToast('Error: ' + (res.error || 'no se pudo actualizar'));
    }
}

/* --------------------------------------------------------------------------
   VISTAS
   -------------------------------------------------------------------------- */
function renderAdminView(app) {
    if (ADMIN_STATE.view === 'productos') return renderProducts(app);
    if (ADMIN_STATE.view === 'producto-form') return renderProductForm(app);
    if (ADMIN_STATE.view === 'categorias') return renderCategories(app);
    if (ADMIN_STATE.view === 'categoria-form') return renderCategoryForm(app);
    if (ADMIN_STATE.view === 'pedidos') return renderOrders(app);
    if (ADMIN_STATE.view === 'personalizacion') return renderPersonalizacion(app);
    renderAdminShell(app);
}

function renderAdminLogin(app, errorMsg) {
    app.innerHTML =
        '<div class="admin-login">' +
            '<form class="admin-login__card" id="login-form">' +
                '<h1 class="admin-login__title">Panel del negocio</h1>' +
                '<p class="admin-login__subtitle">Ingresá con tu contraseña de administrador.</p>' +
                '<label class="admin-field__label" for="login-password">Contraseña</label>' +
                '<input class="admin-field__input" id="login-password" type="password" autocomplete="current-password" required>' +
                (errorMsg ? '<p class="admin-field__error">' + escapeHTML(errorMsg) + '</p>' : '') +
                '<button class="admin-btn admin-btn--primary" type="submit">Entrar</button>' +
            '</form>' +
        '</div>';

    const input = getElement('#login-password');
    if (input) input.focus();
}

function adminTopbar() {
    const business = ADMIN_STATE.business || {};
    return '<header class="admin-topbar">' +
        '<span class="admin-topbar__name">' + escapeHTML(business.business_name || 'Panel del negocio') + '</span>' +
        '<span class="admin-topbar__links">' +
            '<a class="admin-btn admin-btn--ghost" href="index.html" target="_blank" rel="noopener">Ver catálogo</a>' +
            '<button class="admin-btn admin-btn--ghost" data-action="logout" type="button">Salir</button>' +
        '</span>' +
    '</header>';
}

function adminNav(active) {
    const item = function (label, target) {
        return '<button class="admin-nav__item' + (active === target ? ' admin-nav__item--active' : '') + '" data-action="nav" data-target="' + target + '" type="button">' + label + '</button>';
    };

    return '<nav class="admin-nav" aria-label="Secciones del panel">' +
        item('Dashboard', 'dashboard') +
        item('Productos', 'productos') +
        item('Categorías', 'categorias') +
        item('Pedidos', 'pedidos') +
        item('Personalización', 'personalizacion') +
    '</nav>';
}

function adminCard(title, value) {
    return '<div class="admin-card">' +
        '<span class="admin-card__value">' + value + '</span>' +
        '<span class="admin-card__title">' + escapeHTML(title) + '</span>' +
    '</div>';
}

function renderAdminShell(app) {
    const business = ADMIN_STATE.business || {};

    const pending = ADMIN_STATE.orders.filter(function (order) {
        return String(order.status || 'pending') === 'pending';
    }).length;

    const closed = String(business.business_status || 'open').toLowerCase() === 'closed';

    app.innerHTML =
        adminTopbar() +
        adminNav('dashboard') +
        '<main class="admin-main">' +
            '<section class="admin-cards">' +
                adminCard('Productos activos', ADMIN_STATE.products.length) +
                adminCard('Categorías', ADMIN_STATE.categories.length) +
                adminCard('Pedidos pendientes', pending) +
                adminCard('Pedidos totales', ADMIN_STATE.orders.length) +
            '</section>' +
            '<section class="admin-block">' +
                '<h2>Estado del negocio</h2>' +
                '<p>' +
                    (closed
                        ? '<span class="admin-status admin-status--closed">Cerrado</span>'
                        : '<span class="admin-status admin-status--open">Abierto</span>') +
                '</p>' +
                '<p class="admin-hint">Todas las secciones del panel están operativas. Los cambios se reflejan en el catálogo al recargar.</p>' +
            '</section>' +
        '</main>';
}

/* --------------------------------------------------------------------------
   PRODUCTOS
   -------------------------------------------------------------------------- */
function categoryName(id) {
    const cat = ADMIN_STATE.categories.find(function (c) { return c.id === id; });
    return cat ? cat.name : (id || 'sin categoría');
}

function renderProducts(app) {
    const rows = ADMIN_STATE.productsRaw;

    const items = rows.map(function (p) {
        const active = toBoolean(p.active);
        const price = (p.base_price !== '' && p.base_price !== null && p.base_price !== undefined)
            ? formatPrice(p.base_price)
            : (p.variant_options ? 'variantes' : 'consultar');

        return '<div class="admin-row' + (active ? '' : ' admin-row--hidden') + '">' +
            '<div class="admin-row__main">' +
                '<span class="admin-row__name">' + escapeHTML(p.name || '') + '</span>' +
                '<span class="admin-row__meta">' + escapeHTML(categoryName(p.category_id)) + ' · ' + escapeHTML(price) + (active ? '' : ' · OCULTO') + '</span>' +
            '</div>' +
            '<div class="admin-row__actions">' +
                '<button class="admin-btn admin-btn--ghost" data-action="edit-product" data-id="' + escapeHTML(p.id) + '" type="button">Editar</button>' +
                '<button class="admin-btn admin-btn--ghost" data-action="toggle-product" data-id="' + escapeHTML(p.id) + '" type="button">' + (active ? 'Ocultar' : 'Mostrar') + '</button>' +
                '<button class="admin-btn admin-btn--danger" data-action="delete-product" data-id="' + escapeHTML(p.id) + '" type="button">Eliminar</button>' +
            '</div>' +
        '</div>';
    }).join('');

    app.innerHTML =
        adminTopbar() +
        adminNav('productos') +
        '<main class="admin-main">' +
            '<div class="admin-section-head">' +
                '<h2>Productos (' + rows.length + ')</h2>' +
                '<button class="admin-btn admin-btn--primary" data-action="new-product" type="button">+ Nuevo producto</button>' +
            '</div>' +
            (rows.length ? items : '<p class="admin-hint">Todavía no hay productos cargados.</p>') +
        '</main>';
}

function adminField(id, label, type, value) {
    return '<label class="admin-field__label" for="' + id + '">' + label + '</label>' +
        '<input class="admin-field__input" id="' + id + '" type="' + type + '" value="' + escapeHTML(value) + '">';
}

function renderProductForm(app) {
    const p = ADMIN_STATE.editingProduct || {};

    const options = ADMIN_STATE.categories.map(function (c) {
        return '<option value="' + escapeHTML(c.id) + '"' + (c.id === p.category_id ? ' selected' : '') + '>' + escapeHTML(c.name) + '</option>';
    }).join('');

    const priceValue = (p.base_price === undefined || p.base_price === null || p.base_price === '') ? '' : p.base_price;
    const orderValue = (p.order === undefined || p.order === null || p.order === '') ? '' : p.order;

    app.innerHTML =
        adminTopbar() +
        adminNav('productos') +
        '<main class="admin-main">' +
            '<form id="product-form" class="admin-form">' +
                '<h2>' + (p.id ? 'Editar producto' : 'Nuevo producto') + '</h2>' +
                adminField('pf-name', 'Nombre *', 'text', p.name || '') +
                '<label class="admin-field__label" for="pf-category">Categoría</label>' +
                '<select class="admin-field__input" id="pf-category">' + options + '</select>' +
                adminField('pf-description', 'Descripción', 'text', p.description || '') +
                adminField('pf-image', 'URL de imagen', 'url', p.image || '') +
                adminField('pf-price', 'Precio base (dejar vacío si usa variantes)', 'number', priceValue) +
                adminField('pf-variant-name', 'Nombre de variantes (ej: Tamaño)', 'text', p.variant_name || '') +
                adminField('pf-variant-options', 'Variantes (opción:precio, separadas por coma)', 'text', p.variant_options || '') +
                adminField('pf-order', 'Orden (número)', 'number', orderValue) +
                '<label class="admin-check"><input type="checkbox" id="pf-featured"' + (toBoolean(p.featured) ? ' checked' : '') + '> Destacado</label>' +
                '<label class="admin-check"><input type="checkbox" id="pf-new"' + (toBoolean(p.is_new) ? ' checked' : '') + '> Nuevo</label>' +
                '<label class="admin-check"><input type="checkbox" id="pf-active"' + (p.id ? (toBoolean(p.active) ? ' checked' : '') : ' checked') + '> Activo (visible en el catálogo)</label>' +
                '<div class="admin-form__actions">' +
                    '<button class="admin-btn admin-btn--ghost" data-action="back-to-products" type="button">Cancelar</button>' +
                    '<button class="admin-btn admin-btn--primary" type="submit">Guardar</button>' +
                '</div>' +
            '</form>' +
        '</main>';
}

/* --------------------------------------------------------------------------
   CATEGORÍAS (con orden por número y drag & drop)
   -------------------------------------------------------------------------- */

/* Categorías ordenadas por su número de orden (igual que el catálogo). */
function sortedCategoriesRaw() {
    return ADMIN_STATE.categoriesRaw.slice().sort(function (a, b) {
        return (Number(a.order) || 0) - (Number(b.order) || 0);
    });
}

function renderCategories(app) {
    const rows = sortedCategoriesRaw();

    const items = rows.map(function (c) {
        const active = toBoolean(c.active);
        const count = ADMIN_STATE.productsRaw.filter(function (p) {
            return String(p.category_id) === String(c.id);
        }).length;

        return '<div class="admin-row' + (active ? '' : ' admin-row--hidden') + '" data-cat-id="' + escapeHTML(c.id) + '">' +
            '<span class="admin-row__handle" data-drag-id="' + escapeHTML(c.id) + '" title="Arrastrar para reordenar" aria-label="Arrastrar para reordenar ' + escapeHTML(c.name || '') + '">⠿</span>' +
            '<div class="admin-row__main">' +
                '<span class="admin-row__name">' + escapeHTML(c.name || '') + '</span>' +
                '<span class="admin-row__meta">Orden ' + (c.order || 0) + ' · ' + count + ' productos' + (active ? '' : ' · OCULTA') + '</span>' +
            '</div>' +
            '<div class="admin-row__actions">' +
                '<button class="admin-btn admin-btn--ghost" data-action="edit-category" data-id="' + escapeHTML(c.id) + '" type="button">Editar</button>' +
                '<button class="admin-btn admin-btn--ghost" data-action="toggle-category" data-id="' + escapeHTML(c.id) + '" type="button">' + (active ? 'Ocultar' : 'Mostrar') + '</button>' +
                '<button class="admin-btn admin-btn--danger" data-action="delete-category" data-id="' + escapeHTML(c.id) + '" type="button">Eliminar</button>' +
            '</div>' +
        '</div>';
    }).join('');

    app.innerHTML =
        adminTopbar() +
        adminNav('categorias') +
        '<main class="admin-main">' +
            '<div class="admin-section-head">' +
                '<h2>Categorías (' + rows.length + ')</h2>' +
                '<button class="admin-btn admin-btn--primary" data-action="new-category" type="button">+ Nueva categoría</button>' +
            '</div>' +
            '<p class="admin-hint">Arrastrá el ícono ⠿ para reordenar. También podés fijar un número exacto desde "Editar".</p>' +
            (rows.length ? '<div id="categories-list">' + items + '</div>' : '<p class="admin-hint">Todavía no hay categorías cargadas.</p>') +
        '</main>';
}

function renderCategoryForm(app) {
    const c = ADMIN_STATE.editingCategory || {};
    const orderValue = (c.order === undefined || c.order === null || c.order === '') ? '' : c.order;

    app.innerHTML =
        adminTopbar() +
        adminNav('categorias') +
        '<main class="admin-main">' +
            '<form id="category-form" class="admin-form">' +
                '<h2>' + (c.id ? 'Editar categoría' : 'Nueva categoría') + '</h2>' +
                adminField('cf-name', 'Nombre *', 'text', c.name || '') +
                adminField('cf-description', 'Descripción', 'text', c.description || '') +
                adminField('cf-image', 'URL de imagen', 'url', c.image || '') +
                adminField('cf-order', 'Orden (número: define el orden de las pestañas)', 'number', orderValue) +
                '<label class="admin-check"><input type="checkbox" id="cf-active"' + (c.id ? (toBoolean(c.active) ? ' checked' : '') : ' checked') + '> Activa (visible en el catálogo)</label>' +
                '<div class="admin-form__actions">' +
                    '<button class="admin-btn admin-btn--ghost" data-action="back-to-categories" type="button">Cancelar</button>' +
                    '<button class="admin-btn admin-btn--primary" type="submit">Guardar</button>' +
                '</div>' +
            '</form>' +
        '</main>';
}

/* --------------------------------------------------------------------------
   PEDIDOS
   -------------------------------------------------------------------------- */
function renderOrders(app) {
    const filter = ADMIN_STATE.orderFilter || 'todos';

    const all = ADMIN_STATE.orders.slice().sort(function (a, b) {
        const da = new Date(a.timestamp || 0).getTime() || 0;
        const db = new Date(b.timestamp || 0).getTime() || 0;
        return db - da;
    });

    const rows = (filter === 'todos') ? all : all.filter(function (o) {
        return String(o.status || 'pending') === filter;
    });

    const chip = function (label, value) {
        const count = (value === 'todos') ? all.length : all.filter(function (o) {
            return String(o.status || 'pending') === value;
        }).length;
        return '<button class="admin-nav__item' + (filter === value ? ' admin-nav__item--active' : '') + '" data-action="order-filter" data-filter="' + value + '" type="button">' + label + ' (' + count + ')</button>';
    };

    const items = rows.map(function (o) {
        const status = String(o.status || 'pending');
        const phoneDigits = String(o.customer_phone || '').replace(/\D/g, '');

        return '<div class="admin-row admin-order">' +
            '<div class="admin-row__main">' +
                '<span class="admin-row__name">' + escapeHTML(o.customer_name || 'Sin nombre') + ' · ' + escapeHTML(formatPrice(o.total || 0)) + '</span>' +
                '<span class="admin-row__meta">' + escapeHTML(orderDateLabel(o.timestamp)) + ' · ' + (o.delivery_method === 'delivery' ? 'Delivery' : 'Retiro') + (o.address ? ' · ' + escapeHTML(o.address) : '') + '</span>' +
                '<span class="admin-row__meta">' + escapeHTML(o.items || '') + '</span>' +
                (o.notes ? '<span class="admin-row__meta">Obs: ' + escapeHTML(o.notes) + '</span>' : '') +
                '<span class="admin-order__status admin-order__status--' + status + '">' + escapeHTML(orderStatusLabel(status)) + '</span>' +
            '</div>' +
            '<div class="admin-row__actions">' +
                (phoneDigits ? '<a class="admin-btn admin-btn--ghost" href="https://wa.me/' + phoneDigits + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
                (status !== 'completed' ? '<button class="admin-btn admin-btn--ghost" data-action="set-order-status" data-id="' + escapeHTML(o.id) + '" data-status="completed" type="button">Completar</button>' : '') +
                (status !== 'cancelled' ? '<button class="admin-btn admin-btn--danger" data-action="set-order-status" data-id="' + escapeHTML(o.id) + '" data-status="cancelled" type="button">Cancelar</button>' : '') +
                (status !== 'pending' ? '<button class="admin-btn admin-btn--ghost" data-action="set-order-status" data-id="' + escapeHTML(o.id) + '" data-status="pending" type="button">Reabrir</button>' : '') +
            '</div>' +
        '</div>';
    }).join('');

    app.innerHTML =
        adminTopbar() +
        adminNav('pedidos') +
        '<main class="admin-main">' +
            '<div class="admin-section-head"><h2>Pedidos</h2></div>' +
            '<div class="admin-nav">' +
                chip('Todos', 'todos') +
                chip('Pendientes', 'pending') +
                chip('Completados', 'completed') +
                chip('Cancelados', 'cancelled') +
            '</div>' +
            (rows.length ? items : '<p class="admin-hint">No hay pedidos en este filtro.</p>') +
        '</main>';
}

/* --------------------------------------------------------------------------
   PERSONALIZACIÓN CON PREVIEW EN VIVO
   -------------------------------------------------------------------------- */
function adminVal(id) {
    const node = getElement('#' + id);
    return node ? node.value.trim() : '';
}

function colorInputValue(value, fallback) {
    return hexToRgb(value) ? String(value).trim() : fallback;
}

function renderPersonalizacion(app) {
    const b = ADMIN_STATE.business || {};

    app.innerHTML =
        adminTopbar() +
        adminNav('personalizacion') +
        '<main class="admin-main">' +
            '<div class="admin-section-head"><h2>Personalización</h2></div>' +
            '<form id="config-form" class="admin-form">' +
                '<h2>Identidad</h2>' +
                adminField('cz-business_name', 'Nombre del negocio *', 'text', b.business_name || '') +
                adminField('cz-business_description', 'Descripción', 'text', b.business_description || '') +
                adminField('cz-logo_url', 'URL del logo', 'url', b.logo_url || '') +
                '<h2>Colores</h2>' +
                '<div class="admin-colors">' +
                    '<div>' + adminField('cz-primary_color', 'Primario', 'color', colorInputValue(b.primary_color, '#e53935')) + '</div>' +
                    '<div>' + adminField('cz-secondary_color', 'Secundario', 'color', colorInputValue(b.secondary_color, '#ffffff')) + '</div>' +
                    '<div>' + adminField('cz-background_color', 'Fondo', 'color', colorInputValue(b.background_color, '#121212')) + '</div>' +
                '</div>' +
                '<h2>Contacto y operación</h2>' +
                adminField('cz-whatsapp', 'WhatsApp (formato 549…)', 'tel', b.whatsapp || '') +
                adminField('cz-instagram', 'Instagram', 'text', b.instagram || '') +
                adminField('cz-address', 'Dirección', 'text', b.address || '') +
                adminField('cz-opening_hours', 'Horarios', 'text', b.opening_hours || '') +
                '<div class="admin-colors">' +
                    '<div>' + adminField('cz-delivery_cost', 'Costo de delivery', 'number', (b.delivery_cost === undefined || b.delivery_cost === null) ? '' : b.delivery_cost) + '</div>' +
                    '<div><label class="admin-field__label" for="cz-business_status">Estado</label>' +
                        '<select class="admin-field__input" id="cz-business_status">' +
                            '<option value="open"' + (String(b.business_status || 'open') === 'open' ? ' selected' : '') + '>Abierto</option>' +
                            '<option value="closed"' + (String(b.business_status || 'open') === 'closed' ? ' selected' : '') + '>Cerrado</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<label class="admin-check"><input type="checkbox" id="cz-delivery_enabled"' + (b.delivery_enabled === true ? ' checked' : '') + '> Delivery habilitado</label>' +
                '<h2>Vista previa en vivo</h2>' +
                '<div class="cz-preview" id="cz-preview">' +
                    '<div class="cz-preview__bar">' +
                        '<img class="cz-preview__logo" id="cz-preview-logo" src="' + escapeHTML(b.logo_url || '') + '" alt="">' +
                        '<div class="cz-preview__logo-fallback" id="cz-preview-logo-fallback">' + escapeHTML((b.business_name || 'T').charAt(0).toUpperCase()) + '</div>' +
                        '<span class="cz-preview__name" id="cz-preview-name">' + escapeHTML(b.business_name || 'Tu negocio') + '</span>' +
                    '</div>' +
                    '<div class="cz-preview__body">' +
                        '<div class="cz-preview__tabs">' +
                            '<span class="cz-preview__tab cz-preview__tab--active">Todos</span>' +
                            '<span class="cz-preview__tab">Categoría</span>' +
                        '</div>' +
                        '<div class="cz-preview__card">' +
                            '<span class="cz-preview__muted">Producto de ejemplo</span>' +
                            '<span class="cz-preview__price">' + escapeHTML(formatPrice(12000)) + '</span>' +
                            '<button class="cz-preview__btn" type="button">Agregar al pedido</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="admin-form__actions">' +
                    '<button class="admin-btn admin-btn--primary" type="submit">Guardar cambios</button>' +
                '</div>' +
            '</form>' +
        '</main>';

    updatePreview();
}

/* Aplica los valores actuales del formulario al preview, sin guardar. */
function updatePreview() {
    const preview = getElement('#cz-preview');
    if (!preview) return;

    const primary = adminVal('cz-primary_color');
    const background = adminVal('cz-background_color');
    const name = adminVal('cz-business_name') || 'Tu negocio';
    const logo = adminVal('cz-logo_url');

    const dark = isDarkColor(background);

    preview.style.setProperty('--primary-color', primary);
    preview.style.setProperty('--on-primary-color', contrastTextFor(primary));
    preview.style.setProperty('--on-success-color', contrastTextFor('#198754'));
    preview.style.setProperty('--background-color', background);
    preview.style.setProperty('--surface-color', dark ? '#1e1e1e' : '#ffffff');
    preview.style.setProperty('--text-color', dark ? '#f5f5f5' : '#111111');
    preview.style.setProperty('--muted-color', dark ? '#b0b0b0' : '#6d6d6d');
    preview.style.setProperty('--border-color', dark ? '#333333' : '#dddddd');

    const nameNode = getElement('#cz-preview-name');
    if (nameNode) nameNode.textContent = name;

    const logoNode = getElement('#cz-preview-logo');
    const fallbackNode = getElement('#cz-preview-logo-fallback');
    if (logoNode && fallbackNode) {
        logoNode.style.display = logo ? '' : 'none';
        fallbackNode.style.display = logo ? 'none' : '';
        if (logo) logoNode.src = logo;
        fallbackNode.textContent = name.charAt(0).toUpperCase();
    }
}

/* --------------------------------------------------------------------------
   FASE 12.8: DRAG & DROP DE CATEGORÍAS
   Basado en pointer events: funciona con mouse y con touch.
   -------------------------------------------------------------------------- */
let CATEGORY_DRAG = null;

function handleCategoryDragStart(event) {
    if (ADMIN_STATE.view !== 'categorias') return;

    const handle = event.target.closest('[data-drag-id]');
    if (!handle) return;

    const row = handle.closest('.admin-row[data-cat-id]');
    if (!row) return;

    event.preventDefault();

    CATEGORY_DRAG = {
        id: handle.getAttribute('data-drag-id'),
        element: row
    };

    row.classList.add('admin-row--dragging');

    document.addEventListener('pointermove', handleCategoryDragMove);
    document.addEventListener('pointerup', handleCategoryDragEnd);
    document.addEventListener('pointercancel', handleCategoryDragEnd);
}

function handleCategoryDragMove(event) {
    if (!CATEGORY_DRAG) return;

    const under = document.elementFromPoint(event.clientX, event.clientY);
    if (!under) return;

    const targetRow = under.closest('.admin-row[data-cat-id]');
    if (!targetRow || targetRow === CATEGORY_DRAG.element) return;

    const list = CATEGORY_DRAG.element.parentNode;
    if (targetRow.parentNode !== list) return;

    const rect = targetRow.getBoundingClientRect();
    const before = (event.clientY - rect.top) < (rect.height / 2);

    if (before) {
        list.insertBefore(CATEGORY_DRAG.element, targetRow);
    } else {
        list.insertBefore(CATEGORY_DRAG.element, targetRow.nextSibling);
    }
}

async function handleCategoryDragEnd() {
    document.removeEventListener('pointermove', handleCategoryDragMove);
    document.removeEventListener('pointerup', handleCategoryDragEnd);
    document.removeEventListener('pointercancel', handleCategoryDragEnd);

    if (!CATEGORY_DRAG) return;

    const dragged = CATEGORY_DRAG.element;
    dragged.classList.remove('admin-row--dragging');

    const app = getElement('#admin-app');
    const rows = Array.prototype.slice.call(
        dragged.parentNode.querySelectorAll('.admin-row[data-cat-id]')
    );
    const newIds = rows.map(function (r) { return r.getAttribute('data-cat-id'); });
    const oldIds = sortedCategoriesRaw().map(function (c) { return String(c.id); });

    CATEGORY_DRAG = null;

    /* Si el orden no cambió, no se toca nada */
    if (newIds.join('|') === oldIds.join('|')) return;

    const items = newIds.map(function (id, index) {
        return { id: id, order: (index + 1) * 10 };
    });

    const res = await adminPost({ action: 'reorderCategories', token: ADMIN_STATE.token, items: items })
        .catch(function () { return { ok: false }; });

    if (res.ok) {
        showToast('✓ Nuevo orden guardado');
    } else {
        showToast('Error: no se pudo guardar el orden');
    }

    await loadAdminData();
    renderAdminView(app);
}
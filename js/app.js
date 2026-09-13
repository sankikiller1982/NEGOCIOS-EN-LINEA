/* ==========================================================================
   PLATAFORMA DE CATÁLOGO - app.js
   Punto de entrada de la aplicación.
   Fase 6: catálogo + detalle + carrito + checkout con entrega y confirmación.
   ========================================================================== */

/* Estado del catálogo en memoria. */
const CATALOG_STATE = {
    business: null,
    categories: [],
    products: [],
    activeCategory: 'todos',
    search: ''
};

/* Estado del modal de detalle. */
const MODAL_STATE = {
    product: null,
    selectedVariantId: null,
    quantity: 1,
    notes: ''
};

/* Carrito: líneas { id, productId, variantId, quantity, notes } */
let CART = [];
let CART_SHEET_OPEN = false;

/* Vista actual del sheet: 'cart' | 'checkout' | 'confirm' */
let CART_VIEW = 'cart';

/* Estado del checkout. */
const CHECKOUT_STATE = {
    deliveryMethod: 'pickup',
    name: '',
    phone: '',
    address: '',
    notes: ''
};

let CHECKOUT_ERRORS = {};

/* URL del último pedido enviado (para reabrir WhatsApp si hizo falta). */
let LAST_WHATSAPP_URL = '';

document.addEventListener('DOMContentLoaded', initCatalog);

/* --------------------------------------------------------------------------
   INICIALIZACIÓN
   -------------------------------------------------------------------------- */
async function initCatalog() {
    const app = getElement('#app');

    if (!app) {
        console.error('[App] No se encontró el contenedor #app');
        return;
    }

    console.log('[App] DOM cargado correctamente');

    if (!APP_CONFIG.dataSource.sheetId) {
        app.innerHTML = renderConfigErrorState();
        return;
    }

    app.innerHTML = renderLoadingState();

    const data = await getAllData();

    if (!data.business) {
        app.innerHTML = renderErrorState('No se pudo leer la configuración del negocio desde Google Sheets.');
        bindGlobalActions(app);
        return;
    }

    CATALOG_STATE.business = data.business;
    CATALOG_STATE.categories = data.categories;
    CATALOG_STATE.products = data.products;

    /* Fase 8: el tema de la hoja se aplica antes de pintar */
    applyTheme(data.business);

    /* Fase 9: título, favicon y color de navegador según el negocio */
    applyBusinessIdentity(data.business);

    renderShell(app);
    renderContent();

    /* Carrito persistido de sesiones anteriores */
    CART = loadCart();
    renderCartUI();

    /* Cierre de modal o carrito con tecla Escape */
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        if (MODAL_STATE.product) closeModal();
        else if (CART_SHEET_OPEN) closeCartSheet();
    });
}

/* --------------------------------------------------------------------------
   RENDER: ESTRUCTURA FIJA + CONTENIDO DINÁMICO
   -------------------------------------------------------------------------- */
function renderShell(app) {
    const business = CATALOG_STATE.business;

    app.innerHTML =
        renderBusinessHeader(business) +
        renderBusinessInfo(business) +
        renderSearchBar() +
        '<div id="tabs-container"></div>' +
        '<main id="catalog-content" class="catalog-content"></main>' +
        '<div id="cart-bar-root"></div>' +
        '<div id="product-modal-root"></div>' +
        '<div id="cart-root"></div>';

    renderTabs();
    bindShellEvents();
    bindGlobalActions(app);
}

function renderTabs() {
    const container = getElement('#tabs-container');
    if (container) {
        container.innerHTML = renderCategoryTabs(CATALOG_STATE.categories, CATALOG_STATE.activeCategory);
    }
}

function renderContent() {
    const container = getElement('#catalog-content');
    if (!container) return;

    const search = normalizeText(CATALOG_STATE.search);

    /* Caso 1: búsqueda activa */
    if (search !== '') {
        const results = CATALOG_STATE.products.filter(function (product) {
            return normalizeText(product.name).indexOf(search) !== -1 ||
                   normalizeText(product.description).indexOf(search) !== -1;
        });

        container.innerHTML =
            '<section>' +
                '<p class="results-header">Buscaste: <strong>' + escapeHTML(CATALOG_STATE.search) + '</strong> — ' +
                    results.length + (results.length === 1 ? ' producto' : ' productos') +
                '</p>' +
                (results.length
                    ? renderProductGrid(results)
                    : renderEmptyState('search', CATALOG_STATE.search)) +
            '</section>';
        return;
    }

    /* Caso 2: catálogo sin productos */
    if (!CATALOG_STATE.products.length) {
        container.innerHTML = renderEmptyState('catalog');
        return;
    }

    /* Caso 3: "Todos" → secciones por categoría */
    if (CATALOG_STATE.activeCategory === 'todos') {
        const sections = CATALOG_STATE.categories
            .map(function (cat) {
                const prods = CATALOG_STATE.products.filter(function (p) {
                    return p.categoryId === cat.id;
                });
                return prods.length ? renderCategorySection(cat, prods) : '';
            })
            .join('');

        container.innerHTML = sections || renderEmptyState('catalog');
        return;
    }

    /* Caso 4: categoría específica */
    const category = CATALOG_STATE.categories.find(function (c) {
        return c.id === CATALOG_STATE.activeCategory;
    });

    const prods = CATALOG_STATE.products.filter(function (p) {
        return p.categoryId === CATALOG_STATE.activeCategory;
    });

    container.innerHTML = category
        ? (prods.length ? renderCategorySection(category, prods) : renderEmptyState('category'))
        : renderEmptyState('catalog');
}

/* --------------------------------------------------------------------------
   FASE 4: MODAL DE DETALLE
   -------------------------------------------------------------------------- */
function openProductModal(product) {
    MODAL_STATE.product = product;
    MODAL_STATE.selectedVariantId = null;
    MODAL_STATE.quantity = 1;
    MODAL_STATE.notes = '';

    renderModalContent();
    document.body.classList.add('modal-open');
}

function closeModal() {
    MODAL_STATE.product = null;
    const root = getElement('#product-modal-root');
    if (root) root.innerHTML = '';
    if (!CART_SHEET_OPEN) document.body.classList.remove('modal-open');
}

function renderModalContent() {
    const root = getElement('#product-modal-root');
    if (!root || !MODAL_STATE.product) return;

    root.innerHTML =
        '<div class="product-modal-overlay">' +
            renderProductDetail(MODAL_STATE.product, MODAL_STATE) +
        '</div>';
}

/* --------------------------------------------------------------------------
   FASE 5: CARRITO
   -------------------------------------------------------------------------- */
function cartStorageKey() {
    return 'cart-' + APP_CONFIG.dataSource.sheetId;
}

function loadCart() {
    try {
        const raw = localStorage.getItem(cartStorageKey());
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('[Cart] Error al leer localStorage:', error);
        return [];
    }
}

function saveCart() {
    try {
        localStorage.setItem(cartStorageKey(), JSON.stringify(CART));
    } catch (error) {
        console.error('[Cart] Error al guardar en localStorage:', error);
    }
}

function getCartLines() {
    const lines = [];

    CART = CART.filter(function (line) {
        const product = CATALOG_STATE.products.find(function (p) {
            return p.id === line.productId;
        });
        if (!product) return false;

        let variant = null;
        if (line.variantId) {
            variant = product.variants.find(function (v) {
                return v.id === line.variantId;
            }) || null;
            if (!variant) return false;
        }

        const unitPrice = variant ? variant.price : product.basePrice;
        if (unitPrice === null || unitPrice === undefined) return false;

        lines.push({
            id: line.id,
            product: product,
            variant: variant,
            quantity: line.quantity,
            notes: line.notes || '',
            unitPrice: unitPrice,
            subtotal: unitPrice * line.quantity
        });
        return true;
    });

    return lines;
}

function cartTotals(lines) {
    return {
        count: lines.reduce(function (n, l) { return n + l.quantity; }, 0),
        subtotal: lines.reduce(function (n, l) { return n + l.subtotal; }, 0)
    };
}

function renderCartUI() {
    const lines = getCartLines();
    const totals = cartTotals(lines);

    const barRoot = getElement('#cart-bar-root');
    if (barRoot) {
        barRoot.innerHTML = totals.count ? renderCartBar(totals) : '';
    }
    document.body.classList.toggle('has-cart-bar', totals.count > 0);

    if (CART_SHEET_OPEN) {
        renderCartSheetContent(lines, totals);
    }
}

/* Renderiza la vista activa del sheet: carrito, checkout o confirmación. */
function renderCartSheetContent(lines, totals) {
    if (!lines.length && CART_VIEW !== 'cart' && CART_VIEW !== 'sent') {
        CART_VIEW = 'cart';
    }

    const root = getElement('#cart-root');
    if (!root) return;

    if (CART_VIEW === 'checkout') {
        root.innerHTML = renderCheckoutSheet(CATALOG_STATE.business, lines, totals, CHECKOUT_STATE, CHECKOUT_ERRORS);
        return;
    }

        if (CART_VIEW === 'confirm') {
        root.innerHTML = renderConfirmSheet(CATALOG_STATE.business, lines, totals, CHECKOUT_STATE);
        return;
    }

    if (CART_VIEW === 'sent') {
        root.innerHTML = renderOrderSentState();
        return;
    }

    root.innerHTML = renderCartSheet(lines, totals);
}

function openCartSheet() {
    const lines = getCartLines();
    CART_SHEET_OPEN = true;
    CART_VIEW = 'cart';
    renderCartSheetContent(lines, cartTotals(lines));
    document.body.classList.add('modal-open');
}

function closeCartSheet() {
    CART_SHEET_OPEN = false;
    const root = getElement('#cart-root');
    if (root) root.innerHTML = '';
    if (!MODAL_STATE.product) document.body.classList.remove('modal-open');
}

function addToCartFromModal() {
    const product = MODAL_STATE.product;
    const variant = getSelectedVariant(product, MODAL_STATE.selectedVariantId);

    const id = product.id + '|' + (variant ? variant.id : '') + '|' + MODAL_STATE.notes;

    const existing = CART.find(function (l) { return l.id === id; });
    if (existing) {
        existing.quantity = Math.min(99, existing.quantity + MODAL_STATE.quantity);
    } else {
        CART.push({
            id: id,
            productId: product.id,
            variantId: variant ? variant.id : null,
            quantity: MODAL_STATE.quantity,
            notes: MODAL_STATE.notes
        });
    }

    saveCart();
    renderCartUI();
    showToast('✓ Agregado al pedido');
    closeModal();
}

function changeLineQuantity(lineId, delta) {
    const line = CART.find(function (l) { return l.id === lineId; });
    if (!line) return;
    line.quantity = Math.max(1, Math.min(99, line.quantity + delta));
    saveCart();
    renderCartUI();
}

function removeLine(lineId) {
    CART = CART.filter(function (l) { return l.id !== lineId; });
    saveCart();
    renderCartUI();
}

/* --------------------------------------------------------------------------
   FASE 6: CHECKOUT
   -------------------------------------------------------------------------- */

/* Validación simple del formulario de checkout. */
function validateCheckout() {
    const errors = {};

    if (CHECKOUT_STATE.name.trim().length < 2) {
        errors.name = 'Ingresá tu nombre.';
    }

    const digits = CHECKOUT_STATE.phone.replace(/\D/g, '');
    if (digits.length < 6) {
        errors.phone = 'Ingresá un teléfono válido.';
    }

    if (CHECKOUT_STATE.deliveryMethod === 'delivery' && CHECKOUT_STATE.address.trim().length < 5) {
        errors.address = 'Ingresá la dirección de entrega.';
    }

    return errors;
}

/* Limpia el error de un campo en vivo mientras el usuario escribe. */
function clearFieldError(key) {
    delete CHECKOUT_ERRORS[key];

    const input = getElement('#checkout-' + key);
    if (input) {
        input.classList.remove('checkout-field__input--error');
        const errorNode = input.parentNode.querySelector('.checkout-field__error');
        if (errorNode) errorNode.remove();
    }
}

/* --------------------------------------------------------------------------
   EVENTOS
   -------------------------------------------------------------------------- */
function bindShellEvents() {
    const input = getElement('#catalog-search');
    const clear = getElement('#search-clear');
    const tabs = getElement('#tabs-container');
    const content = getElement('#catalog-content');
    const modalRoot = getElement('#product-modal-root');
    const cartBarRoot = getElement('#cart-bar-root');
    const cartRoot = getElement('#cart-root');

    /* Buscador */
    if (input) {
        input.addEventListener('input', function () {
            CATALOG_STATE.search = input.value;
            if (clear) {
                clear.classList.toggle('search-bar__clear--visible', input.value !== '');
            }
            renderContent();
        });
    }

    if (clear) {
        clear.addEventListener('click', function () {
            CATALOG_STATE.search = '';
            if (input) {
                input.value = '';
                input.focus();
            }
            clear.classList.remove('search-bar__clear--visible');
            renderContent();
        });
    }

    /* Tabs de categorías */
    if (tabs) {
        tabs.addEventListener('click', function (event) {
            const button = event.target.closest('[data-category]');
            if (!button) return;

            CATALOG_STATE.activeCategory = button.getAttribute('data-category');
            renderTabs();
            renderContent();
        });
    }

    /* Apertura del modal de detalle desde las cards */
    if (content) {
        content.addEventListener('click', function (event) {
            const card = event.target.closest('[data-product-id]');
            if (!card) return;
            openProductById(card.getAttribute('data-product-id'));
        });

        content.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target.closest('[data-product-id]');
            if (!card) return;
            event.preventDefault();
            openProductById(card.getAttribute('data-product-id'));
        });
    }

    /* Modal de detalle */
    if (modalRoot) {
        modalRoot.addEventListener('click', function (event) {
            if (event.target.classList.contains('product-modal-overlay')) {
                closeModal();
                return;
            }

            const variantButton = event.target.closest('[data-variant]');
            if (variantButton) {
                MODAL_STATE.selectedVariantId = variantButton.getAttribute('data-variant');
                renderModalContent();
                return;
            }

            const action = event.target.closest('[data-action]');
            if (!action) return;

            const type = action.getAttribute('data-action');

            if (type === 'close-modal') closeModal();

            if (type === 'qty-plus') {
                if (MODAL_STATE.quantity < 99) MODAL_STATE.quantity++;
                renderModalContent();
            }

            if (type === 'qty-minus') {
                if (MODAL_STATE.quantity > 1) MODAL_STATE.quantity--;
                renderModalContent();
            }

            if (type === 'add-to-cart') addToCartFromModal();
        });

        modalRoot.addEventListener('input', function (event) {
            if (event.target.id === 'product-notes') {
                MODAL_STATE.notes = event.target.value;
            }
        });
    }

    /* Barra del carrito */
    if (cartBarRoot) {
        cartBarRoot.addEventListener('click', function (event) {
            if (event.target.closest('[data-action="open-cart"]')) {
                openCartSheet();
            }
        });
    }

    /* Sheet del carrito / checkout / confirmación */
    if (cartRoot) {
        cartRoot.addEventListener('click', function (event) {
            if (event.target.classList.contains('cart-overlay')) {
                closeCartSheet();
                return;
            }

            /* Selección de método de entrega */
            const deliveryButton = event.target.closest('[data-method]');
            if (deliveryButton) {
                CHECKOUT_STATE.deliveryMethod = deliveryButton.getAttribute('data-method');
                if (CHECKOUT_STATE.deliveryMethod === 'pickup') {
                    clearFieldError('address');
                }
                renderCartUI();
                return;
            }

            const action = event.target.closest('[data-action]');
            if (!action) return;

            const type = action.getAttribute('data-action');
            const lineId = action.getAttribute('data-line-id');

            /* Vista carrito */
            if (type === 'close-cart') closeCartSheet();
            if (type === 'cart-qty-plus') changeLineQuantity(lineId, 1);
            if (type === 'cart-qty-minus') changeLineQuantity(lineId, -1);
            if (type === 'remove-line') removeLine(lineId);

            if (type === 'clear-cart') {
                if (confirm('¿Vaciar todo el pedido?')) {
                    CART = [];
                    saveCart();
                    renderCartUI();
                }
            }

            /* Navegación entre vistas */
            if (type === 'continue-checkout') {
                CART_VIEW = 'checkout';
                renderCartUI();
            }

            if (type === 'back-to-cart') {
                CART_VIEW = 'cart';
                renderCartUI();
            }

            if (type === 'back-to-checkout') {
                CART_VIEW = 'checkout';
                renderCartUI();
            }

            /* Validación y paso a confirmación */
            if (type === 'go-confirm') {
                CHECKOUT_ERRORS = validateCheckout();

                if (Object.keys(CHECKOUT_ERRORS).length) {
                    renderCartUI();
                    const firstKey = Object.keys(CHECKOUT_ERRORS)[0];
                    const field = getElement('#checkout-' + firstKey);
                    if (field) field.focus();
                    return;
                }

                CART_VIEW = 'confirm';
                renderCartUI();
            }

            /* Fase 7: envío real por WhatsApp */
            if (type === 'send-whatsapp') handleSendWhatsApp();

            if (type === 'reopen-whatsapp') {
                if (LAST_WHATSAPP_URL) openWhatsAppUrl(LAST_WHATSAPP_URL);
            }
        });

        /* Campos del checkout: guardar en estado sin repintar (conserva foco) */
        cartRoot.addEventListener('input', function (event) {
            const id = event.target.id;

            if (id === 'checkout-name') {
                CHECKOUT_STATE.name = event.target.value;
                clearFieldError('name');
            }
            if (id === 'checkout-phone') {
                CHECKOUT_STATE.phone = event.target.value;
                clearFieldError('phone');
            }
            if (id === 'checkout-address') {
                CHECKOUT_STATE.address = event.target.value;
                clearFieldError('address');
            }
            if (id === 'checkout-notes') {
                CHECKOUT_STATE.notes = event.target.value;
            }
        });
    }
}

function openProductById(productId) {
    const product = CATALOG_STATE.products.find(function (p) {
        return p.id === productId;
    });
    if (product) openProductModal(product);
}

/* Acciones globales: reintentar y resetear filtros. */
function bindGlobalActions(app) {
    app.addEventListener('click', function (event) {
        const action = event.target.closest('[data-action]');
        if (!action) return;

        const type = action.getAttribute('data-action');

        if (type === 'retry') {
            location.reload();
        }

        if (type === 'reset-filters') {
            CATALOG_STATE.search = '';
            CATALOG_STATE.activeCategory = 'todos';

            const input = getElement('#catalog-search');
            if (input) input.value = '';

            const clear = getElement('#search-clear');
            if (clear) clear.classList.remove('search-bar__clear--visible');

            renderTabs();
            renderContent();
        }
    });
}

/* --------------------------------------------------------------------------
   FASE 7: ENVÍO POR WHATSAPP
   -------------------------------------------------------------------------- */
function handleSendWhatsApp() {
    const lines = getCartLines();
    if (!lines.length) return;

    const totals = cartTotals(lines);
    const business = CATALOG_STATE.business;
    const number = String(business.whatsapp || '').replace(/\D/g, '');

    if (!number) {
        showToast('El negocio no configuró su número de WhatsApp');
        console.error('[WhatsApp] Falta el número en la hoja config (clave whatsapp).');
        return;
    }

    const deliveryCost = getDeliveryCostFor(CHECKOUT_STATE.deliveryMethod, business);

    const order = {
        lines: lines,
        totals: totals,
        deliveryCost: deliveryCost,
        total: totals.subtotal + deliveryCost,
        checkout: {
            deliveryMethod: CHECKOUT_STATE.deliveryMethod,
            name: CHECKOUT_STATE.name,
            phone: CHECKOUT_STATE.phone,
            address: CHECKOUT_STATE.address,
            notes: CHECKOUT_STATE.notes
        }
    };

    const message = buildWhatsAppMessage(order, business);
    console.log('[WhatsApp] Mensaje generado:\n' + message);

    LAST_WHATSAPP_URL = 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);

        openWhatsAppUrl(LAST_WHATSAPP_URL);

    /* Fase 10.5: registro del pedido en la hoja orders (no bloquea el envío) */
    const orderRecord = {
        id: 'PED-' + Date.now(),
        timestamp: new Date().toLocaleString('es-AR'),
        customer_name: CHECKOUT_STATE.name,
        customer_phone: CHECKOUT_STATE.phone,
        delivery_method: CHECKOUT_STATE.deliveryMethod,
        address: CHECKOUT_STATE.deliveryMethod === 'delivery' ? CHECKOUT_STATE.address : '',
        notes: CHECKOUT_STATE.notes,
        status: 'pending',
        items: lines.map(function (line) {
            return line.quantity + ' x ' + line.product.name +
                (line.variant ? ' (' + line.variant.name + ')' : '') +
                (line.notes ? ' [' + line.notes + ']' : '') +
                ' = ' + formatPrice(line.subtotal);
        }).join('; '),
        subtotal: totals.subtotal,
        delivery_cost: deliveryCost,
        total: totals.subtotal + deliveryCost
    };
    saveOrderToSheet(orderRecord);

    /* El pedido ya salió: vaciamos el carrito y mostramos la confirmación */

    /* El pedido ya salió: vaciamos el carrito y mostramos la confirmación */
    CART = [];
    saveCart();
    CART_VIEW = 'sent';
    renderCartUI();
}

/* Abre WhatsApp mediante un ancla simulada:
   el bloqueador de popups la acepta como navegación del usuario. */
function openWhatsAppUrl(url) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

/* --------------------------------------------------------------------------
   FASE 8: TEMA DINÁMICO DESDE LA HOJA CONFIG
   -------------------------------------------------------------------------- */

/* Convierte hex (#rgb o #rrggbb) a {r,g,b}. Devuelve null si es inválido. */
function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;

    let value = hex.trim().replace(/^#/, '');
    if (value.length === 3) {
        value = value.split('').map(function (c) { return c + c; }).join('');
    }
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;

    return {
        r: parseInt(value.substring(0, 2), 16),
        g: parseInt(value.substring(2, 4), 16),
        b: parseInt(value.substring(4, 6), 16)
    };
}

/* Luminancia relativa según WCAG. */
function luminance(rgb) {
    const channel = function (c) {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function isDarkColor(hex) {
    const rgb = hexToRgb(hex);
    return rgb ? luminance(rgb) < 0.45 : false;
}

/* Texto que contrasta con un fondo dado (WCAG). */
function contrastTextFor(hex) {
    return isDarkColor(hex) ? '#ffffff' : '#111111';
}

/* Aplica el tema del negocio a las variables CSS globales. */
function applyTheme(business) {
    const rootStyle = document.documentElement.style;

    const primary = (typeof business.primary_color === 'string') ? business.primary_color : '';
    const secondary = (typeof business.secondary_color === 'string') ? business.secondary_color : '';
    const background = (typeof business.background_color === 'string') ? business.background_color : '';

    if (hexToRgb(primary)) {
        rootStyle.setProperty('--primary-color', primary.trim());
        rootStyle.setProperty('--on-primary-color', contrastTextFor(primary));
    }

    if (hexToRgb(secondary)) {
        rootStyle.setProperty('--secondary-color', secondary.trim());
    }

    if (hexToRgb(background)) {
        const dark = isDarkColor(background);
        rootStyle.setProperty('--background-color', background.trim());
        rootStyle.setProperty('--surface-color', dark ? '#1e1e1e' : '#ffffff');
        rootStyle.setProperty('--text-color', dark ? '#f5f5f5' : '#111111');
        rootStyle.setProperty('--muted-color', dark ? '#b0b0b0' : '#777777');
        rootStyle.setProperty('--border-color', dark ? '#333333' : '#dddddd');
    }

    /* Texto sobre el verde de éxito (fijo) */
    rootStyle.setProperty('--on-success-color', contrastTextFor('#198754'));

    console.log('[Theme] Tema aplicado desde la hoja config');
}

/* --------------------------------------------------------------------------
   FASE 9: IDENTIDAD DE PESTAÑA Y NAVEGADOR
   -------------------------------------------------------------------------- */
function applyBusinessIdentity(business) {
    const name = business.business_name || 'Catálogo digital';

    /* Título de pestaña con el nombre del negocio */
    document.title = name + ' — Catálogo';

    /* Meta description con la descripción del negocio */
    const meta = document.querySelector('meta[name="description"]');
    if (meta && business.business_description) {
        meta.setAttribute('content', business.business_description);
    }

    /* Color de la barra del navegador móvil (theme-color) */
    let themeColor = document.querySelector('meta[name="theme-color"]');
    if (!themeColor) {
        themeColor = document.createElement('meta');
        themeColor.name = 'theme-color';
        document.head.appendChild(themeColor);
    }
    const primary = (typeof business.primary_color === 'string' && hexToRgb(business.primary_color))
        ? business.primary_color.trim()
        : '#000000';
    themeColor.setAttribute('content', primary);

    /* Favicon = logo del negocio si existe */
    if (business.logo_url) {
        let icon = document.querySelector('link[rel="icon"]');
        if (!icon) {
            icon = document.createElement('link');
            icon.rel = 'icon';
            document.head.appendChild(icon);
        }
        icon.href = business.logo_url;
    }

    console.log('[Theme] Identidad de pestaña aplicada: ' + name);
}
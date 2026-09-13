/* ==========================================================================
   PLATAFORMA DE CATÁLOGO - components.js
   Capa de componentes reutilizables.
   Fase 3: componentes visuales del catálogo público implementados.
   Los componentes de carrito, checkout y WhatsApp siguen como placeholder.
   ========================================================================== */

/* --------------------------------------------------------------------------
   HELPERS INTERNOS DE COMPONENTES
   -------------------------------------------------------------------------- */

/* Normaliza texto para búsquedas: minúsculas y sin acentos. */
function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/* Define el texto de precio según el caso:
   - precio base → "$21.500"
   - sin precio base con variantes → "Desde $12.000"
   - sin precio y sin variantes → "Consultar precio" */
function priceLabel(product) {
    if (product.basePrice !== null && product.basePrice !== undefined) {
        return { text: formatPrice(product.basePrice), consult: false };
    }

    if (product.variants && product.variants.length) {
        const prices = product.variants
            .map(function (v) { return v.price; })
            .filter(function (p) { return p !== null; });

        if (prices.length) {
            return { text: 'Desde ' + formatPrice(Math.min.apply(null, prices)), consult: false };
        }
    }

    return { text: 'Consultar precio', consult: true };
}

/* Imagen del producto o placeholder elegante con la inicial.
   Si la URL existe pero falla al cargar, onerror la reemplaza por el placeholder. */
function productMediaHTML(product) {
    if (product.image) {
        return '<img src="' + escapeHTML(product.image) + '" alt="' + escapeHTML(product.name) + '" loading="lazy" onerror="productImageError(this)">';
    }
    const initial = product.name
        ? escapeHTML(product.name.charAt(0).toUpperCase())
        : '?';
    return '<div class="product-card__placeholder" aria-hidden="true">' + initial + '</div>';
}

/* Badges: máximo Nuevo y Destacado. */
function productBadgesHTML(product) {
    const badges = [];
    if (product.isNew) badges.push('<span class="badge badge--new">Nuevo</span>');
    if (product.featured) badges.push('<span class="badge badge--featured">Destacado</span>');
    return badges.length
        ? '<div class="product-card__badges">' + badges.join('') + '</div>'
        : '';
}

/* Si la imagen de un producto no carga (URL rota o caída),
   la reemplaza por el placeholder con la inicial. */
function productImageError(img) {
    const placeholder = document.createElement('div');
    placeholder.className = 'product-card__placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = (img.alt || '?').charAt(0).toUpperCase();
    img.replaceWith(placeholder);
}

/* Si el logo no carga, lo reemplaza por el fallback con la inicial del negocio. */
function logoImageError(img) {
    const fallback = document.createElement('div');
    fallback.className = 'business-header__logo-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    const name = (img.alt || '').replace('Logo de ', '');
    fallback.textContent = (name || '?').charAt(0).toUpperCase();
    img.replaceWith(fallback);
}

/* --------------------------------------------------------------------------
   COMPONENTES: HEADER E INFO
   -------------------------------------------------------------------------- */

function renderBusinessHeader(business) {
    const logo = business.logo_url
        ? '<img class="business-header__logo" src="' + escapeHTML(business.logo_url) + '" alt="Logo de ' + escapeHTML(business.business_name || '') + '" onerror="logoImageError(this)">'
        : '<div class="business-header__logo-fallback" aria-hidden="true">' +
            escapeHTML((business.business_name || '?').charAt(0).toUpperCase()) +
          '</div>';

    const links = [];
    if (business.whatsapp) {
        const digits = String(business.whatsapp).replace(/\D/g, '');
        links.push('<a class="business-header__link" href="https://wa.me/' + digits + '" target="_blank" rel="noopener">WhatsApp</a>');
    }
    if (business.instagram) {
        const user = String(business.instagram).replace(/^@/, '');
        links.push('<a class="business-header__link" href="https://instagram.com/' + escapeHTML(user) + '" target="_blank" rel="noopener">Instagram</a>');
    }

    return '<header class="business-header">' +
        logo +
        '<h1 class="business-header__name">' + escapeHTML(business.business_name || '') + '</h1>' +
        (links.length ? '<div class="business-header__links">' + links.join('') + '</div>' : '') +
    '</header>';
}

function renderBusinessInfo(business) {
    const meta = [];

    const closed = String(business.business_status || '').toLowerCase() === 'closed';
    meta.push(
        closed
            ? '<span class="business-status business-status--closed"><span class="business-status__dot"></span>Cerrado</span>'
            : '<span class="business-status business-status--open"><span class="business-status__dot"></span>Abierto</span>'
    );

    if (business.opening_hours) {
        meta.push('<span>🕒 ' + escapeHTML(business.opening_hours) + '</span>');
    }
    if (business.address) {
        meta.push('<span>📍 ' + escapeHTML(business.address) + '</span>');
    }

    return '<section class="business-info">' +
        (business.business_description
            ? '<p class="business-info__description">' + escapeHTML(business.business_description) + '</p>'
            : '') +
        '<div class="business-info__meta">' + meta.join('') + '</div>' +
    '</section>';
}

/* --------------------------------------------------------------------------
   COMPONENTES: BÚSQUEDA Y CATEGORÍAS
   -------------------------------------------------------------------------- */

function renderSearchBar() {
    return '<div class="search-bar"><div class="search-bar__field">' +
        '<span class="search-bar__icon" aria-hidden="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<circle cx="11" cy="11" r="7"></circle>' +
                '<line x1="21" y1="21" x2="16.5" y2="16.5"></line>' +
            '</svg>' +
        '</span>' +
        '<input id="catalog-search" class="search-bar__input" type="search" placeholder="¿Qué estás buscando?" aria-label="Buscar productos" autocomplete="off">' +
        '<button id="search-clear" class="search-bar__clear" type="button" aria-label="Limpiar búsqueda">×</button>' +
    '</div></div>';
}

function renderCategoryTabs(categories, active) {
    const tabs = [
        '<button class="category-tab' + (active === 'todos' ? ' category-tab--active' : '') + '" data-category="todos" type="button">Todos</button>'
    ];

    categories.forEach(function (cat) {
        tabs.push(
            '<button class="category-tab' + (active === cat.id ? ' category-tab--active' : '') + '" data-category="' + escapeHTML(cat.id) + '" type="button">' +
                escapeHTML(cat.name) +
            '</button>'
        );
    });

    return '<nav class="category-tabs" aria-label="Categorías">' + tabs.join('') + '</nav>';
}

/* --------------------------------------------------------------------------
   COMPONENTES: PRODUCTOS
   -------------------------------------------------------------------------- */

function renderProductCard(product) {
    const price = priceLabel(product);

    const priceHTML = price.consult
        ? '<span class="product-card__price product-card__price--consult">' + escapeHTML(price.text) + '</span>'
        : '<span class="product-card__price">' + escapeHTML(price.text) + '</span>';

    const variantsHTML = (product.variants && product.variants.length)
        ? '<span class="product-card__variants">' +
            escapeHTML(product.variantName || 'Variantes') + ': ' + product.variants.length + ' opciones' +
          '</span>'
        : '';

    return '<article class="product-card product-card--clickable" data-product-id="' + escapeHTML(product.id) + '" tabindex="0" role="button" aria-label="Ver detalle de ' + escapeHTML(product.name) + '">' +
        '<div class="product-card__media">' + productMediaHTML(product) + '</div>' +
        '<div class="product-card__body">' +
            productBadgesHTML(product) +
            '<h3 class="product-card__name">' + escapeHTML(product.name) + '</h3>' +
            (product.description
                ? '<p class="product-card__description">' + escapeHTML(product.description) + '</p>'
                : '') +
            '<div class="product-card__footer">' + priceHTML + variantsHTML + '</div>' +
        '</div>' +
    '</article>';
}

function renderProductGrid(products) {
    if (!products.length) return '';
    return '<div class="product-grid">' +
        products.map(renderProductCard).join('') +
    '</div>';
}

function renderCategorySection(category, products) {
    return '<section class="category-section">' +
        '<h2 class="category-section__title">' + escapeHTML(category.name) + '</h2>' +
        (category.description
            ? '<p class="category-section__description">' + escapeHTML(category.description) + '</p>'
            : '') +
        renderProductGrid(products) +
    '</section>';
}

/* --------------------------------------------------------------------------
   COMPONENTES: ESTADOS
   -------------------------------------------------------------------------- */

function renderEmptyState(type, searchTerm) {
    if (type === 'search') {
        return '<div class="empty-state">' +
            '<span class="empty-state__icon" aria-hidden="true">🔍</span>' +
            '<p class="empty-state__title">No encontramos productos</p>' +
            '<p>Buscaste: "' + escapeHTML(searchTerm || '') + '"</p>' +
            '<p>Probá con otro nombre o categoría.</p>' +
            '<button class="empty-state__action" data-action="reset-filters" type="button">Ver todo</button>' +
        '</div>';
    }

    if (type === 'category') {
        return '<div class="empty-state">' +
            '<span class="empty-state__icon" aria-hidden="true">📦</span>' +
            '<p class="empty-state__title">Esta categoría todavía no tiene productos</p>' +
        '</div>';
    }

    return '<div class="empty-state">' +
        '<span class="empty-state__icon" aria-hidden="true">📦</span>' +
        '<p class="empty-state__title">Todavía no hay productos publicados</p>' +
    '</div>';
}

/* Estado de carga con skeletons (diseño Stitch, Pantalla de estados). */
function renderLoadingState() {
    const cards = [];
    for (let i = 0; i < 4; i++) {
        cards.push('<div class="skeleton-card skeleton"></div>');
    }

    return '<p class="sr-only">Cargando catálogo...</p>' +
        '<div class="skeleton-header skeleton"></div>' +
        '<div class="skeleton-search skeleton"></div>' +
        '<div class="skeleton-tabs skeleton"></div>' +
        '<div class="skeleton-grid">' + cards.join('') + '</div>';
}

function renderErrorState(message) {
    return '<div class="init-message">' +
        '<h1 class="init-message__title">No pudimos cargar el catálogo</h1>' +
        '<p>' + escapeHTML(message || 'Revisá tu conexión o la configuración de la hoja.') + '</p>' +
        '<button class="empty-state__action" data-action="retry" type="button">Reintentar</button>' +
    '</div>';
}

function renderConfigErrorState() {
    return '<div class="init-message">' +
        '<h1 class="init-message__title">Fase 3 — Catálogo</h1>' +
        '<p class="init-message__status" style="color: var(--danger-color);">Falta configurar el SHEET_ID en js/config.js</p>' +
    '</div>';
}

/* --------------------------------------------------------------------------
   PLACEHOLDERS DE FASES SIGUIENTES (NO TOCAR TODAVÍA)
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   FASE 4: DETALLE DE PRODUCTO (MODAL)
   -------------------------------------------------------------------------- */

/* Devuelve la variante seleccionada, o la primera por defecto. */
function getSelectedVariant(product, variantId) {
    if (!product.variants || !product.variants.length) return null;

    if (variantId) {
        const found = product.variants.find(function (v) {
            return v.id === variantId;
        });
        if (found) return found;
    }

    return product.variants[0];
}

/* Chips de variantes: nombre + precio, con estado activo. */
function renderVariantSelector(product, selectedId) {
    const selected = getSelectedVariant(product, selectedId);

    const options = product.variants.map(function (v) {
        const active = selected && v.id === selected.id;
        return '<button class="variant-option' + (active ? ' variant-option--active' : '') + '" data-variant="' + escapeHTML(v.id) + '" type="button">' +
            escapeHTML(v.name) +
            (v.price !== null ? ' — ' + escapeHTML(formatPrice(v.price)) : '') +
        '</button>';
    }).join('');

    return '<div class="variant-selector">' +
        '<span class="variant-selector__label">' + escapeHTML(product.variantName || 'Variantes') + '</span>' +
        '<div class="variant-selector__options">' + options + '</div>' +
    '</div>';
}

/* Stepper de cantidad: botones grandes aptos para táctil. */
function renderQuantitySelector(quantity) {
    return '<div class="quantity-selector" role="group" aria-label="Cantidad">' +
        '<button class="quantity-selector__btn" data-action="qty-minus" type="button" aria-label="Disminuir cantidad">−</button>' +
        '<span class="quantity-selector__value">' + quantity + '</span>' +
        '<button class="quantity-selector__btn" data-action="qty-plus" type="button" aria-label="Aumentar cantidad">+</button>' +
    '</div>';
}

/* Modal de detalle. Recibe el producto y la selección actual del usuario. */
function renderProductDetail(product, selection) {
    const variant = getSelectedVariant(product, selection.selectedVariantId);
    const unitPrice = variant ? variant.price : product.basePrice;
    const hasPrice = (unitPrice !== null && unitPrice !== undefined);
    const total = hasPrice ? unitPrice * selection.quantity : null;

    let html = '<div class="product-modal" role="dialog" aria-modal="true" aria-label="' + escapeHTML(product.name) + '">';

    html += '<button class="product-modal__close" data-action="close-modal" type="button" aria-label="Cerrar">×</button>';
    html += '<div class="product-modal__media">' + productMediaHTML(product) + '</div>';
    html += '<h2 class="product-modal__name">' + escapeHTML(product.name) + '</h2>';

    if (product.description) {
        html += '<p class="product-modal__description">' + escapeHTML(product.description) + '</p>';
    }

    if (product.variants && product.variants.length) {
        html += renderVariantSelector(product, selection.selectedVariantId);
    }

    html += '<div class="product-modal__row">' +
        '<span class="product-modal__price">' +
            (hasPrice ? escapeHTML(formatPrice(unitPrice)) : 'Consultar precio') +
        '</span>' +
        (hasPrice ? renderQuantitySelector(selection.quantity) : '') +
    '</div>';

    html += '<label class="product-modal__notes-label" for="product-notes">¿Querés agregar alguna observación?</label>' +
        '<textarea id="product-notes" class="product-modal__notes" placeholder="Ej: sin cebolla, color preferido, etc.">' +
            escapeHTML(selection.notes) +
        '</textarea>';

    html += '<button class="product-modal__cta" data-action="add-to-cart" type="button"' + (hasPrice ? '' : ' disabled') + '>' +
        (hasPrice
            ? 'Agregar al pedido — ' + escapeHTML(formatPrice(total))
            : 'Consultar precio') +
    '</button>';

    html += '</div>';
    return html;
}

/* Toast de feedback temporal (hasta que exista el carrito en Fase 5). */
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function () {
        toast.remove();
    }, 2500);
}

/* --------------------------------------------------------------------------
   FASE 5: CARRITO (BARRA + SHEET + ÍTEMS)
   -------------------------------------------------------------------------- */

/* Barra inferior fija. Solo se renderiza si hay productos. */
function renderCartBar(totals) {
    return '<button class="cart-bar" data-action="open-cart" type="button">' +
        '<span class="cart-bar__icon" aria-hidden="true">🛒</span>' +
        '<span class="cart-bar__label">Ver pedido</span>' +
        '<span class="cart-bar__count">' + totals.count + (totals.count === 1 ? ' producto' : ' productos') + '</span>' +
        '<span class="cart-bar__total">' + escapeHTML(formatPrice(totals.subtotal)) + '</span>' +
    '</button>';
}

/* Ítem individual del carrito. */
function renderCartItem(line) {
    return '<div class="cart-item">' +
        '<div class="cart-item__info">' +
            '<span class="cart-item__name">' + escapeHTML(line.product.name) + '</span>' +
            (line.variant ? '<span class="cart-item__variant">' + escapeHTML(line.variant.name) + '</span>' : '') +
            (line.notes ? '<span class="cart-item__notes">"' + escapeHTML(line.notes) + '"</span>' : '') +
            '<span class="cart-item__unit">' + escapeHTML(formatPrice(line.unitPrice)) + ' c/u</span>' +
            '<div class="cart-item__controls">' +
                '<div class="quantity-selector" role="group" aria-label="Cantidad de ' + escapeHTML(line.product.name) + '">' +
                    '<button class="quantity-selector__btn" data-action="cart-qty-minus" data-line-id="' + escapeHTML(line.id) + '" type="button" aria-label="Disminuir cantidad">−</button>' +
                    '<span class="quantity-selector__value">' + line.quantity + '</span>' +
                    '<button class="quantity-selector__btn" data-action="cart-qty-plus" data-line-id="' + escapeHTML(line.id) + '" type="button" aria-label="Aumentar cantidad">+</button>' +
                '</div>' +
                '<span class="cart-item__subtotal">' + escapeHTML(formatPrice(line.subtotal)) + '</span>' +
                '<button class="cart-item__remove" data-action="remove-line" data-line-id="' + escapeHTML(line.id) + '" type="button">Eliminar</button>' +
            '</div>' +
        '</div>' +
    '</div>';
}

/* Sheet completo: header + ítems o estado vacío + footer con subtotal. */
function renderCartSheet(lines, totals) {
    let html = '<div class="cart-overlay">' +
        '<div class="cart-sheet" role="dialog" aria-modal="true" aria-label="Tu pedido">' +
            '<div class="cart-sheet__header">' +
                '<h2 class="cart-sheet__title">Tu pedido</h2>' +
                '<button class="cart-sheet__close" data-action="close-cart" type="button" aria-label="Cerrar">×</button>' +
            '</div>';

    if (!lines.length) {
        html += '<div class="cart-sheet__items">' +
            '<div class="empty-state">' +
                '<span class="empty-state__icon" aria-hidden="true">🛒</span>' +
                '<p class="empty-state__title">Tu carrito está vacío</p>' +
                '<p>Agregá productos del catálogo para armar tu pedido.</p>' +
                '<button class="empty-state__action" data-action="close-cart" type="button">Explorar productos</button>' +
            '</div>' +
        '</div>';
    } else {
        html += '<div class="cart-sheet__items">' + lines.map(renderCartItem).join('') + '</div>';
        html += '<div class="cart-sheet__footer">' +
            '<div class="cart-summary">' +
                '<div class="cart-summary__row cart-summary__row--total">' +
                    '<span>Subtotal</span>' +
                    '<span>' + escapeHTML(formatPrice(totals.subtotal)) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="cart-sheet__actions">' +
                '<button class="cart-sheet__clear" data-action="clear-cart" type="button">Vaciar</button>' +
                '<button class="cart-sheet__continue" data-action="continue-checkout" type="button">Continuar</button>' +
            '</div>' +
        '</div>';
    }

    html += '</div></div>';
    return html;
}

/* --------------------------------------------------------------------------
   FASE 6: CHECKOUT Y CONFIRMACIÓN
   -------------------------------------------------------------------------- */

/* Costo de delivery según método y configuración del negocio. */
function getDeliveryCostFor(method, business) {
    if (method !== 'delivery') return 0;
    if (!business || business.delivery_enabled !== true) return 0;
    return business.delivery_cost || 0;
}

/* Campo de formulario con label, input y error inline. */
function renderField(id, label, type, value, error, placeholder, required) {
    return '<div class="checkout-field">' +
        '<label class="checkout-field__label" for="' + id + '">' + label + (required ? ' *' : '') + '</label>' +
        '<input id="' + id + '" class="checkout-field__input' + (error ? ' checkout-field__input--error' : '') + '"' +
            ' type="' + type + '"' +
            ' value="' + escapeHTML(value) + '"' +
            (placeholder ? ' placeholder="' + escapeHTML(placeholder) + '"' : '') +
        '>' +
        (error ? '<span class="checkout-field__error">' + escapeHTML(error) + '</span>' : '') +
    '</div>';
}

/* Opciones de entrega según configuración del negocio. */
function renderDeliveryOptions(business, state) {
    const deliveryEnabled = (business && business.delivery_enabled === true);

    let html = '<div class="checkout-section">' +
        '<span class="checkout-section__label">Método de entrega</span>' +
        '<div class="delivery-options">' +
            '<button class="delivery-option' + (state.deliveryMethod === 'pickup' ? ' delivery-option--active' : '') + '" data-action="select-delivery" data-method="pickup" type="button">' +
                '<span class="delivery-option__title">🏪 Retiro en el local</span>' +
                '<span class="delivery-option__hint">Retirás tu pedido por tu cuenta</span>' +
            '</button>';

    if (deliveryEnabled) {
        const cost = business.delivery_cost;
        html += '<button class="delivery-option' + (state.deliveryMethod === 'delivery' ? ' delivery-option--active' : '') + '" data-action="select-delivery" data-method="delivery" type="button">' +
                    '<span class="delivery-option__title">🚚 Delivery</span>' +
                    '<span class="delivery-option__hint">' + (cost ? 'Costo: ' + escapeHTML(formatPrice(cost)) : 'Sin costo') + '</span>' +
                '</button>';
    }

    html += '</div></div>';
    return html;
}

/* Vista de checkout: entrega + datos + resumen con total. */
function renderCheckoutSheet(business, lines, totals, state, errors) {
    const deliveryCost = getDeliveryCostFor(state.deliveryMethod, business);
    const total = totals.subtotal + deliveryCost;

    return '<div class="cart-overlay"><div class="cart-sheet" role="dialog" aria-modal="true" aria-label="Checkout">' +
        '<div class="cart-sheet__header">' +
            '<h2 class="cart-sheet__title">Completá tu pedido</h2>' +
            '<button class="cart-sheet__close" data-action="close-cart" type="button" aria-label="Cerrar">×</button>' +
        '</div>' +
        '<div class="cart-sheet__items">' +
            renderDeliveryOptions(business, state) +
            renderField('checkout-name', 'Nombre', 'text', state.name, errors.name, 'Tu nombre', true) +
            renderField('checkout-phone', 'Teléfono', 'tel', state.phone, errors.phone, 'Ej: 341 555 5555', true) +
            (state.deliveryMethod === 'delivery'
                ? renderField('checkout-address', 'Dirección', 'text', state.address, errors.address, 'Calle, número, piso, ciudad', true)
                : '') +
            renderField('checkout-notes', 'Observaciones del pedido', 'text', state.notes, '', 'Ej: llamar al llegar', false) +
        '</div>' +
        '<div class="cart-sheet__footer">' +
            '<div class="cart-summary">' +
                '<div class="cart-summary__row"><span>Subtotal</span><span>' + escapeHTML(formatPrice(totals.subtotal)) + '</span></div>' +
                '<div class="cart-summary__row"><span>Delivery</span><span>' + (state.deliveryMethod === 'delivery' ? escapeHTML(formatPrice(deliveryCost)) : '—') + '</span></div>' +
                '<div class="cart-summary__row cart-summary__row--total"><span>Total</span><span>' + escapeHTML(formatPrice(total)) + '</span></div>' +
            '</div>' +
            '<div class="cart-sheet__actions">' +
                '<button class="cart-sheet__clear" data-action="back-to-cart" type="button">Volver</button>' +
                '<button class="cart-sheet__continue" data-action="go-confirm" type="button">Confirmar pedido</button>' +
            '</div>' +
        '</div>' +
    '</div></div>';
}

/* Vista de confirmación previa al envío por WhatsApp. */
function renderConfirmSheet(business, lines, totals, state) {
    const deliveryCost = getDeliveryCostFor(state.deliveryMethod, business);
    const total = totals.subtotal + deliveryCost;

    const itemsHtml = lines.map(function (line) {
        return '<div class="confirm-item">' +
                    '<span class="confirm-item__qty">' + line.quantity + ' ×</span>' +
                    '<span class="confirm-item__name">' + escapeHTML(line.product.name) + (line.variant ? ' (' + escapeHTML(line.variant.name) + ')' : '') + '</span>' +
                    '<span class="confirm-item__subtotal">' + escapeHTML(formatPrice(line.subtotal)) + '</span>' +
                '</div>' +
                (line.notes ? '<div class="confirm-item__notes">"' + escapeHTML(line.notes) + '"</div>' : '');
    }).join('');

    return '<div class="cart-overlay"><div class="cart-sheet" role="dialog" aria-modal="true" aria-label="Confirmación del pedido">' +
        '<div class="cart-sheet__header">' +
            '<h2 class="cart-sheet__title">Tu pedido está listo</h2>' +
            '<button class="cart-sheet__close" data-action="close-cart" type="button" aria-label="Cerrar">×</button>' +
        '</div>' +
        '<div class="cart-sheet__items">' +
            '<div class="confirm-block">' + itemsHtml + '</div>' +
            '<div class="confirm-block">' +
                '<div class="cart-summary__row"><span>Subtotal</span><span>' + escapeHTML(formatPrice(totals.subtotal)) + '</span></div>' +
                '<div class="cart-summary__row"><span>Delivery</span><span>' + (state.deliveryMethod === 'delivery' ? escapeHTML(formatPrice(deliveryCost)) : 'Retiro en el local') + '</span></div>' +
                '<div class="cart-summary__row cart-summary__row--total"><span>Total</span><span>' + escapeHTML(formatPrice(total)) + '</span></div>' +
            '</div>' +
            '<div class="confirm-block">' +
                '<div class="confirm-data"><strong>' + escapeHTML(state.name) + '</strong> — ' + escapeHTML(state.phone) + '</div>' +
                (state.deliveryMethod === 'delivery'
                    ? '<div class="confirm-data">📍 ' + escapeHTML(state.address) + '</div>'
                    : '<div class="confirm-data">🏪 Retiro en el local</div>') +
                (state.notes ? '<div class="confirm-data">Obs: ' + escapeHTML(state.notes) + '</div>' : '') +
            '</div>' +
        '</div>' +
        '<div class="cart-sheet__footer">' +
            '<div class="cart-sheet__actions">' +
                '<button class="cart-sheet__clear" data-action="back-to-checkout" type="button">Volver</button>' +
                '<button class="cart-sheet__continue" data-action="send-whatsapp" type="button">Enviar pedido por WhatsApp</button>' +
            '</div>' +
        '</div>' +
    '</div></div>';
}

/* --------------------------------------------------------------------------
   FASE 7: WHATSAPP (MENSAJE + PANTALLA DE ENVIADO)
   -------------------------------------------------------------------------- */

/* Construye el mensaje estructurado del pedido.
   Texto plano con formato WhatsApp (negritas con asteriscos). */
function buildWhatsAppMessage(order, business) {
    const lines = [];

    lines.push('*PEDIDO — ' + (business.business_name || '') + '*');
    lines.push('');
    lines.push('*Productos:*');

    order.lines.forEach(function (line) {
        lines.push(
            line.quantity + ' × ' + line.product.name +
            (line.variant ? ' (' + line.variant.name + ')' : '') +
            ' — ' + formatPrice(line.subtotal)
        );
        if (line.notes) {
            lines.push('   Obs: ' + line.notes);
        }
    });

    lines.push('');
    lines.push('*Subtotal:* ' + formatPrice(order.totals.subtotal));
    lines.push('*Delivery:* ' + (order.deliveryCost ? formatPrice(order.deliveryCost) : 'Retiro en el local'));
    lines.push('*TOTAL:* ' + formatPrice(order.total));
    lines.push('');
    lines.push('*Cliente:* ' + order.checkout.name);
    lines.push('*Teléfono:* ' + order.checkout.phone);
    lines.push('*Entrega:* ' + (order.checkout.deliveryMethod === 'delivery' ? 'Delivery' : 'Retiro en el local'));

    if (order.checkout.deliveryMethod === 'delivery' && order.checkout.address) {
        lines.push('*Dirección:* ' + order.checkout.address);
    }

    if (order.checkout.notes) {
        lines.push('*Observaciones:* ' + order.checkout.notes);
    }

    return lines.join('\n');
}

/* Pantalla de pedido enviado (Pantalla 09 del diseño). */
function renderOrderSentState() {
    return '<div class="cart-overlay"><div class="cart-sheet" role="dialog" aria-modal="true" aria-label="Pedido enviado">' +
        '<div class="cart-sheet__items">' +
            '<div class="sent-state">' +
                '<span class="sent-state__icon" aria-hidden="true">✓</span>' +
                '<p class="sent-state__title">Pedido enviado</p>' +
                '<p class="sent-state__text">El negocio recibirá tu pedido por WhatsApp.</p>' +
                '<div class="sent-state__actions">' +
                    '<button class="cart-sheet__continue" data-action="close-cart" type="button">Volver al catálogo</button>' +
                    '<button class="sent-state__reopen" data-action="reopen-whatsapp" type="button">Abrir WhatsApp nuevamente</button>' +
                '</div>' +
            '</div>' +
        '</div>' +
    '</div></div>';
}
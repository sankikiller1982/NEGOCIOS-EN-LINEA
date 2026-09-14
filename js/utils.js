/* ==========================================================================
   PLATAFORMA DE CATÁLOGO - utils.js
   Funciones utilitarias reutilizables.
   Fase 1: Funciones básicas.
   ========================================================================== */

/* Escapa caracteres HTML para prevenir XSS.
   Uso: escapeHTML('<script>alert("xss")</script>') */
function escapeHTML(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const str = String(value);
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };

    return str.replace(/[&<>"']/g, function (char) {
        return map[char];
    });
}

/* Formatea un número como precio.
   Uso: formatPrice(21500) → "$21.500" */
function formatPrice(value) {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const number = Number(value);

    if (isNaN(number)) {
        return '';
    }

    return '$' + number.toLocaleString('es-AR');
}

/* Obtiene un elemento del DOM de forma segura.
   Uso: getElement('#app') */
function getElement(selector) {
    return document.querySelector(selector);
}

/* --------------------------------------------------------------------------
   FASE 12.6: HELPERS DE COLOR (compartidos entre catálogo y panel admin)
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
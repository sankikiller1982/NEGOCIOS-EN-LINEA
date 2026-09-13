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
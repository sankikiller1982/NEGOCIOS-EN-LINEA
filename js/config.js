/* ==========================================================================
   PLATAFORMA DE CATÁLOGO - config.js
   Configuración general de la aplicación.
   Fase 12.1: backend Apps Script v2 (lecturas por script + token de pedidos).
   ========================================================================== */

const APP_CONFIG = {

    /* Información del negocio.
       Se lee desde la hoja "config" de Sheets al cargar.
       Queda como respaldo por si la hoja no responde. */
    business: {
        name: '',
        description: '',
        logo: '',
        whatsapp: '',
        instagram: '',
        address: '',
        openingHours: ''
    },

    /* Tema visual. Se aplica desde la hoja en Fase 8. */
    theme: {
        primaryColor: '',
        secondaryColor: '',
        backgroundColor: ''
    },

    /* Fuente de datos.
       ------------------------------------------------------------------
       sheetId:       ID de tu hoja (entre /d/ y /edit de la URL).
       appsScriptUrl: URL /exec de tu Apps Script (backend v2).
       orderToken:    EXACTAMENTE el mismo valor que pusiste en
                      BACKEND_CONFIG.ORDER_TOKEN dentro del Apps Script.
       ------------------------------------------------------------------ */
    dataSource: {
        type: 'google-sheets',
        sheetId: '1O8rwIwIiblmgr2CAQVU9MLj6uewVXOQAd9CqU4jIzUM',
        appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyrDmyTlLZQlDxjZypQ8IY9OutQD_xPd-pMPKIkXcwLShsYRuUNOS5wYrJD8K5Ca_jw/exec',
        orderToken: 'pedidos_x7Q2mL9pR4wZ31Ks'
    },

    /* Funcionalidades habilitadas. */
    features: {
        delivery: false,
        variants: true,
        whatsappOrders: true
    }
};
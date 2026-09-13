/* ==========================================================================
   PLATAFORMA DE CATÁLOGO - config.js
   Configuración general de la aplicación.
   Fase 2: sheetId listo para recibir el ID real de Google Sheets.
   ========================================================================== */

const APP_CONFIG = {

    /* Información del negocio.
       En Fase 2 estos valores se leen desde la hoja "config" de Sheets.
       Quedan como respaldo por si la hoja no responde. */
    business: {
        name: '',
        description: '',
        logo: '',
        whatsapp: '',
        instagram: '',
        address: '',
        openingHours: ''
    },

    /* Tema visual.
       Se aplicará al CSS en Fase 8. Todavía no se usa. */
    theme: {
        primaryColor: '',
        secondaryColor: '',
        backgroundColor: ''
    },

    /* Fuente de datos.
       ------------------------------------------------------------------
       CÓMO CONFIGURAR EL SHEET ID:
       1. Abrí tu hoja de Google Sheets.
       2. Copiá el ID desde la URL:
          https://docs.google.com/spreadsheets/d/XXXXXXXXXXXX/edit
          El ID es la parte XXXXXXXXXXXX (entre /d/ y /edit).
       3. Pegalo entre las comillas de sheetId, abajo.
       4. Verificá que la hoja esté compartida como:
          "Cualquier persona con el enlace" -> "Lector"
       ------------------------------------------------------------------ */
    dataSource: {
        type: 'google-sheets',
        sheetId: '1O8rwIwIiblmgr2CAQVU9MLj6uewVXOQAd9CqU4jIzUM',          // <-- PEGÁ ACÁ TU SHEET ID
        appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyrDmyTlLZQlDxjZypQ8IY9OutQD_xPd-pMPKIkXcwLShsYRuUNOS5wYrJD8K5Ca_jw/exec'     // Alternativa solo si gviz falla por CORS
    },

    /* Funcionalidades habilitadas. */
    features: {
        delivery: false,
        variants: true,
        whatsappOrders: true
    }
};
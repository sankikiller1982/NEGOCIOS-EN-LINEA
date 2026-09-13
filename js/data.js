/* ==========================================================================
   PLATAFORMA DE CATÁLOGO - data.js
   Capa de datos.
   Fase 2: conexión real a Google Sheets vía endpoint público gviz.
   Sin backend. Sin dependencias. Sin Apps Script (por ahora).
   ========================================================================== */

/* --------------------------------------------------------------------------
   HELPERS INTERNOS: NORMALIZACIÓN DE VALORES
   -------------------------------------------------------------------------- */

/* Convierte un valor de Sheets a booleano.
   Acepta: true, "true", "TRUE", 1, "1" → true
   Acepta: false, "false", 0, "0", vacío → false */
function toBoolean(value) {
    if (value === true) return true;
    if (value === false) return false;
    if (value === null || value === undefined) return false;

    const str = String(value).trim().toLowerCase();
    if (str === 'true' || str === '1') return true;
    if (str === 'false' || str === '0' || str === '') return false;

    return false;
}

/* Convierte un valor de Sheets a número. Devuelve null si es inválido. */
function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;

    const clean = String(value).trim().replace(/[$\s]/g, '');
    const number = Number(clean);

    return isNaN(number) ? null : number;
}

/* Convierte un valor de Sheets a texto limpio. */
function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

/* Genera un slug: "6 porciones" → "6-porciones" */
function slugify(value) {
    return toText(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/* --------------------------------------------------------------------------
   HELPERS INTERNOS: FETCH Y PARSEO DE GOOGLE SHEETS
   -------------------------------------------------------------------------- */

/* Construye la URL pública del endpoint gviz para una hoja.
   headers=1 fuerza a Google a tratar SOLO la fila 1 como encabezado.
   Sin esto, Google puede "comerse" filas de datos como encabezados
   (pasó en la hoja config: detectó 7 encabezados y rompió el mapeo). */
function buildSheetUrl(sheetName) {
    const sheetId = APP_CONFIG.dataSource.sheetId;

    return 'https://docs.google.com/spreadsheets/d/' + sheetId +
           '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheetName) +
           '&headers=1';
}

/* Parseo RESILIENTE de la respuesta gviz.
   Funciona si el JSON viene crudo o envuelto en el wrapper:
   google.visualization.Query.setResponse({...}); */
function parseGvizResponse(text) {
    let jsonText = text;
    const trimmed = text.trim();

    if (trimmed.charAt(0) !== '{') {
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');

        if (first === -1 || last === -1 || last <= first) {
            throw new Error('Formato de respuesta no reconocido');
        }

        jsonText = text.slice(first, last + 1);
    }

    const data = JSON.parse(jsonText);
    const table = data.table;

    if (!table || !table.cols || !table.rows) {
        throw new Error('La respuesta no contiene una tabla válida');
    }

    const headers = table.cols.map(function (col) {
        return col.label || col.id || '';
    });

    return table.rows.map(function (row) {
        const obj = {};

        headers.forEach(function (header, i) {
            const cell = (row.c && row.c[i]) ? row.c[i] : null;
            obj[header] = (cell && cell.v !== undefined && cell.v !== null)
                ? cell.v
                : '';
        });

        return obj;
    });
}

/* Fetch de una hoja por nombre. Devuelve array de objetos planos. */
async function fetchSheet(sheetName) {
    const sheetId = APP_CONFIG.dataSource.sheetId;

    if (!sheetId) {
        throw new Error('SHEET_ID sin configurar en js/config.js');
    }

    const url = buildSheetUrl(sheetName);
    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new Error(
                'La hoja "' + sheetName + '" no es pública (401/403). ' +
                'Compartila como "Cualquier persona con el enlace -> Lector".'
            );
        }
        throw new Error('Error HTTP ' + response.status + ' en hoja "' + sheetName + '"');
    }

    const text = await response.text();

    try {
        return parseGvizResponse(text);
    } catch (error) {
        console.error('[Data] Falla de parseo en hoja "' + sheetName + '":', error.message);
        console.error('[Data] Texto crudo (primeros 200 caracteres):', text.substring(0, 200));
        throw error;
    }
}

/* --------------------------------------------------------------------------
   FUNCIONES PÚBLICAS: DATOS NORMALIZADOS
   -------------------------------------------------------------------------- */

/* Lee la hoja "config" y devuelve un objeto plano { key: value }. */
async function getBusinessData() {
    try {
        const rows = await fetchSheet('config');
        const business = {};

        rows.forEach(function (row) {
            const key = toText(row.key);
            if (key) {
                business[key] = (row.value !== undefined && row.value !== null)
                    ? row.value
                    : '';
            }
        });

         /* Normalizaciones específicas */
        business.delivery_enabled = toBoolean(business.delivery_enabled);
        business.delivery_cost = toNumber(business.delivery_cost);

        console.log('[Data] config: OK (' + Object.keys(business).length + ' claves)');
        console.log('[Data] Objeto config recibido:', business);
        return business;
    } catch (error) {
        console.error('[Data] config: ERROR -', error.message);
        return null;
    }
}

/* Lee la hoja "categories": solo activas, ordenadas por order. */
async function getCategories() {
    try {
        const rows = await fetchSheet('categories');

        const categories = rows
            .map(function (row) {
                const order = toNumber(row.order);
                return {
                    id: toText(row.id),
                    name: toText(row.name),
                    description: toText(row.description),
                    image: toText(row.image),
                    order: (order !== null) ? order : 0,
                    active: toBoolean(row.active)
                };
            })
            .filter(function (cat) {
                return cat.active === true && cat.id !== '';
            })
            .sort(function (a, b) {
                return a.order - b.order;
            });

        console.log('[Data] categories: OK (' + categories.length + ' activas)');
        return categories;
    } catch (error) {
        console.error('[Data] categories: ERROR -', error.message);
        return [];
    }
}

/* Lee la hoja "products": solo activos, con variantes parseadas. */
async function getProducts() {
    try {
        const rows = await fetchSheet('products');

        const products = rows
            .map(function (row) {
                const order = toNumber(row.order);

                const product = {
                    id: toText(row.id),
                    categoryId: toText(row.category_id),
                    name: toText(row.name),
                    description: toText(row.description),
                    image: toText(row.image),
                    basePrice: toNumber(row.base_price),
                    active: toBoolean(row.active),
                    featured: toBoolean(row.featured),
                    isNew: toBoolean(row.is_new),
                    order: (order !== null) ? order : 0,
                    variantName: toText(row.variant_name),
                    variants: []
                };

                /* Parseo de variantes: "opcion1:precio1,opcion2:precio2" */
                const rawVariants = toText(row.variant_options);

                if (rawVariants !== '') {
                    product.variants = rawVariants
                        .split(',')
                        .map(function (option) {
                            const parts = option.split(':');
                            const name = toText(parts[0]);
                            const price = toNumber(parts[1]);

                            return {
                                id: slugify(name),
                                name: name,
                                price: price
                            };
                        })
                        .filter(function (v) {
                            return v.name !== '';
                        });
                }

                return product;
            })
            .filter(function (prod) {
                return prod.active === true && prod.id !== '';
            })
            .sort(function (a, b) {
                return a.order - b.order;
            });

        console.log('[Data] products: OK (' + products.length + ' activos)');
        return products;
    } catch (error) {
        console.error('[Data] products: ERROR -', error.message);
        return [];
    }
}

/* Carga las 3 hojas en paralelo y devuelve el objeto consolidado. */
async function getAllData() {
    const results = await Promise.all([
        getBusinessData(),
        getCategories(),
        getProducts()
    ]);

    return {
        business: results[0],
        categories: results[1],
        products: results[2]
    };
}

/* --------------------------------------------------------------------------
   FASE 10.5: ESCRITURA DE PEDIDOS EN LA HOJA orders
   -------------------------------------------------------------------------- */

/* Envía el pedido a Apps Script (doPost) para registrarlo en la hoja orders.
   Es "fire and forget": NUNCA bloquea ni rompe el envío por WhatsApp.
   Con mode 'no-cors' el navegador no puede leer la respuesta,
   pero la petición llega y el script la procesa. */
async function saveOrderToSheet(order) {
    const url = APP_CONFIG.dataSource.appsScriptUrl;

    if (!url) {
        console.warn('[Orders] appsScriptUrl sin configurar en js/config.js: el pedido no se guardará en la hoja orders.');
        return false;
    }

    try {
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(order)
        });
        console.log('[Orders] Pedido registrado en la hoja orders:', order.id);
        return true;
    } catch (error) {
        console.error('[Orders] No se pudo guardar el pedido en la hoja:', error);
        return false;
    }
}
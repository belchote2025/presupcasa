// app.js - Versión Blindada (Sustituye a script.js)

// --- Versión del script (actualiza al subir; en producción debe verse v18+, endpoint api.php) ---
const APP_JS_VERSION = '18';
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('PRESUP – app.js versión:', APP_JS_VERSION);
}

// Reducir aviso Canvas2D por getImageData (html2canvas): optimización para lecturas frecuentes
(function () {
    var orig = HTMLCanvasElement.prototype.getContext;
    if (typeof orig !== 'function') return;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        if (type === '2d') {
            attrs = attrs && typeof attrs === 'object' ? Object.assign({}, attrs) : {};
            if (attrs.willReadFrequently === undefined) attrs.willReadFrequently = true;
        }
        return orig.call(this, type, attrs);
    };
})();

// Pequeño indicador visual de la versión cargada (solo para debug)
document.addEventListener('DOMContentLoaded', () => {
    try {
        const el = document.createElement('div');
        Object.assign(el.style, { position: 'fixed', bottom: '4px', right: '8px', fontSize: '10px', color: 'var(--text-muted)', opacity: '0.5', zIndex: '9999', pointerEvents: 'none' });
        el.textContent = `app.js v${APP_JS_VERSION}`;
        document.body.appendChild(el);
    } catch (e) {}
});

// Manejo global de errores para evitar que errores externos (extensiones, etc.) afecten la app
window.addEventListener('error', (event) => {
    // Ignorar errores de extensiones del navegador o scripts externos
    if (event.filename && (
        event.filename.includes('spoofer') || 
        event.filename.includes('extension') ||
        event.filename.includes('chrome-extension') ||
        event.filename.includes('moz-extension')
    )) {
        event.preventDefault();
        return false;
    }
    // Para otros errores, solo loguear sin interrumpir
    console.warn('Error capturado:', event.error);
    return true;
});

// Manejo de promesas rechazadas sin catch
window.addEventListener('unhandledrejection', (event) => {
    console.warn('Promesa rechazada:', event.reason);
    // No prevenir el comportamiento por defecto para errores reales
});

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let currentUser = null;
    let items = [];
    let companyData = { name: 'Navegatel', address: '', cif: '', email: '', defaultTax: 21 };
    let currentQuoteId = null;
    let currentQuoteSignature = null; // Firma del cliente (data URL) para vista previa y PDF
    let currentDocumentDate = null;   // Fecha del documento (presupuesto/factura) para export Verifactu
    // Tema de documento (solo frontend, guardado en este navegador)
    let docTheme = 'none';
    let docBgImage = null;
    
    // Caché para optimizar carga
    const dataCache = {
        invoices: { data: null, timestamp: 0, ttl: 30000 },
        history: { data: null, timestamp: 0, ttl: 30000 },
        customers: { data: null, timestamp: 0, ttl: 60000 },
        catalog: { data: null, timestamp: 0, ttl: 120000 },
        expenses: { data: null, timestamp: 0, ttl: 30000 },
        appointments: { data: null, timestamp: 0, ttl: 30000 },
        settings: { data: null, timestamp: 0, ttl: 300000 } // 5 minutos
    };
    
    function getCachedData(key) {
        const cache = dataCache[key];
        if (!cache || !cache.data || (Date.now() - cache.timestamp) >= cache.ttl) return null;
        if (Array.isArray(cache.data)) return cache.data;
        if (cache.data.status) { invalidateCache(key); return null; }
        return cache.data;
    }
    
    function setCachedData(key, data) {
        if (dataCache[key]) {
            dataCache[key].data = data;
            dataCache[key].timestamp = Date.now();
        }
    }
    
    function invalidateCache(key) {
        if (dataCache[key]) {
            dataCache[key].data = null;
            dataCache[key].timestamp = 0;
        }
    }

    // Caché para alertas (evita 504 en producción por exceso de peticiones)
    let _dashboardAlertsCache = { data: null, ts: 0 };
    const DASHBOARD_ALERTS_CACHE_MS = 180 * 1000; // 3 minutos
    let _appointmentsTodayCache = { data: null, ts: 0 };
    const APPOINTMENTS_TODAY_CACHE_MS = 90 * 1000; // 90 segundos
    async function getDashboardAlerts() {
        const now = Date.now();
        if (_dashboardAlertsCache.data !== null && (now - _dashboardAlertsCache.ts) < DASHBOARD_ALERTS_CACHE_MS) {
            return _dashboardAlertsCache.data;
        }
        try {
            const data = await apiFetch('get_dashboard_alerts', { timeout: 25000 });
            _dashboardAlertsCache = { data, ts: Date.now() };
            return data;
        } catch (e) {
            if (_dashboardAlertsCache.data !== null) return _dashboardAlertsCache.data;
            throw e;
        }
    }
    async function getAppointmentsToday() {
        const now = Date.now();
        if (_appointmentsTodayCache.data !== null && (now - _appointmentsTodayCache.ts) < APPOINTMENTS_TODAY_CACHE_MS) {
            return _appointmentsTodayCache.data;
        }
        try {
            const data = await apiFetch('get_appointments_today');
            const list = (data && data.appointments_today) ? data.appointments_today : [];
            _appointmentsTodayCache = { data: { appointments_today: list }, ts: Date.now() };
            return _appointmentsTodayCache.data;
        } catch (e) {
            if (_appointmentsTodayCache.data !== null) return _appointmentsTodayCache.data;
            return { appointments_today: [] };
        }
    }

    // Ruta base del backend: mismo directorio que index.html (raíz o subcarpeta como /presup/).
    const getApiBase = () => {
        const path = (typeof window !== 'undefined' && window.location.pathname) || '';
        const dir = path.replace(/\/[^/]*$/, '') || '/'; // sin el último segmento (ej. index.html)
        const base = (dir === '/' || dir === '') ? '/' : (dir.endsWith('/') ? dir : dir + '/');
        if (typeof window !== 'undefined' && window.location.origin) {
            return window.location.origin + base;
        }
        return base;
    };
    // Endpoint de la API: api.php directo (sin reescrituras).
    // Endpoint: api.php (evita 508/405 en Hostinger).
    const getApiEndpoint = () => {
        return getApiBase() + 'api.php';
    };

    // --- DOM ---
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    const loginUser = document.getElementById('login-user');
    const loginPass = document.getElementById('login-pass');
    const btnLogin = document.getElementById('btn-login');
    const linkTimeClock = document.getElementById('link-time-clock');
    const timeClockPanel = document.getElementById('time-clock-panel');
    const timeClockUserInput = document.getElementById('time-clock-user');
    const timeClockPassInput = document.getElementById('time-clock-pass');
    const timeClockMsg = document.getElementById('time-clock-msg');
    const btnTimeClockStart = document.getElementById('btn-time-clock-start');
    const loginError = document.getElementById('login-error');
    const btnLogout = document.getElementById('btn-logout');
    const itemsContainer = document.getElementById('items-container');
    const previewItemsBody = document.getElementById('preview-items-body');
    const addItemBtn = document.getElementById('add-item');
    const clientNameInput = document.getElementById('client-name');
    const clientIdInput = document.getElementById('client-id');
    const clientAddressInput = document.getElementById('client-address');
    const clientEmailInput = document.getElementById('client-email');
    const clientPhoneInput = document.getElementById('client-phone');
    const quoteNotesInput = document.getElementById('quote-notes');
    const recurringInvoiceCard = document.getElementById('recurring-invoice-card');
    const recurringInvoiceEnabledInput = document.getElementById('recurring-invoice-enabled');
    const recurringInvoiceFrequencyInput = document.getElementById('recurring-invoice-frequency');
    const recurringInvoiceNextDateInput = document.getElementById('recurring-invoice-next-date');
    const recurringInvoiceStartDateInput = document.getElementById('recurring-invoice-start-date');
    const recurringInvoiceEndDateInput = document.getElementById('recurring-invoice-end-date');
    const rebuInvoiceCard = document.getElementById('rebu-invoice-card');
    const rebuInvoiceEnabledInput = document.getElementById('rebu-invoice-enabled');

    // Indica si el documento cargado en el editor debe tratarse como FACTURA
    let currentDocumentIsInvoice = false;
    const downloadBtn = document.getElementById('btn-download');
    const saveBtn = document.getElementById('btn-save');
    const duplicateBtn = document.getElementById('btn-duplicate');
    const exportEinvoiceBtn = document.getElementById('btn-export-einvoice');
    const exportEinvoiceXmlBtn = document.getElementById('btn-export-einvoice-xml');
    const themeToggle = document.getElementById('theme-toggle');
    const userAvatar = document.getElementById('user-avatar');
    const historyList = document.getElementById('history-list');
    const invoicesList = document.getElementById('invoices-list');
    const catalogList = document.getElementById('catalog-list');

    // Navegación
    const navDashboard = document.getElementById('nav-dashboard');
    const navEditor = document.getElementById('nav-editor');
    const navHistory = document.getElementById('nav-history');
    const navInvoices = document.getElementById('nav-invoices');
    const navProjects = document.getElementById('nav-projects');
    const navActivities = document.getElementById('nav-activities');
    const navContracts = document.getElementById('nav-contracts');
    const navAppointments = document.getElementById('nav-appointments');
    const navMeetings = document.getElementById('nav-meetings');
    const navCalendar = document.getElementById('nav-calendar');
    const navCustomers = document.getElementById('nav-customers');
    const navCatalog = document.getElementById('nav-catalog');
    const navExpenses = document.getElementById('nav-expenses');
    const navRemittances = document.getElementById('nav-remittances');
    const navTpv = document.getElementById('nav-tpv');
    const navTickets = document.getElementById('nav-tickets');
    const navReceipts = document.getElementById('nav-receipts');
    const navSettings = document.getElementById('nav-settings');
    const navAdmin = document.getElementById('nav-admin');
    const sections = document.querySelectorAll('.view-section');
    const navButtons = document.querySelectorAll('.nav-item');
    const sidebar = document.querySelector('.sidebar');
    const globalSearch = document.getElementById('global-search');
    const docThemeSelect = document.getElementById('doc-theme-select');
    const settingsDefaultTemplateSelect = document.getElementById('settings-default-template');
    const settingsTemplateScopeSelect = document.getElementById('settings-template-scope');
    const settingsTabs = document.querySelectorAll('.settings-tab');
    const settingsTabPanels = document.querySelectorAll('.settings-tab-panel');
    const docBgFileInput = document.getElementById('doc-bg-file');
    const quickNewQuoteBtn = document.getElementById('btn-quick-new-quote');
    const quickNewInvoiceBtn = document.getElementById('btn-quick-new-invoice');
    const quickNewInvoiceCreateBtn = document.getElementById('btn-quick-new-invoice-create');
    const quickNewExpenseBtn = document.getElementById('btn-quick-new-expense');
    const quickNewApptBtn = document.getElementById('btn-quick-new-appt');
    const previewToggleBtn = document.getElementById('btn-toggle-preview');
    const editorLayout = document.querySelector('.editor-layout');
    const historyStatusFilter = document.getElementById('history-status-filter');
    const invoicesStatusFilter = document.getElementById('invoices-status-filter');
    const processRecurringInvoicesBtn = document.getElementById('btn-process-recurring-invoices');
    const copySummaryBtn = document.getElementById('btn-copy-summary');
    const quotePreviewContainer = document.getElementById('quote-preview-container');
    const expenseTicketFileInput = document.getElementById('expense-ticket-file');
    const expenseTicketUploadBtn = document.getElementById('btn-expense-upload-ticket');
    const dashboardScanExpenseBtn = document.getElementById('btn-dashboard-scan-expense');
    const dashboardExpenseCameraInput = document.getElementById('dashboard-expense-camera');
    const expenseCustomerSelect = document.getElementById('expense-customer-id');
    const expenseProjectSelect = document.getElementById('expense-project-id');
    const dashboardTimeclockBtn = document.getElementById('btn-dashboard-timeclock');

    let editOnDocumentMode = false;

    const historyViewListBtn = document.getElementById('history-view-list');
    const historyViewBoardBtn = document.getElementById('history-view-board');
    const invoicesViewListBtn = document.getElementById('invoices-view-list');
    const invoicesViewBoardBtn = document.getElementById('invoices-view-board');
    let historyViewMode = (typeof localStorage !== 'undefined' && localStorage.getItem('historyViewMode') === 'board') ? 'board' : 'list';

    if (historyViewListBtn && historyViewBoardBtn) {
        const applyHistoryViewClasses = () => {
            const makePrimary = (btn) => {
                if (!btn) return;
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            };
            const makeSecondary = (btn) => {
                if (!btn) return;
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            };
            if (historyViewMode === 'board') {
                makeSecondary(historyViewListBtn);
                makePrimary(historyViewBoardBtn);
            } else {
                makePrimary(historyViewListBtn);
                makeSecondary(historyViewBoardBtn);
            }
        };
        applyHistoryViewClasses();

        historyViewListBtn.addEventListener('click', () => {
            historyViewMode = 'list';
            try { localStorage.setItem('historyViewMode', 'list'); } catch (e) {}
            applyHistoryViewClasses();
            if (typeof loadHistoryPage === 'function') loadHistoryPage(historyCurrentPage || 0);
        });
        historyViewBoardBtn.addEventListener('click', () => {
            historyViewMode = 'board';
            try { localStorage.setItem('historyViewMode', 'board'); } catch (e) {}
            applyHistoryViewClasses();
            if (typeof loadHistoryPage === 'function') loadHistoryPage(historyCurrentPage || 0);
        });
    }

    let invoicesViewMode = (typeof localStorage !== 'undefined' && localStorage.getItem('invoicesViewMode') === 'board') ? 'board' : 'list';
    if (invoicesViewListBtn && invoicesViewBoardBtn) {
        const applyInvoicesViewClasses = () => {
            const makePrimary = (btn) => {
                if (!btn) return;
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            };
            const makeSecondary = (btn) => {
                if (!btn) return;
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            };
            if (invoicesViewMode === 'board') {
                makeSecondary(invoicesViewListBtn);
                makePrimary(invoicesViewBoardBtn);
            } else {
                makePrimary(invoicesViewListBtn);
                makeSecondary(invoicesViewBoardBtn);
            }
        };
        applyInvoicesViewClasses();

        invoicesViewListBtn.addEventListener('click', () => {
            invoicesViewMode = 'list';
            try { localStorage.setItem('invoicesViewMode', 'list'); } catch (e) {}
            applyInvoicesViewClasses();
            loadInvoicesPage(invoicesCurrentPage || 0);
        });
        invoicesViewBoardBtn.addEventListener('click', () => {
            invoicesViewMode = 'board';
            try { localStorage.setItem('invoicesViewMode', 'board'); } catch (e) {}
            applyInvoicesViewClasses();
            loadInvoicesPage(invoicesCurrentPage || 0);
        });
    }

    // Actualizar vista previa en vivo cuando cambian los datos principales
    const livePreviewInputs = [
        clientNameInput,
        clientIdInput,
        clientAddressInput,
        clientEmailInput,
        clientPhoneInput,
        quoteNotesInput
    ];

    livePreviewInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                updatePreview();
            });
        }
    });

    // Al marcar/desmarcar REBU en una factura, actualizar la vista previa al momento
    if (rebuInvoiceEnabledInput) {
        rebuInvoiceEnabledInput.addEventListener('change', () => {
            updatePreview();
        });
    }

    // --- UTILS ---
    async function apiFetch(action, options = {}) {
        // Permitir pasar parámetros extra en action, ej: "get_quote?id=XXX"
        let baseAction = action;
        let extraQuery = '';
        const qIndex = action.indexOf('?');
        if (qIndex !== -1) {
            baseAction = action.slice(0, qIndex);
            extraQuery = action.slice(qIndex + 1); // sin el "?"
        }

        const url = `${getApiEndpoint()}?action=${encodeURIComponent(baseAction)}${extraQuery ? `&${extraQuery}` : ''}&t=${Date.now()}`;
        
        const controller = new AbortController();
        const timeoutMs = options.timeout ?? 15000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const { timeout: _t, ...fetchOpts } = options;
        try {
            const res = await fetch(url, { ...fetchOpts, credentials: 'same-origin', signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                // No reintentar automáticamente - dejar que el usuario decida
                if (res.status === 508) {
                    const pathNorm = (typeof window !== 'undefined' ? (window.location.pathname || '/').replace(/\/index\.html$/i, '') : '') || '/';
                    const enRaiz = pathNorm === '/' || pathNorm === '';
                    const msg = enRaiz ? 'Error 508. Limpia caché (Ctrl+F5) y recarga. Si sigue, contacta al hosting.' : 'Error 508. Revisa el .htaccess en la raíz del sitio.';
                    showToast(msg, 'error');
                    throw new Error('508 Loop. ' + msg);
                }
                if (res.status === 504) {
                    showToast('El servidor ha tardado demasiado (504). Intenta de nuevo en un momento.', 'error');
                }
                // Log para debug
                console.error(`Error HTTP ${res.status} para:`, baseAction, extraQuery ? `con query: ${extraQuery}` : '');
                throw new Error(`Error HTTP: ${res.status}`);
            }
            
            // Verificamos si es JSON antes de parsear
            const text = await res.text();
            if (!text || text.trim() === '') {
                console.error("Respuesta vacía del servidor para:", baseAction, "URL:", url);
                throw new Error("El servidor devolvió una respuesta vacía. Comprueba la URL y que el recurso exista.");
            }
            // Si el servidor devolvió HTML (p. ej. página de error o index), no es JSON
            const looksLikeHtml = /^\s*</.test(text) || text.includes('<!DOCTYPE') || text.includes('<html');
            if (looksLikeHtml) {
                console.error('Respuesta HTML en lugar de JSON:', url, text.substring(0, 100));
                showToast('El servidor devolvió una página en lugar de datos. Comprueba que api.php esté en la misma carpeta que index.html.', 'error');
                throw new Error('El servidor devolvió HTML en lugar de JSON. Revisa que api.php exista en la raíz del sitio.');
            }
            try {
                const parsed = JSON.parse(text);
                if (parsed && parsed.error) {
                    throw new Error(parsed.error);
                }
                return parsed;
            } catch (e) {
                if (e instanceof Error && e.message && e.message.indexOf('El servidor devolvió') !== -1) throw e;
                if (res.status === 508) {
                    showToast('Error 508. Limpia caché (Ctrl+F5) y recarga.', 'error');
                    throw new Error('508 Loop. Limpia caché y recarga o contacta al hosting.');
                }
                console.error("Respuesta no válida del servidor:", text.substring(0, 200), "URL:", url);
                throw new Error("El servidor devolvió un error inesperado: " + (e.message || 'Formato inválido'));
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                showToast('La petición tardó demasiado. Intenta de nuevo.', 'error');
                throw new Error('Timeout: La petición tardó demasiado');
            }
            console.error('Fetch error:', e, "URL intentada:", url);
            throw e;
        }
    }

    const currencyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
    const formatCurrency = (v) => currencyFormatter.format(v);
    const escapeHtml = (s) => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const toastContainer = document.getElementById('toast-container');
    const showToast = (msg, type = 'info') => {
        if (!toastContainer) return;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        toastContainer.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    };

    // --- Vista cliente "Mis documentos" (pública, por token) ---
    async function showClientDocumentsView(token) {
        const viewEl = document.getElementById('client-documents-view');
        const appEl = document.getElementById('app-container');
        const loginEl = document.querySelector('.login-screen');
        if (viewEl) viewEl.classList.remove('hidden');
        if (appEl) appEl.classList.add('hidden');
        if (loginEl) loginEl.classList.add('hidden');
        document.getElementById('client-documents-error').classList.add('hidden');
        document.getElementById('client-documents-name').textContent = '';
        document.getElementById('client-documents-list').innerHTML = '<p style="color:var(--text-muted);">Cargando...</p>';
        try {
            const url = getApiEndpoint() + '?action=get_client_documents&token=' + encodeURIComponent(token) + '&t=' + Date.now();
            const r = await fetch(url, { credentials: 'same-origin' });
            const data = await r.json();
            if (data.error) {
                document.getElementById('client-documents-error').textContent = data.error;
                document.getElementById('client-documents-error').classList.remove('hidden');
                document.getElementById('client-documents-list').innerHTML = '';
                return;
            }
            document.getElementById('client-documents-name').textContent = (data.name || 'Cliente') + ' — Tus presupuestos y facturas';
            const all = [...(data.quotes || []).map(q => ({ ...q, type: 'quote' })), ...(data.invoices || []).map(i => ({ ...i, type: 'invoice' }))];
            all.sort((a, b) => (new Date(b.date || 0)) - (new Date(a.date || 0)));
            if (all.length === 0) {
                document.getElementById('client-documents-list').innerHTML = '<p style="color:var(--text-muted);padding:0.5rem;">No hay documentos.</p>';
            } else {
                const statusLabel = (doc, isQuote) => {
                    const s = (doc.status || '').toLowerCase();
                    if (isQuote) return s === 'accepted' ? 'Aceptado' : s === 'sent' ? 'Enviado' : s === 'waiting_client' ? 'En espera de cliente' : s === 'rejected' ? 'Rechazado' : 'Borrador';
                    return s === 'paid' ? 'Pagada' : s === 'pending' ? 'Pendiente' : 'Anulada';
                };
                document.getElementById('client-documents-list').innerHTML = all.map(doc => {
                    const isQuote = doc.type === 'quote';
                    const label = isQuote ? 'Presupuesto' : 'Factura';
                    const dateStr = doc.date ? new Date(doc.date).toLocaleDateString('es-ES') : '';
                    const statusStr = statusLabel(doc, isQuote);
                    const totalStr = formatCurrency(doc.total_amount || 0);
                    return `<div class="history-item" style="padding:0.75rem;"><strong>${label} ${(doc.id||'').replace(/</g,'&lt;')}</strong> · ${totalStr} · ${statusStr}${dateStr ? ' · ' + dateStr : ''}</div>`;
                }).join('');
            }
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            document.getElementById('client-documents-error').textContent = 'No se pudieron cargar los documentos.';
            document.getElementById('client-documents-error').classList.remove('hidden');
            document.getElementById('client-documents-list').innerHTML = '';
        }
    }

    // --- BOOT ---
    async function boot() {
        const isLight = localStorage.getItem('theme') === 'light';
        if (isLight) document.body.classList.add('light-theme');
        const loginThemeIcon = document.getElementById('login-theme-icon');
        if (loginThemeIcon) {
            loginThemeIcon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
            if (typeof lucide !== 'undefined') requestAnimationFrame(() => lucide.createIcons());
        }
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('view') === 'client' && urlParams.get('token')) {
            showClientDocumentsView(urlParams.get('token'));
            if (typeof lucide !== 'undefined') requestAnimationFrame(() => lucide.createIcons());
            return;
        }
        if (window.location.protocol === 'file:') {
            showLogin();
            const warn = document.createElement('p');
            warn.style.cssText = 'text-align:center;color:var(--danger);background:rgba(239,68,68,0.1);padding:1rem;margin:1rem;border-radius:8px;font-size:0.9rem;';
            warn.textContent = 'Estás abriendo la app desde el disco (file://). Para que el login funcione, ábrela desde el navegador con: ';
            const link = document.createElement('a');
            link.href = 'http://localhost/presup/';
            link.textContent = 'http://localhost/presup/';
            link.style.color = 'var(--primary)';
            warn.appendChild(link);
            document.querySelector('.login-card')?.insertBefore(warn, document.querySelector('.input-group'));
            return;
        }
        try {
            const data = await apiFetch('get_boot_data');
            if (data && data.session) {
                if (data.settings) {
                    companyData = {
                        name: data.settings.name || 'Navegatel',
                        cif: data.settings.cif || '',
                        email: data.settings.email || '',
                        address: data.settings.address || '',
                        defaultTax: parseFloat(data.settings.default_tax) || 21
                    };
                    setCachedData('settings', data.settings);
                    updateCompanyDisplay();
                }
                if (data.companies && Array.isArray(data.companies) && data.companies.length > 1) {
                    const wrap = document.getElementById('company-switcher-wrap');
                    const sel = document.getElementById('company-switcher');
                    if (wrap && sel) {
                        wrap.classList.remove('hidden');
                        sel.innerHTML = data.companies.map(c => `<option value="${c.id}" ${c.id == (data.current_company_id || 1) ? 'selected' : ''}>${escapeHtml(c.name || 'Empresa ' + c.id)}</option>`).join('');
                        if (!sel.dataset.listenerAttached) {
                            sel.dataset.listenerAttached = '1';
                            sel.addEventListener('change', async () => {
                                const cid = sel.value;
                                if (!cid) return;
                                try {
                                    const fd = new FormData();
                                    fd.append('company_id', cid);
                                    await apiFetch('set_current_company', { method: 'POST', body: fd });
                                    invalidateCache('settings');
                                    invalidateCache('customers');
                                    invalidateCache('history');
                                    invalidateCache('invoices');
                                    const boot = await apiFetch('get_boot_data');
                                    if (boot && boot.settings) {
                                        setCachedData('settings', boot.settings);
                                        companyData = { name: boot.settings.name || '', cif: boot.settings.cif || '', email: boot.settings.email || '', address: boot.settings.address || '', defaultTax: parseFloat(boot.settings.default_tax) || 21 };
                                        updateCompanyDisplay();
                                    }
                                    showToast('Empresa cambiada', 'success');
                                    loadDashboard();
                                    if (document.getElementById('section-customers') && !document.getElementById('section-customers').classList.contains('hidden')) loadCustomers();
                                } catch (e) {
                                    showToast(e.message || 'Error al cambiar empresa', 'error');
                                }
                            });
                        }
                    }
                }
                showApp(data.session);
                loadDocThemeFromStorage();
                if (data.session && data.session.role === 'admin') {
                    apiFetch('upgrade_tags_schema').catch(() => {});
                }
            } else {
                showLogin();
            }
        } catch (e) {
            console.error('Boot error:', e);
            showLogin();
        }
    }

    function showApp(user) {
        currentUser = user;
        loginScreen.classList.add('hidden');
        appContainer.classList.remove('hidden');
        document.body.classList.remove('auth-mode');
        const settingsForUi = getCachedData('settings') || {};
        const chatbotWrap = document.getElementById('chatbot-wrap');
        if (chatbotWrap) {
            const chatbotEnabled = !(settingsForUi.chatbot_enabled === 0 || settingsForUi.chatbot_enabled === '0');
            chatbotWrap.classList.toggle('hidden', !chatbotEnabled);
        }
        const navPwaInstall = document.getElementById('nav-pwa-install');
        if (navPwaInstall) {
            const pwaEnabled = !(settingsForUi.pwa_install_enabled === 0 || settingsForUi.pwa_install_enabled === '0');
            navPwaInstall.classList.toggle('hidden', !pwaEnabled);
        }
        userAvatar.textContent = user.username.substring(0, 2).toUpperCase();
        if (user.role === 'admin') document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        resetEditor();
        requestAnimationFrame(() => {
            loadDashboard();
            switchSection('section-dashboard', navDashboard);
        });
        // Cargar avisos al iniciar sesión (solo si hay avisos y están activados en Ajustes)
        setTimeout(() => {
            try {
                // openModalAnyway = false → solo abre la ventana si realmente hay avisos
                fetchAndShowDashboardAlerts(false);
            } catch (e) {}
        }, 2000);
        if (window._appointmentReminderInterval) clearInterval(window._appointmentReminderInterval);
        const REMINDER_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos (menos carga en producción)
        function startReminderInterval() {
            if (window._appointmentReminderInterval) return;
            checkAppointmentReminders();
            window._appointmentReminderInterval = setInterval(checkAppointmentReminders, REMINDER_INTERVAL_MS);
        }
        function stopReminderInterval() {
            if (window._appointmentReminderInterval) {
                clearInterval(window._appointmentReminderInterval);
                window._appointmentReminderInterval = null;
            }
        }
        if (document.visibilityState === 'visible') startReminderInterval();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') startReminderInterval();
            else stopReminderInterval();
        });
        setTimeout(checkAppointmentReminders, 8 * 1000);
        // Cargar estado del control horario (si hay jornada iniciada)
        try { loadTimeClockStatus(); } catch (e) {}
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            requestAnimationFrame(() => { lucide.createIcons(); });
            setTimeout(() => { lucide.createIcons(); }, 150);
        } else if (window.lucide && window.lucide.createIcons) {
            requestAnimationFrame(() => { window.lucide.createIcons(); });
            setTimeout(() => { window.lucide.createIcons(); }, 150);
        }
    }

    const timeClockWidget = document.getElementById('time-clock-widget');
    const timeClockElapsedEl = document.getElementById('time-clock-elapsed');
    const btnTimeClockEnd = document.getElementById('btn-time-clock-end');

    async function loadTimeClockStatus() {
        if (!timeClockWidget || !currentUser) return;
        try {
            const data = await apiFetch('time_clock_status');
            if (!data || data.status !== 'running') {
                timeClockWidget.classList.add('hidden');
                if (timeClockInterval) {
                    clearInterval(timeClockInterval);
                    timeClockInterval = null;
                }
                return;
            }
            const startedAt = new Date(data.start_time);
            const update = () => {
                const now = new Date();
                const diff = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
                if (timeClockElapsedEl) timeClockElapsedEl.textContent = formatDurationSeconds(diff);
            };
            update();
            timeClockWidget.classList.remove('hidden');
            if (timeClockInterval) clearInterval(timeClockInterval);
            timeClockInterval = setInterval(update, 1000);
        } catch (e) {
            // Si falla, ocultamos el widget pero no interrumpimos nada
            if (timeClockWidget) timeClockWidget.classList.add('hidden');
        }
    }

    if (btnTimeClockEnd && timeClockWidget) {
        btnTimeClockEnd.addEventListener('click', async () => {
            if (!confirm('¿Terminar la jornada ahora?')) return;
            const fd = new FormData();
            fd.append('action', 'time_clock_end');
            try {
                const res = await fetch(getApiEndpoint() + '?t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
                const data = await res.json();
                if (data.status === 'success') {
                    showToast('Jornada finalizada.', 'success');
                    if (timeClockWidget) timeClockWidget.classList.add('hidden');
                    if (timeClockInterval) {
                        clearInterval(timeClockInterval);
                        timeClockInterval = null;
                    }
                } else {
                    showToast(data.message || 'No se pudo terminar la jornada.', 'error');
                }
            } catch (e) {
                showToast(e.message || 'Error al terminar la jornada.', 'error');
            }
        });
    }

    const appointmentRemindersShown = new Set();
    const REMINDER_WINDOW_MS = 90 * 1000; // ventana para no duplicar si el chequeo se retrasa

    function showAppointmentNotification(title, body) {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
            try {
                const n = new Notification(title, {
                    body: body,
                    icon: (typeof getApiEndpoint === 'function' ? new URL('logo.png', window.location.href).href : '/logo.png'),
                    tag: 'appointment-reminder',
                    requireInteraction: false
                });
                n.onclick = () => { window.focus(); n.close(); };
            } catch (e) { /* notificaciones no soportadas o bloqueadas */ }
        } else if (Notification.permission === 'default') {
            Notification.requestPermission().then((p) => {
                if (p === 'granted') showAppointmentNotification(title, body);
            });
        }
    }

    async function checkAppointmentReminders() {
        if (!currentUser) return;
        const settings = getCachedData('settings');
        if (settings && (settings.alerts_enabled === 0 || settings.alerts_enabled === '0')) return;
        if (settings && (settings.appointment_reminders_enabled === 0 || settings.appointment_reminders_enabled === '0')) return;
        try {
            const data = await getAppointmentsToday();
            const list = data && data.appointments_today ? data.appointments_today : [];
            const now = Date.now();
            for (const a of list) {
                const dateStr = (a.date || '').toString();
                if (!dateStr) continue;
                const aptTime = new Date(dateStr).getTime();
                const timeLabel = dateStr.slice(11, 16);
                const clientName = a.client_name || 'Cita';
                const key5 = (a.id || dateStr) + '-5';
                const key1 = (a.id || dateStr) + '-1';
                // Recordatorio 5 minutos antes: toast + notificación en el móvil
                if (now >= aptTime - 5 * 60 * 1000 && now < aptTime && !appointmentRemindersShown.has(key5)) {
                    appointmentRemindersShown.add(key5);
                    showToast('⏰ Cita en 5 minutos: ' + clientName + ' a las ' + timeLabel, 'info');
                    showAppointmentNotification('⏰ Cita en 5 min', clientName + ' a las ' + timeLabel);
                }
                // Recordatorio 1 minuto antes
                if (now >= aptTime - 1 * 60 * 1000 && now < aptTime - 1 * 60 * 1000 + REMINDER_WINDOW_MS && !appointmentRemindersShown.has(key1)) {
                    appointmentRemindersShown.add(key1);
                    showToast('⏰ Cita en 1 minuto: ' + clientName + ' a las ' + timeLabel, 'info');
                    showAppointmentNotification('⏰ Cita en 1 min', clientName + ' a las ' + timeLabel + '.');
                }
            }
        } catch (e) { }
    }

    // --- CONTROL HORARIO (TIME CLOCK) ---
    if (linkTimeClock && timeClockPanel) {
        linkTimeClock.addEventListener('click', (e) => {
            e.preventDefault();
            timeClockPanel.classList.toggle('hidden');
            timeClockMsg.classList.add('hidden');
            timeClockMsg.textContent = '';
            if (!timeClockPanel.classList.contains('hidden')) {
                if (timeClockUserInput && loginUser && loginUser.value) timeClockUserInput.value = loginUser.value;
                (timeClockUserInput || timeClockPassInput || loginUser)?.focus();
            }
        });
    }

    let timeClockInterval = null;
    function formatDurationSeconds(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        const h = String(Math.floor(sec / 3600)).padStart(2, '0');
        const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    async function startTimeClockFromLogin() {
        if (!timeClockUserInput || !timeClockPassInput) return;
        const u = timeClockUserInput.value.trim();
        const p = timeClockPassInput.value;
        if (!u || !p) {
            timeClockMsg.textContent = 'Indica usuario y contraseña.';
            timeClockMsg.classList.remove('hidden');
            return;
        }
        const fd = new FormData();
        fd.append('action', 'time_clock_start');
        fd.append('username', u);
        fd.append('password', p);
        try {
            const res = await fetch(getApiEndpoint() + '?t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
            const data = await res.json();
            if (data.status === 'success' || data.status === 'already_running') {
                const startedAt = data.start_time ? new Date(data.start_time) : new Date();
                const now = new Date();
                const diff = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
                timeClockMsg.textContent = data.status === 'already_running'
                    ? 'Ya tenías una jornada iniciada. Tiempo aproximado: ' + formatDurationSeconds(diff) + '.'
                    : 'Jornada iniciada.';
                timeClockMsg.classList.remove('hidden');
                timeClockMsg.style.color = 'var(--success)';
                timeClockPassInput.value = '';
                if (btnTimeClockStart && timeClockPanel) {
                    timeClockPanel.dataset.mode = 'running';
                    btnTimeClockStart.textContent = 'Terminar jornada';
                }
            } else {
                timeClockMsg.textContent = data.message || 'No se pudo iniciar la jornada.';
                timeClockMsg.classList.remove('hidden');
                timeClockMsg.style.color = 'var(--danger)';
            }
        } catch (e) {
            timeClockMsg.textContent = e.message || 'Error al iniciar la jornada.';
            timeClockMsg.classList.remove('hidden');
            timeClockMsg.style.color = 'var(--danger)';
        }
    }

    async function endTimeClockFromLogin() {
        if (!timeClockUserInput || !timeClockPassInput) return;
        const u = timeClockUserInput.value.trim();
        const p = timeClockPassInput.value;
        if (!u || !p) {
            timeClockMsg.textContent = 'Indica usuario y contraseña para terminar.';
            timeClockMsg.classList.remove('hidden');
            timeClockMsg.style.color = 'var(--danger)';
            return;
        }
        const fd = new FormData();
        fd.append('action', 'time_clock_end');
        fd.append('username', u);
        fd.append('password', p);
        try {
            const res = await fetch(getApiEndpoint() + '?t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
            const data = await res.json();
            if (data.status === 'success') {
                timeClockMsg.textContent = 'Jornada finalizada.';
                timeClockMsg.classList.remove('hidden');
                timeClockMsg.style.color = 'var(--success)';
                timeClockPassInput.value = '';
                if (btnTimeClockStart && timeClockPanel) {
                    timeClockPanel.dataset.mode = 'stopped';
                    btnTimeClockStart.textContent = 'Iniciar jornada';
                }
            } else {
                timeClockMsg.textContent = data.message || 'No se pudo terminar la jornada.';
                timeClockMsg.classList.remove('hidden');
                timeClockMsg.style.color = 'var(--danger)';
            }
        } catch (e) {
            timeClockMsg.textContent = e.message || 'Error al terminar la jornada.';
            timeClockMsg.classList.remove('hidden');
            timeClockMsg.style.color = 'var(--danger)';
        }
    }

    if (btnTimeClockStart) {
        btnTimeClockStart.addEventListener('click', (e) => {
            e.preventDefault();
            if (timeClockPanel && timeClockPanel.dataset.mode === 'running') {
                endTimeClockFromLogin();
            } else {
                startTimeClockFromLogin();
            }
        });
    }

    async function fetchAndShowDashboardAlerts(openModalAnyway) {
        const body = document.getElementById('dashboard-alerts-body');
        const modal = document.getElementById('dashboard-alerts-modal');
        if (!body || !modal) return;
        if (openModalAnyway) {
            modal.classList.remove('hidden');
            body.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Cargando avisos…</p>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        try {
            const settings = getCachedData('settings');
            if (settings && (settings.alerts_enabled === 0 || settings.alerts_enabled === '0')) {
                if (openModalAnyway) body.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Los avisos están desactivados en Ajustes.</p>';
                return;
            }
            const data = await getDashboardAlerts();
            let myTasks = [];
            try { myTasks = await apiFetch('get_my_tasks') || []; } catch (e) {}
            const pendingTasks = Array.isArray(myTasks) ? myTasks.filter(t => !(t.completed === 1 || t.completed === '1' || t.completed === true)) : [];
            const hasTasks = pendingTasks.length > 0;

            const hasAppointments = (data.appointments_today && data.appointments_today.length) > 0;
            const hasQuotes = (data.draft_quotes && data.draft_quotes.length) > 0;
            const hasInvoices = (data.pending_invoices && data.pending_invoices.length) > 0;
            const hasOverdue = (data.overdue_invoices && data.overdue_invoices.length) > 0;
            const hasSentNoResponse = (data.sent_quotes_no_response && data.sent_quotes_no_response.length) > 0;
            const hasMessages = (data.messages && data.messages.length) > 0;
            if (!hasAppointments && !hasQuotes && !hasInvoices && !hasOverdue && !hasSentNoResponse && !hasMessages && !hasTasks) {
                if (openModalAnyway) body.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No hay avisos para hoy.</p>';
                else return;
            }
            const parts = [];
            if (hasAppointments) {
                parts.push('<div class="alerts-block"><strong><i data-lucide="calendar"></i> Citas hoy</strong><ul class="alerts-list">');
                data.appointments_today.forEach(a => {
                    const time = (a.date || '').toString().slice(11, 16);
                    const desc = (a.client_name || 'Sin nombre') + (time ? ' · ' + time : '');
                    parts.push('<li>' + escapeHtml(desc) + '</li>');
                });
                parts.push('</ul></div>');
            }
            if (hasQuotes) {
                parts.push('<div class="alerts-block"><strong><i data-lucide="file-text"></i> Presupuestos sin cerrar (borrador/enviados)</strong><ul class="alerts-list">');
                data.draft_quotes.slice(0, 5).forEach(q => {
                    parts.push('<li>' + escapeHtml((q.id || '') + ' · ' + (q.client_name || '') + ' · ' + (q.total_amount != null ? formatCurrency(Number(q.total_amount)) : '')) + '</li>');
                });
                if (data.draft_quotes.length > 5) parts.push('<li><em>y ' + (data.draft_quotes.length - 5) + ' más</em></li>');
                parts.push('</ul></div>');
            }
            if (hasInvoices) {
                parts.push('<div class="alerts-block"><strong><i data-lucide="receipt"></i> Facturas pendientes de cobro</strong><ul class="alerts-list">');
                data.pending_invoices.slice(0, 5).forEach(inv => {
                    parts.push('<li>' + escapeHtml((inv.id || '') + ' · ' + (inv.client_name || '') + ' · ' + (inv.total_amount != null ? formatCurrency(Number(inv.total_amount)) : '')) + '</li>');
                });
                if (data.pending_invoices.length > 5) parts.push('<li><em>y ' + (data.pending_invoices.length - 5) + ' más</em></li>');
                parts.push('</ul></div>');
            }
            if (hasOverdue) {
                const overdueDays = (getCachedData('settings') || {}).overdue_invoice_days || 30;
                parts.push('<div class="alerts-block"><strong><i data-lucide="alert-circle"></i> Facturas impagadas (más de ' + overdueDays + ' días)</strong><ul class="alerts-list">');
                (data.overdue_invoices || []).slice(0, 5).forEach(inv => {
                    const dateStr = inv.date ? new Date(inv.date).toLocaleDateString('es-ES') : '';
                    parts.push('<li>' + escapeHtml((inv.id || '') + ' · ' + (inv.client_name || '') + ' · ' + dateStr + ' · ' + (inv.total_amount != null ? formatCurrency(Number(inv.total_amount)) : '')) + '</li>');
                });
                if (data.overdue_invoices.length > 5) parts.push('<li><em>y ' + (data.overdue_invoices.length - 5) + ' más</em></li>');
                parts.push('</ul></div>');
            }
            if (hasSentNoResponse) {
                parts.push('<div class="alerts-block"><strong><i data-lucide="clock"></i> Presupuestos enviados sin respuesta (más de 7 días)</strong><ul class="alerts-list">');
                data.sent_quotes_no_response.slice(0, 5).forEach(q => {
                    const days = q.date ? Math.floor((Date.now() - new Date(q.date).getTime()) / 86400000) : 0;
                    parts.push('<li>' + escapeHtml((q.id || '') + ' · ' + (q.client_name || '') + (days ? ' · hace ' + days + ' días' : '')) + '</li>');
                });
                if (data.sent_quotes_no_response.length > 5) parts.push('<li><em>y ' + (data.sent_quotes_no_response.length - 5) + ' más</em></li>');
                parts.push('</ul></div>');
            }
            if (hasMessages) {
                parts.push('<div class="alerts-block"><strong><i data-lucide="mail"></i> Mensajes del administrador</strong><ul class="alerts-list">');
                data.messages.forEach(m => {
                    const subj = (m.subject || 'Sin asunto').replace(/</g, '&lt;');
                    const from = (m.from_username || 'Admin').replace(/</g, '&lt;');
                    const date = (m.created_at || '').toString().slice(0, 16).replace('T', ' ');
                    parts.push('<li class="alert-message" data-msg-id="' + (m.id || '') + '"><strong>' + subj + '</strong><br><small>' + from + ' · ' + date + '</small>' + (m.body ? '<br><span class="alert-message-body">' + escapeHtml(m.body) + '</span>' : '') + '</li>');
                });
                parts.push('</ul></div>');
            }
            if (hasTasks) {
                parts.push('<div class="alerts-block"><strong><i data-lucide="list-todo"></i> Tareas asignadas pendientes</strong><ul class="alerts-list">');
                pendingTasks.slice(0, 8).forEach(t => {
                    const proj = (t.project_name || 'Proyecto').replace(/</g, '&lt;');
                    const title = (t.title || 'Tarea').replace(/</g, '&lt;');
                    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('es-ES') : '';
                    parts.push('<li>' + escapeHtml(title + (proj ? ' · ' + proj : '') + (dueStr ? ' · ' + dueStr : '')) + '</li>');
                });
                if (pendingTasks.length > 8) parts.push('<li><em>y ' + (pendingTasks.length - 8) + ' más</em></li>');
                parts.push('</ul><p style="margin-top:0.5rem;"><button type="button" class="btn btn-primary btn-sm" id="alerts-goto-activities"><i data-lucide="list-todo" style="width:14px;height:14px;"></i> Ver en Actividades</button></p></div>');
            }
            body.innerHTML = parts.join('');
            if (hasTasks) {
                const gotoBtn = body.querySelector('#alerts-goto-activities');
                if (gotoBtn) gotoBtn.addEventListener('click', () => {
                    document.getElementById('alerts-modal-close')?.click();
                    document.getElementById('nav-activities')?.click();
                });
            }
            modal.classList.remove('hidden');
            window._dashboardAlertsMessages = (data.messages || []).map(m => m.id);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            if (openModalAnyway) body.innerHTML = '<p style="color:var(--danger);text-align:center;">No se pudieron cargar las alertas. El servidor puede estar saturado (504). Intenta más tarde.</p>';
            else if (!_dashboardAlertsCache.data) showToast('No se pudieron cargar las alertas. Intenta más tarde.', 'error');
        }
    }

    document.getElementById('alerts-modal-close')?.addEventListener('click', async () => {
        const modal = document.getElementById('dashboard-alerts-modal');
        if (modal) modal.classList.add('hidden');
        const ids = window._dashboardAlertsMessages;
        if (ids && ids.length) {
            try {
                for (const id of ids) {
                    const fd = new FormData();
                    fd.append('id', id);
                    await fetch(getApiEndpoint() + '?action=mark_message_read&t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
                }
            } catch (e) {}
        }
    });
    document.getElementById('dashboard-alerts-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'dashboard-alerts-modal') {
            document.getElementById('alerts-modal-close')?.click();
        }
    });
    document.addEventListener('keydown', function alertsModalEscape(e) {
        if (e.key !== 'Escape') return;
        var alertsModal = document.getElementById('dashboard-alerts-modal');
        if (alertsModal && !alertsModal.classList.contains('hidden')) {
            document.getElementById('alerts-modal-close')?.click();
        }
    });

    function showLogin() {
        loginScreen.classList.remove('hidden');
        appContainer.classList.add('hidden');
        document.body.classList.add('auth-mode');
        document.getElementById('chatbot-wrap')?.classList.add('hidden');
        setTimeout(function () { if (loginUser) loginUser.focus(); }, 100);
    }

    // --- LOGIN ---
    async function login() {
        if (window.location.protocol === 'file:') {
            showToast('Abre la app desde http://localhost/presup/ (o http://127.0.0.1/presup/) para que el login funcione.', 'error');
            return;
        }
        const fd = new FormData();
        fd.append('action', 'login');
        fd.append('username', loginUser.value.trim());
        fd.append('password', loginPass.value);
        try {
            const res = await fetch(`${getApiEndpoint()}?t=${Date.now()}`, { method: 'POST', body: fd, credentials: 'same-origin' });
            const text = await res.text();
            let data = null;
            try {
                data = text ? JSON.parse(text) : {};
            } catch (_) {
                console.error('Respuesta no JSON:', text.slice(0, 200));
                const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(window.location.origin);
                showToast(isLocal ? 'El servidor devolvió un error. Comprueba que Apache, MySQL y api.php estén disponibles.' : 'El servidor devolvió un error. Intenta de nuevo o revisa la consola (F12).', 'error');
                return;
            }
            if (data.status === 'success') {
                // En lugar de recargar toda la página, relanzamos boot()
                // para que cargue la app y, entre otras cosas, el estado del control horario.
                try {
                    await boot();
                } catch (e) {
                    location.reload();
                }
            } else {
                loginError.classList.remove('hidden');
                loginError.textContent = data.message || 'Usuario o contraseña incorrectos';
                showToast(data.message || 'Credenciales incorrectas', 'error');
            }
        } catch (e) {
            console.error('Error login:', e);
            const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(window.location.origin);
            showToast(isLocal ? 'Error de conexión. ¿Está Apache y MySQL encendido? Abre desde http://localhost/presup/.' : 'Error de conexión. Comprueba la red e intenta de nuevo.', 'error');
        }
    }

    // --- Recuperación de contraseña ---
    const passwordResetPanel = document.getElementById('password-reset-panel');
    const resetRequestForm = document.getElementById('reset-request-form');
    const resetForm = document.getElementById('reset-form');
    const resetRequestMsg = document.getElementById('reset-request-msg');
    const resetMsg = document.getElementById('reset-msg');
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset');
    if (resetToken && passwordResetPanel) {
        passwordResetPanel.classList.remove('hidden');
        resetRequestForm.classList.add('hidden');
        resetForm.classList.remove('hidden');
        document.getElementById('reset-new-password').value = '';
    }
    const linkForgot = document.getElementById('link-forgot-password');
    if (linkForgot) {
        linkForgot.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (passwordResetPanel) {
                passwordResetPanel.classList.toggle('hidden');
            }
            if (resetRequestMsg) { resetRequestMsg.classList.add('hidden'); resetRequestMsg.textContent = ''; }
            if (resetMsg) { resetMsg.classList.add('hidden'); resetMsg.textContent = ''; }
        });
    }
    const linkBackLogin = document.getElementById('link-back-login');
    if (linkBackLogin) {
        linkBackLogin.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (passwordResetPanel) passwordResetPanel.classList.add('hidden');
            window.history.replaceState({}, '', window.location.pathname);
        });
    }
    const btnRequestReset = document.getElementById('btn-request-reset');
    if (btnRequestReset) btnRequestReset.addEventListener('click', async () => {
        const username = (document.getElementById('reset-username') || {}).value?.trim();
        if (!username) { showToast('Indica el usuario', 'error'); return; }
        const fd = new FormData();
        fd.append('action', 'request_password_reset');
        fd.append('username', username);
        try {
            const res = await fetch(getApiEndpoint(), { method: 'POST', body: fd });
            const data = await res.json();
            if (data.status === 'success') {
                if (resetRequestMsg) {
                    resetRequestMsg.textContent = data.message || 'Solicitud enviada. El administrador te comunicará la nueva contraseña.';
                    resetRequestMsg.classList.remove('hidden');
                }
            } else {
                showToast(data.message || 'Error', 'error');
            }
        } catch (e) { showToast('Error de conexión', 'error'); }
    });
    const btnDoReset = document.getElementById('btn-do-reset');
    if (btnDoReset) btnDoReset.addEventListener('click', async () => {
        const token = resetToken || (params.get('reset') || '').trim();
        const newPass = (document.getElementById('reset-new-password') || {}).value || '';
        if (!token || newPass.length < 4) { showToast('Token inválido o contraseña demasiado corta (mín. 4)', 'error'); return; }
        const fd = new FormData();
        fd.append('action', 'reset_password');
        fd.append('token', token);
        fd.append('new_password', newPass);
        try {
            const res = await fetch(getApiEndpoint(), { method: 'POST', body: fd });
            const data = await res.json();
            if (data.status === 'success') {
                if (resetMsg) { resetMsg.textContent = data.message || 'Contraseña actualizada.'; resetMsg.style.color = 'var(--primary)'; resetMsg.classList.remove('hidden'); }
                showToast(data.message, 'success');
                setTimeout(() => { window.location.href = window.location.pathname; }, 1500);
            } else {
                if (resetMsg) { resetMsg.textContent = data.message || 'Error'; resetMsg.style.color = 'var(--danger)'; resetMsg.classList.remove('hidden'); }
                showToast(data.message, 'error');
            }
        } catch (e) { showToast('Error de conexión', 'error'); }
    });

    // --- Vista pública: cliente firma y acepta el presupuesto (enlace sin login) ---
    const acceptQuoteId = params.get('accept');
    const acceptQuoteToken = params.get('token');
    const acceptQuoteView = document.getElementById('accept-quote-view');
    if (acceptQuoteView && acceptQuoteId && acceptQuoteToken) {
        loginScreen.classList.add('hidden');
        if (appContainer) appContainer.classList.add('hidden');
        acceptQuoteView.classList.remove('hidden');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        else if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();

        const acceptQuoteError = document.getElementById('accept-quote-error');
        const acceptQuoteSummary = document.getElementById('accept-quote-summary');
        const acceptQuoteSuccess = document.getElementById('accept-quote-success');
        const acceptQuoteForm = document.getElementById('accept-quote-form');
        const acceptQuoteName = document.getElementById('accept-quote-name');
        const acceptQuoteCanvas = document.getElementById('accept-quote-canvas');
        const acceptQuoteClear = document.getElementById('accept-quote-clear');
        const acceptQuoteSubmit = document.getElementById('accept-quote-submit');

        function showAcceptError(msg) {
            if (acceptQuoteError) { acceptQuoteError.textContent = msg || ''; acceptQuoteError.classList.toggle('hidden', !msg); }
            if (acceptQuoteForm) acceptQuoteForm.classList.add('hidden');
        }
        function renderAcceptSummary(q) {
            const items = (q.items || []).map(i => {
                const qty = parseFloat(i.quantity) || 0;
                const price = parseFloat(i.price) || 0;
                const tax = parseFloat(i.tax_percent) || 0;
                const lineTotal = qty * price * (1 + tax / 100);
                return `<tr><td>${(i.description || '').replace(/</g, '&lt;')}</td><td>${qty}</td><td>${price.toFixed(2)} €</td><td>${lineTotal.toFixed(2)} €</td></tr>`;
            }).join('');
            const total = parseFloat(q.total_amount) || 0;
            let html = `<p><strong>Presupuesto ${(q.id || '').replace(/</g, '&lt;')}</strong></p>`;
            html += `<p>Cliente: ${(q.client_name || '').replace(/</g, '&lt;')}</p>`;
            if (items) html += `<table style="width:100%;border-collapse:collapse;margin-top:0.5rem;"><thead><tr><th style="text-align:left;">Descripción</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${items}</tbody></table>`;
            html += `<p style="margin-top:0.75rem;"><strong>Total: ${total.toFixed(2)} €</strong></p>`;
            if (acceptQuoteSummary) acceptQuoteSummary.innerHTML = html;
        }

        (async function initAcceptQuote() {
            try {
                const res = await fetch(`${getApiEndpoint()}?action=get_quote_public&id=${encodeURIComponent(acceptQuoteId)}&token=${encodeURIComponent(acceptQuoteToken)}`);
                const data = await res.json();
                if (data.error) {
                    if (data.error === 'already_accepted' || (data.message && data.message.includes('ya fue aceptado'))) {
                        if (acceptQuoteSuccess) { acceptQuoteSuccess.classList.remove('hidden'); acceptQuoteSuccess.innerHTML = '<strong>Presupuesto aceptado.</strong> Este presupuesto ya fue aceptado anteriormente.'; }
                        if (acceptQuoteForm) acceptQuoteForm.classList.add('hidden');
                    } else {
                        showAcceptError(data.message || data.error || 'Enlace no válido.');
                    }
                    return;
                }
                renderAcceptSummary(data);
                if (acceptQuoteForm) acceptQuoteForm.classList.remove('hidden');
                if (acceptQuoteSuccess) acceptQuoteSuccess.classList.add('hidden');

                let drawing = false;
                const ctx = acceptQuoteCanvas.getContext('2d');
                if (ctx) {
                    ctx.strokeStyle = '#111';
                    ctx.lineWidth = 2;
                    ctx.lineCap = 'round';
                    function start(e) { drawing = true; ctx.beginPath(); const x = e.touches ? e.touches[0].clientX : e.clientX; const y = e.touches ? e.touches[0].clientY : e.clientY; const rect = acceptQuoteCanvas.getBoundingClientRect(); ctx.moveTo(x - rect.left, y - rect.top); }
                    function move(e) { if (!drawing) return; e.preventDefault(); const x = e.touches ? e.touches[0].clientX : e.clientX; const y = e.touches ? e.touches[0].clientY : e.clientY; const rect = acceptQuoteCanvas.getBoundingClientRect(); ctx.lineTo(x - rect.left, y - rect.top); ctx.stroke(); }
                    function end() { drawing = false; }
                    acceptQuoteCanvas.addEventListener('mousedown', start);
                    acceptQuoteCanvas.addEventListener('mousemove', move);
                    acceptQuoteCanvas.addEventListener('mouseup', end);
                    acceptQuoteCanvas.addEventListener('mouseleave', end);
                    acceptQuoteCanvas.addEventListener('touchstart', start, { passive: false });
                    acceptQuoteCanvas.addEventListener('touchmove', move, { passive: false });
                    acceptQuoteCanvas.addEventListener('touchend', end);
                }
                if (acceptQuoteClear) acceptQuoteClear.addEventListener('click', () => { if (ctx) ctx.clearRect(0, 0, acceptQuoteCanvas.width, acceptQuoteCanvas.height); });
                if (acceptQuoteSubmit) acceptQuoteSubmit.addEventListener('click', async () => {
                    const name = (acceptQuoteName && acceptQuoteName.value) ? acceptQuoteName.value.trim() : '';
                    let signature = '';
                    if (acceptQuoteCanvas && ctx) {
                        const dataUrl = acceptQuoteCanvas.toDataURL('image/png');
                        if (dataUrl && dataUrl.length > 100) signature = dataUrl;
                    }
                    if (!signature && !name) {
                        if (acceptQuoteError) { acceptQuoteError.textContent = 'Escriba su nombre o firme en el recuadro.'; acceptQuoteError.classList.remove('hidden'); }
                        return;
                    }
                    acceptQuoteSubmit.disabled = true;
                    const fd = new FormData();
                    fd.append('action', 'accept_quote_signature');
                    fd.append('id', acceptQuoteId);
                    fd.append('token', acceptQuoteToken);
                    if (signature) fd.append('quote_signature', signature);
                    if (name) fd.append('accepted_by', name);
                    try {
                        const r = await fetch(getApiEndpoint(), { method: 'POST', body: fd });
                        const result = await r.json();
                        if (result.status === 'success') {
                            if (acceptQuoteForm) acceptQuoteForm.classList.add('hidden');
                            if (acceptQuoteSuccess) { acceptQuoteSuccess.classList.remove('hidden'); acceptQuoteSuccess.innerHTML = '<strong>Presupuesto aceptado.</strong> Gracias por su confianza.'; }
                        } else {
                            if (acceptQuoteError) { acceptQuoteError.textContent = result.message || 'Error al guardar.'; acceptQuoteError.classList.remove('hidden'); }
                            acceptQuoteSubmit.disabled = false;
                        }
                    } catch (e) {
                        if (acceptQuoteError) { acceptQuoteError.textContent = 'Error de conexión.'; acceptQuoteError.classList.remove('hidden'); }
                        acceptQuoteSubmit.disabled = false;
                    }
                });
            } catch (e) {
                showAcceptError('Error al cargar el presupuesto.');
            }
        })();
    }

    // --- EDITOR ---
    function resetEditor() {
        currentQuoteId = null;
        currentQuoteSignature = null;
        currentDocumentDate = null;
        clientNameInput.value = ''; clientIdInput.value = ''; clientAddressInput.value = ''; clientEmailInput.value = ''; clientPhoneInput.value = ''; quoteNotesInput.value = '';
        document.getElementById('quote-status').value = 'draft';
        const editorProjectSel = document.getElementById('editor-project-id');
        if (editorProjectSel) editorProjectSel.value = '';
        items = [{ id: Date.now(), description: 'Nuevo Servicio', quantity: 1, price: 0, tax: companyData.defaultTax }];
        renderItems(); updatePreview();
        
        // Ocultar historial de cambios y pagos al resetear
        const auditCard = document.getElementById('audit-log-card');
        if (auditCard) auditCard.style.display = 'none';
        const paymentsCard = document.getElementById('invoice-payments-card');
        if (paymentsCard) paymentsCard.style.display = 'none';
        setRecurringInvoiceUI(false);
        const validUntilWrap = document.getElementById('editor-valid-until-wrap');
        if (validUntilWrap) validUntilWrap.style.display = 'none';
        const validUntilInput = document.getElementById('editor-valid-until');
        if (validUntilInput) validUntilInput.value = '';
    }

    window.getNextInvoiceId = async function() {
        try {
            const res = await apiFetch('get_next_invoice_number');
            return (res && res.next_id) ? res.next_id : null;
        } catch (e) { return null; }
    };

    async function startNewInvoice() {
        const nextId = await getNextInvoiceId();
        currentQuoteId = nextId || ('FAC-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
        currentDocumentIsInvoice = true;
        currentQuoteSignature = null;
        clientNameInput.value = '';
        clientIdInput.value = '';
        clientAddressInput.value = '';
        clientEmailInput.value = '';
        clientPhoneInput.value = '';
        quoteNotesInput.value = '';
        document.getElementById('quote-status').value = 'pending';
        items = [{ id: Date.now(), description: 'Nuevo Servicio', quantity: 1, price: 0, tax: companyData.defaultTax }];
        renderItems();
        updatePreview();
        const auditCard = document.getElementById('audit-log-card');
        if (auditCard) auditCard.style.display = 'none';
        const paymentsCard = document.getElementById('invoice-payments-card');
        if (paymentsCard) paymentsCard.style.display = 'none';
        setRecurringInvoiceUI(true, { enabled: false, frequency: 'monthly', next_date: '' });
        switchSection('section-editor', navEditor);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    document.getElementById('btn-new-invoice')?.addEventListener('click', async () => {
        await startNewInvoice();
    });

    window.newQuoteFromCustomer = async (customerId) => {
        try {
            const data = await apiFetch('get_customers');
            const c = data.find(x => x.id == customerId);
            if (c) {
                clientNameInput.value = c.name || '';
                clientIdInput.value = c.tax_id || '';
                clientAddressInput.value = c.address || '';
                clientEmailInput.value = c.email || '';
                clientPhoneInput.value = c.phone || '';
                currentQuoteId = null;
                currentDocumentIsInvoice = false;
                currentQuoteSignature = null;
                document.getElementById('quote-status').value = 'draft';
                setRecurringInvoiceUI(false);
                updatePreview();
                switchSection('section-editor', navEditor);
            }
        } catch (e) { showToast('Error al cargar cliente', 'error'); }
    };

    function itemImageSrc(url) {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
        const base = window.location.origin + (window.location.pathname.replace(/\/[^/]*$/, '') || '') + '/';
        return base + url.replace(/^\//, '');
    }

    function renderItems() {
        itemsContainer.innerHTML = '';
        items.forEach(i => {
            const row = document.createElement('div');
            row.className = 'item-row';

            const imgSrc = itemImageSrc(i.image_url);
            // Usamos estilos inline para asegurar que se vean pequeñas incluso si falla la caché del CSS
            const imgStyle = "width: 32px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0;";
            const imgContent = i.image_url ?
                `<img src="${imgSrc.replace(/"/g, '&quot;')}" style="${imgStyle}" loading="lazy" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" onload="this.nextElementSibling.style.display='none';"><div style="${imgStyle} border: 1px dashed var(--border); display: none; align-items: center; justify-content: center; font-size: 8px; color: var(--text-muted);">Sin foto</div><button type="button" class="item-image-remove" data-item-id="${i.id}" title="Quitar foto" style="position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;border:none;background:var(--danger, #dc2626);color:#fff;font-size:10px;line-height:1;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.2);">×</button>` :
                `<div style="${imgStyle} border: 1px dashed var(--border); display: flex; align-items: center; justify-content: center; font-size: 8px; color: var(--text-muted);">Sin foto</div>`;
            const imgWrap = `<div class="item-image-wrap" data-item-id="${i.id}" title="Añadir o cambiar foto" style="cursor: pointer; flex-shrink: 0; position: relative;">${imgContent}</div>`;

            row.innerHTML = `
                <div class="item-desc-cell" style="display: flex; align-items: center; gap: 0.5rem; background: var(--bg-main); border: 1px solid var(--border); border-radius: 0.5rem; padding-left: 0.5rem;">
                    ${imgWrap}
                    <input type="text" value="${i.description}" placeholder="Descripción" oninput="updateItem(${i.id},'description',this.value)" style="border: none !important; flex: 1;">
                </div>
                <input type="number" value="${i.quantity}" oninput="updateItem(${i.id},'quantity',this.value)">
                <input type="number" value="${i.price}" oninput="updateItem(${i.id},'price',this.value)">
                <input type="number" value="${i.tax}" oninput="updateItem(${i.id},'tax',this.value)">
                <button class="btn-remove" onclick="removeItem(${i.id})">❌</button>
            `;
            itemsContainer.appendChild(row);
        });
    }

    function applyDocTheme() {
        const previewCard = document.getElementById('quote-preview');
        const sideBg = document.getElementById('preview-side-bg');
        if (!previewCard) return;

        // Limpiar estilos previos
        previewCard.style.backgroundImage = '';
        previewCard.style.backgroundSize = '';
        previewCard.style.backgroundPosition = '';
        previewCard.style.backgroundRepeat = '';

        if (sideBg) {
            sideBg.classList.add('hidden');
            sideBg.style.backgroundImage = '';
        }

        if (!docBgImage || !docTheme || docTheme === 'none') {
            return;
        }

        if (docTheme === 'full') {
            previewCard.style.backgroundImage = `url(${docBgImage})`;
            previewCard.style.backgroundSize = 'cover';
            previewCard.style.backgroundPosition = 'center';
            previewCard.style.backgroundRepeat = 'no-repeat';
        } else if (docTheme === 'side' && sideBg) {
            sideBg.style.backgroundImage = `url(${docBgImage})`;
            sideBg.classList.remove('hidden');
        }
    }

    function loadDocThemeFromStorage() {
        try {
            const storedTheme = localStorage.getItem('docTheme');
            const storedImage = localStorage.getItem('docBgImage');
            if (storedTheme) docTheme = storedTheme;
            if (storedImage) docBgImage = storedImage;
            if (docThemeSelect) {
                docThemeSelect.value = docTheme || 'none';
            }
            applyDocTheme();
        } catch (e) {
            console.warn('No se pudo cargar el tema de documento desde localStorage', e);
        }
    }

    function updatePreview() {
        // Cliente
        document.getElementById('preview-client-name').textContent = clientNameInput.value || 'Cliente';

        const previewClientDetails = document.getElementById('preview-client-details');
        if (previewClientDetails) {
            const address = (clientAddressInput && clientAddressInput.value.trim()) || 'Dirección del Cliente';
            const email = (clientEmailInput && clientEmailInput.value.trim()) || '';
            const phone = (clientPhoneInput && clientPhoneInput.value.trim()) || '';
            const nif = (clientIdInput && clientIdInput.value.trim())
                ? `NIF: ${clientIdInput.value.trim()}`
                : 'NIF: 00000000X';

            const lines = [];
            if (address) lines.push(address);
            if (email) lines.push(email);
            if (phone) lines.push(phone);
            if (nif) lines.push(nif);

            previewClientDetails.innerHTML = lines.join('<br>');
        }

        // Empresa y logo
        const previewLogoEl = document.querySelector('.preview-logo');
        if (previewLogoEl) {
            const sett = getCachedData('settings');
            const dataUrl = sett && sett.document_logo_data_url ? String(sett.document_logo_data_url) : '';
            const logoUrlSetting = sett && sett.document_logo_url && String(sett.document_logo_url).trim() ? String(sett.document_logo_url).trim() : '';
            if (dataUrl) {
                previewLogoEl.src = dataUrl;
            } else if (logoUrlSetting) {
                previewLogoEl.src = logoUrlSetting;
            } else {
                previewLogoEl.src = '';
            }
        }
        document.getElementById('preview-company-name').textContent = companyData.name;
        document.getElementById('preview-company-details').innerHTML = `${(companyData.address || '').replace(/\n/g, '<br>')}<br>CIF: ${companyData.cif}`;
        previewItemsBody.innerHTML = '';
        items.forEach((i, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.itemIndex = String(idx);
            const imgSrc = itemImageSrc(i.image_url);
            const img = i.image_url ? `<img src="${imgSrc.replace(/"/g, '&quot;')}" style="width:30px;height:30px;object-fit:cover;margin-right:5px;vertical-align:middle" loading="lazy" onerror="this.style.display='none'">` : '';

            const tdDesc = document.createElement('td');
            tdDesc.innerHTML = `${img}<span class="preview-item-desc preview-editable" data-field="description" contenteditable="false">${(i.description || '').toString().replace(/</g, '&lt;')}</span>`;

            const tdQty = document.createElement('td');
            tdQty.classList.add('preview-editable');
            tdQty.dataset.field = 'quantity';
            tdQty.setAttribute('contenteditable', 'false');
            tdQty.textContent = String(i.quantity);

            const tdPrice = document.createElement('td');
            tdPrice.classList.add('preview-editable');
            tdPrice.dataset.field = 'price';
            tdPrice.setAttribute('contenteditable', 'false');
            tdPrice.textContent = formatCurrency(i.price);

            const tdVat = document.createElement('td');
            tdVat.classList.add('preview-col-vat', 'preview-editable');
            tdVat.dataset.field = 'tax';
            tdVat.setAttribute('contenteditable', 'false');
            tdVat.textContent = `${i.tax}%`;

            const tdTotal = document.createElement('td');
            tdTotal.textContent = formatCurrency(i.quantity * i.price);

            tr.appendChild(tdDesc);
            tr.appendChild(tdQty);
            tr.appendChild(tdPrice);
            tr.appendChild(tdVat);
            tr.appendChild(tdTotal);
            previewItemsBody.appendChild(tr);
        });
        const sub = items.reduce((a, b) => a + (b.quantity * b.price), 0);
        const tax = items.reduce((a, b) => a + (b.quantity * b.price * (b.tax / 100)), 0);
        let isInvoice = currentDocumentIsInvoice || (currentQuoteId && String(currentQuoteId).startsWith('FAC-'));
        const isRebuActive = isInvoice && rebuInvoiceEnabledInput && rebuInvoiceEnabledInput.checked;
        if (isRebuActive) {
            // En REBU mostramos solo TOTAL al cliente (precio final), sin desglosar IVA
            document.getElementById('preview-subtotal').textContent = '';
            document.getElementById('preview-tax').textContent = '';
            document.getElementById('preview-total').textContent = formatCurrency(sub + tax);
        } else {
            document.getElementById('preview-subtotal').textContent = formatCurrency(sub);
            document.getElementById('preview-tax').textContent = formatCurrency(tax);
            document.getElementById('preview-total').textContent = formatCurrency(sub + tax);
        }

        // Actualizar notas en la vista previa
        const notesContainer = document.getElementById('preview-notes-container');
        const notesText = document.getElementById('preview-notes-text');
        if (notesContainer && notesText) {
            const value = (quoteNotesInput && quoteNotesInput.value) ? quoteNotesInput.value.trim() : '';
            notesText.textContent = value;
            // Ocultar el bloque de notas si está vacío
            notesContainer.style.display = value ? 'block' : 'none';
        }

        // isInvoice ya calculado más arriba
        const lang = (getCachedData('settings') && getCachedData('settings').document_language === 'en') ? 'en' : 'es';
        // Fallback extra: si el ID parece de factura (FAC-XXXX), forzamos a FACTURA aunque algún flag esté mal
        const idStr = String(currentQuoteId || '');
        if (/^FAC-/i.test(idStr)) {
            isInvoice = true;
        }
        const docTitle = isInvoice ? (lang === 'en' ? 'INVOICE' : 'FACTURA') : (lang === 'en' ? 'QUOTE' : 'PRESUPUESTO');
        const mainMetaTitle = document.querySelector('#quote-preview .quote-meta h2');
        if (mainMetaTitle) mainMetaTitle.textContent = docTitle;
        const mainMetaIdSpan = document.getElementById('preview-quote-id');
        if (mainMetaIdSpan) mainMetaIdSpan.textContent = currentQuoteId || 'NUEVO';
        // Etiquetas idioma
        const labels = lang === 'en'
            ? { no: 'No.', date: 'Date', para: 'To', desc: 'Description', qty: 'Qty', price: 'Price', vat: 'VAT', total: 'Total', subtotal: 'Subtotal', notes: 'Notes', signature: 'Client signature:', validity: 'Quote valid for 15 days.', thanks: 'Thank you for your trust.', validUntil: 'Valid until:' }
            : { no: 'Nº', date: 'Fecha', para: 'PARA:', desc: 'Descripción', qty: 'Cant.', price: 'Precio', vat: 'IVA', total: 'TOTAL', subtotal: 'Subtotal', notes: 'Notas:', signature: 'Firma del cliente:', validity: 'Validez del presupuesto: 15 días.', thanks: 'Gracias por su confianza.', validUntil: 'Válido hasta:' };
        const meta = document.querySelector('#quote-preview .quote-meta');
        if (meta) {
            const ps = meta.querySelectorAll('p');
            if (ps[0] && ps[0].querySelector('strong')) ps[0].querySelector('strong').textContent = labels.no + ': ';
            if (ps[1] && ps[1].querySelector('strong')) ps[1].querySelector('strong').textContent = labels.date + ': ';
        }
        // Válido hasta (solo presupuestos): vista previa y PDF
        const validUntilWrap = document.getElementById('preview-valid-until-wrap');
        const validUntilSpan = document.getElementById('preview-valid-until');
        const validUntilLabel = document.getElementById('preview-valid-until-label');
        if (validUntilWrap && validUntilSpan && validUntilLabel) {
            const validUntilInput = document.getElementById('editor-valid-until');
            const raw = validUntilInput && validUntilInput.value ? String(validUntilInput.value).trim() : '';
            if (!isInvoice && raw) {
                const d = raw.substring(0, 10);
                const parts = d.split('-');
                validUntilSpan.textContent = parts.length === 3 ? (parts[2] + '/' + parts[1] + '/' + parts[0]) : raw;
                validUntilLabel.textContent = labels.validUntil + ' ';
                validUntilWrap.classList.remove('hidden');
                validUntilWrap.style.display = 'block';
            } else {
                validUntilWrap.classList.add('hidden');
                validUntilWrap.style.display = 'none';
            }
        }
        const clientH = document.querySelector('.preview-client h4');
        if (clientH) clientH.textContent = labels.para;
        const ths = document.querySelectorAll('.preview-table thead th');
        if (ths.length >= 5) {
            ths[0].textContent = labels.desc;
            ths[1].textContent = labels.qty;
            ths[2].textContent = labels.price;
            ths[3].textContent = labels.vat;
            ths[4].textContent = labels.total;
            // En facturas REBU ocultamos la columna de IVA completa (cabecera + celdas)
            if (isRebuActive) {
                ths[3].style.display = 'none';
                document.querySelectorAll('#preview-items-body td.preview-col-vat').forEach(td => { td.style.display = 'none'; });
            } else {
                ths[3].style.display = '';
                document.querySelectorAll('#preview-items-body td.preview-col-vat').forEach(td => { td.style.display = ''; });
            }
        }
        // Etiquetas del resumen: asociar por ID del valor para no cruzar Subtotal/IVA/TOTAL
        const elSub = document.getElementById('preview-subtotal');
        const elTax = document.getElementById('preview-tax');
        const elTotal = document.getElementById('preview-total');
        if (elSub && elSub.previousElementSibling) elSub.previousElementSibling.textContent = labels.subtotal;
        if (elTax && elTax.previousElementSibling) elTax.previousElementSibling.textContent = labels.vat;
        if (elTotal && elTotal.previousElementSibling) elTotal.previousElementSibling.textContent = labels.total;
        const sumLines = document.querySelectorAll('.preview-summary .summary-line');
        if (sumLines.length >= 3) {
            // Ocultar líneas de Subtotal e IVA si es factura en REBU
            if (isRebuActive) {
                sumLines[0].style.display = 'none';
                sumLines[1].style.display = 'none';
            } else {
                sumLines[0].style.display = '';
                sumLines[1].style.display = '';
            }
        }
        const notesH = document.querySelector('#preview-notes-container h4');
        if (notesH) notesH.textContent = labels.notes;
        const sigH = document.querySelector('#preview-signature-container h4');
        if (sigH) sigH.textContent = labels.signature;
        const settings = getCachedData('settings');
        let customFooterHtml = settings && settings.document_footer && String(settings.document_footer).trim();
        const footerCustomEl = document.getElementById('preview-footer-custom');
        const footerDefaultEl = document.getElementById('preview-footer-default');
        if (footerCustomEl && footerDefaultEl) {
            if (customFooterHtml) {
                const logoUrl = (settings && settings.document_logo_url && String(settings.document_logo_url).trim()) ? String(settings.document_logo_url).trim() : 'logo.png';
                customFooterHtml = customFooterHtml.replace(/https?:\/\/navegatel\.org\/[^"'\s]*logo[^"'\s]*\.(png|jpg|jpeg|gif|webp)/gi, logoUrl);
                customFooterHtml = customFooterHtml.replace(/src=["']logo\.png["']/gi, 'src="' + (logoUrl || 'logo.png').replace(/"/g, '&quot;') + '"');
                footerCustomEl.innerHTML = customFooterHtml;
                footerCustomEl.classList.remove('hidden');
                footerCustomEl.style.display = 'block';
                footerDefaultEl.classList.add('hidden');
                footerDefaultEl.style.display = 'none';
            } else {
                footerCustomEl.classList.add('hidden');
                footerCustomEl.style.display = 'none';
                footerCustomEl.innerHTML = '';
                footerDefaultEl.classList.remove('hidden');
                footerDefaultEl.style.display = 'block';
                const footerPs = footerDefaultEl.querySelectorAll('p');
                if (footerPs[0]) footerPs[0].textContent = labels.validity;
                if (footerPs[1]) footerPs[1].textContent = labels.thanks;
            }
        }
        // Nota específica para facturas en REBU (usa plantilla configurable si existe)
        if (footerDefaultEl && isInvoice && isRebuActive) {
            const footerPs = footerDefaultEl.querySelectorAll('p');
            let rebuText = settings && settings.rebu_footer_text && String(settings.rebu_footer_text).trim();
            if (!rebuText) {
                rebuText = lang === 'en'
                    ? 'Special scheme for used goods (REBU). VAT is included in the price and is not itemized. The seller is taxed on the profit margin according to VAT regulations.'
                    : 'Régimen especial de los bienes usados (REBU). El IVA está incluido en el precio y no se desglosa. El vendedor tributa por el margen de beneficio conforme a la normativa del IVA.';
            }
            if (footerPs[0]) footerPs[0].textContent = rebuText;
            if (footerPs[1]) footerPs[1].textContent = labels.thanks;
        }
        // QR en pie: enlace de pago (si está configurado) y bloque Verifactu para facturas
        const footerEl = document.querySelector('.preview-footer');
        let qrContainer = document.getElementById('preview-qr-container');
        if (!qrContainer && footerEl) {
            qrContainer = document.createElement('div');
            qrContainer.id = 'preview-qr-container';
            qrContainer.className = 'hidden';
            qrContainer.style.marginTop = '0.5rem';
            footerEl.insertBefore(qrContainer, footerEl.querySelector('.btn'));
        }
        let verifactuQrBlock = document.getElementById('preview-verifactu-qr-block');
        if (!verifactuQrBlock) {
            const metaEl = document.querySelector('.quote-meta');
            if (metaEl) {
                verifactuQrBlock = document.createElement('div');
                verifactuQrBlock.id = 'preview-verifactu-qr-block';
                verifactuQrBlock.className = 'hidden';
                verifactuQrBlock.style.marginTop = '0.5rem';
                verifactuQrBlock.style.textAlign = 'center';
                metaEl.appendChild(verifactuQrBlock);
            }
        }
        const paymentMethodsBlock = document.getElementById('preview-payment-methods');
        if (paymentMethodsBlock) {
            const settings = getCachedData('settings');
            const methodsStr = (settings && settings.payment_methods) ? String(settings.payment_methods).trim() : '';
            const methods = methodsStr ? methodsStr.split(/\s*,\s*/) : [];
            const labels = { transferencia: lang === 'en' ? 'Bank transfer' : 'Transferencia bancaria', efectivo: lang === 'en' ? 'Cash' : 'Efectivo', online: lang === 'en' ? 'Card / Online payment' : 'Tarjeta / Pago online', bizum: 'Bizum', cheque: lang === 'en' ? 'Cheque' : 'Cheque / Talón' };
            if (methods.length > 0) {
                let html = '<strong>' + (lang === 'en' ? 'Payment methods: ' : 'Formas de pago: ') + '</strong>' + methods.map(m => labels[m] || m).join(', ');
                if (methods.indexOf('transferencia') !== -1 && settings && settings.payment_transfer_details && String(settings.payment_transfer_details).trim()) {
                    html += '<div style="margin-top:0.35rem;white-space:pre-line;color:var(--text-muted);font-size:0.8rem;">' + (String(settings.payment_transfer_details).trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')) + '</div>';
                }
                paymentMethodsBlock.innerHTML = html;
                paymentMethodsBlock.classList.remove('hidden');
                paymentMethodsBlock.style.display = 'block';
            } else {
                paymentMethodsBlock.innerHTML = '';
                paymentMethodsBlock.classList.add('hidden');
                paymentMethodsBlock.style.display = 'none';
            }
        }
        if (qrContainer) {
            const settings = getCachedData('settings');
            const payUrl = settings && settings.payment_link_url && isInvoice ? (settings.payment_link_url.replace(/\{id\}/g, currentQuoteId || '')).trim() : '';
            if (payUrl && payUrl.startsWith('http')) {
                qrContainer.innerHTML = '<p style="font-size:0.7rem;margin-bottom:0.25rem;">' + (lang === 'en' ? 'Pay online:' : 'Pagar online:') + '</p><img src="https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=' + encodeURIComponent(payUrl) + '" alt="QR" width="64" height="64" style="display:block;">';
                qrContainer.classList.remove('hidden');
                qrContainer.style.display = 'block';
            } else {
                qrContainer.classList.add('hidden');
                qrContainer.style.display = 'none';
            }
        }
        if (verifactuQrBlock) {
            if (isInvoice && currentQuoteId) {
                const docDate = currentDocumentDate ? new Date(currentDocumentDate) : new Date();
                const fechaExp = docDate.toISOString().slice(0, 10);
                const nifEmisor = (companyData.cif || '').toString().trim().replace(/\s/g, '');
                const verifactuBaseUrl = (getCachedData('settings') && getCachedData('settings').verifactu_verification_url) || 'https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html';
                const qrData = nifEmisor ? (verifactuBaseUrl + (verifactuBaseUrl.indexOf('?') >= 0 ? '&' : '?') + 'numero=' + encodeURIComponent(currentQuoteId) + '&nif=' + encodeURIComponent(nifEmisor) + '&fecha=' + encodeURIComponent(fechaExp)) : verifactuBaseUrl;
                verifactuQrBlock.innerHTML = '<p style="font-size:0.7rem;margin-bottom:0.25rem;font-weight:600;">Factura verificable en la sede electrónica de la AEAT</p><p style="font-size:0.65rem;margin-bottom:0.35rem;color:var(--text-muted);">VERI*FACTU</p><img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(qrData) + '" alt="QR Verifactu" width="80" height="80" style="display:inline-block;vertical-align:middle;">';
                verifactuQrBlock.style.display = 'block';
                verifactuQrBlock.classList.remove('hidden');
            } else {
                verifactuQrBlock.classList.add('hidden');
                verifactuQrBlock.style.display = 'none';
            }
        }

        // Firma del cliente (si existe)
        const sigContainer = document.getElementById('preview-signature-container');
        const sigImg = document.getElementById('preview-signature-img');
        if (sigContainer && sigImg) {
            if (currentQuoteSignature && currentQuoteSignature.length > 50) {
                sigImg.src = currentQuoteSignature;
                sigContainer.classList.remove('hidden');
                sigContainer.style.display = 'block';
            } else {
                sigContainer.classList.add('hidden');
                sigContainer.style.display = 'none';
            }
        }

        // Actualizar opciones del selector de estado dinámicamente
        const statusSelect = document.getElementById('quote-status');
        const currentVal = statusSelect.value;
        statusSelect.innerHTML = isInvoice ? `
            <option value="pending">Pendiente</option>
            <option value="paid">Pagada</option>
            <option value="cancelled">Anulada</option>
        ` : `
            <option value="draft">Borrador</option>
            <option value="sent">Enviado</option>
            <option value="waiting_client">En espera de cliente</option>
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
        `;
        // Restaurar valor si es compatible o poner por defecto
        if ([...statusSelect.options].some(o => o.value === currentVal)) {
            statusSelect.value = currentVal;
        }

        // Aplicar posible fondo de documento
        applyDocTheme();
        // Mostrar u ocultar "Enlace para firmar" y "Pagar" según tipo de documento (local y producción)
        updatePayButtonVisibility();
    }

    function buildElectronicDocumentPayload(isInvoice) {
        const isFac = !!(currentQuoteId && currentQuoteId.startsWith('FAC-'));
        const docId = currentQuoteId || (isInvoice ? `FAC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}` : `PRE-${Date.now()}`);

        const docDate = currentDocumentDate ? new Date(currentDocumentDate) : new Date();
        const dateISO = docDate.toISOString();
        const fechaExpedicion = docDate.toISOString().slice(0, 10);

        const lines = items.map(i => ({
            description: i.description || '',
            quantity: Number(i.quantity) || 0,
            unit_price: Number(i.price) || 0,
            tax_percent: Number(i.tax) || companyData.defaultTax,
            line_subtotal: (Number(i.quantity) || 0) * (Number(i.price) || 0),
            line_tax: (Number(i.quantity) || 0) * (Number(i.price) || 0) * ((Number(i.tax) || companyData.defaultTax) / 100)
        }));

        const subtotal = lines.reduce((acc, l) => acc + l.line_subtotal, 0);
        const taxTotal = lines.reduce((acc, l) => acc + l.line_tax, 0);
        const total = subtotal + taxTotal;

        const nifEmisor = (companyData.cif || '').toString().trim().toUpperCase().replace(/\s/g, '');
        const nifReceptor = (clientIdInput && clientIdInput.value ? clientIdInput.value : '').toString().trim().toUpperCase().replace(/\s/g, '');

        const verifactu = {
            nif_emisor: nifEmisor || null,
            nif_receptor: nifReceptor || null,
            numero_factura: docId,
            fecha_expedicion: fechaExpedicion,
            nombre_emisor: (companyData.name || '').trim() || null,
            nombre_receptor: (clientNameInput && clientNameInput.value ? clientNameInput.value : '').trim() || null,
            direccion_receptor: (clientAddressInput && clientAddressInput.value ? clientAddressInput.value : '').trim() || null,
            lineas: lines.map(l => ({
                descripcion: l.description,
                cantidad: l.quantity,
                precio_unitario: Math.round(l.unit_price * 100) / 100,
                tipo_iva: Math.round(l.tax_percent) || 21,
                importe_linea: Math.round((l.line_subtotal + l.line_tax) * 100) / 100
            })),
            base_imponible: Math.round(subtotal * 100) / 100,
            cuota_iva: Math.round(taxTotal * 100) / 100,
            total_factura: Math.round(total * 100) / 100,
            moneda: 'EUR'
        };

        return {
            schema_version: '1.0',
            type: isInvoice || isFac ? 'invoice' : 'quote',
            id: docId,
            date: dateISO,
            status: document.getElementById('quote-status') ? document.getElementById('quote-status').value : (isInvoice || isFac ? 'pending' : 'draft'),
            company: {
                name: companyData.name,
                cif: companyData.cif,
                email: companyData.email,
                address: companyData.address
            },
            customer: {
                name: clientNameInput ? clientNameInput.value : '',
                tax_id: clientIdInput ? clientIdInput.value : '',
                address: clientAddressInput ? clientAddressInput.value : '',
                email: clientEmailInput ? clientEmailInput.value : '',
                phone: clientPhoneInput ? clientPhoneInput.value : ''
            },
            notes: quoteNotesInput ? quoteNotesInput.value : '',
            currency: 'EUR',
            lines,
            totals: {
                subtotal,
                tax: taxTotal,
                total
            },
            verifactu
        };
    }

    function buildFacturaeXmlFromPayload(payload) {
        const xmlEscape = (s) => (s == null ? '' : String(s))
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const ver = payload.verifactu || {};
        const company = payload.company || {};
        const customer = payload.customer || {};
        const lines = Array.isArray(payload.lines) ? payload.lines : [];
        const totals = payload.totals || { subtotal: 0, tax: 0, total: 0 };

        const issueDate = (ver.fecha_expedicion || payload.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
        const [year, month, day] = issueDate.split('-');
        const taxRate = lines.length ? (lines[0].tax_percent || ver.lineas?.[0]?.tipo_iva || 21) : (ver.lineas && ver.lineas[0] ? (ver.lineas[0].tipo_iva || 21) : 21);

        let xml = '';
        xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<fe:Facturae xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:fe="http://www.facturae.es/Facturae/2009/v3.2/Facturae">\n';
        xml += '  <FileHeader>\n';
        xml += '    <SchemaVersion>3.2</SchemaVersion>\n';
        xml += '    <Modality>I</Modality>\n';
        xml += '    <InvoiceIssuerType>EM</InvoiceIssuerType>\n';
        xml += '    <Batch>\n';
        xml += '      <BatchIdentifier>' + xmlEscape(ver.numero_factura || payload.id || '') + '</BatchIdentifier>\n';
        xml += '      <InvoicesCount>1</InvoicesCount>\n';
        xml += '      <TotalInvoicesAmount>\n';
        xml += '        <TotalAmount>' + totals.total.toFixed(2) + '</TotalAmount>\n';
        xml += '      </TotalInvoicesAmount>\n';
        xml += '      <TotalOutstandingAmount>\n';
        xml += '        <TotalAmount>' + totals.total.toFixed(2) + '</TotalAmount>\n';
        xml += '      </TotalOutstandingAmount>\n';
        xml += '      <TotalExecutableAmount>\n';
        xml += '        <TotalAmount>' + totals.total.toFixed(2) + '</TotalAmount>\n';
        xml += '      </TotalExecutableAmount>\n';
        xml += '      <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>\n';
        xml += '    </Batch>\n';
        xml += '  </FileHeader>\n';

        xml += '  <Parties>\n';
        xml += '    <SellerParty>\n';
        xml += '      <TaxIdentification>\n';
        xml += '        <PersonTypeCode>J</PersonTypeCode>\n';
        xml += '        <ResidenceTypeCode>R</ResidenceTypeCode>\n';
        xml += '        <TaxIdentificationNumber>' + xmlEscape((company.cif || ver.nif_emisor || '').toString()) + '</TaxIdentificationNumber>\n';
        xml += '      </TaxIdentification>\n';
        xml += '      <AdministrativeCentres/>\n';
        xml += '      <LegalEntity>\n';
        xml += '        <CorporateName>' + xmlEscape(company.name || ver.nombre_emisor || '') + '</CorporateName>\n';
        xml += '        <AddressInSpain>\n';
        xml += '          <Address>' + xmlEscape(company.address || '') + '</Address>\n';
        xml += '          <PostCode>00000</PostCode>\n';
        xml += '          <Town>Desconocido</Town>\n';
        xml += '          <Province>Desconocida</Province>\n';
        xml += '          <CountryCode>ESP</CountryCode>\n';
        xml += '        </AddressInSpain>\n';
        xml += '        <ContactDetails>\n';
        xml += '          <ElectronicMail>' + xmlEscape(company.email || '') + '</ElectronicMail>\n';
        xml += '        </ContactDetails>\n';
        xml += '      </LegalEntity>\n';
        xml += '    </SellerParty>\n';

        xml += '    <BuyerParty>\n';
        xml += '      <TaxIdentification>\n';
        xml += '        <PersonTypeCode>F</PersonTypeCode>\n';
        xml += '        <ResidenceTypeCode>R</ResidenceTypeCode>\n';
        xml += '        <TaxIdentificationNumber>' + xmlEscape((customer.tax_id || ver.nif_receptor || '').toString()) + '</TaxIdentificationNumber>\n';
        xml += '      </TaxIdentification>\n';
        xml += '      <Individual>\n';
        xml += '        <Name>' + xmlEscape(customer.name || ver.nombre_receptor || '') + '</Name>\n';
        xml += '        <FirstSurname></FirstSurname>\n';
        xml += '        <AddressInSpain>\n';
        xml += '          <Address>' + xmlEscape(customer.address || ver.direccion_receptor || '') + '</Address>\n';
        xml += '          <PostCode>00000</PostCode>\n';
        xml += '          <Town>Desconocido</Town>\n';
        xml += '          <Province>Desconocida</Province>\n';
        xml += '          <CountryCode>ESP</CountryCode>\n';
        xml += '        </AddressInSpain>\n';
        xml += '        <ContactDetails>\n';
        xml += '          <ElectronicMail>' + xmlEscape(customer.email || '') + '</ElectronicMail>\n';
        xml += '          <Telephone>' + xmlEscape(customer.phone || '') + '</Telephone>\n';
        xml += '        </ContactDetails>\n';
        xml += '      </Individual>\n';
        xml += '    </BuyerParty>\n';
        xml += '  </Parties>\n';

        xml += '  <Invoices>\n';
        xml += '    <Invoice>\n';
        xml += '      <InvoiceHeader>\n';
        xml += '        <InvoiceNumber>' + xmlEscape(ver.numero_factura || payload.id || '') + '</InvoiceNumber>\n';
        xml += '        <InvoiceSeriesCode></InvoiceSeriesCode>\n';
        xml += '        <InvoiceDocumentType>FC</InvoiceDocumentType>\n';
        xml += '        <InvoiceClass>OO</InvoiceClass>\n';
        xml += '      </InvoiceHeader>\n';

        xml += '      <InvoiceIssueData>\n';
        xml += '        <IssueDate>' + xmlEscape(issueDate) + '</IssueDate>\n';
        xml += '        <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>\n';
        xml += '        <TaxCurrencyCode>EUR</TaxCurrencyCode>\n';
        xml += '        <LanguageName>es</LanguageName>\n';
        xml += '      </InvoiceIssueData>\n';

        xml += '      <TaxesOutputs>\n';
        xml += '        <Tax>\n';
        xml += '          <TaxTypeCode>01</TaxTypeCode>\n';
        xml += '          <TaxRate>' + Number(taxRate).toFixed(2) + '</TaxRate>\n';
        xml += '          <TaxableBase>\n';
        xml += '            <TotalAmount>' + totals.subtotal.toFixed(2) + '</TotalAmount>\n';
        xml += '          </TaxableBase>\n';
        xml += '          <TaxAmount>\n';
        xml += '            <TotalAmount>' + totals.tax.toFixed(2) + '</TotalAmount>\n';
        xml += '          </TaxAmount>\n';
        xml += '        </Tax>\n';
        xml += '      </TaxesOutputs>\n';

        xml += '      <InvoiceTotals>\n';
        xml += '        <TotalGrossAmount>' + totals.subtotal.toFixed(2) + '</TotalGrossAmount>\n';
        xml += '        <TotalGeneralDiscounts>0.00</TotalGeneralDiscounts>\n';
        xml += '        <TotalGeneralSurcharges>0.00</TotalGeneralSurcharges>\n';
        xml += '        <TotalGrossAmountBeforeTaxes>' + totals.subtotal.toFixed(2) + '</TotalGrossAmountBeforeTaxes>\n';
        xml += '        <TotalTaxOutputs>' + totals.tax.toFixed(2) + '</TotalTaxOutputs>\n';
        xml += '        <TotalTaxesWithheld>0.00</TotalTaxesWithheld>\n';
        xml += '        <InvoiceTotal>' + totals.total.toFixed(2) + '</InvoiceTotal>\n';
        xml += '        <TotalOutstandingAmount>' + totals.total.toFixed(2) + '</TotalOutstandingAmount>\n';
        xml += '        <TotalExecutableAmount>' + totals.total.toFixed(2) + '</TotalExecutableAmount>\n';
        xml += '      </InvoiceTotals>\n';

        xml += '      <Items>\n';
        lines.forEach((l, idx) => {
            const lineBase = (Number(l.line_subtotal) || ((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))) || 0;
            const lineTax = (Number(l.line_tax) || 0);
            xml += '        <InvoiceLine>\n';
            xml += '          <ItemDescription>' + xmlEscape(l.description || '') + '</ItemDescription>\n';
            xml += '          <Quantity>' + (Number(l.quantity) || 0) + '</Quantity>\n';
            xml += '          <UnitOfMeasure>01</UnitOfMeasure>\n';
            xml += '          <UnitPriceWithoutTax>' + (Number(l.unit_price) || 0).toFixed(6) + '</UnitPriceWithoutTax>\n';
            xml += '          <TotalCost>' + lineBase.toFixed(6) + '</TotalCost>\n';
            xml += '          <GrossAmount>' + lineBase.toFixed(6) + '</GrossAmount>\n';
            xml += '          <TaxesOutputs>\n';
            xml += '            <Tax>\n';
            xml += '              <TaxTypeCode>01</TaxTypeCode>\n';
            xml += '              <TaxRate>' + Number(l.tax_percent || taxRate).toFixed(2) + '</TaxRate>\n';
            xml += '              <TaxableBase>\n';
            xml += '                <TotalAmount>' + lineBase.toFixed(2) + '</TotalAmount>\n';
            xml += '              </TaxableBase>\n';
            xml += '              <TaxAmount>\n';
            xml += '                <TotalAmount>' + lineTax.toFixed(2) + '</TotalAmount>\n';
            xml += '              </TaxAmount>\n';
            xml += '            </Tax>\n';
            xml += '          </TaxesOutputs>\n';
            if (payload.notes && payload.notes.length > 0) {
                // opcional: dejar AdditionalLineItemInformation vacío o repetir descripción según necesidad
            }
            xml += '        </InvoiceLine>\n';
        });
        xml += '      </Items>\n';

        xml += '      <PaymentDetails>\n';
        xml += '        <Installment>\n';
        xml += '          <InstallmentDueDate>' + xmlEscape(issueDate) + '</InstallmentDueDate>\n';
        xml += '          <InstallmentAmount>' + totals.total.toFixed(2) + '</InstallmentAmount>\n';
        xml += '          <PaymentMeans>04</PaymentMeans>\n';
        xml += '        </Installment>\n';
        xml += '      </PaymentDetails>\n';

        if (payload.notes) {
            xml += '      <AdditionalData>\n';
            xml += '        <InvoiceAdditionalInformation>' + xmlEscape(payload.notes) + '</InvoiceAdditionalInformation>\n';
            xml += '      </AdditionalData>\n';
        }

        xml += '    </Invoice>\n';
        xml += '  </Invoices>\n';
        xml += '</fe:Facturae>\n';
        return xml;
    }

    window.updateItem = (id, f, v) => { 
        const i = items.find(x => String(x.id) === String(id)); 
        if (i) { 
            if (f === 'description') i[f] = v;
            else if (f === 'image_url') i[f] = v || null;
            else i[f] = parseFloat(v) || 0; 
            updatePreview(); 
        } 
    };
    window.removeItem = (id) => { 
        if (items.length <= 1) {
            showToast('Debe haber al menos un artículo', 'error');
            return;
        }
        if (confirm('¿Eliminar este artículo?')) {
            items = items.filter(x => x.id !== id); 
            renderItems(); 
            updatePreview(); 
        }
    };
    addItemBtn.addEventListener('click', () => { 
        items.push({ id: Date.now(), description: '', quantity: 1, price: 0, tax: companyData.defaultTax }); 
        renderItems(); 
        // Enfocar el nuevo campo de descripción
        setTimeout(() => {
            const newItem = itemsContainer.querySelector('.item-row:last-child input[type="text"]');
            if (newItem) newItem.focus();
        }, 100);
    });

    const itemImageUploadInput = document.getElementById('item-image-upload');
    itemsContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.item-image-remove');
        if (removeBtn) {
            e.preventDefault();
            e.stopPropagation();
            const id = removeBtn.getAttribute('data-item-id');
            if (id != null) {
                updateItem(Number(id) || id, 'image_url', null);
                renderItems();
                updatePreview();
                showToast('Foto quitada', 'success');
            }
            return;
        }
        const wrap = e.target.closest('.item-image-wrap');
        if (!wrap) return;
        e.preventDefault();
        const id = wrap.getAttribute('data-item-id');
        if (id == null) return;
        window._pendingItemImageId = id;
        if (itemImageUploadInput) itemImageUploadInput.click();
    });
    if (itemImageUploadInput) {
        itemImageUploadInput.addEventListener('change', async function() {
            const itemId = window._pendingItemImageId;
            window._pendingItemImageId = null;
            this.value = '';
            if (itemId == null) return;
            const file = this.files && this.files[0];
            if (!file) return;
            try {
                showToast('Subiendo imagen...', 'info');
                const fd = new FormData();
                fd.append('image', file);
                const res = await fetch(`${getApiEndpoint()}?action=upload_item_image&t=${Date.now()}`, {
                    method: 'POST',
                    body: fd,
                    credentials: 'same-origin'
                });
                const text = await res.text();
                let result;
                try {
                    result = JSON.parse(text);
                } catch (parseErr) {
                    console.error('Respuesta upload_item_image no es JSON:', text.slice(0, 200));
                    showToast('Error en la respuesta del servidor', 'error');
                    return;
                }
                if (result.status === 'success' && result.url) {
                    const urlWithCache = result.url + (result.url.indexOf('?') === -1 ? '?t=' + Date.now() : '');
                    updateItem(Number(itemId) || itemId, 'image_url', urlWithCache);
                    renderItems();
                    updatePreview();
                    showToast('Foto añadida', 'success');
                } else {
                    showToast(result.message || 'Error al subir la imagen', 'error');
                }
            } catch (err) {
                console.error('Error subiendo imagen:', err);
                showToast('Error al subir la imagen: ' + (err.message || ''), 'error');
            }
        });
    }

    // --- NAVEGACION ---
    window._documentTemplates = [];
    async function loadEditorTemplates() {
        const sel = document.getElementById('editor-document-template');
        if (!sel) return;
        try {
            const list = await apiFetch('get_document_templates');
            window._documentTemplates = Array.isArray(list) ? list : [];
            const isInvoice = currentDocumentIsInvoice || (currentQuoteId && String(currentQuoteId).startsWith('FAC-'));
            const type = isInvoice ? 'invoice' : 'quote';
            sel.innerHTML = '<option value="">Ninguna</option>';
            window._documentTemplates.filter(t => (t.type || 'quote') === type).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name || ('Plantilla ' + t.id);
                sel.appendChild(opt);
            });
            sel.value = '';
        } catch (e) {
            sel.innerHTML = '<option value="">Ninguna</option>';
        }
    }
    document.getElementById('editor-document-template')?.addEventListener('change', function () {
        const id = this.value;
        if (!id || !window._documentTemplates) return;
        const t = window._documentTemplates.find(x => String(x.id) === String(id));
        if (!t) return;
        let arr = [];
        try {
            arr = JSON.parse(t.items_json || '[]');
        } catch (e) { arr = []; }
        const defaultTax = (companyData && companyData.defaultTax) || 21;
        items = arr.map((it, i) => ({
            id: Date.now() + i,
            description: it.description || '',
            image_url: it.image_url || null,
            quantity: parseFloat(it.quantity) || 1,
            price: parseFloat(it.price) || 0,
            tax: parseFloat(it.tax) || defaultTax
        }));
        if (items.length === 0) items = [{ id: Date.now(), description: 'Nuevo Servicio', quantity: 1, price: 0, tax: defaultTax }];
        if (quoteNotesInput) quoteNotesInput.value = t.notes || '';
        renderItems();
        updatePreview();
        showToast('Plantilla aplicada', 'success');
    });

    function switchSection(id, btn) {
        sections.forEach(s => s.classList.add('hidden'));
        const target = document.getElementById(id);
        if (target) target.classList.remove('hidden');
        if (id === 'section-editor') loadEditorTemplates();

        // Sincronizar botones de escritorio
        navButtons.forEach(b => b.classList.remove('active'));
        if (btn && btn.classList.contains('nav-item')) btn.classList.add('active');

        // Sincronizar botones móviles
        const mobileBtns = document.querySelectorAll('.mobile-nav-item');
        const sectionToLabel = {
            'section-dashboard': 'inicio',
            'section-editor': 'editor',
            'section-history': 'historial',
            'section-invoices': 'facturas',
            'section-projects': 'proyectos',
            'section-activities': 'actividades / tareas',
            'section-contracts': 'contratos',
            'section-appointments': 'citas',
            'section-meetings': 'reuniones',
            'section-meetings': 'reuniones',
            'section-calendar': 'calendario',
            'section-catalog': 'catálogo',
            'section-expenses': 'gastos',
            'section-remittances': 'remesas',
            'section-tpv': 'tpv',
            'section-tickets': 'tickets',
            'section-receipts': 'recibos',
            'section-leads': 'leads',
            'section-settings': 'config'
        };

        mobileBtns.forEach(b => {
            if (b.classList.contains('mobile-nav-more')) return;
            b.classList.remove('active');
            const span = b.querySelector('span');
            const label = span ? span.textContent.toLowerCase() : '';
            if (sectionToLabel[id] === label) b.classList.add('active');
        });

        const prev = document.getElementById('quote-preview-container');
        const layout = document.querySelector('.editor-layout');
        if (prev) {
            if (id === 'section-editor') prev.classList.remove('hidden');
            else prev.classList.add('hidden');
        }
        if (layout) {
            if (id === 'section-editor') {
                layout.style.display = 'grid';
                layout.classList.remove('dashboard-active');
            } else {
                layout.style.display = 'block';
                if (id === 'section-dashboard' && currentUser && currentUser.role === 'admin') layout.classList.add('dashboard-active');
                else layout.classList.remove('dashboard-active');
            }
        }

        // Sincronizar acciones flotantes móviles
        const mActions = document.getElementById('mobile-editor-actions');
        if (mActions) {
            mActions.classList.toggle('hidden', id !== 'section-editor');
        }

        // Cerrar sidebar en móvil tras click
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        }
    }

    // Hamburger: abrir/cerrar sidebar en móvil
    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (btnSidebarToggle && sidebar) {
        btnSidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            document.body.classList.toggle('sidebar-open', sidebar.classList.contains('active'));
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        });
    }

    // Flecha para contraer/expandir sidebar en escritorio
    const sidebarCollapseToggle = document.getElementById('sidebar-collapse-toggle');
    if (sidebarCollapseToggle && sidebar) {
        sidebarCollapseToggle.addEventListener('click', () => {
            const collapsed = document.body.classList.toggle('sidebar-collapsed');
            // Al contraer, asegurarnos de cerrar el modo móvil
            if (collapsed) {
                sidebar.classList.remove('active');
                document.body.classList.remove('sidebar-open');
            }
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                const icon = sidebarCollapseToggle.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', collapsed ? 'chevron-right' : 'chevron-left');
                    lucide.createIcons();
                }
            }
        });
    }

    window.ensureEditorProjectsLoaded = async function() {
        const sel = document.getElementById('editor-project-id');
        if (!sel) return;
        const currentVal = sel.value || '';
        try {
            const list = await apiFetch('get_projects') || [];
            const projects = Array.isArray(list) ? list : (list.projects || list.items || []);
            sel.innerHTML = '<option value="">— Sin proyecto —</option>';
            projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = (p.name || 'Proyecto ' + p.id).replace(/</g, '&lt;');
                sel.appendChild(opt);
            });
            if (currentVal && projects.some(p => String(p.id) === String(currentVal))) sel.value = currentVal;
        } catch (e) { }
    };

    // Panel "Más" del menú móvil
    const mobileNavMoreBtn = document.getElementById('mobile-nav-btn-more');
    const mobileNavMorePanel = document.getElementById('mobile-nav-more-panel');
    const mobileNavMoreOverlay = document.getElementById('mobile-nav-more-overlay');
    const mobileNavMoreClose = document.getElementById('mobile-nav-more-close');
    function closeMobileNavMore() {
        if (mobileNavMorePanel) mobileNavMorePanel.classList.add('hidden');
        if (mobileNavMoreOverlay) mobileNavMoreOverlay.classList.add('hidden');
        if (mobileNavMorePanel) mobileNavMorePanel.setAttribute('aria-hidden', 'true');
        if (mobileNavMoreOverlay) mobileNavMoreOverlay.setAttribute('aria-hidden', 'true');
    }
    function openMobileNavMore() {
        if (mobileNavMorePanel) { mobileNavMorePanel.classList.remove('hidden'); mobileNavMorePanel.setAttribute('aria-hidden', 'false'); }
        if (mobileNavMoreOverlay) { mobileNavMoreOverlay.classList.remove('hidden'); mobileNavMoreOverlay.setAttribute('aria-hidden', 'false'); }
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
    if (mobileNavMoreBtn) mobileNavMoreBtn.addEventListener('click', openMobileNavMore);
    if (mobileNavMoreClose) mobileNavMoreClose.addEventListener('click', closeMobileNavMore);
    if (mobileNavMoreOverlay) mobileNavMoreOverlay.addEventListener('click', closeMobileNavMore);

    navDashboard.addEventListener('click', () => { loadDashboard(); switchSection('section-dashboard', navDashboard); });
    navEditor.addEventListener('click', () => switchSection('section-editor', navEditor));

    navAppointments.addEventListener('click', () => {
        loadAppointments();
        switchSection('section-appointments', navAppointments);
    });
    if (navMeetings) {
        navMeetings.addEventListener('click', () => {
            loadMeetings();
            switchSection('section-meetings', navMeetings);
        });
    }

    window._calendarViewData = { year: new Date().getFullYear(), month: new Date().getMonth(), appointments: [], invoices: [] };
    async function loadCalendarView() {
        const grid = document.getElementById('calendar-view-grid');
        const titleEl = document.getElementById('calendar-view-month-title');
        const detailPlace = document.getElementById('calendar-view-day-placeholder');
        const detailEvents = document.getElementById('calendar-view-day-events');
        if (!grid || !titleEl) return;
        const d = window._calendarViewData;
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        titleEl.textContent = `${monthNames[d.month]} ${d.year}`;
        try {
            const [appts, invData] = await Promise.all([
                apiFetch('get_appointments'),
                apiFetch('get_invoices?limit=500&offset=0')
            ]);
            const apptList = Array.isArray(appts) ? appts : [];
            const invList = (invData && invData.items) ? invData.items : [];
            d.appointments = apptList;
            d.invoices = invList.filter(i => (i.status || '').toLowerCase() === 'pending');
        } catch (e) {
            d.appointments = [];
            d.invoices = [];
        }
        const firstDay = new Date(d.year, d.month, 1);
        const lastDay = new Date(d.year, d.month + 1, 0);
        const startPad = (firstDay.getDay() + 6) % 7;
        const daysInMonth = lastDay.getDate();
        const totalCells = startPad + daysInMonth;
        const rows = Math.ceil(totalCells / 7);
        const dayLabels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
        let html = dayLabels.map(l => `<div class="calendar-view-weekday">${l}</div>`).join('');
        for (let i = 0; i < rows * 7; i++) {
            if (i < startPad) {
                html += '<div class="calendar-view-day-cell calendar-view-empty"></div>';
                continue;
            }
            const dayNum = i - startPad + 1;
            if (dayNum > daysInMonth) {
                html += '<div class="calendar-view-day-cell calendar-view-empty"></div>';
                continue;
            }
            const dateStr = `${d.year}-${String(d.month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
            const dayStart = dateStr + 'T00:00:00';
            const dayEnd = dateStr + 'T23:59:59';
            const apptsOnDay = d.appointments.filter(a => {
                const ad = (a.date || '').replace(' ', 'T').substring(0, 10);
                return ad === dateStr;
            });
            const invsOnDay = d.invoices.filter(inv => {
                const id = (inv.date || '').toString().substring(0, 10);
                return id === dateStr;
            });
            const count = apptsOnDay.length + invsOnDay.length;
            const isToday = new Date().toISOString().substring(0, 10) === dateStr;
            const classes = ['calendar-view-day-cell'];
            if (isToday) classes.push('calendar-view-day-today');
            if (apptsOnDay.length) classes.push('has-appointments');
            if (invsOnDay.length) classes.push('has-invoices');
            const badges = count
                ? `<div class="calendar-view-day-badges">${apptsOnDay.length ? '📅 ' + apptsOnDay.length : ''}${(apptsOnDay.length && invsOnDay.length) ? ' · ' : ''}${invsOnDay.length ? '📄 ' + invsOnDay.length : ''}</div>`
                : '';
            html += `<div class="${classes.join(' ')}" data-date="${dateStr}">
                <div class="calendar-view-day-number">${dayNum}</div>
                ${badges}
            </div>`;
        }
        grid.innerHTML = html;
        grid.querySelectorAll('.calendar-view-day-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const dateStr = cell.dataset.date;
                detailPlace.style.display = 'none';
                detailEvents.style.display = 'block';
                const apptsOnDay = d.appointments.filter(a => ((a.date || '').replace(' ', 'T').substring(0, 10)) === dateStr);
                const invsOnDay = d.invoices.filter(inv => (inv.date || '').toString().substring(0, 10) === dateStr);
                let listHtml = '';
                apptsOnDay.forEach(a => {
                    const time = (a.date || '').substring(11, 16) || '';
                    listHtml += `<div class="history-item" style="cursor:pointer;" onclick="document.getElementById('nav-appointments').click();"><div style="flex:1"><strong>📅 ${(a.client_name || 'Cita').replace(/</g,'&lt;')}</strong><br><small>${time}</small></div></div>`;
                });
                invsOnDay.forEach(inv => {
                    listHtml += `<div class="history-item" style="cursor:pointer;" onclick="loadInvoice('${(inv.id||'').replace(/'/g,"\\'")}');"><div style="flex:1"><strong>📄 ${(inv.client_name || 'Sin nombre').replace(/</g,'&lt;')}</strong><br><small>${inv.id} · ${formatCurrency(inv.total_amount||0)}</small></div></div>`;
                });
                if (!listHtml) listHtml = '<p style="color:var(--text-muted);margin:0;">Nada este día.</p>';
                detailEvents.innerHTML = listHtml;
            });
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    document.getElementById('calendar-view-prev')?.addEventListener('click', () => {
        const d = window._calendarViewData;
        d.month--; if (d.month < 0) { d.month = 11; d.year--; }
        loadCalendarView();
    });
    document.getElementById('calendar-view-next')?.addEventListener('click', () => {
        const d = window._calendarViewData;
        d.month++; if (d.month > 11) { d.month = 0; d.year++; }
        loadCalendarView();
    });
    document.getElementById('calendar-view-today')?.addEventListener('click', () => {
        const t = new Date();
        window._calendarViewData.year = t.getFullYear();
        window._calendarViewData.month = t.getMonth();
        loadCalendarView();
    });
    if (navCalendar) {
        navCalendar.addEventListener('click', () => {
            switchSection('section-calendar', navCalendar);
            loadCalendarView();
        });
    }

    navCustomers.addEventListener('click', () => {
        loadCustomers();
        loadCustomersBirthdays();
        switchSection('section-customers', navCustomers);
    });
    navCatalog.addEventListener('click', async () => {
        try {
            // Intentar usar caché primero
            let data = getCachedData('catalog');
            
            if (!data) {
                data = await apiFetch('get_catalog');
                setCachedData('catalog', data);
            }
            
            renderCatalogList(data);
            const catalogSearchEl = document.getElementById('catalog-search');
            if (catalogSearchEl) catalogSearchEl.value = '';
            switchSection('section-catalog', navCatalog);
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            showToast('Error al cargar catálogo', 'error');
        }
    });

    navSettings.addEventListener('click', async () => {
        await loadSettings();
        switchSection('section-settings', navSettings);
        // Asegurar que la pestaña Avisos y otros elementos admin se muestren si el usuario es admin (por si no se aplicó al cargar)
        if (currentUser && currentUser.role === 'admin') document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    });

    function renderCatalogList(data) {
        if (!catalogList) return;
        renderList(
            catalogList,
            data,
            (i) => `
                <div class="history-item">
                    ${i.image_url ? `<img src="${i.image_url}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;margin-right:10px" loading="lazy" onerror="this.style.display='none'">` : ''}
                    <div style="flex:1">
                        <strong>${(i.description || '').replace(/</g, '&lt;')}</strong>
                        <br>
                        <small>${formatCurrency(i.price)} + ${i.tax}%</small>
                        ${typeof i.stock_qty !== 'undefined' ? `
                            <br>
                            <span style="font-size:12px;color:${(i.stock_qty !== null && i.stock_min !== null && i.stock_qty <= i.stock_min) ? 'var(--danger)' : 'var(--text-muted)'};">
                                Stock: ${i.stock_qty ?? 0}${(i.stock_min && i.stock_min > 0) ? ` (mín. ${i.stock_min})` : ''}
                            </span>
                        ` : ''}
                    </div>
                    <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="addFromCatalog(${i.id})">Añadir</button>
                        <button class="btn btn-secondary btn-sm" onclick="editCatalogItem(${i.id})" title="Editar"><i data-lucide="edit-3" style="width:14px;height:14px;"></i> Editar</button>
                        <button class="btn btn-remove btn-sm" onclick="deleteCatalogItem(${i.id})" title="Eliminar"><i data-lucide="trash-2" style="width:14px;height:14px;"></i> Borrar</button>
                    </div>
                </div>
            `,
            'No hay artículos en el catálogo'
        );
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    (function initCatalogSearch() {
        const el = document.getElementById('catalog-search');
        if (!el) return;
        el.addEventListener('input', () => {
            const q = (el.value || '').trim().toLowerCase();
            let data = getCachedData('catalog');
            if (!data || !Array.isArray(data)) return;
            const filtered = q ? data.filter(i => (String(i.description || '').toLowerCase().includes(q))) : data;
            renderCatalogList(filtered);
        });
    })();

    window.addFromCatalog = async (id) => {
        try {
            let data = getCachedData('catalog');
            if (!data) {
                data = await apiFetch('get_catalog');
                setCachedData('catalog', data);
            }
            const item = data.find(x => x.id == id);
            if (item) {
                if (items.length === 1 && items[0].price === 0) items = [];
                items.push({
                    id: Date.now(),
                    description: item.description,
                    image_url: item.image_url,
                    quantity: 1,
                    price: parseFloat(item.price),
                    tax: parseFloat(item.tax),
                    catalog_item_id: item.id ? parseInt(item.id, 10) : null
                });
                renderItems(); updatePreview(); switchSection('section-editor', navEditor);
            }
        } catch (e) { 
            console.error('Error añadiendo del catálogo:', e);
        }
    };

    window.editCatalogItem = function(id) {
        let data = getCachedData('catalog');
        if (!data) return;
        const item = data.find(x => x.id == id);
        if (!item) return;
        const descEl = document.getElementById('catalog-desc');
        const longEl = document.getElementById('catalog-long-desc');
        const priceEl = document.getElementById('catalog-price');
        const taxEl = document.getElementById('catalog-tax');
        const stockEl = document.getElementById('catalog-stock');
        const stockMinEl = document.getElementById('catalog-stock-min');
        const editIdEl = document.getElementById('catalog-edit-id');
        const btnEl = document.getElementById('btn-add-catalog');
        if (descEl) descEl.value = item.description || '';
        if (longEl) longEl.value = item.long_description || '';
        if (priceEl) priceEl.value = item.price != null ? item.price : '';
        if (taxEl) taxEl.value = item.tax != null ? item.tax : 21;
        if (stockEl) stockEl.value = item.stock_qty != null ? item.stock_qty : '';
        if (stockMinEl) stockMinEl.value = item.stock_min != null ? item.stock_min : '';
        if (editIdEl) editIdEl.value = id;
        if (btnEl) btnEl.textContent = 'Actualizar artículo';
        document.getElementById('catalog-image').value = '';
        switchSection('section-catalog', navCatalog);
        if (descEl) descEl.focus();
    };

    window.deleteCatalogItem = async function(id) {
        if (!confirm('¿Eliminar este artículo del catálogo?')) return;
        try {
            const fd = new FormData();
            fd.append('id', id);
            await apiFetch('delete_catalog_item', { method: 'POST', body: fd });
            showToast('Artículo eliminado del catálogo', 'success');
            invalidateCache('catalog');
            const editIdEl = document.getElementById('catalog-edit-id');
            if (editIdEl && editIdEl.value == id) {
                editIdEl.value = '';
                document.getElementById('catalog-desc').value = '';
                document.getElementById('catalog-long-desc').value = '';
                document.getElementById('catalog-price').value = '';
                document.getElementById('catalog-tax').value = '21';
                document.getElementById('catalog-image').value = '';
                const btnEl = document.getElementById('btn-add-catalog');
                if (btnEl) btnEl.textContent = 'Guardar en Catálogo';
            }
            const data = await apiFetch('get_catalog');
            setCachedData('catalog', data);
            renderCatalogList(data);
        } catch (e) {
            showToast(e?.message || 'Error al eliminar', 'error');
        }
    };

    document.getElementById('btn-add-catalog').addEventListener('click', async () => {
        const desc = document.getElementById('catalog-desc').value;
        const longDesc = document.getElementById('catalog-long-desc').value;
        const price = document.getElementById('catalog-price').value;
        const tax = document.getElementById('catalog-tax').value;
        const stock = document.getElementById('catalog-stock') ? document.getElementById('catalog-stock').value : '';
        const stockMin = document.getElementById('catalog-stock-min') ? document.getElementById('catalog-stock-min').value : '';
        const imageFile = document.getElementById('catalog-image').files[0];

        if (!desc || !price) {
            showToast('Completa los campos obligatorios', 'error');
            return;
        }

        const fd = new FormData();
        fd.append('description', desc);
        fd.append('long_description', longDesc);
        fd.append('price', price);
        fd.append('tax', tax);
        if (stock !== '') fd.append('stock_qty', stock);
        if (stockMin !== '') fd.append('stock_min', stockMin);
        if (imageFile) fd.append('image', imageFile);

        const editIdEl = document.getElementById('catalog-edit-id');
        if (editIdEl && editIdEl.value) fd.append('id', editIdEl.value);
        try {
            await apiFetch('save_catalog_item', { method: 'POST', body: fd });
            showToast(editIdEl && editIdEl.value ? 'Artículo actualizado' : 'Artículo guardado en catálogo', 'success');
            document.getElementById('catalog-desc').value = '';
            document.getElementById('catalog-long-desc').value = '';
            document.getElementById('catalog-price').value = '';
            document.getElementById('catalog-tax').value = '21';
            if (document.getElementById('catalog-stock')) document.getElementById('catalog-stock').value = '';
            if (document.getElementById('catalog-stock-min')) document.getElementById('catalog-stock-min').value = '';
            document.getElementById('catalog-image').value = '';
            if (editIdEl) editIdEl.value = '';
            const btnEl = document.getElementById('btn-add-catalog');
            if (btnEl) btnEl.textContent = 'Guardar en Catálogo';
            invalidateCache('catalog');
            const data = await apiFetch('get_catalog');
            setCachedData('catalog', data);
            renderCatalogList(data);
        } catch (e) { showToast('Error al guardar en catálogo', 'error'); }
    });

    const HISTORY_PAGE_SIZE = 20;
    let historyCurrentPage = 0;
    let historyTotal = 0;

    navHistory.addEventListener('click', async () => {
        historyCurrentPage = 0;
        await loadHistoryPage(0);
    });

    async function loadHistoryPage(page) {
        let wasCached = false;
        try {
            if (page === 0) await ensureHistoryClientFilterFilled();
            let data = getCachedData('history');
            const isPaginated = data && typeof data === 'object' && 'items' in data;
            if (data && isPaginated && data.page === page) {
                wasCached = true;
            } else {
                data = null;
            }
            if (!data) {
                if (page === 0) showToast('Cargando historial...', 'info');
                const search = (document.getElementById('global-search') || {}).value?.trim() || '';
                const clientName = (document.getElementById('history-client-filter') && document.getElementById('history-client-filter').value) || '';
                const tagHistory = (document.getElementById('history-tag-filter') && document.getElementById('history-tag-filter').value) ? document.getElementById('history-tag-filter').value.trim() : '';
                const url = `get_history?limit=${HISTORY_PAGE_SIZE}&offset=${page * HISTORY_PAGE_SIZE}` + (search ? `&search=${encodeURIComponent(search)}` : '') + (clientName ? `&client_name=${encodeURIComponent(clientName)}` : '') + (tagHistory ? `&tag=${encodeURIComponent(tagHistory)}` : '');
                data = await apiFetch(url);
                if (data && typeof data === 'object' && Array.isArray(data.items)) {
                    data.page = page;
                    setCachedData('history', data);
                } else {
                    throw new Error('El servidor devolvió datos inválidos');
                }
            }
            const items = data.items || [];
            historyTotal = data.total ?? 0;
            historyCurrentPage = page;

            let itemsToRender = items;
            const historyFilterVal = historyStatusFilter ? historyStatusFilter.value : 'all';
            if (historyFilterVal !== 'all') itemsToRender = itemsToRender.filter(q => (q.status || 'draft').toLowerCase() === historyFilterVal);
            const historyDateFrom = historyDateFromInput?.value?.trim() || '';
            const historyDateTo = historyDateToInput?.value?.trim() || '';
            if (historyDateFrom || historyDateTo) {
                itemsToRender = itemsToRender.filter(q => {
                    const d = q.date ? new Date(q.date) : null;
                    if (!d) return true;
                    if (historyDateFrom && d < new Date(historyDateFrom + 'T00:00:00')) return false;
                    if (historyDateTo && d > new Date(historyDateTo + 'T23:59:59')) return false;
                    return true;
                });
            }

            const renderHistory = (itemList) => {
                if (historyViewMode === 'board') {
                    if (!historyList) return;
                    const historyCard = historyList.closest('.card');
                    if (historyCard) historyCard.classList.add('history-board-full-container');
                    const statusOrder = ['draft', 'sent', 'waiting_client', 'accepted', 'rejected'];
                    const statusLabels = {
                        draft: 'Borrador',
                        sent: 'Enviado',
                        waiting_client: 'En espera de cliente',
                        accepted: 'Aceptado',
                        rejected: 'Rechazado'
                    };
                    const columns = {};
                    statusOrder.forEach(s => { columns[s] = []; });
                    (itemList || []).forEach(q => {
                        const status = (q.status || 'draft').toLowerCase();
                        const key = statusOrder.includes(status) ? status : 'draft';
                        columns[key].push(q);
                    });
                    const statusColorStyles = (status) => {
                        return status === 'accepted'
                            ? 'background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.3);'
                            : status === 'sent'
                                ? 'background:rgba(59,130,246,0.1);color:#3b82f6;border-color:rgba(59,130,246,0.3);'
                                : status === 'waiting_client'
                                    ? 'background:rgba(245,158,11,0.1);color:#f59e0b;border-color:rgba(245,158,11,0.3);'
                                    : status === 'rejected'
                                        ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3);'
                                        : 'background:rgba(148,163,184,0.1);color:#94a3b8;border-color:rgba(148,163,184,0.3);';
                    };
                    const colHtml = statusOrder.map(statusKey => {
                        const colItems = columns[statusKey] || [];
                        const cards = colItems.length === 0
                            ? '<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0.25rem;">Sin presupuestos</div>'
                            : colItems.map(q => {
                                const userBadge = (q.username && currentUser && currentUser.role === 'admin')
                                    ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${q.username}</span>`
                                    : '';
                                const safeId = String(q.id).replace(/'/g, "\\'");
                                const dateStr = q.date ? new Date(q.date).toLocaleDateString('es-ES') : '';
                                const status = (q.status || 'draft').toLowerCase();
                                const statusLabel = statusLabels[status] || status || '—';
                                const statusColor = statusColorStyles(status);
                                let validBadge = '';
                                if (q.valid_until && String(q.valid_until).trim()) {
                                    const validDate = new Date(String(q.valid_until).substring(0, 10));
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    validDate.setHours(0, 0, 0, 0);
                                    if (validDate < today) {
                                        validBadge = '<span style="display:inline-block;margin-top:0.25rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.65rem;font-weight:600;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">Caducado</span>';
                                    } else {
                                        const daysLeft = Math.ceil((validDate - today) / (1000 * 60 * 60 * 24));
                                        if (daysLeft <= 7) {
                                            validBadge = '<span style="display:inline-block;margin-top:0.25rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.65rem;font-weight:600;background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);">Caduca en ' + daysLeft + ' día(s)</span>';
                                        }
                                    }
                                }
                                return `
                                    <div class="history-board-card" draggable="true" data-quote-id="${safeId}">
                                        <div class="history-board-card-main">
                                            <div class="history-board-card-title">
                                                ${(q.client_name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;')}${userBadge}
                                            </div>
                                            <div class="history-board-card-meta">
                                                ${safeId} • ${formatCurrency(q.total_amount || 0)}${dateStr ? ' • ' + dateStr : ''}
                                            </div>
                                            <div class="history-board-card-badges">
                                                <span style="display:inline-block;padding:0.15rem 0.6rem;border-radius:999px;font-size:0.7rem;font-weight:600;border:1px solid;${statusColor}">
                                                    ${statusLabel}
                                                </span>
                                                ${validBadge}
                                            </div>
                                        </div>
                                        <div class="history-board-card-actions">
                                            ${status !== 'accepted' ? `
                                            <button class="btn btn-accent btn-xs" onclick="markQuoteAccepted('${safeId}')" title="Marcar como aceptado">
                                                <i data-lucide="check-circle" style="width:12px;height:12px;"></i>
                                            </button>` : ''}
                                            <button class="btn btn-secondary btn-xs" onclick="loadQuote('${safeId}')" title="Editar">
                                                <i data-lucide="edit-3" style="width:12px;height:12px;"></i>
                                            </button>
                                            <button class="btn btn-accent btn-xs" onclick="duplicateQuote('${safeId}')" title="Duplicar">
                                                <i data-lucide="copy" style="width:12px;height:12px;"></i>
                                            </button>
                                            <button class="btn btn-remove btn-xs" onclick="deleteQuote('${safeId}')" title="Eliminar presupuesto">
                                                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        return `
                            <div class="history-board-column" data-status="${statusKey}">
                                <div class="history-board-column-header">
                                    <div class="history-board-column-title">
                                        ${statusLabels[statusKey]}
                                    </div>
                                    <span class="history-board-column-count">${colItems.length}</span>
                                </div>
                                <div class="history-board-column-body">
                                    ${cards}
                                </div>
                            </div>
                        `;
                    }).join('');
                    historyList.innerHTML = `
                        <div class="history-board history-board-full">
                            ${colHtml}
                        </div>
                    `;
                    // Drag & Drop para cambiar estado desde tablero
                    try {
                        const boardEl = historyList.querySelector('.history-board');
                        if (boardEl) {
                            const cols = Array.from(boardEl.querySelectorAll('.history-board-column'));
                            let dragSrc = null;
                            cols.forEach(col => {
                                const statusKey = col.getAttribute('data-status');
                                col.addEventListener('dragover', (e) => {
                                    e.preventDefault();
                                });
                                col.addEventListener('drop', async (e) => {
                                    e.preventDefault();
                                    const qid = e.dataTransfer?.getData('text/plain') || dragSrc?.getAttribute('data-quote-id');
                                    if (!qid || !statusKey) return;
                                    if (!['draft','sent','accepted','rejected'].includes(statusKey)) return;
                                    try {
                                        const fd = new FormData();
                                        fd.append('id', qid);
                                        fd.append('status', statusKey);
                                        await apiFetch('update_quote_status', { method: 'POST', body: fd });
                                        invalidateCache('history');
                                        loadHistoryPage(historyCurrentPage || 0);
                                        showToast('Estado actualizado', 'success');
                                    } catch (err) {
                                        console.error('Error al actualizar estado desde tablero:', err);
                                        showToast('No se pudo actualizar el estado', 'error');
                                    }
                                });
                            });
                            const cards = Array.from(boardEl.querySelectorAll('.history-board-card'));
                            cards.forEach(card => {
                                card.addEventListener('dragstart', (e) => {
                                    dragSrc = card;
                                    e.dataTransfer?.setData('text/plain', card.getAttribute('data-quote-id') || '');
                                    e.dataTransfer?.setDragImage(card, 50, 20);
                                });
                                card.addEventListener('dragend', () => {
                                    dragSrc = null;
                                });
                            });
                        }
                    } catch (e) {
                        console.error('Error inicializando drag & drop en historial:', e);
                    }
                    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                } else {
                    const historyCard = historyList && historyList.closest ? historyList.closest('.card') : null;
                    if (historyCard) historyCard.classList.remove('history-board-full-container');
                    renderList(
                        historyList,
                        itemList,
                        (q) => {
                        const userBadge = (q.username && currentUser && currentUser.role === 'admin') ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${q.username}</span>` : '';
                        // Escapar comillas para evitar errores en onclick
                        const safeId = String(q.id).replace(/'/g, "\\'");
                        const dateStr = q.date ? new Date(q.date).toLocaleDateString('es-ES') : '';
                        const status = (q.status || 'draft').toLowerCase();
                        const statusLabel =
                            status === 'draft' ? 'Borrador' :
                            status === 'sent' ? 'Enviado' :
                            status === 'waiting_client' ? 'En espera de cliente' :
                            status === 'accepted' ? 'Aceptado' :
                            status === 'rejected' ? 'Rechazado' : status;
                        const statusColor =
                            status === 'accepted'
                                ? 'background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.3);'
                                : status === 'sent'
                                    ? 'background:rgba(59,130,246,0.1);color:#3b82f6;border-color:rgba(59,130,246,0.3);'
                                    : status === 'waiting_client'
                                        ? 'background:rgba(245,158,11,0.1);color:#f59e0b;border-color:rgba(245,158,11,0.3);'
                                        : status === 'rejected'
                                            ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3);'
                                            : 'background:rgba(148,163,184,0.1);color:#94a3b8;border-color:rgba(148,163,184,0.3);';
                            let validBadge = '';
                            if (q.valid_until && String(q.valid_until).trim()) {
                                const validDate = new Date(String(q.valid_until).substring(0, 10));
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                validDate.setHours(0, 0, 0, 0);
                                if (validDate < today) {
                                    validBadge = '<span style="display:inline-block;margin-left:0.35rem;margin-top:0.25rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.65rem;font-weight:600;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">Caducado</span>';
                                } else {
                                    const daysLeft = Math.ceil((validDate - today) / (1000 * 60 * 60 * 24));
                                    if (daysLeft <= 7) {
                                        validBadge = '<span style="display:inline-block;margin-left:0.35rem;margin-top:0.25rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.65rem;font-weight:600;background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);">Caduca en ' + daysLeft + ' día(s)</span>';
                                    }
                                }
                            }
                            return `
                            <div class="history-item">
                                <div style="flex:1">
                                    <strong>${(q.client_name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong>${userBadge}
                                    <br>
                                    <small>${safeId} • ${formatCurrency(q.total_amount || 0)}${dateStr ? ' • ' + dateStr : ''}</small>
                                    <br>
                                    <span style="display:inline-block;margin-top:0.25rem;padding:0.1rem 0.6rem;border-radius:999px;font-size:0.7rem;font-weight:600;border:1px solid;${statusColor}">
                                        ${statusLabel}
                                    </span>${validBadge}
                                </div>
                                <div style="display:flex;gap:0.5rem;align-items:center;">
                                    ${status !== 'accepted' ? `
                                    <button class="btn btn-accent btn-sm" onclick="markQuoteAccepted('${safeId}')" title="Marcar como aceptado">
                                        <i data-lucide="check-circle" style="width:14px;height:14px;"></i>
                                        <span style="font-size:0.75rem;">Aceptar</span>
                                    </button>` : ''}
                                    <button class="btn btn-secondary btn-sm" onclick="loadQuote('${safeId}')" title="Editar">
                                        <i data-lucide="edit-3" style="width:14px;height:14px;"></i> Editar
                                    </button>
                                    <button class="btn btn-accent btn-sm" onclick="duplicateQuote('${safeId}')" title="Duplicar">
                                        <i data-lucide="copy" style="width:14px;height:14px;"></i> Duplicar
                                    </button>
                                    <button class="btn btn-remove btn-sm" onclick="deleteQuote('${safeId}')" title="Eliminar presupuesto">
                                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Eliminar
                                    </button>
                                </div>
                            </div>
                        `;
                        },
                        'No hay presupuestos registrados',
                        'Error al cargar historial. Intenta recargar la página.'
                    );
                }
            };

            historyList.dataset.source = 'history';
            renderHistory(itemsToRender);

            const historyPagination = document.getElementById('history-pagination');
            if (historyPagination) {
                const totalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));
                if (totalPages > 1 || historyTotal > HISTORY_PAGE_SIZE) {
                    historyPagination.classList.remove('hidden');
                    historyPagination.style.display = 'flex';
                    historyPagination.innerHTML = `
                        <span style="color: var(--text-muted); font-size: 0.9rem;">Página ${page + 1} de ${totalPages} (${historyTotal} en total)</span>
                        <div style="display: flex; gap: 0.5rem;">
                            <button type="button" class="btn btn-secondary btn-sm" id="history-prev" ${page === 0 ? 'disabled' : ''}>Anterior</button>
                            <button type="button" class="btn btn-secondary btn-sm" id="history-next" ${page >= totalPages - 1 ? 'disabled' : ''}>Siguiente</button>
                        </div>
                    `;
                    historyPagination.querySelector('#history-prev')?.addEventListener('click', () => loadHistoryPage(Math.max(0, page - 1)));
                    historyPagination.querySelector('#history-next')?.addEventListener('click', () => loadHistoryPage(Math.min(totalPages - 1, page + 1)));
                } else {
                    historyPagination.classList.add('hidden');
                }
            }

            if (!wasCached && page === 0) showToast('Historial cargado', 'success');
            switchSection('section-history', navHistory);
        } catch (e) { 
            console.error('Error cargando historial:', e);
            // Invalidar caché si hay error para forzar recarga
            invalidateCache('history');
            showToast('Error al cargar historial: ' + (e.message || 'Error desconocido'), 'error');
            if (historyList) {
                historyList.innerHTML = '<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:2rem;">Error al cargar historial. Intenta recargar la página.</div></div>';
            }
        }
    }

    function renderList(container, data, renderItem, emptyMessage, errorMessage) {
        if (!container) return;
        const errMsg = errorMessage || 'Error al cargar datos';
        const emptyMsg = emptyMessage || 'No hay datos';
        try {
            if (data == null) {
                container.innerHTML = `<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:2rem;">${escapeHtml(errMsg)}</div></div>`;
                return;
            }
            if (!Array.isArray(data)) {
                container.innerHTML = `<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:2rem;">${escapeHtml(errMsg)}</div></div>`;
                return;
            }
            if (data.length === 0) {
                container.innerHTML = `<div class="history-item"><div style="flex:1;text-align:center;color:var(--text-muted);padding:2rem;">${escapeHtml(emptyMsg)}</div></div>`;
                return;
            }
            
            // Renderizado optimizado usando DocumentFragment
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            
            try {
                const html = data.map((item, index) => {
                    try {
                        return renderItem(item, index);
                    } catch (e) {
                        console.error(`Error renderizando item ${index}:`, e, item);
                        return `<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:1rem;">Error renderizando item</div></div>`;
                    }
                }).join('');
                
                tempDiv.innerHTML = html;
                while (tempDiv.firstChild) {
                    fragment.appendChild(tempDiv.firstChild);
                }
                container.innerHTML = '';
                container.appendChild(fragment);
            } catch (renderError) {
                container.innerHTML = `<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:2rem;">${escapeHtml('Error al renderizar: ' + (renderError && renderError.message))}</div></div>`;
            }
        } catch (e) {
            container.innerHTML = `<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:2rem;">${escapeHtml(errMsg)}</div></div>`;
        }
    }

    const INVOICES_PAGE_SIZE = 20;
    let invoicesCurrentPage = 0;

    navInvoices.addEventListener('click', async () => {
        invoicesCurrentPage = 0;
        invalidateCache('invoices');
        await loadInvoicesPage(0);
    });

    navProjects.addEventListener('click', async () => {
        await loadProjectsPage();
    });

    navActivities.addEventListener('click', async () => {
        await loadActivitiesPage();
        switchSection('section-activities', navActivities);
    });

    navContracts.addEventListener('click', async () => {
        switchSection('section-contracts', navContracts);
        await loadContractsPage();
    });

    const historyDateFromInput = document.getElementById('history-date-from');
    const historyDateToInput = document.getElementById('history-date-to');
    const invoicesDateFromInput = document.getElementById('invoices-date-from');
    const invoicesDateToInput = document.getElementById('invoices-date-to');
    const invoicesRebuOnlyInput = document.getElementById('invoices-rebu-only');

    async function ensureHistoryClientFilterFilled() {
        const sel = document.getElementById('history-client-filter');
        if (!sel || sel.options.length > 1) return;
        try {
            const customers = await apiFetch('get_customers');
            const names = (customers || []).map(c => (c.name || '').trim()).filter(Boolean);
            const seen = new Set();
            names.forEach(n => { if (!seen.has(n)) { seen.add(n); const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); } });
        } catch (e) { console.error('Error rellenando filtro cliente historial:', e); }
    }
    async function ensureInvoicesClientFilterFilled() {
        const sel = document.getElementById('invoices-client-filter');
        if (!sel || sel.options.length > 1) return;
        try {
            const customers = await apiFetch('get_customers');
            const names = (customers || []).map(c => (c.name || '').trim()).filter(Boolean);
            const seen = new Set();
            names.forEach(n => { if (!seen.has(n)) { seen.add(n); const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); } });
        } catch (e) { console.error('Error rellenando filtro cliente facturas:', e); }
    }
    document.getElementById('history-client-filter')?.addEventListener('change', () => { invalidateCache('history'); loadHistoryPage(0); });
    document.getElementById('history-tag-filter')?.addEventListener('change', () => { invalidateCache('history'); loadHistoryPage(0); });
    document.getElementById('history-tag-filter')?.addEventListener('keyup', (e) => { if (e.key === 'Enter') { invalidateCache('history'); loadHistoryPage(0); } });
    document.getElementById('invoices-tag-filter')?.addEventListener('change', () => { invalidateCache('invoices'); loadInvoicesPage(0); });
    document.getElementById('invoices-tag-filter')?.addEventListener('keyup', (e) => { if (e.key === 'Enter') { invalidateCache('invoices'); loadInvoicesPage(0); } });
    document.getElementById('invoices-client-filter')?.addEventListener('change', () => { invalidateCache('invoices'); loadInvoicesPage(0); });
    historyStatusFilter?.addEventListener('change', () => { loadHistoryPage(historyCurrentPage); });
    historyDateFromInput?.addEventListener('change', () => { loadHistoryPage(historyCurrentPage); });
    historyDateToInput?.addEventListener('change', () => { loadHistoryPage(historyCurrentPage); });
    invoicesStatusFilter?.addEventListener('change', () => { loadInvoicesPage(invoicesCurrentPage); });
    invoicesDateFromInput?.addEventListener('change', () => { loadInvoicesPage(invoicesCurrentPage); });
    invoicesDateToInput?.addEventListener('change', () => { loadInvoicesPage(invoicesCurrentPage); });
    invoicesRebuOnlyInput?.addEventListener('change', () => { loadInvoicesPage(invoicesCurrentPage); });

    async function loadInvoicesPage(page) {
        try {
            if (page === 0) await ensureInvoicesClientFilterFilled();
            let data = getCachedData('invoices');
            const isPaginated = data && typeof data === 'object' && 'items' in data;
            if (data && isPaginated && data.page === page) {
                // usar caché
            } else {
                data = null;
            }
            if (!data) {
                if (page === 0) showToast('Cargando facturas...', 'info');
                const clientNameInv = (document.getElementById('invoices-client-filter') && document.getElementById('invoices-client-filter').value) || '';
                const tagInv = (document.getElementById('invoices-tag-filter') && document.getElementById('invoices-tag-filter').value) ? document.getElementById('invoices-tag-filter').value.trim() : '';
                const url = `get_invoices?limit=${INVOICES_PAGE_SIZE}&offset=${page * INVOICES_PAGE_SIZE}` + (clientNameInv ? `&client_name=${encodeURIComponent(clientNameInv)}` : '') + (tagInv ? `&tag=${encodeURIComponent(tagInv)}` : '');
                data = await apiFetch(url);
                if (data && data.status === 'error') {
                    showToast(data.message || 'Error al cargar facturas', 'error');
                    invoicesList.innerHTML = '<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:2rem;">' + (data.message || 'Error al cargar facturas') + '</div></div>';
                    switchSection('section-invoices', navInvoices);
                    return;
                }
                data.page = page;
                setCachedData('invoices', data);
            }
            const items = Array.isArray(data.items) ? data.items : [];
            const totalInvoices = data.total ?? 0;
            const filterVal = invoicesStatusFilter ? invoicesStatusFilter.value : 'all';
            let itemsToRender = items;
            if (filterVal === 'recurring') {
                itemsToRender = items.filter(i => i.is_recurring === 1 || i.is_recurring === '1' || i.is_recurring === true);
            } else if (filterVal !== 'all') {
                itemsToRender = items.filter(i => (i.status || '').toLowerCase() === filterVal);
            }
            if (invoicesRebuOnlyInput && invoicesRebuOnlyInput.checked) {
                itemsToRender = itemsToRender.filter(i => i.is_rebu === 1 || i.is_rebu === '1' || i.is_rebu === true);
            }
            const invDateFrom = invoicesDateFromInput?.value?.trim() || '';
            const invDateTo = invoicesDateToInput?.value?.trim() || '';
            if (invDateFrom || invDateTo) {
                itemsToRender = itemsToRender.filter(i => {
                    const d = i.date ? new Date(i.date) : null;
                    if (!d) return true;
                    if (invDateFrom && d < new Date(invDateFrom + 'T00:00:00')) return false;
                    if (invDateTo && d > new Date(invDateTo + 'T23:59:59')) return false;
                    return true;
                });
            }

            const renderInvoices = (itemList) => {
                if (invoicesViewMode === 'board') {
                    if (!invoicesList) return;
                    const invoicesCard = invoicesList.closest('.card');
                    if (invoicesCard) invoicesCard.classList.add('history-board-full-container');

                    const statusOrder = ['pending', 'paid', 'cancelled'];
                    const statusLabels = {
                        pending: 'Pendiente',
                        paid: 'Pagada',
                        cancelled: 'Anulada'
                    };
                    const columns = {};
                    statusOrder.forEach(s => { columns[s] = []; });
                    (itemList || []).forEach(i => {
                        const status = (i.status || 'pending').toLowerCase();
                        const key = statusOrder.includes(status) ? status : 'pending';
                        columns[key].push(i);
                    });
                    const statusColorStyles = (status) => {
                        return status === 'paid'
                            ? 'background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.3);'
                            : status === 'pending'
                                ? 'background:rgba(245,158,11,0.1);color:#f59e0b;border-color:rgba(245,158,11,0.3);'
                                : status === 'cancelled'
                                    ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3);'
                                    : 'background:rgba(148,163,184,0.1);color:#94a3b8;border-color:rgba(148,163,184,0.3);';
                    };
                    const colHtml = statusOrder.map(statusKey => {
                        const colItems = columns[statusKey] || [];
                        const cards = colItems.length === 0
                            ? '<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0.25rem;">Sin facturas</div>'
                            : colItems.map(i => {
                                const userBadge = (i.username && currentUser && currentUser.role === 'admin')
                                    ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${i.username}</span>`
                                    : '';
                                const safeInvoiceId = String(i.id).replace(/'/g, "\\'");
                                const dateStr = i.date ? new Date(i.date).toLocaleDateString('es-ES') : '';
                                const status = (i.status || '').toLowerCase();
                                const statusLabel = statusLabels[status] || status || '—';
                                const statusColor = statusColorStyles(status);
                                const isRecurring = i.is_recurring === 1 || i.is_recurring === '1' || i.is_recurring === true;
                                const isRebu = i.is_rebu === 1 || i.is_rebu === '1' || i.is_rebu === true;
                                const nextDateStr = (i.next_date && isRecurring) ? new Date(i.next_date).toLocaleDateString('es-ES') : '';
                                const recurringBadge = isRecurring
                                    ? `<span style="display:inline-block;margin-left:0.5rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.7rem;background:rgba(59,130,246,0.08);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);">
                                            Recurrente${nextDateStr ? ' · Próx. ' + nextDateStr : ''}
                                       </span>`
                                    : '';
                                const rebuBadge = isRebu
                                    ? `<span style="display:inline-block;margin-left:0.5rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.7rem;background:rgba(245,158,11,0.08);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);">
                                            REBU
                                       </span>`
                                    : '';
                                return `
                                    <div class="history-board-card" draggable="true" data-invoice-id="${safeInvoiceId}">
                                        <div class="history-board-card-main">
                                            <div class="history-board-card-title">
                                                ${(i.client_name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;')}${userBadge}${recurringBadge}${rebuBadge}
                                            </div>
                                            <div class="history-board-card-meta">
                                                ${safeInvoiceId} • ${formatCurrency(i.total_amount || 0)}${dateStr ? ' • ' + dateStr : ''}
                                            </div>
                                            <div class="history-board-card-badges">
                                                <span style="display:inline-block;padding:0.15rem 0.6rem;border-radius:999px;font-size:0.7rem;font-weight:600;border:1px solid;${statusColor}">
                                                    ${statusLabel}
                                                </span>
                                            </div>
                                        </div>
                                        <div class="history-board-card-actions">
                                            ${status !== 'paid' ? `
                                            <button class="btn btn-accent btn-xs" onclick="markInvoicePaid('${safeInvoiceId}')" title="Marcar como pagada">
                                                <i data-lucide="check-circle" style="width:12px;height:12px;"></i>
                                            </button>` : ''}
                                            <button class="btn btn-secondary btn-xs" onclick="openInvoiceRecurring('${safeInvoiceId}')" title="Configurar o editar recurrencia">
                                                <i data-lucide="repeat" style="width:12px;height:12px;"></i>
                                            </button>
                                            <button class="btn btn-secondary btn-xs" onclick="loadInvoice('${safeInvoiceId}')" title="Editar">
                                                <i data-lucide="edit-3" style="width:12px;height:12px;"></i>
                                            </button>
                                            <button class="btn btn-accent btn-xs" onclick="duplicateInvoice('${safeInvoiceId}')" title="Duplicar">
                                                <i data-lucide="copy" style="width:12px;height:12px;"></i>
                                            </button>
                                            <button class="btn btn-remove btn-xs" onclick="deleteInvoice('${safeInvoiceId}')" title="Eliminar factura">
                                                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        return `
                            <div class="history-board-column" data-status="${statusKey}">
                                <div class="history-board-column-header">
                                    <div class="history-board-column-title">
                                        ${statusLabels[statusKey]}
                                    </div>
                                    <span class="history-board-column-count">${colItems.length}</span>
                                </div>
                                <div class="history-board-column-body">
                                    ${cards}
                                </div>
                            </div>
                        `;
                    }).join('');
                    invoicesList.innerHTML = `
                        <div class="history-board history-board-full">
                            ${colHtml}
                        </div>
                    `;
                    try {
                        const boardEl = invoicesList.querySelector('.history-board');
                        if (boardEl) {
                            const cols = Array.from(boardEl.querySelectorAll('.history-board-column'));
                            let dragSrc = null;
                            cols.forEach(col => {
                                const statusKey = col.getAttribute('data-status');
                                col.addEventListener('dragover', (e) => {
                                    e.preventDefault();
                                });
                                col.addEventListener('drop', async (e) => {
                                    e.preventDefault();
                                    const card = dragSrc || e.target.closest('.history-board-card');
                                    const invId = card ? card.getAttribute('data-invoice-id') : null;
                                    if (!invId || !statusKey) return;
                                    if (!['pending','paid','cancelled'].includes(statusKey)) return;
                                    try {
                                        const fd = new FormData();
                                        fd.append('id', invId);
                                        fd.append('status', statusKey);
                                        await apiFetch('update_invoice_status', { method: 'POST', body: fd });
                                        invalidateCache('invoices');
                                        loadInvoicesPage(invoicesCurrentPage || 0);
                                    } catch (err) {
                                        console.error('Error actualizando estado de factura desde tablero:', err);
                                        showToast('No se pudo actualizar el estado de la factura', 'error');
                                    }
                                });
                            });
                            const cardsEls = Array.from(boardEl.querySelectorAll('.history-board-card'));
                            cardsEls.forEach(card => {
                                card.addEventListener('dragstart', (e) => {
                                    dragSrc = card;
                                    if (e.dataTransfer) {
                                        e.dataTransfer.setData('text/plain', card.getAttribute('data-invoice-id') || '');
                                    }
                                });
                                card.addEventListener('dragend', () => {
                                    dragSrc = null;
                                });
                            });
                        }
                    } catch (err) {
                        console.error('Error configurando drag & drop en tablero de facturas:', err);
                    }
                    return;
                }

                const invoicesCard = invoicesList && invoicesList.closest ? invoicesList.closest('.card') : null;
                if (invoicesCard) invoicesCard.classList.remove('history-board-full-container');

                renderList(
                    invoicesList,
                    itemList,
                    (i) => {
                    const userBadge = (i.username && currentUser && currentUser.role === 'admin') ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${i.username}</span>` : '';
                    const safeInvoiceId = String(i.id).replace(/'/g, "\\'");
                    const dateStr = i.date ? new Date(i.date).toLocaleDateString('es-ES') : '';
                    const status = (i.status || '').toLowerCase();
                    const statusLabel = status === 'paid' ? 'Pagada' : status === 'pending' ? 'Pendiente' : status === 'cancelled' ? 'Anulada' : status || 'Desconocido';
                    const statusColor = status === 'paid'
                        ? 'background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.3);'
                        : status === 'pending'
                            ? 'background:rgba(245,158,11,0.1);color:#f59e0b;border-color:rgba(245,158,11,0.3);'
                            : status === 'cancelled'
                                ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3);'
                                : 'background:rgba(148,163,184,0.1);color:#94a3b8;border-color:rgba(148,163,184,0.3);';
                    const isRecurring = i.is_recurring === 1 || i.is_recurring === '1' || i.is_recurring === true;
                    const isRebu = i.is_rebu === 1 || i.is_rebu === '1' || i.is_rebu === true;
                    const nextDateStr = (i.next_date && isRecurring) ? new Date(i.next_date).toLocaleDateString('es-ES') : '';
                    const recurringBadge = isRecurring
                        ? `<span style="display:inline-block;margin-left:0.5rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.7rem;background:rgba(59,130,246,0.08);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);">
                                Recurrente${nextDateStr ? ' · Próx. ' + nextDateStr : ''}
                           </span>`
                        : '';
                    const rebuBadge = isRebu
                        ? `<span style="display:inline-block;margin-left:0.5rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.7rem;background:rgba(245,158,11,0.08);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);">
                                REBU
                           </span>`
                        : '';
                        return `
                        <div class="history-item">
                            <div style="flex:1">
                                <strong>${(i.client_name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong>${userBadge}${recurringBadge}${rebuBadge}
                                <br>
                                <small>${safeInvoiceId} • ${formatCurrency(i.total_amount || 0)}${dateStr ? ' • ' + dateStr : ''}</small>
                                <br>
                                <span style="display:inline-block;margin-top:0.25rem;padding:0.1rem 0.6rem;border-radius:999px;font-size:0.7rem;font-weight:600;border:1px solid;${statusColor}">
                                    ${statusLabel}
                                </span>
                            </div>
                            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                                ${status !== 'paid' ? `
                                <button class="btn btn-accent btn-sm" onclick="markInvoicePaid('${safeInvoiceId}')" title="Marcar como pagada">
                                    <i data-lucide="check-circle" style="width:14px;height:14px;"></i>
                                    <span style="font-size:0.75rem;">Pagada</span>
                                </button>` : ''}
                                <button class="btn btn-secondary btn-sm" onclick="openInvoiceRecurring('${safeInvoiceId}')" title="Configurar o editar recurrencia">
                                    <i data-lucide="repeat" style="width:14px;height:14px;"></i> Recurrente
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="loadInvoice('${safeInvoiceId}')" title="Editar">
                                    <i data-lucide="edit-3" style="width:14px;height:14px;"></i> Editar
                                </button>
                                <button class="btn btn-accent btn-sm" onclick="duplicateInvoice('${safeInvoiceId}')" title="Duplicar">
                                    <i data-lucide="copy" style="width:14px;height:14px;"></i> Duplicar
                                </button>
                                <button class="btn btn-remove btn-sm" onclick="deleteInvoice('${safeInvoiceId}')" title="Eliminar factura">
                                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Eliminar
                                </button>
                            </div>
                        </div>
                    `;
                    },
                    itemsToRender.length === 0 && (invoicesStatusFilter?.value !== 'all' || invoicesDateFromInput?.value || invoicesDateToInput?.value || document.getElementById('invoices-tag-filter')?.value || document.getElementById('invoices-client-filter')?.value)
                        ? 'No hay facturas con los filtros aplicados. Prueba a quitar filtros (estado, fechas, etiqueta, cliente).'
                        : 'No hay facturas registradas',
                    'Error al cargar facturas. Intenta recargar la página.'
                );
            };

            invoicesList.dataset.source = 'invoices';
            renderInvoices(itemsToRender);

            const invoicesPagination = document.getElementById('invoices-pagination');
            if (invoicesPagination) {
                const totalPages = Math.max(1, Math.ceil(totalInvoices / INVOICES_PAGE_SIZE));
                if (totalPages > 1 || totalInvoices > INVOICES_PAGE_SIZE) {
                    invoicesPagination.classList.remove('hidden');
                    invoicesPagination.style.display = 'flex';
                    invoicesPagination.innerHTML = `
                        <span style="color: var(--text-muted); font-size: 0.9rem;">Página ${page + 1} de ${totalPages} (${totalInvoices} en total)</span>
                        <div style="display: flex; gap: 0.5rem;">
                            <button type="button" class="btn btn-secondary btn-sm" id="invoices-prev" ${page === 0 ? 'disabled' : ''}>Anterior</button>
                            <button type="button" class="btn btn-secondary btn-sm" id="invoices-next" ${page >= totalPages - 1 ? 'disabled' : ''}>Siguiente</button>
                        </div>
                    `;
                    invoicesPagination.querySelector('#invoices-prev')?.addEventListener('click', () => loadInvoicesPage(Math.max(0, page - 1)));
                    invoicesPagination.querySelector('#invoices-next')?.addEventListener('click', () => loadInvoicesPage(Math.min(totalPages - 1, page + 1)));
                } else {
                    invoicesPagination.classList.add('hidden');
                }
            }

            if (page === 0) showToast('Facturas cargadas', 'success');
            switchSection('section-invoices', navInvoices);
        } catch (e) { 
            console.error('Error cargando facturas:', e);
            showToast('Error al cargar facturas: ' + (e.message || 'Error desconocido'), 'error');
            invoicesList.innerHTML = '<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:2rem;">Error al cargar facturas. Intenta recargar la página.</div></div>';
        }
    }

    const projectsList = document.getElementById('projects-list');
    const projectsListCard = document.getElementById('projects-list-card');
    const projectFormCard = document.getElementById('project-form-card');
    const projectDetailCard = document.getElementById('project-detail-card');
    const projectsStatusFilter = document.getElementById('projects-status-filter');
    const projectsSearchInput = document.getElementById('projects-search');

    const PROJECT_STATUS_LABELS = { planning: 'Planificación', in_progress: 'En curso', on_hold: 'Pausado', completed: 'Completado', cancelled: 'Cancelado' };

    async function loadProjectsPage() {
        try {
            const myTasksEl = document.getElementById('projects-my-tasks-list');
            const myTasksFilter = document.getElementById('projects-my-tasks-filter');
            if (myTasksEl) {
                try {
                    const myTasks = await apiFetch('get_my_tasks');
                    const raw = Array.isArray(myTasks) ? myTasks : [];
                    window._myTasksCache = raw;
                    const onlyPending = myTasksFilter && myTasksFilter.value === 'pending';
                    const arr = onlyPending ? raw.filter(t => !(t.completed === 1 || t.completed === '1' || t.completed === true)) : raw;
                    if (arr.length === 0) {
                        myTasksEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">' + (onlyPending ? 'No tienes tareas pendientes.' : 'No tienes tareas asignadas.') + '</div></div>';
                    } else {
                        myTasksEl.innerHTML = arr.map(t => {
                            const projName = (t.project_name || 'Proyecto').replace(/</g, '&lt;');
                            const title = (t.title || '').replace(/</g, '&lt;');
                            const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('es-ES') : '';
                            const done = t.completed === 1 || t.completed === '1';
                            return `
                                <div class="history-item" style="cursor:pointer;" onclick="openProjectDetail(${t.project_id})">
                                    <div style="flex:1">
                                        <strong>${title}</strong><br>
                                        <small>${projName}${dueStr ? ' · ' + dueStr : ''}</small>
                                        ${done ? '<br><span style="color:var(--accent);font-size:0.8rem;">Completada</span>' : ''}
                                    </div>
                                    <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-muted);"></i>
                                </div>
                            `;
                        }).join('');
                        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                    }
                } catch (e) { if (myTasksEl) myTasksEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);">No se pudieron cargar tus tareas.</div></div>'; }
            }

            const status = projectsStatusFilter ? projectsStatusFilter.value : '';
            const search = projectsSearchInput ? projectsSearchInput.value.trim() : '';
            let url = 'get_projects';
            const params = new URLSearchParams();
            if (status) params.set('status', status);
            if (search) params.set('search', search);
            if (params.toString()) url += '?' + params.toString();
            const data = await apiFetch(url);
            const list = Array.isArray(data) ? data : [];
            if (!projectsList) { switchSection('section-projects', navProjects); return; }
            const renderItem = (p) => {
                const statusLabel = PROJECT_STATUS_LABELS[p.status] || p.status || '—';
                const statusColors = { planning: 'rgba(148,163,184,0.25)', in_progress: 'rgba(59,130,246,0.25)', on_hold: 'rgba(245,158,11,0.25)', completed: 'rgba(16,185,129,0.25)', cancelled: 'rgba(239,68,68,0.2)' };
                const sc = statusColors[p.status] || 'rgba(148,163,184,0.25)';
                const userBadge = (p.username && currentUser && currentUser.role === 'admin') ? `<span class="project-user-badge">${(p.username || '').replace(/</g, '&lt;')}</span>` : '';
                const client = (p.client_name || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const budgetStr = p.budget != null && p.budget !== '' ? formatCurrency(p.budget) : '—';
                const dates = [p.start_date, p.end_date].filter(Boolean).map(d => new Date(d).toLocaleDateString('es-ES')).join(' → ') || '—';
                const taskCount = (p.task_count ?? 0) || 0;
                const tasksDone = (p.tasks_completed ?? 0) || 0;
                const pct = taskCount > 0 ? Math.round((tasksDone / taskCount) * 100) : 0;
                const taskProgress = taskCount > 0
                    ? `<div class="project-task-progress-bar-wrap"><span class="project-task-progress" title="Tareas">${tasksDone}/${taskCount}</span><div class="project-task-progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%;height:100%;background:var(--accent);border-radius:999px;"></div></div></div>`
                    : '';
                const statusClass = (p.status && ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'].indexOf(p.status) >= 0) ? p.status : '';
                return `
                    <div class="project-item" data-status="${(p.status || '').replace(/"/g, '&quot;')}">
                        <div class="project-item-main">
                            <strong class="project-item-name">${(p.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong>${userBadge}
                            <div class="project-item-meta"><small>${client} · ${budgetStr}${dates !== '—' ? ' · ' + dates : ''}</small></div>
                            <div class="project-item-badges">
                                <span class="project-status-badge ${statusClass}" style="${statusClass ? '' : 'background:' + sc + ';color:var(--text-main);'}">${statusLabel}</span>
                                ${taskProgress}
                            </div>
                        </div>
                        <div class="project-item-actions">
                            <button class="btn btn-secondary btn-sm" onclick="openProjectDetail(${p.id})" title="Ver detalle"><i data-lucide="eye" style="width:14px;height:14px;"></i> Ver</button>
                            <button class="btn btn-secondary btn-sm" onclick="openProjectForm(${p.id})" title="Editar"><i data-lucide="edit-3" style="width:14px;height:14px;"></i> Editar</button>
                            <button class="btn btn-remove btn-sm" onclick="event.stopPropagation();deleteProject(${p.id})" title="Eliminar proyecto"><i data-lucide="trash-2" style="width:14px;height:14px;"></i> Eliminar</button>
                        </div>
                    </div>
                `;
            };
            if (list.length === 0) {
                projectsList.innerHTML = '<div class="history-item"><div style="flex:1;text-align:center;color:var(--text-muted);padding:2rem;">No hay proyectos. Crea uno con el botón «Nuevo proyecto».</div></div>';
            } else {
                projectsList.innerHTML = list.map(renderItem).join('');
            }
            if (projectsListCard) projectsListCard.classList.remove('hidden');
            if (projectFormCard) projectFormCard.classList.add('hidden');
            if (projectDetailCard) projectDetailCard.classList.add('hidden');
            switchSection('section-projects', navProjects);
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            console.error('Error cargando proyectos:', e);
            showToast('Error al cargar proyectos', 'error');
            if (projectsList) projectsList.innerHTML = '<div class="history-item"><div style="flex:1;text-align:center;color:var(--danger);padding:2rem;">Error al cargar proyectos.</div></div>';
        }
    }

    window.openProjectForm = async function(projectId) {
        const cardList = document.getElementById('projects-list-card');
        const cardForm = document.getElementById('project-form-card');
        const cardDetail = document.getElementById('project-detail-card');
        const titleEl = document.getElementById('project-form-title');
        const projectIdInput = document.getElementById('project-id');
        const projectNameInput = document.getElementById('project-name');
        const projectDescriptionInput = document.getElementById('project-description');
        const projectClientIdSelect = document.getElementById('project-client-id');
        const projectClientNameInput = document.getElementById('project-client-name');
        const projectStatusSelect = document.getElementById('project-status');
        const projectBudgetInput = document.getElementById('project-budget');
        const projectStartDateInput = document.getElementById('project-start-date');
        const projectEndDateInput = document.getElementById('project-end-date');
        if (!cardForm || !projectIdInput) return;
        projectIdInput.value = projectId ? projectId : '';
        if (titleEl) titleEl.innerHTML = projectId ? '<i data-lucide=\"edit-3\"></i> Editar proyecto' : '<i data-lucide=\"folder-plus\"></i> Nuevo proyecto';
        projectNameInput.value = '';
        projectDescriptionInput.value = '';
        projectClientNameInput.value = '';
        projectStatusSelect.value = 'planning';
        projectBudgetInput.value = '';
        projectStartDateInput.value = '';
        projectEndDateInput.value = '';
        projectClientIdSelect.innerHTML = '<option value="">— Sin asignar —</option>';
        try {
            const customers = await apiFetch('get_customers');
            (customers || []).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = (c.name || '').replace(/</g, '&lt;');
                projectClientIdSelect.appendChild(opt);
            });
        } catch (e) {}
        if (projectId) {
            const project = await apiFetch('get_project?id=' + projectId);
            if (project && project.id) {
                projectNameInput.value = project.name || '';
                projectDescriptionInput.value = project.description || '';
                projectClientNameInput.value = project.client_name || '';
                projectStatusSelect.value = project.status || 'planning';
                projectBudgetInput.value = project.budget != null && project.budget !== '' ? project.budget : '';
                projectStartDateInput.value = project.start_date || '';
                projectEndDateInput.value = project.end_date || '';
                if (project.client_id) projectClientIdSelect.value = project.client_id;
            }
        } else {
            projectClientIdSelect.value = '';
        }
        const btnDeleteProject = document.getElementById('btn-delete-project');
        if (btnDeleteProject) btnDeleteProject.style.display = projectId ? '' : 'none';
        if (cardList) cardList.classList.add('hidden');
        if (cardDetail) cardDetail.classList.add('hidden');
        cardForm.classList.remove('hidden');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    };

    window.openProjectDetail = async function(projectId) {
        const cardList = document.getElementById('projects-list-card');
        const cardForm = document.getElementById('project-form-card');
        const cardDetail = document.getElementById('project-detail-card');
        const detailName = document.getElementById('project-detail-name');
        const detailMeta = document.getElementById('project-detail-meta');
        const detailDesc = document.getElementById('project-detail-description');
        const tasksList = document.getElementById('project-tasks-list');
        const taskTitleInput = document.getElementById('project-task-title');
        const taskDueInput = document.getElementById('project-task-due');
        if (!cardDetail || !detailName) return;
        try {
            const project = await apiFetch('get_project?id=' + projectId);
            if (!project || !project.id) { showToast('Proyecto no encontrado', 'error'); return; }
            detailName.innerHTML = '<i data-lucide="folder-open"></i> ' + (project.name || 'Proyecto').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const statusLabel = PROJECT_STATUS_LABELS[project.status] || project.status || '—';
            const client = (project.client_name || '—').replace(/</g, '&lt;');
            const budgetStr = project.budget != null && project.budget !== '' ? formatCurrency(project.budget) : '—';
            const startStr = project.start_date ? new Date(project.start_date).toLocaleDateString('es-ES') : '—';
            const endStr = project.end_date ? new Date(project.end_date).toLocaleDateString('es-ES') : '—';
            detailMeta.innerHTML = `Cliente: ${client} &nbsp;|&nbsp; Estado: ${statusLabel} &nbsp;|&nbsp; Presupuesto: ${budgetStr} &nbsp;|&nbsp; Fechas: ${startStr} → ${endStr}`;
            detailDesc.innerHTML = project.description ? '<p style="white-space:pre-wrap;margin:0;">' + (project.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>' : '<p style="color:var(--text-muted);margin:0;">Sin descripción.</p>';
            cardDetail.dataset.projectId = projectId;
            const taskAssigneeSelect = document.getElementById('project-task-assignee');
            let usersForAssignment = [];
            try {
                usersForAssignment = await apiFetch('get_users_for_assignment') || [];
            } catch (e) {}
            if (taskAssigneeSelect) {
                taskAssigneeSelect.innerHTML = '<option value="">— Sin asignar —</option>';
                usersForAssignment.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = (u.username || '').replace(/</g, '&lt;');
                    taskAssigneeSelect.appendChild(opt);
                });
            }
            const tasks = project.tasks || [];
            // Vista Lista
            if (tasks.length === 0) {
                tasksList.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);">Sin tareas. Añade una arriba.</div></div>';
            } else {
                tasksList.innerHTML = tasks.map(t => {
                    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('es-ES') : '';
                    const checked = t.completed === 1 || t.completed === '1' || t.completed === true;
                    const assigneeId = t.assigned_to_user_id || '';
                    const optUsers = usersForAssignment.map(u => `<option value="${u.id}" ${u.id == assigneeId ? 'selected' : ''}>${(u.username || '').replace(/</g, '&lt;')}</option>`).join('');
                    const assigneeSelect = `<select class="status-select" style="width:auto;min-width:100px;font-size:0.8rem;" onchange="updateTaskAssignee(${projectId}, ${t.id}, this)" title="Cambiar responsable">${optUsers ? '<option value="">— Sin asignar —</option>' + optUsers : '<option value="">— Sin asignar —</option>'} </select>`;
                    const safeTitle = (t.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                    const safeDesc = (t.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                    const safeDue = (t.due_date || '');
                    return `
                        <div class="project-task-row ${checked ? 'completed' : ''}" data-task-id="${t.id}" data-task-title="${safeTitle}" data-task-desc="${safeDesc}" data-task-due="${safeDue}" data-task-completed="${checked ? '1' : '0'}" data-task-sort="${t.sort_order || 0}">
                            <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleProjectTask(${projectId}, ${t.id}, this.checked)" title="Marcar completada" aria-label="Marcar completada">
                            <span class="project-task-title">${(t.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                            ${dueStr ? `<span class="project-task-meta">${dueStr}</span>` : ''}
                            ${assigneeSelect}
                            <button class="btn btn-remove btn-sm" onclick="deleteProjectTask(${projectId}, ${t.id})" title="Eliminar tarea"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                        </div>
                    `;
                }).join('');
            }
            // Vista Kanban básica (Por hacer / Hecho)
            const boardEl = document.getElementById('project-board');
            if (boardEl) {
                const pending = tasks.filter(t => !(t.completed === 1 || t.completed === '1' || t.completed === true));
                const done = tasks.filter(t => t.completed === 1 || t.completed === '1' || t.completed === true);
                const renderCol = (id, title, arr) => {
                    const items = arr.length === 0
                        ? '<div style="color:var(--text-muted);font-size:0.85rem;padding:0.25rem 0;">Sin tareas</div>'
                        : arr.map(t => {
                            const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('es-ES') : '';
                            const checked = t.completed === 1 || t.completed === '1' || t.completed === true;
                            const safeTitle = (t.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            const assignee = (t.assignee_username || t.assigned_username || '').replace(/</g, '&lt;');
                            const metaParts = [];
                            if (dueStr) metaParts.push(dueStr);
                            if (assignee) metaParts.push(assignee);
                            const meta = metaParts.length ? metaParts.join(' · ') : '';
                            return `
                                <div class="project-board-card ${checked ? 'completed' : ''}" data-task-id="${t.id}" style="background:rgba(15,23,42,0.7);border-radius:0.6rem;padding:0.5rem 0.55rem;margin-bottom:0.45rem;border:1px solid rgba(148,163,184,0.35);">
                                    <div style="display:flex;align-items:flex-start;gap:0.5rem;">
                                        <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleProjectTask(${projectId}, ${t.id}, this.checked)" title="Marcar completada" aria-label="Marcar completada">
                                        <div style="flex:1;min-width:0;">
                                            <div style="font-size:0.9rem;font-weight:500;">${safeTitle}</div>
                                            ${meta ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.15rem;">${meta}</div>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    return `
                        <div class="project-board-column" data-column="${id}" style="min-width:230px;max-width:260px;flex:0 0 auto;background:radial-gradient(circle at top left, rgba(59,130,246,0.08), rgba(15,23,42,0.02));border-radius:0.9rem;padding:0.6rem 0.5rem;border:1px solid rgba(148,163,184,0.25);">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.35rem;">
                                <span style="font-size:0.85rem;font-weight:600;">${title}</span>
                                <span style="font-size:0.75rem;color:var(--text-muted);">${arr.length}</span>
                            </div>
                            ${items}
                        </div>
                    `;
                };
                boardEl.innerHTML = `
                    <div class="project-board-columns" style="display:flex;gap:0.75rem;align-items:flex-start;overflow-x:auto;padding-bottom:0.25rem;">
                        ${renderCol('pending', 'Por hacer', pending)}
                        ${renderCol('done', 'Hecho', done)}
                    </div>
                `;
            }
            if (taskTitleInput) taskTitleInput.value = '';
            if (taskDueInput) taskDueInput.value = '';
            if (taskAssigneeSelect) taskAssigneeSelect.value = '';
            const linkedDocsEl = document.getElementById('project-detail-linked-docs');
            const linkedQuotes = project.linked_quotes || [];
            const linkedInvoices = project.linked_invoices || [];
            if (linkedDocsEl) {
                if (linkedQuotes.length === 0 && linkedInvoices.length === 0) {
                    linkedDocsEl.innerHTML = '';
                } else {
                    const parts = [];
                    if (linkedQuotes.length > 0) {
                        parts.push('<h4 style="margin:1rem 0 0.5rem;"><i data-lucide="file-text"></i> Presupuestos vinculados</h4><div class="history-list">');
                        linkedQuotes.forEach(q => {
                            const safeId = (q.id || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const dateStr = q.date ? new Date(q.date).toLocaleDateString('es-ES') : '';
                            const totalStr = formatCurrency(q.total_amount || 0);
                            const statusStr = (q.status || '').replace(/</g, '&lt;');
                            parts.push(`<div class="history-item" style="cursor:pointer;" onclick="switchSection('section-editor', document.getElementById('nav-editor')); loadQuote('${safeId}');"><div style="flex:1;">Presupuesto ${(q.id||'').replace(/</g,'&lt;')} · ${totalStr} · ${statusStr}${dateStr ? ' · ' + dateStr : ''}</div><i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-muted);"></i></div>`);
                        });
                        parts.push('</div>');
                    }
                    if (linkedInvoices.length > 0) {
                        parts.push('<h4 style="margin:1rem 0 0.5rem;"><i data-lucide="file-text"></i> Facturas vinculadas</h4><div class="history-list">');
                        linkedInvoices.forEach(inv => {
                            const safeId = (inv.id || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const dateStr = inv.date ? new Date(inv.date).toLocaleDateString('es-ES') : '';
                            const totalStr = formatCurrency(inv.total_amount || 0);
                            const statusStr = (inv.status || '').replace(/</g, '&lt;');
                            parts.push(`<div class="history-item" style="cursor:pointer;" onclick="switchSection('section-editor', document.getElementById('nav-editor')); loadInvoice('${safeId}');"><div style="flex:1;">Factura ${(inv.id||'').replace(/</g,'&lt;')} · ${totalStr} · ${statusStr}${dateStr ? ' · ' + dateStr : ''}</div><i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-muted);"></i></div>`);
                        });
                        parts.push('</div>');
                    }
                    linkedDocsEl.innerHTML = parts.join('');
                }
            }
            if (cardList) cardList.classList.add('hidden');
            if (cardForm) cardForm.classList.add('hidden');
            cardDetail.classList.remove('hidden');
            // Vista por defecto: Lista
            const viewListBtn = document.getElementById('project-view-list-btn');
            const viewBoardBtn = document.getElementById('project-view-board-btn');
            const boardEl2 = document.getElementById('project-board');
            if (viewListBtn && viewBoardBtn && tasksList && boardEl2) {
                const setView = (mode) => {
                    if (mode === 'board') {
                        tasksList.classList.add('hidden');
                        boardEl2.classList.remove('hidden');
                        viewBoardBtn.classList.add('btn-accent');
                        viewListBtn.classList.remove('btn-accent');
                    } else {
                        tasksList.classList.remove('hidden');
                        boardEl2.classList.add('hidden');
                        viewListBtn.classList.add('btn-accent');
                        viewBoardBtn.classList.remove('btn-accent');
                    }
                };
                viewListBtn.onclick = () => setView('list');
                viewBoardBtn.onclick = () => setView('board');
                setView('board'); // Mostrar Kanban por defecto al abrir el proyecto
            }
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            console.error('Error cargando proyecto:', e);
            showToast('Error al cargar proyecto', 'error');
        }
    };

    window.toggleProjectTask = async function(projectId, taskId, checked) {
        try {
            const row = document.querySelector(`#project-tasks-list [data-task-id="${taskId}"]`);
            const titleText = row?.querySelector('.project-task-title')?.textContent || 'Tarea';
            const form = new FormData();
            form.append('project_id', projectId);
            form.append('task_id', taskId);
            form.append('title', titleText);
            form.append('completed', checked ? 1 : 0);
            await apiFetch('save_project_task', { method: 'POST', body: form });
            // Recargar detalle para refrescar lista y tablero Kanban
            openProjectDetail(projectId);
        } catch (e) { showToast('Error al actualizar tarea', 'error'); }
    };

    window.deleteProjectTask = async function(projectId, taskId) {
        if (!confirm('¿Eliminar esta tarea?')) return;
        try {
            const form = new FormData();
            form.append('project_id', projectId);
            form.append('task_id', taskId);
            await apiFetch('delete_project_task', { method: 'POST', body: form });
            showToast('Tarea eliminada', 'success');
            openProjectDetail(projectId);
        } catch (e) { showToast('Error al eliminar tarea', 'error'); }
    };

    window.updateTaskAssignee = async function(projectId, taskId, selectEl) {
        const row = selectEl && selectEl.closest ? selectEl.closest('.history-item') : null;
        if (!row) return;
        const form = new FormData();
        form.append('project_id', projectId);
        form.append('task_id', taskId);
        form.append('title', row.dataset.taskTitle || '');
        form.append('description', row.dataset.taskDesc || '');
        form.append('due_date', row.dataset.taskDue || '');
        form.append('completed', row.dataset.taskCompleted || '0');
        form.append('sort_order', row.dataset.taskSort || '0');
        form.append('assigned_to_user_id', selectEl.value || '');
        try {
            await apiFetch('save_project_task', { method: 'POST', body: form });
            showToast('Responsable actualizado', 'success');
        } catch (e) { showToast('Error al actualizar', 'error'); }
    };

    document.getElementById('btn-new-project')?.addEventListener('click', () => openProjectForm());
    document.getElementById('btn-project-back-to-list')?.addEventListener('click', () => loadProjectsPage());
    document.getElementById('btn-project-detail-back')?.addEventListener('click', () => loadProjectsPage());
    document.getElementById('btn-project-duplicate')?.addEventListener('click', async () => {
        const id = document.getElementById('project-detail-card')?.dataset?.projectId;
        if (!id) return;
        try {
            const fd = new FormData();
            fd.append('id', id);
            const result = await apiFetch('duplicate_project', { method: 'POST', body: fd });
            if (result && result.status === 'success' && result.id) {
                showToast('Proyecto duplicado', 'success');
                openProjectDetail(result.id);
            } else {
                showToast(result?.message || 'Error al duplicar', 'error');
            }
        } catch (e) {
            showToast('Error al duplicar proyecto', 'error');
        }
    });

    const CONTRACT_STATUS_LABELS = { draft: 'Borrador', sent: 'Enviado', signed: 'Firmado', expired: 'Expirado', cancelled: 'Cancelado' };

    const CONTRACT_TEMPLATES = {
        redes_sociales: {
            title: 'Contrato de gestión de redes sociales (Community Management)',
            terms: `PRIMERA. OBJETO
El presente contrato tiene por objeto la prestación de servicios de gestión de redes sociales (community management), creación de contenido y estrategia de comunicación digital para las cuentas que el CLIENTE indique (Facebook, Instagram, Twitter/X, LinkedIn, TikTok u otras).

SEGUNDA. OBLIGACIONES DEL PRESTADOR
- Gestionar las redes sociales acordadas según el plan y calendario editorial aprobado.
- Crear y publicar contenido (textos, imágenes, vídeos) de forma regular.
- Responder a comentarios y mensajes directos dentro del horario establecido.
- Elaborar informes mensuales de seguimiento (alcance, interacciones, crecimiento).
- Proponer mejoras y acciones de engagement.

TERCERA. OBLIGACIONES DEL CLIENTE
- Facilitar acceso a las cuentas y permisos necesarios.
- Proporcionar información, material gráfico y aprobaciones en los plazos acordados.
- Abonar la contraprestación en los plazos establecidos.

CUARTA. DURACIÓN Y FORMA DE PAGO
La vigencia del contrato será la indicada en el encabezado. El importe se abonará según la modalidad pactada (mensual, por campaña o proyecto).

QUINTA. PROPIEDAD INTELECTUAL
El contenido creado será de propiedad del CLIENTE una vez satisfecho el pago. El PRESTADOR podrá incluir el trabajo en su portfolio salvo confidencialidad expresamente acordada.

SEXTA. CONFIDENCIALIDAD
Ambas partes se comprometen a no divulgar información confidencial obtenida durante la vigencia del contrato.

SÉPTIMA. RESOLUCIÓN
Cualquiera de las partes podrá resolver el contrato con un preaviso de 30 días. El incumplimiento de las obligaciones de pago facultará al PRESTADOR para suspender los servicios y resolver el contrato.`
        },
        diseno_web: {
            title: 'Contrato de diseño y desarrollo web',
            terms: `PRIMERA. OBJETO
El presente contrato regula la prestación de servicios de diseño y desarrollo de sitio web (diseño, maquetación, programación, integración de contenidos e instalación en el entorno acordado) para el CLIENTE.

SEGUNDA. ALCANCE DEL PROYECTO
- Diseño de interfaz (mockups/maquetas) según especificaciones y número de revisiones acordadas.
- Desarrollo front-end y, en su caso, back-end o CMS (WordPress, etc.).
- Integración de contenidos proporcionados por el CLIENTE.
- Publicación en el servidor/hosting indicado y configuración básica (dominio, SSL si procede).
- Entrega de documentación básica de uso y, si se pacta, formación.

TERCERA. OBLIGACIONES DEL CLIENTE
- Proporcionar textos, imágenes, logotipos y datos necesarios en los plazos acordados.
- Designar un interlocutor único para aprobaciones y cambios.
- Asegurar que dispone de derechos sobre los contenidos aportados.
- Abonar los importes en los plazos establecidos (anticipo, hitos o entrega final).

CUARTA. PLAZOS Y ENTREGABLES
Los plazos de entrega dependerán de la disponibilidad de contenidos y aprobaciones. Los retrasos imputables al CLIENTE no supondrán penalización para el PRESTADOR.

QUINTA. PROPIEDAD Y LICENCIAS
Una vez satisfecho el pago total, el CLIENTE será titular del sitio web desarrollado y de los entregables pactados. Se mantendrán las licencias de terceros (plantillas, plugins, fuentes) según sus condiciones. El código desarrollado a medida se cederá al CLIENTE.

SEXTA. MANTENIMIENTO Y ACTUALIZACIONES
El presente contrato no incluye mantenimiento post-lanzamiento salvo que se contrate expresamente (actualizaciones de seguridad, cambios de contenido, soporte).

SÉPTIMA. GARANTÍA
Se garantiza el correcto funcionamiento del sitio según especificaciones durante un período de 30 días desde la entrega, para corrección de defectos imputables al desarrollo. No quedan cubiertos fallos por modificaciones ajenas al PRESTADOR o por el uso de hosting/terceros.`
        },
        mantenimiento_web: {
            title: 'Contrato de mantenimiento web',
            terms: `PRIMERA. OBJETO
El presente contrato tiene por objeto la prestación de servicios de mantenimiento del sitio web del CLIENTE, que incluye actualizaciones de seguridad, revisiones técnicas, copias de seguridad y, en su caso, pequeños cambios de contenido según el plan contratado.

SEGUNDA. SERVICIOS INCLUIDOS
- Actualizaciones de seguridad del CMS, plugins y temas (en su caso).
- Revisión periódica del funcionamiento del sitio y enlaces.
- Copias de seguridad con la periodicidad acordada.
- Soporte por correo o canal acordado para incidencias dentro del horario establecido.
- Pequeños cambios de texto o imágenes (límite según plan: X horas/mes o ilimitado según pacto).

TERCERA. EXCLUSIONES
Quedan fuera del mantenimiento: rediseños, nuevas funcionalidades complejas, migraciones de servidor, contenidos que requieran diseño o copywriting profesional. Estos se presupuestarán aparte.

CUARTA. DURACIÓN Y FORMA DE PAGO
Contrato de duración indicada en encabezado, con facturación mensual o según periodo acordado. La renovación será tácita salvo denuncia con 30 días de antelación.

QUINTA. NIVEL DE SERVICIO
Se establecerán plazos de respuesta para incidencias críticas (caída del sitio) y no críticas (consultas, cambios), según el plan contratado.

SEXTA. ACCESO
El CLIENTE facilitará acceso al hosting, FTP y panel de administración necesarios para la prestación del servicio.`
        },
        marketing_digital: {
            title: 'Contrato de servicios de marketing digital',
            terms: `PRIMERA. OBJETO
El presente contrato regula la prestación de servicios de marketing digital (SEO, SEM, publicidad en redes sociales, email marketing, analítica y estrategia) para el CLIENTE, según el alcance y canales acordados.

SEGUNDA. ALCANCE
- Definición de estrategia y plan de medios digitales.
- Gestión de campañas de publicidad (Google Ads, Meta Ads, etc.) y presupuesto acordado.
- Optimización para motores de búsqueda (SEO) y seguimiento de posicionamiento.
- Informes periódicos de resultados (métricas, ROI, recomendaciones).

TERCERA. OBLIGACIONES DEL CLIENTE
- Facilitar acceso a cuentas de publicidad, analítica y herramientas que se vayan a gestionar.
- Aprobar presupuestos de medios y creatividades en los plazos acordados.
- Abonar la cuota de gestión y, en su caso, el coste de medios por separado según facturación acordada.

CUARTA. PRESUPUESTO DE MEDIOS
Los gastos en publicidad (Google, redes sociales, etc.) serán facturados al CLIENTE o gestionados con cargo a su cuenta, según lo pactado. La cuota de gestión del PRESTADOR es independiente del gasto en medios.

QUINTA. CONFIDENCIALIDAD Y DATOS
Ambas partes cumplirán la normativa de protección de datos aplicable. El PRESTADOR actuará como encargado del tratamiento cuando acceda a datos del CLIENTE según lo acordado.

SEXTA. DURACIÓN Y RESOLUCIÓN
Vigencia según encabezado. Cualquiera de las partes podrá resolver con 30 días de preaviso. El CLIENTE asumirá los costes ya comprometidos en campañas en curso.`
        },
        consultoria: {
            title: 'Contrato de consultoría / asesoría',
            terms: `PRIMERA. OBJETO
El presente contrato tiene por objeto la prestación de servicios de consultoría y asesoría en la materia o ámbito acordado (estrategia, organización, digital, fiscal, etc.), en la modalidad y horas/días pactados.

SEGUNDA. PRESTACIÓN
- Análisis, diagnóstico y propuestas según el encargo.
- Informes, documentación y recomendaciones.
- Reuniones de seguimiento y, en su caso, apoyo en la implementación dentro del alcance contratado.
La consultoría se prestará en las instalaciones del CLIENTE, en las del PRESTADOR o por medios telemáticos, según convenga.

TERCERA. OBLIGACIONES DEL CLIENTE
- Proporcionar la información y documentación necesaria para el correcto desarrollo del encargo.
- Designar un interlocutor y facilitar los contactos necesarios.
- Abonar los honorarios en los plazos establecidos.

CUARTA. HONORARIOS Y FACTURACIÓN
Los honorarios se facturarán según la modalidad pactada: por horas/días, por proyecto o por resultado, conforme al presupuesto aceptado. Los gastos y desplazamientos no incluidos se acordarán por separado.

QUINTA. INDEPENDENCIA
El PRESTADOR actúa con plena independencia profesional. Las recomendaciones no constituyen asesoramiento jurídico o fiscal sustitutivo de un profesional colegiado cuando la ley lo exija.

SEXTA. CONFIDENCIALIDAD
Toda la información recibida en el marco del encargo será tratada como confidencial y no se divulgará a terceros sin consentimiento del CLIENTE, salvo obligación legal.

SÉPTIMA. PROPIEDAD DE LOS ENTREGABLES
Los informes, documentos y materiales elaborados para el CLIENTE serán de su propiedad una vez satisfecho el pago. El PRESTADOR podrá conservar una copia para su archivo profesional.`
        },
        desarrollo_app: {
            title: 'Contrato de desarrollo de aplicación',
            terms: `PRIMERA. OBJETO
El presente contrato regula el diseño, desarrollo, pruebas y entrega de una aplicación (web, móvil o ambas) según especificaciones y alcance definidos en el documento de requisitos o anexo técnico.

SEGUNDA. FASES DEL PROYECTO
- Análisis y especificación de requisitos.
- Diseño de interfaz y experiencia de usuario (UX/UI).
- Desarrollo, integraciones y pruebas.
- Despliegue en los entornos acordados (stores, servidor, etc.).
- Documentación y, en su caso, formación al CLIENTE.

TERCERA. OBLIGACIONES DEL CLIENTE
- Aprobar especificaciones y diseños en los hitos acordados.
- Proporcionar accesos (APIs, cuentas, contenido) y datos de prueba necesarios.
- Realizar las pruebas de aceptación en el plazo establecido.
- Abonar el proyecto según hitos (anticipo, entregas parciales, entrega final).

CUARTA. PLAZOS
Los plazos dependerán de la disponibilidad de aprobaciones y de los requisitos del CLIENTE. Los retrasos imputables al CLIENTE no generarán penalización al PRESTADOR.

QUINTA. PROPIEDAD Y CESIÓN
Una vez satisfecho el importe total, el CLIENTE será titular de la aplicación desarrollada y del código fuente entregado, salvo componentes de terceros sujetos a sus propias licencias. El PRESTADOR podrá utilizar el proyecto en su portfolio salvo pacto de confidencialidad.

SEXTA. MANTENIMIENTO Y ACTUALIZACIONES
El contrato no incluye mantenimiento post-lanzamiento ni nuevas versiones salvo que se contrate expresamente. Se garantiza la corrección de defectos imputables al desarrollo durante 30 días desde la entrega.`
        },
        contenidos: {
            title: 'Contrato de creación de contenidos',
            terms: `PRIMERA. OBJETO
El presente contrato regula la prestación de servicios de creación de contenidos (textos, guiones, copy, artículos para blog, redes sociales, newsletters o material audiovisual según pacto) para el CLIENTE.

SEGUNDA. ALCANCE
- Creación de contenidos según el formato, tono y calendario acordados.
- Revisión y hasta X rondas de corrección por entrega (según pacto).
- Adaptación a canales y soportes indicados por el CLIENTE.

TERCERA. OBLIGACIONES DEL CLIENTE
- Proporcionar briefs, información de marca y materiales de referencia.
- Devolver correcciones y aprobaciones en los plazos acordados para cumplir el calendario.
- Abonar la contraprestación según las condiciones pactadas (por pieza, por pack o mensual).

CUARTA. PROPIEDAD INTELECTUAL
Los contenidos creados serán de propiedad del CLIENTE una vez satisfecho el pago. El PRESTADOR podrá utilizarlos en su portfolio o muestras salvo pacto de confidencialidad o exclusividad.

QUINTA. AUTORÍA Y DERECHOS DE TERCEROS
El PRESTADOR garantiza la autoría original y que los contenidos no vulneran derechos de terceros. Si el CLIENTE aporta imágenes, música o otros elementos, asume la responsabilidad de disponer de los derechos necesarios.

SEXTA. REUTILIZACIÓN
Los contenidos se entregan para su uso en los canales y fines acordados. Su reutilización en otros soportes o campañas podrá pactarse por separado si implica trabajo adicional.`
        },
        fotografia_video: {
            title: 'Contrato de servicios de fotografía y/o vídeo',
            terms: `PRIMERA. OBJETO
El presente contrato regula la prestación de servicios profesionales de fotografía y/o grabación y edición de vídeo (reportaje, evento, producto, corporativo, etc.) según el encargo y entregables acordados.

SEGUNDA. ALCANCE
- Sesión/s de fotografía y/o grabación en las fechas y ubicaciones acordadas.
- Edición y postproducción (retoque, montaje, colorización) según el paquete contratado.
- Entrega de archivos en los formatos y soportes pactados (digital, resolución, número de entregas).

TERCERA. OBLIGACIONES DEL CLIENTE
- Confirmar fecha, hora y lugar con antelación suficiente.
- Facilitar acceso a las instalaciones y permisos necesarios (autorizaciones de imagen si procede).
- Proporcionar briefing, referencias o requisitos específicos en tiempo útil.
- Abonar la contraprestación según las condiciones pactadas (anticipo y saldo, o pago único).

CUARTA. DERECHOS DE IMAGEN Y USO
Las imágenes y vídeos finales serán de uso del CLIENTE para los fines acordados (web, redes, impresión, campañas). El PRESTADOR podrá utilizarlos en su portfolio y promoción salvo pacto de confidencialidad. En eventos con terceros, el CLIENTE se responsabiliza de obtener las autorizaciones de imagen necesarias.

QUINTA. CANCELACIÓN Y POSPOSICIÓN
La cancelación o cambio de fecha con menos de X días de antelación (según pacto) podrá suponer el abono total o parcial del servicio. La climatología u otras causas de fuerza mayor podrán acordar nueva fecha sin penalización.

SEXTA. ENTREGA
El plazo de entrega se indicará según el volumen del trabajo. Las revisiones o cambios adicionales fuera del alcance pactado se presupuestarán por separado.`
        },
        formacion: {
            title: 'Contrato de formación / impartición de cursos',
            terms: `PRIMERA. OBJETO
El presente contrato regula la impartición de acciones formativas (cursos, talleres, seminarios o mentoría) por parte del PRESTADOR para el CLIENTE o para los participantes que este designe, en la materia, duración y formato acordados.

SEGUNDA. CONTENIDO Y METODOLOGÍA
- Programa y materiales didácticos según la oferta formativa aceptada.
- Impartición en las fechas, horarios y modalidad acordados (presencial, online o mixto).
- Entrega de documentación y, en su caso, certificado de asistencia o aprovechamiento según pacto.

TERCERA. OBLIGACIONES DEL CLIENTE
- Facilitar el espacio, equipamiento o acceso a la plataforma necesarios cuando la formación sea in company.
- Comunicar el número de participantes y requisitos previos con antelación suficiente.
- Abonar el importe en los plazos establecidos (reserva, antes del inicio o según facturación acordada).

CUARTA. ASISTENCIA Y CANCELACIÓN
Las condiciones de cancelación o cambio de fecha por parte del CLIENTE se regirán por lo pactado (devolución total/parcial, cambio de convocatoria). Si el PRESTADOR debe cancelar por causa mayor, se ofrecerá nueva fecha o devolución.

QUINTA. PROPIEDAD INTELECTUAL
Los materiales y contenidos formativos son propiedad del PRESTADOR. Se autoriza su uso exclusivo por los participantes en el marco de la acción formativa. No se permite la grabación, reproducción o distribución sin autorización expresa.

SEXTA. CONFIDENCIALIDAD
La información intercambiada en el marco de la formación (casos, datos de empresas o participantes) se tratará como confidencial por ambas partes.`
        },
        hosting_dominios: {
            title: 'Contrato de hosting y registro de dominios',
            terms: `PRIMERA. OBJETO
El presente contrato regula la contratación de servicios de alojamiento web (hosting) y/o registro y renovación de nombres de dominio que el PRESTADOR facilita al CLIENTE, actuando como intermediario con los registradores y proveedores correspondientes.

SEGUNDA. SERVICIOS
- Registro o transferencia de dominio/s en nombre del CLIENTE o según instrucciones.
- Contratación de plan de hosting (espacio, bases de datos, cuentas de correo, SSL si aplica) según la oferta elegida.
- Configuración inicial y, en su caso, migración o instalación básica dentro del alcance contratado.

TERCERA. OBLIGACIONES DEL CLIENTE
- Proporcionar datos de titularidad correctos para el registro del dominio (normativa ICANN y del registrador).
- Abonar las cuotas en los plazos establecidos (anualidad de dominio, mensualidad o anualidad de hosting). El impago puede dar lugar a la suspensión del servicio y pérdida del dominio.
- Mantener actualizados los datos de contacto para avisos de renovación.

CUARTA. TITULARIDAD DEL DOMINIO
El dominio quedará registrado a nombre del CLIENTE. El PRESTADOR no será titular del mismo. En caso de cese del servicio, el CLIENTE podrá solicitar la transferencia del dominio a otro proveedor según los procedimientos del registrador.

QUINTA. RENOVACIÓN
Los dominios y el hosting se renovarán automáticamente según la periodicidad contratada salvo denuncia con el preaviso indicado por el PRESTADOR. Es responsabilidad del CLIENTE asegurar la renovación para no perder el dominio.

SEXTA. LÍMITES Y USO ACEPTABLE
El uso del hosting debe ajustarse a la ley y a la política de uso aceptable del proveedor. No se permiten usos ilícitos, spam, malware o actividades que comprometan la seguridad o reputación. El incumplimiento puede dar lugar a la resolución del servicio.`
        },
        soporte_tecnico: {
            title: 'Contrato de soporte técnico / servicios IT',
            terms: `PRIMERA. OBJETO
El presente contrato regula la prestación de servicios de soporte técnico y/o administración de sistemas informáticos (mantenimiento de equipos, redes, software, copias de seguridad, monitorización) para el CLIENTE, según el alcance y nivel de servicio acordados.

SEGUNDA. ALCANCE
- Atención de incidencias y consultas dentro del horario y canales establecidos (teléfono, correo, ticket, acceso remoto).
- Tareas preventivas y correctivas según el plan contratado (actualizaciones, revisiones, backups).
- Administración de servidores, redes o aplicaciones cuando se haya pactado expresamente.

TERCERA. OBLIGACIONES DEL CLIENTE
- Facilitar acceso remoto o físico y permisos necesarios para la realización de las tareas.
- Designar un interlocutor para priorización y autorizaciones.
- No realizar modificaciones que puedan afectar al servicio sin coordinación con el PRESTADOR.
- Abonar la cuota o facturación según la modalidad pactada (mensual, por horas, por incidencia).

CUARTA. NIVEL DE SERVICIO
Se establecerán plazos de respuesta y resolución según la criticidad (urgente, alta, media, baja) y el plan contratado. Las incidencias fuera de horario o que requieran desplazamiento podrán facturarse aparte si se ha acordado.

QUINTA. EXCLUSIONES
Quedan fuera del soporte estándar: desarrollo de software a medida, instalaciones nuevas no pactadas, daños por mal uso o por terceros, equipos o software no incluidos en el acuerdo. Estos servicios se presupuestarán por separado.

SEXTA. CONFIDENCIALIDAD Y SEGURIDAD
El PRESTADOR tratará la información y accesos del CLIENTE con confidencialidad y adoptará medidas razonables de seguridad. Actuará como encargado del tratamiento cuando acceda a datos personales según la normativa aplicable.`
        },
        diseno_grafico: {
            title: 'Contrato de diseño gráfico',
            terms: `PRIMERA. OBJETO
El presente contrato regula la prestación de servicios de diseño gráfico (identidad visual, cartelería, packaging, material editorial, digital, etc.) para el CLIENTE, según el encargo y entregables acordados.

SEGUNDA. ALCANCE
- Creación de diseños según el briefing y número de revisiones pactadas.
- Entrega de archivos en los formatos solicitados (impresión, web, editable) y propiedad de uso según cláusula siguiente.
- Adaptaciones o variaciones dentro del alcance acordado.

TERCERA. OBLIGACIONES DEL CLIENTE
- Proporcionar briefing, referencias, textos y materiales (logotipos, imágenes con derechos) en los plazos acordados.
- Realizar las aprobaciones y feedback en tiempo útil para cumplir las fechas de entrega.
- Abonar la contraprestación según las condiciones pactadas (anticipo, por fase o entrega final).

CUARTA. PROPIEDAD INTELECTUAL Y DERECHOS DE USO
Una vez satisfecho el pago, el CLIENTE tendrá derecho a utilizar los diseños entregados para los fines y soportes acordados. Los archivos fuente y la autoría moral podrán quedar en manos del PRESTADOR salvo cesión expresa. El PRESTADOR podrá incluir el trabajo en su portfolio salvo pacto de confidencialidad.

QUINTA. REVISIONES Y CAMBIOS
El número de rondas de revisión incluidas será el pactado. Los cambios que supongan un rediseño sustancial o trabajo adicional se presupuestarán por separado.

SEXTA. ELEMENTOS DE TERCEROS
Si el CLIENTE aporta imágenes, tipografías o otros elementos, garantiza disponer de los derechos necesarios. Las fuentes o recursos de pago utilizados por el PRESTADOR para el proyecto podrán repercutirse o quedar incluidos según pacto.`
        },
        traduccion: {
            title: 'Contrato de servicios de traducción',
            terms: `PRIMERA. OBJETO
El presente contrato regula la prestación de servicios de traducción (y, en su caso, revisión, maquetación o localización) de documentos o contenidos del idioma origen al idioma destino acordados, según el volumen y formato pactados.

SEGUNDA. ALCANCE
- Traducción conforme al encargo (documentos, web, software, audiovisual según especialidad).
- Entrega en los plazos acordados y en el formato solicitado.
- Revisión o corrección de estilo dentro del alcance pactado (una pasada de revisión, glosario, etc.).

TERCERA. OBLIGACIONES DEL CLIENTE
- Entregar los textos o archivos en el formato y fecha acordados para cumplir los plazos.
- Proporcionar glosarios, referencias o material de contexto cuando sea necesario.
- Abonar la contraprestación según tarifa pactada (por palabra, por página, por proyecto) en los plazos establecidos.

CUARTA. CALIDAD Y REVISIÓN
El PRESTADOR realizará la traducción con la diligencia profesional debida. Las reclamaciones por errores sustanciales deberán comunicarse en un plazo razonable (por ejemplo, 15 días) desde la entrega para su corrección. No se asumen responsabilidades por daños derivados del uso del texto traducido en contextos no acordados.

QUINTA. CONFIDENCIALIDAD
Los documentos y contenidos tratados serán confidenciales. El PRESTADOR no los divulgará ni utilizará para otros fines. Podrá conservar copia para archivo y reclamaciones según la ley.

SEXTA. PROPIEDAD Y DERECHOS
El texto traducido se entrega para su uso por el CLIENTE en los fines acordados. Los derechos de autor sobre la traducción corresponden al PRESTADOR salvo cesión expresa; el CLIENTE tiene derecho al uso según el contrato.`
        },
        colaboracion_freelance: {
            title: 'Contrato marco de colaboración freelance',
            terms: `PRIMERA. OBJETO
El presente contrato tiene carácter marco y regula la relación de colaboración entre el CLIENTE y el PRESTADOR (autónomo/freelance) para la realización de encargos o proyectos que se irán concretando por escrito (presupuesto, orden de encargo o anexo) en cuanto a alcance, plazo y precio.

SEGUNDA. RELACIÓN CONTRACTUAL
Las partes actúan con plena independencia. El PRESTADOR no queda vinculado por relación laboral ni de agencia. Será responsable de sus obligaciones fiscales y de Seguridad Social. Cada encargo aceptado se regirá por este marco y por las condiciones específicas del encargo.

TERCERA. ENCARGOS Y FORMA DE PAGO
Cada encargo se documentará con presupuesto o orden aceptada, indicando descripción, plazo y precio. El pago se realizará según lo pactado en cada encargo (anticipo, por hitos, a 30 días, etc.). Los gastos no incluidos se acordarán por separado.

CUARTA. ENTREGABLES Y PROPIEDAD
Los entregables de cada encargo serán propiedad del CLIENTE una vez satisfecho el pago correspondiente, salvo pacto distinto (cesión parcial, licencia, portfolio). El PRESTADOR podrá incluir el trabajo en su portfolio salvo confidencialidad expresamente acordada.

QUINTA. CONFIDENCIALIDAD
Ambas partes se obligan a mantener la confidencialidad de la información intercambiada en el marco de la colaboración y a no utilizarla en perjuicio de la otra parte.

SEXTA. DURACIÓN Y RESOLUCIÓN
Este marco tendrá la vigencia indicada en el encabezado y se prorrogará tácitamente salvo denuncia con 30 días de antelación. La resolución no afectará a los encargos ya aceptados, que se liquidarán según sus condiciones. Cualquier incumplimiento grave podrá dar lugar a la resolución anticipada.`
        }
    };

    document.getElementById('contract-template')?.addEventListener('change', function() {
        const key = this.value;
        if (!key || !CONTRACT_TEMPLATES[key]) return;
        const t = CONTRACT_TEMPLATES[key];
        const titleEl = document.getElementById('contract-title');
        const termsEl = document.getElementById('contract-terms');
        if (titleEl) titleEl.value = t.title || '';
        if (termsEl) termsEl.value = t.terms || '';
        updateContractPreview();
        showToast('Plantilla aplicada. Puedes editar título y cláusulas.', 'success');
    });

    async function fillContractQuotesDropdown() {
        const sel = document.getElementById('contract-quote-id');
        if (!sel) return;
        try {
            const data = await apiFetch('get_history?limit=100&offset=0');
            const items = (data && data.items) ? data.items : [];
            const quotes = items.filter(item => item.id && !String(item.id).startsWith('FAC-'));
            sel.innerHTML = '<option value="">— Sin presupuesto —</option>';
            quotes.forEach(q => {
                const opt = document.createElement('option');
                opt.value = q.id;
                const statusStr = q.status === 'accepted' ? 'Aceptado' : q.status === 'waiting_client' ? 'En espera de cliente' : q.status === 'sent' ? 'Enviado' : q.status === 'rejected' ? 'Rechazado' : q.status || 'Borrador';
                const label = (q.client_name || 'Sin cliente') + ' · ' + (q.id || '') + (q.status ? ' · ' + statusStr : '');
                opt.textContent = label.length > 60 ? label.slice(0, 57) + '…' : label;
                sel.appendChild(opt);
            });
        } catch (e) {}
    }

    document.getElementById('contract-quote-id')?.addEventListener('change', async function() {
        const quoteId = this.value;
        if (!quoteId) return;
        try {
            const q = await apiFetch('get_quote?id=' + encodeURIComponent(quoteId));
            if (q && q.error) { showToast(q.error, 'error'); return; }
            if (!q || !q.id) return;
            document.getElementById('contract-client-name').value = q.client_name || '';
            document.getElementById('contract-client-id').value = q.client_id || '';
            document.getElementById('contract-client-address').value = q.client_address || '';
            document.getElementById('contract-client-email').value = q.client_email || '';
            document.getElementById('contract-client-phone').value = q.client_phone || '';
            const total = (q.totals && q.totals.total != null) ? q.totals.total : (q.total_amount != null ? q.total_amount : '');
            document.getElementById('contract-amount').value = total !== '' ? total : '';
            if (!document.getElementById('contract-title').value) {
                document.getElementById('contract-title').value = 'Contrato - Presupuesto ' + (q.id || '');
            }
            updateContractPreview();
            showToast('Datos del presupuesto aplicados', 'success');
        } catch (e) { showToast('Error al cargar presupuesto', 'error'); }
    });

    window.openContractFromQuote = async function(quoteId) {
        if (!quoteId) return;
        switchSection('section-contracts', navContracts);
        await openContractFormNew(quoteId);
    };

    const contractsStatusFilter = document.getElementById('contracts-status-filter');
    const contractsSearchInput = document.getElementById('contracts-search');
    let contractsSearchTimeout = null;

    async function loadContractsPage() {
        const listCard = document.getElementById('contracts-list-card');
        const formCard = document.getElementById('contract-form-card');
        const listEl = document.getElementById('contracts-list');
        if (!listEl) return;
        try {
            const status = contractsStatusFilter ? contractsStatusFilter.value : '';
            const search = contractsSearchInput ? contractsSearchInput.value.trim() : '';
            let url = 'get_contracts';
            const params = new URLSearchParams();
            if (status) params.set('status', status);
            if (search) params.set('search', search);
            if (params.toString()) url += '?' + params.toString();
            const list = await apiFetch(url) || [];
            if (listCard) listCard.classList.remove('hidden');
            if (formCard) formCard.classList.add('hidden');
            document.getElementById('contract-preview-card')?.classList.add('hidden');
            if (!list.length) {
                listEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;padding:2rem;">No hay contratos con los filtros actuales. Prueba a cambiar el estado o la búsqueda, o crea uno nuevo.</div></div>';
            } else {
                const statusColors = { draft: 'rgba(148,163,184,0.25)', sent: 'rgba(59,130,246,0.25)', signed: 'rgba(16,185,129,0.25)', expired: 'rgba(245,158,11,0.25)', cancelled: 'rgba(239,68,68,0.2)' };
                listEl.innerHTML = list.map(c => {
                    const safeId = (c.id || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    const dateStr = c.date ? new Date(c.date).toLocaleDateString('es-ES') : '';
                    const amountStr = c.amount != null && c.amount !== '' ? formatCurrency(c.amount) : '—';
                    const statusStr = CONTRACT_STATUS_LABELS[c.status] || c.status || '—';
                    const statusBg = statusColors[c.status] || 'rgba(148,163,184,0.25)';
                    const vigencia = [c.start_date, c.end_date].filter(Boolean).map(d => new Date(d).toLocaleDateString('es-ES')).join(' – ') || '';
                    const title = (c.title || 'Sin título').replace(/</g, '&lt;');
                    const client = (c.client_name || '').replace(/</g, '&lt;');
                    return `
                    <div class="history-item contract-item" data-contract-id="${safeId}" onclick="if(!event.target.closest('.contract-item-actions')) openContract('${safeId}')" style="cursor:pointer;">
                        <div class="contract-item-main">
                            <strong class="contract-item-title">${title}</strong>
                            <div class="contract-item-meta"><small>${client} · ${amountStr}${dateStr ? ' · ' + dateStr : ''}${vigencia ? ' · Vigencia: ' + vigencia : ''}</small></div>
                            <span class="contract-status-badge" style="background:${statusBg};color:var(--text);">${statusStr}</span>
                        </div>
                        <div class="contract-item-actions" onclick="event.stopPropagation();">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="openContract('${safeId}')" title="Editar"><i data-lucide="edit-3" style="width:14px;height:14px;"></i> Editar</button>
                            <button type="button" class="btn btn-secondary btn-sm" onclick="downloadContractPdf('${safeId}')" title="Descargar PDF"><i data-lucide="download" style="width:14px;height:14px;"></i> PDF</button>
                            <button type="button" class="btn btn-remove btn-sm" onclick="deleteContractFromList('${safeId}')" title="Eliminar"><i data-lucide="trash-2" style="width:14px;height:14px;"></i> Eliminar</button>
                        </div>
                    </div>`;
                }).join('');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            listEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--danger);text-align:center;padding:2rem;">Error al cargar contratos. Intenta recargar.</div></div>';
        }
    }

    window.deleteContractFromList = async function(id) {
        if (!id || !confirm('¿Eliminar este contrato?')) return;
        try {
            const fd = new FormData();
            fd.append('id', id);
            const result = await apiFetch('delete_contract', { method: 'POST', body: fd });
            if (result && result.status === 'success') {
                showToast('Contrato eliminado', 'success');
                loadContractsPage();
            } else {
                showToast(result?.message || 'Error al eliminar', 'error');
            }
        } catch (e) {
            showToast('Error al eliminar contrato', 'error');
        }
    };

    window.downloadContractPdf = async function(id) {
        if (!id) return;
        await openContract(id);
        const previewCard = document.getElementById('contract-preview-card');
        if (previewCard) previewCard.classList.remove('hidden');
        updateContractPreview();
        setTimeout(() => document.getElementById('btn-contract-download-pdf')?.click(), 400);
    };
    window.openContract = async function(id) {
        const listCard = document.getElementById('contracts-list-card');
        const formCard = document.getElementById('contract-form-card');
        const previewCard = document.getElementById('contract-preview-card');
        if (!id) return;
        try {
            const c = await apiFetch('get_contract?id=' + encodeURIComponent(id));
            if (c && c.error) { showToast(c.error, 'error'); return; }
            if (!c || !c.id) { showToast('Contrato no encontrado', 'error'); return; }
            document.getElementById('contract-id').value = c.id;
            const dateVal = (c.date || '').toString().replace(' ', 'T').slice(0, 19);
            document.getElementById('contract-date').value = dateVal || '';
            document.getElementById('contract-client-name').value = c.client_name || '';
            document.getElementById('contract-client-id').value = c.client_id || '';
            document.getElementById('contract-client-address').value = c.client_address || '';
            document.getElementById('contract-client-email').value = c.client_email || '';
            document.getElementById('contract-client-phone').value = c.client_phone || '';
            document.getElementById('contract-title').value = c.title || '';
            document.getElementById('contract-terms').value = c.terms || '';
            document.getElementById('contract-amount').value = c.amount != null && c.amount !== '' ? c.amount : '';
            document.getElementById('contract-status').value = c.status || 'draft';
            document.getElementById('contract-start-date').value = (c.start_date || '').toString().slice(0, 10);
            document.getElementById('contract-end-date').value = (c.end_date || '').toString().slice(0, 10);
            const projSel = document.getElementById('contract-project-id');
            if (projSel && projSel.options.length <= 1) {
                const list = await apiFetch('get_projects') || [];
                const projects = Array.isArray(list) ? list : (list.projects || list.items || []);
                projSel.innerHTML = '<option value="">— Sin proyecto —</option>';
                projects.forEach(p => {
                    const o = document.createElement('option');
                    o.value = p.id;
                    o.textContent = (p.name || 'Proyecto ' + p.id).replace(/</g, '&lt;');
                    projSel.appendChild(o);
                });
            }
            document.getElementById('contract-project-id').value = (c.project_id != null && c.project_id !== '') ? c.project_id : '';
            await fillContractQuotesDropdown();
            const quoteSel = document.getElementById('contract-quote-id');
            if (quoteSel && c.quote_id) {
                const opt = Array.from(quoteSel.options).find(o => o.value === c.quote_id);
                if (!opt) {
                    const o = document.createElement('option');
                    o.value = c.quote_id;
                    o.textContent = 'Presupuesto ' + c.quote_id;
                    quoteSel.appendChild(o);
                }
                quoteSel.value = c.quote_id;
            } else if (quoteSel) quoteSel.value = '';
            document.getElementById('contract-form-title').innerHTML = '<i data-lucide="file-signature"></i> ' + (c.title || 'Contrato').replace(/</g, '&lt;');
            if (listCard) listCard.classList.add('hidden');
            if (formCard) formCard.classList.remove('hidden');
            if (previewCard) { previewCard.classList.remove('hidden'); updateContractPreview(); }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) { showToast('Error al cargar contrato', 'error'); }
    };
    async function openContractFormNew(optionalQuoteId) {
        document.getElementById('contract-id').value = '';
        document.getElementById('contract-date').value = new Date().toISOString().slice(0, 19);
        const templateSel = document.getElementById('contract-template');
        if (templateSel) templateSel.value = '';
        document.getElementById('contract-client-name').value = '';
        document.getElementById('contract-client-id').value = '';
        document.getElementById('contract-client-address').value = '';
        document.getElementById('contract-client-email').value = '';
        document.getElementById('contract-client-phone').value = '';
        document.getElementById('contract-title').value = '';
        document.getElementById('contract-terms').value = '';
        document.getElementById('contract-amount').value = '';
        document.getElementById('contract-status').value = 'draft';
        document.getElementById('contract-start-date').value = '';
        document.getElementById('contract-end-date').value = '';
        document.getElementById('contract-project-id').value = '';
        document.getElementById('contract-quote-id').value = '';
        document.getElementById('contract-form-title').innerHTML = '<i data-lucide="file-signature"></i> Nuevo contrato';
        const listCard = document.getElementById('contracts-list-card');
        const formCard = document.getElementById('contract-form-card');
        const previewCard = document.getElementById('contract-preview-card');
        if (listCard) listCard.classList.add('hidden');
        if (formCard) formCard.classList.remove('hidden');
        if (previewCard) previewCard.classList.add('hidden');
        await ensureEditorProjectsLoaded();
        const projSel = document.getElementById('contract-project-id');
        if (projSel && projSel.options.length <= 1) {
            const list = await apiFetch('get_projects') || [];
            const projects = Array.isArray(list) ? list : (list.projects || list.items || []);
            projSel.innerHTML = '<option value="">— Sin proyecto —</option>';
            projects.forEach(p => {
                const o = document.createElement('option');
                o.value = p.id;
                o.textContent = (p.name || 'Proyecto ' + p.id).replace(/</g, '&lt;');
                projSel.appendChild(o);
            });
        }
        await fillContractQuotesDropdown();
        if (optionalQuoteId) {
            const quoteSel = document.getElementById('contract-quote-id');
            if (quoteSel) {
                const opt = Array.from(quoteSel.options).find(o => o.value === optionalQuoteId);
                if (!opt) {
                    const o = document.createElement('option');
                    o.value = optionalQuoteId;
                    o.textContent = 'Presupuesto ' + optionalQuoteId;
                    quoteSel.appendChild(o);
                }
                quoteSel.value = optionalQuoteId;
                quoteSel.dispatchEvent(new Event('change'));
            }
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    function updateContractPreview() {
        const el = document.getElementById('contract-preview-content');
        if (!el) return;
        const name = document.getElementById('contract-client-name')?.value || 'Cliente';
        const title = document.getElementById('contract-title')?.value || 'Contrato';
        const terms = document.getElementById('contract-terms')?.value || '';
        const amount = document.getElementById('contract-amount')?.value;
        const start = document.getElementById('contract-start-date')?.value;
        const end = document.getElementById('contract-end-date')?.value;
        const id = document.getElementById('contract-id')?.value || 'Nuevo';
        const dateVal = document.getElementById('contract-date')?.value;
        const date = dateVal ? new Date(dateVal.replace(' ', 'T')).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES');
        el.innerHTML = `<h2 style="margin-top:0;">${(title).replace(/</g,'&lt;')}</h2><p><strong>Ref:</strong> ${(id).replace(/</g,'&lt;')} &nbsp; <strong>Fecha:</strong> ${date}</p><p><strong>Entre:</strong> ${companyData.name || 'Empresa'} y <strong>${(name).replace(/</g,'&lt;')}</strong></p>${start || end ? `<p><strong>Vigencia:</strong> ${start ? new Date(start).toLocaleDateString('es-ES') : '—'} a ${end ? new Date(end).toLocaleDateString('es-ES') : '—'}</p>` : ''}<div style="white-space:pre-wrap;margin:1rem 0;">${(terms || 'Sin cláusulas.').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>${amount !== '' && amount != null ? `<p style="margin-top:1rem;"><strong>Importe total:</strong> ${formatCurrency(parseFloat(amount) || 0)}</p>` : ''}`;
    }
    contractsStatusFilter?.addEventListener('change', () => loadContractsPage());
    if (contractsSearchInput) {
        contractsSearchInput.addEventListener('input', () => {
            if (contractsSearchTimeout) clearTimeout(contractsSearchTimeout);
            contractsSearchTimeout = setTimeout(() => loadContractsPage(), 400);
        });
    }
    document.getElementById('btn-new-contract')?.addEventListener('click', () => openContractFormNew());
    document.getElementById('btn-contract-back')?.addEventListener('click', () => loadContractsPage());
    document.getElementById('btn-save-contract')?.addEventListener('click', async () => {
        const clientName = document.getElementById('contract-client-name')?.value?.trim();
        if (!clientName) { showToast('Indica el nombre del cliente', 'error'); return; }
        const fd = new FormData();
        const id = document.getElementById('contract-id')?.value;
        if (id) fd.append('id', id);
        const dateInput = document.getElementById('contract-date')?.value;
        if (dateInput) fd.append('date', dateInput.replace('T', ' ') + (dateInput.match(/\d{2}:\d{2}:\d{2}/) ? '' : ':00'));
        fd.append('client_name', clientName);
        fd.append('client_id', document.getElementById('contract-client-id')?.value ?? '');
        fd.append('client_address', document.getElementById('contract-client-address')?.value ?? '');
        fd.append('client_email', document.getElementById('contract-client-email')?.value ?? '');
        fd.append('client_phone', document.getElementById('contract-client-phone')?.value ?? '');
        fd.append('title', document.getElementById('contract-title')?.value ?? '');
        fd.append('terms', document.getElementById('contract-terms')?.value ?? '');
        fd.append('amount', document.getElementById('contract-amount')?.value ?? '');
        fd.append('status', document.getElementById('contract-status')?.value ?? 'draft');
        fd.append('start_date', document.getElementById('contract-start-date')?.value ?? '');
        fd.append('end_date', document.getElementById('contract-end-date')?.value ?? '');
        fd.append('project_id', document.getElementById('contract-project-id')?.value ?? '');
        fd.append('quote_id', document.getElementById('contract-quote-id')?.value ?? '');
        try {
            const result = await apiFetch('save_contract', { method: 'POST', body: fd });
            if (result && result.status === 'success') {
                showToast('Contrato guardado', 'success');
                document.getElementById('contract-id').value = result.id || id;
                updateContractPreview();
            } else {
                showToast(result?.message || 'Error al guardar', 'error');
            }
        } catch (e) { showToast('Error al guardar contrato', 'error'); }
    });
    document.getElementById('btn-contract-delete')?.addEventListener('click', async () => {
        const id = document.getElementById('contract-id')?.value;
        if (!id || !confirm('¿Eliminar este contrato?')) return;
        try {
            const fd = new FormData();
            fd.append('id', id);
            const result = await apiFetch('delete_contract', { method: 'POST', body: fd });
            if (result && result.status === 'success') {
                showToast('Contrato eliminado', 'success');
                loadContractsPage();
            } else {
                showToast(result?.message || 'Error al eliminar', 'error');
            }
        } catch (e) { showToast('Error al eliminar', 'error'); }
    });
    ['contract-client-name','contract-title','contract-terms','contract-amount','contract-start-date','contract-end-date'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => updateContractPreview());
        document.getElementById(id)?.addEventListener('change', () => updateContractPreview());
    });
    async function getContractPDFBlob() {
        updateContractPreview();
        const el = document.getElementById('contract-preview');
        if (!el || typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
            throw new Error('Cargando librerías PDF...');
        }
        const canvas = await html2canvas(el, { scale: 2, useCORS: true });
        const img = canvas.toDataURL('image/png');
        const PdfCtor = window.jspdf && (window.jspdf.jsPDF || window.jspdf.js);
        if (!PdfCtor) throw new Error('No se pudo inicializar la librería PDF.');
        const pdf = new PdfCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const w = pdf.internal.pageSize.getWidth();
        const h = (canvas.height * w) / canvas.width;
        pdf.addImage(img, 'PNG', 0, 0, w, Math.min(h, 297));
        if (h > 297) {
            pdf.addPage();
            pdf.addImage(img, 'PNG', 0, -(297 * canvas.width / canvas.height), w, h);
        }
        return pdf.output('blob');
    }
    window.getContractPDFBlob = getContractPDFBlob;

    document.getElementById('btn-contract-download-pdf')?.addEventListener('click', async () => {
        const el = document.getElementById('contract-preview');
        if (!el || typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
            showToast('Cargando librerías PDF...', 'info');
            return;
        }
        showToast('Generando PDF...', 'info');
        try {
            const blob = await getContractPDFBlob();
            const id = document.getElementById('contract-id')?.value || 'contrato';
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Contrato_' + id + '.pdf';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            showToast('PDF descargado', 'success');
        } catch (e) {
            showToast(e.message || 'Error al generar PDF', 'error');
        }
    });
    document.getElementById('btn-contract-send-email')?.addEventListener('click', () => {
        const previewCard = document.getElementById('contract-preview-card');
        if (previewCard) previewCard.classList.remove('hidden');
        updateContractPreview();
        const contractId = document.getElementById('contract-id')?.value || 'contrato';
        const contractTitle = (document.getElementById('contract-title')?.value || 'Contrato').trim();
        const contractClientEmail = (document.getElementById('contract-client-email')?.value || '').trim();
        window._emailContext = {
            getPDFBlob: getContractPDFBlob,
            filename: 'Contrato_' + contractId + '.pdf'
        };
        const modalEmailOverlay = document.getElementById('modal-email-overlay');
        const modalEmailTo = document.getElementById('modal-email-to');
        const modalEmailSubject = document.getElementById('modal-email-subject');
        const modalEmailBody = document.getElementById('modal-email-body');
        const nombreArchivoContract = 'Contrato_' + contractId + '.pdf';
        const defaultBodyContract = `Buenos días,

Le enviamos el contrato en el archivo adjunto (${nombreArchivoContract}).

Puede revisarlo y, si tiene alguna duda, no dude en contactarnos.

Un cordial saludo.`;
        if (modalEmailTo) modalEmailTo.value = contractClientEmail;
        if (modalEmailSubject) modalEmailSubject.value = 'Contrato: ' + contractTitle;
        if (modalEmailBody) modalEmailBody.value = defaultBodyContract;
        if (modalEmailOverlay) modalEmailOverlay.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
        setTimeout(function () { if (modalEmailTo) modalEmailTo.focus(); }, 100);
    });
    document.getElementById('btn-contract-print')?.addEventListener('click', () => {
        try {
            updateContractPreview();
        } catch (e) {}
        const el = document.getElementById('contract-preview');
        if (!el) {
            showToast('No se pudo preparar la vista de impresión.', 'error');
            return;
        }
        const html = el.outerHTML;
        const w = window.open('', '_blank');
        if (!w) {
            showToast('El navegador ha bloqueado la ventana de impresión (popup).', 'error');
            return;
        }
        const cssHref = (function () {
            const basePath = (location.pathname || '').replace(/[^/]+$/, '');
            return basePath + 'style.css?v=6';
        })();
        w.document.open();
        w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Contrato</title>
<link rel="stylesheet" href="${cssHref}">
</head>
<body style="background:#fff;padding:2rem;">
<div class="contract-preview-print">
${html}
</div>
<script>
window.addEventListener('load', function() {
  window.print();
});
</script>
</body>
</html>`);
        w.document.close();
    });
    document.getElementById('btn-project-edit')?.addEventListener('click', () => {
        const id = document.getElementById('section-projects')?.querySelector('#project-detail-card')?.dataset?.projectId;
        if (id) openProjectForm(parseInt(id, 10));
    });
    document.getElementById('btn-project-detail-delete')?.addEventListener('click', () => {
        const id = document.getElementById('project-detail-card')?.dataset?.projectId;
        if (id) deleteProject(parseInt(id, 10));
    });
    document.getElementById('btn-save-project')?.addEventListener('click', async () => {
        const projectIdInput = document.getElementById('project-id');
        const projectNameInput = document.getElementById('project-name');
        const projectClientIdSelect = document.getElementById('project-client-id');
        const projectClientNameInput = document.getElementById('project-client-name');
        const name = projectNameInput?.value?.trim();
        if (!name) { showToast('El nombre del proyecto es obligatorio', 'error'); return; }
        const form = new FormData();
        if (projectIdInput?.value) form.append('id', projectIdInput.value);
        form.append('name', name);
        form.append('description', document.getElementById('project-description')?.value ?? '');
        form.append('client_name', projectClientNameInput?.value?.trim() ?? '');
        form.append('client_id', projectClientIdSelect?.value ?? '');
        form.append('status', document.getElementById('project-status')?.value ?? 'planning');
        form.append('budget', document.getElementById('project-budget')?.value ?? '');
        form.append('start_date', document.getElementById('project-start-date')?.value ?? '');
        form.append('end_date', document.getElementById('project-end-date')?.value ?? '');
        try {
            const res = await apiFetch('save_project', { method: 'POST', body: form });
            if (res && res.status === 'success') { showToast('Proyecto guardado', 'success'); loadProjectsPage(); }
            else showToast(res?.message || 'Error al guardar', 'error');
        } catch (e) { showToast('Error al guardar proyecto', 'error'); }
    });
    window.deleteProject = async function(projectId) {
        if (!confirm('¿Eliminar este proyecto y todas sus tareas? Esta acción no se puede deshacer.')) return;
        try {
            const form = new FormData();
            form.append('id', projectId);
            const result = await apiFetch('delete_project', { method: 'POST', body: form });
            if (result && result.status === 'success') {
                showToast('Proyecto eliminado', 'success');
                if (document.getElementById('project-form-card')?.classList.contains('hidden') === false && document.getElementById('project-id')?.value === String(projectId)) {
                    loadProjectsPage();
                } else {
                    loadProjectsPage();
                }
            } else {
                showToast(result?.message || 'No puedes eliminar este proyecto', 'error');
            }
        } catch (e) {
            showToast('Error al eliminar: ' + (e.message || ''), 'error');
        }
    };

    document.getElementById('btn-delete-project')?.addEventListener('click', async () => {
        const id = document.getElementById('project-id')?.value;
        if (!id) return;
        await deleteProject(parseInt(id, 10));
    });
    document.getElementById('btn-add-project-task')?.addEventListener('click', async () => {
        const projectId = document.getElementById('project-detail-card')?.dataset?.projectId;
        const titleInput = document.getElementById('project-task-title');
        const dueInput = document.getElementById('project-task-due');
        const assigneeSelect = document.getElementById('project-task-assignee');
        const title = titleInput?.value?.trim();
        if (!title) { showToast('Escribe el título de la tarea', 'error'); return; }
        if (!projectId) { showToast('Proyecto no cargado', 'error'); return; }
        const form = new FormData();
        form.append('project_id', projectId);
        form.append('title', title);
        form.append('due_date', dueInput?.value ?? '');
        form.append('assigned_to_user_id', assigneeSelect?.value ?? '');
        try {
            await apiFetch('save_project_task', { method: 'POST', body: form });
            showToast('Tarea añadida', 'success');
            titleInput.value = '';
            dueInput.value = '';
            if (assigneeSelect) assigneeSelect.value = '';
            openProjectDetail(parseInt(projectId, 10));
        } catch (e) { showToast('Error al añadir tarea', 'error'); }
    });
    projectsStatusFilter?.addEventListener('change', () => loadProjectsPage());
    let projectsSearchTimeout = null;
    projectsSearchInput?.addEventListener('input', () => {
        clearTimeout(projectsSearchTimeout);
        projectsSearchTimeout = setTimeout(() => loadProjectsPage(), 400);
    });

    document.getElementById('projects-my-tasks-filter')?.addEventListener('change', () => {
        const myTasksEl = document.getElementById('projects-my-tasks-list');
        const myTasksFilter = document.getElementById('projects-my-tasks-filter');
        if (!myTasksEl || !window._myTasksCache) return;
        const onlyPending = myTasksFilter && myTasksFilter.value === 'pending';
        const arr = onlyPending ? window._myTasksCache.filter(t => !(t.completed === 1 || t.completed === '1' || t.completed === true)) : window._myTasksCache;
        if (arr.length === 0) {
            myTasksEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">' + (onlyPending ? 'No tienes tareas pendientes.' : 'No tienes tareas asignadas.') + '</div></div>';
        } else {
                    myTasksEl.innerHTML = arr.map(t => {
                            const projName = (t.project_name || 'Proyecto').replace(/</g, '&lt;');
                            const title = (t.title || '').replace(/</g, '&lt;');
                            const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('es-ES') : '';
                            const done = t.completed === 1 || t.completed === '1';
                            const assignedBy = (t.assigned_by_username || '').trim() ? ' · ' + (t.assigned_by_username || '').replace(/</g, '&lt;') : '';
                            return `<div class="history-item" style="cursor:pointer;" onclick="openProjectDetail(${t.project_id})"><div style="flex:1"><strong>${title}</strong><br><small>${projName}${dueStr ? ' · ' + dueStr : ''}${assignedBy}</small>${done ? '<br><span style="color:var(--accent);font-size:0.8rem;">Completada</span>' : ''}</div><i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-muted);"></i></div>`;
                        }).join('');
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    });

    window._activitiesCache = [];
    window._activitiesProjectFilter = '';
    async function loadActivitiesPage() {
        const listEl = document.getElementById('activities-list');
        const emptyEl = document.getElementById('activities-empty');
        const statPending = document.getElementById('activities-count-pending');
        const statDone = document.getElementById('activities-count-done');
        const statOverdue = document.getElementById('activities-count-overdue');
        const statWeek = document.getElementById('activities-count-week');
        const filterEl = document.getElementById('activities-filter');
        const sortEl = document.getElementById('activities-sort');
        const searchEl = document.getElementById('activities-search');
        if (!listEl) return;
        try {
            const [raw, usersList] = await Promise.all([
                apiFetch('get_my_tasks'),
                apiFetch('get_users_for_assignment')
            ]);
            const all = Array.isArray(raw) ? raw : [];
            window._activitiesCache = all;
            const projectFilterSelect = document.getElementById('activities-project-filter');
            if (projectFilterSelect) {
                const existingVal = window._activitiesProjectFilter || '';
                const projects = Array.from(new Map(all.map(t => [t.project_id, t.project_name])).entries())
                    .filter(([id, name]) => id && name)
                    .sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));
                projectFilterSelect.innerHTML = '<option value="">Todos los proyectos</option>' +
                    projects.map(([id, name]) => `<option value="${id}">${(name || '').replace(/</g, '&lt;')}</option>`).join('');
                if (existingVal) projectFilterSelect.value = String(existingVal);
            }

            const datalist = document.getElementById('activities-users-datalist');
            if (datalist && Array.isArray(usersList)) {
                datalist.innerHTML = '';
                usersList.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.username || '';
                    datalist.appendChild(opt);
                });
            }
            const today = new Date().toISOString().slice(0, 10);
            const endOfWeek = new Date();
            endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
            const weekEnd = endOfWeek.toISOString().slice(0, 10);
            const pending = all.filter(t => !(t.completed === 1 || t.completed === '1' || t.completed === true));
            const overdue = pending.filter(t => t.due_date && (t.due_date + '').slice(0, 10) < today);
            const thisWeek = pending.filter(t => {
                const d = (t.due_date || '').toString().slice(0, 10);
                return d && d >= today && d <= weekEnd;
            });
            if (statPending) statPending.textContent = pending.length;
            if (statDone) statDone.textContent = all.length - pending.length;
            if (statOverdue) statOverdue.textContent = overdue.length;
            if (statWeek) statWeek.textContent = thisWeek.length;

            const filter = (filterEl && filterEl.value) || 'pending';
            let arr = filter === 'pending' ? pending : filter === 'overdue' ? overdue : filter === 'this_week' ? thisWeek : filter === 'completed' ? all.filter(t => t.completed === 1 || t.completed === '1') : all;
            const projectFilterSelect2 = document.getElementById('activities-project-filter');
            const projectFilterVal = projectFilterSelect2 ? (projectFilterSelect2.value || '').trim() : '';
            if (projectFilterVal) {
                const pid = parseInt(projectFilterVal, 10);
                if (!isNaN(pid)) {
                    arr = arr.filter(t => parseInt(t.project_id, 10) === pid);
                }
            }
            const searchTerm = (searchEl && searchEl.value || '').trim().toLowerCase();
            if (searchTerm) arr = arr.filter(t => {
                const title = (t.title || '').toLowerCase();
                const desc = (t.description || '').toString().toLowerCase();
                return title.includes(searchTerm) || desc.includes(searchTerm);
            });
            const sort = (sortEl && sortEl.value) || 'due';
            if (sort === 'recent') arr = [...arr].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            else if (sort === 'project') arr = [...arr].sort((a, b) => (a.project_name || '').localeCompare(b.project_name || ''));
            else if (sort === 'assigned_by') arr = [...arr].sort((a, b) => (a.assigned_by_username || '').localeCompare(b.assigned_by_username || ''));
            else arr = [...arr].sort((a, b) => {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
            });

            if (arr.length === 0) {
                listEl.innerHTML = '';
                if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.style.display = 'block'; }
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                return;
            }
            if (emptyEl) { emptyEl.classList.add('hidden'); emptyEl.style.display = 'none'; }

            listEl.innerHTML = arr.map(t => {
                const done = t.completed === 1 || t.completed === '1';
                const due = (t.due_date || '').toString().slice(0, 10);
                const dueStr = due ? new Date(t.due_date).toLocaleDateString('es-ES') : '';
                let dueBadge = '';
                let dueState = '';
                if (!done && due) {
                    if (due < today) { dueBadge = '<span class="activity-badge overdue">Vencida</span>'; dueState = 'overdue'; }
                    else if (due === today) { dueBadge = '<span class="activity-badge due-today">Vence hoy</span>'; dueState = 'today'; }
                    else if (due <= weekEnd) { dueBadge = '<span class="activity-badge project">' + dueStr + ' (esta semana)</span>'; dueState = 'week'; }
                    else dueBadge = '<span class="activity-badge project">' + dueStr + '</span>';
                } else if (done) dueBadge = '<span class="activity-badge done">Completada</span>';
                const assignedBy = (t.assigned_by_username || '').trim() ? 'Asignado por ' + (t.assigned_by_username || '').replace(/</g, '&lt;') : '';
                const projName = (t.project_name || 'Proyecto').replace(/</g, '&lt;');
                const title = (t.title || '').replace(/</g, '&lt;');
                const desc = (t.description || '').toString().trim().replace(/</g, '&lt;');
                const createdStr = t.created_at ? new Date(t.created_at).toLocaleDateString('es-ES') : '';
                return `
                    <div class="activity-card ${done ? 'completed' : ''}" data-task-id="${t.task_id}" data-project-id="${t.project_id}" data-due-state="${dueState}">
                        <div class="activity-card-header">
                            <div class="activity-card-check">
                                <input type="checkbox" ${done ? 'checked' : ''} aria-label="Marcar como completada" onchange="toggleActivityCompleted(${t.task_id}, ${t.project_id}, this.checked)">
                            </div>
                            <div class="activity-card-body">
                                <div class="activity-title">${title}</div>
                                <div class="activity-meta">${projName}${assignedBy ? ' · ' + assignedBy : ''}${createdStr ? ' · ' + createdStr : ''}</div>
                                ${desc ? '<div class="activity-description">' + desc + '</div>' : ''}
                                <div class="activity-badges">${dueBadge}</div>
                                <div class="activity-card-actions">
                                    <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('nav-projects').click(); setTimeout(() => openProjectDetail(${t.project_id}), 350)"><i data-lucide="external-link" style="width:14px;height:14px;"></i> Ver proyecto</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            listEl.innerHTML = '<div class="activity-card"><div class="activity-card-body"><p style="color:var(--danger);">No se pudieron cargar las actividades.</p></div></div>';
            if (emptyEl) emptyEl.classList.add('hidden');
        }
    }

    window.toggleActivityCompleted = async function(taskId, projectId, completed) {
        try {
            const fd = new FormData();
            fd.append('task_id', taskId);
            fd.append('project_id', projectId);
            fd.append('completed', completed ? '1' : '0');
            await apiFetch('set_task_completed', { method: 'POST', body: fd });
            showToast(completed ? 'Tarea marcada como completada' : 'Tarea pendiente', 'success');
            const card = document.querySelector(`.activity-card[data-task-id="${taskId}"][data-project-id="${projectId}"]`);
            if (card) {
                card.classList.toggle('completed', !!completed);
                const badge = card.querySelector('.activity-badge.done');
                const check = card.querySelector('.activity-card-check input');
                if (completed && !badge) {
                    const badges = card.querySelector('.activity-badges');
                    if (badges) badges.insertAdjacentHTML('beforeend', '<span class="activity-badge done">Completada</span>');
                } else if (!completed && badge) badge.remove();
            }
            const statPending = document.getElementById('activities-count-pending');
            const statDone = document.getElementById('activities-count-done');
            const all = window._activitiesCache || [];
            const pending = all.filter(t => !(t.completed === 1 || t.completed === '1'));
            const updated = all.map(t => t.task_id === taskId ? { ...t, completed: completed ? 1 : 0 } : t);
            window._activitiesCache = updated;
            const newPending = updated.filter(t => !(t.completed === 1 || t.completed === '1')).length;
            if (statPending) statPending.textContent = newPending;
            if (statDone) statDone.textContent = updated.length - newPending;
        } catch (e) {
            showToast(e?.message || 'Error al actualizar', 'error');
        }
    };

    document.getElementById('activities-filter')?.addEventListener('change', () => loadActivitiesPage());
    document.getElementById('activities-sort')?.addEventListener('change', () => loadActivitiesPage());
    document.getElementById('activities-project-filter')?.addEventListener('change', (e) => {
        window._activitiesProjectFilter = e.target.value || '';
        loadActivitiesPage();
    });
    document.getElementById('activities-refresh')?.addEventListener('click', () => loadActivitiesPage());
    document.getElementById('activities-stats')?.addEventListener('click', function (e) {
        var stat = e.target.closest('.activity-stat[data-filter]');
        if (!stat) return;
        var filterVal = stat.getAttribute('data-filter');
        var f = document.getElementById('activities-filter');
        if (f && filterVal) { f.value = filterVal; loadActivitiesPage(); }
    });
    let activitiesSearchTimeout = null;
    document.getElementById('activities-search')?.addEventListener('input', () => {
        clearTimeout(activitiesSearchTimeout);
        activitiesSearchTimeout = setTimeout(() => loadActivitiesPage(), 200);
    });

    document.getElementById('activities-btn-assign')?.addEventListener('click', async () => {
        const toUser = (document.getElementById('activities-assign-to')?.value || '').trim();
        const title = (document.getElementById('activities-assign-title')?.value || '').trim();
        if (!toUser) { showToast('Indica el nombre del usuario', 'error'); return; }
        if (!title || title.length < 3) { showToast('Indica la tarea o instrucción (mín. 3 caracteres)', 'error'); return; }
        try {
            const fd = new FormData();
            fd.append('to_user', toUser);
            fd.append('title', title);
            fd.append('description', '');
            const res = await apiFetch('create_assigned_activity', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast('Tarea asignada a ' + toUser, 'success');
                document.getElementById('activities-assign-to').value = '';
                document.getElementById('activities-assign-title').value = '';
                await loadActivitiesPage();
            } else {
                showToast(res?.message || 'No se pudo asignar', 'error');
            }
        } catch (e) {
            showToast(e?.message || 'Error al asignar', 'error');
        }
    });

    function openChatbotPanel() {
        const panel = document.getElementById('chatbot-panel');
        const messagesEl = document.getElementById('chatbot-messages');
        if (panel) panel.classList.remove('hidden');
        if (messagesEl && messagesEl.children.length === 0 && typeof addMessage === 'function') {
            const welcome = typeof CHATBOT_WELCOME !== 'undefined' ? CHATBOT_WELCOME : 'Di "Ayuda" para ver qué puedo hacer.';
            addMessage('bot', welcome);
        }
    }
    document.getElementById('activities-open-chatbot')?.addEventListener('click', openChatbotPanel);
    document.getElementById('activities-empty-open-chatbot')?.addEventListener('click', openChatbotPanel);
    document.getElementById('activities-empty-go-projects')?.addEventListener('click', () => { navProjects.click(); });

    document.getElementById('btn-projects-go-activities')?.addEventListener('click', () => { navActivities.click(); });
    document.getElementById('btn-project-tasks-open-activities')?.addEventListener('click', () => {
        const cardDetail = document.getElementById('project-detail-card');
        const pid = cardDetail?.dataset?.projectId;
        if (!pid) { navActivities.click(); return; }
        window._activitiesProjectFilter = String(pid);
        navActivities.click();
        setTimeout(() => { loadActivitiesPage(); }, 300);
    });

    let currentEditingCustomerId = null;
    let lastCustomersData = [];

    function renderCustomersList(customersData) {
        const customersList = document.getElementById('customers-list');
        if (!customersList) return;
        renderList(
            customersList,
            customersData,
            (c) => {
                const userBadge = c.username ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${c.username}</span>` : '';
                const cat = (c.category || '').trim() ? `<span style="color:var(--text-muted);font-size:0.75rem;">${c.category}</span>` : '';
                const bd = (c.birthday || '').trim() ? `<br><small style="color:var(--text-muted);">Cumple: ${c.birthday}</small>` : '';
                const lead = (c.lead_source || '').trim() ? ` <span style="font-size:0.7rem;color:var(--primary);">${c.lead_source}</span>` : '';
                return `
                    <div class="history-item">
                        <div style="flex:1"><strong>${(c.name || '').replace(/</g, '&lt;')}</strong>${userBadge}${lead}<br><small>${c.tax_id || ''} • ${c.email || ''}</small>${cat}${bd}</div>
                        <button class="btn btn-secondary btn-sm" onclick="showCustomerModal(${c.id})" title="Ver / Log">Ver</button>
                        <button class="btn btn-primary btn-sm" onclick="newQuoteFromCustomer(${c.id})" title="Nuevo presupuesto para este cliente"><i data-lucide="file-plus" style="width:12px;height:12px;"></i> Presupuesto</button>
                        <button class="btn btn-secondary btn-sm" onclick="setClientFromAgenda(${c.id})">Seleccionar</button>
                        <button class="btn btn-remove btn-sm" onclick="deleteCustomer(${c.id})">🗑️</button>
                    </div>
                `;
            },
            'No hay clientes registrados'
        );
    }

    async function loadCustomers() {
        try {
            const category = (document.getElementById('customers-filter-category') && document.getElementById('customers-filter-category').value) || '';
            let data = category ? null : getCachedData('customers');
            if (!data) {
                data = await apiFetch('get_customers' + (category ? '?category=' + encodeURIComponent(category) : ''));
                if (!category) setCachedData('customers', data);
            }
            lastCustomersData = Array.isArray(data) ? data : [];
            const searchInput = document.getElementById('customers-search');
            const searchTerm = (searchInput && searchInput.value || '').trim().toLowerCase();
            const toRender = searchTerm
                ? lastCustomersData.filter(c => {
                    const name = (c.name || '').toLowerCase();
                    const taxId = (c.tax_id || '').toLowerCase();
                    const email = (c.email || '').toLowerCase();
                    return name.includes(searchTerm) || taxId.includes(searchTerm) || email.includes(searchTerm);
                })
                : lastCustomersData;
            renderCustomersList(toRender);
            const dl = document.getElementById('customers-datalist');
            if (dl && data) dl.innerHTML = data.map(c => `<option value="${c.name}">`).join('');
        } catch (e) {
            console.error('Error cargando clientes:', e);
        }
    }

    const customersSearchInput = document.getElementById('customers-search');
    if (customersSearchInput) {
        customersSearchInput.addEventListener('input', () => {
            if (!lastCustomersData.length) return;
            const term = (customersSearchInput.value || '').trim().toLowerCase();
            const toRender = term
                ? lastCustomersData.filter(c => {
                    const name = (c.name || '').toLowerCase();
                    const taxId = (c.tax_id || '').toLowerCase();
                    const email = (c.email || '').toLowerCase();
                    return name.includes(term) || taxId.includes(term) || email.includes(term);
                })
                : lastCustomersData;
            renderCustomersList(toRender);
        });
    }

    async function loadCustomersBirthdays() {
        const list = document.getElementById('customers-birthdays-list');
        const card = document.getElementById('customers-birthdays-card');
        if (!list || !card) return;
        try {
            const data = await apiFetch('get_customers_birthdays');
            if (data && data.length > 0) {
                card.style.display = 'block';
                list.innerHTML = data.map(c => {
                    const day = c.birthday ? c.birthday.split('-')[2] : '';
                    return `<div class="history-item"><div style="flex:1"><strong>${(c.name || '').replace(/</g, '&lt;')}</strong><br><small>Día ${day} de este mes</small></div></div>`;
                }).join('');
            } else {
                card.style.display = 'none';
            }
        } catch (e) {
            card.style.display = 'none';
        }
    }

    window.showCustomerModal = async (customerId) => {
        try {
            let data = await apiFetch('get_customers');
            const c = data.find(x => x.id == customerId);
            if (!c) return;
            currentEditingCustomerId = c.id;
            document.getElementById('modal-customer-title').textContent = c.name || 'Cliente';
            const details = document.getElementById('modal-customer-details');
            details.innerHTML = `
                <p><strong>Email:</strong> ${(c.email || '—')}</p>
                <p><strong>Teléfono:</strong> ${(c.phone || '—')}</p>
                <p><strong>Dirección:</strong> ${(c.address || '—')}</p>
                <p><strong>Categoría:</strong> ${(c.category || '—')}</p>
                <p><strong>Origen:</strong> ${(c.lead_source || 'Manual')}</p>
                <p><strong>Cumpleaños:</strong> ${(c.birthday || '—')}</p>
                ${(c.notes || '').trim() ? '<p><strong>Notas:</strong><br>' + (c.notes || '').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>' : ''}
            `;
            const docsEl = document.getElementById('modal-customer-documents');
            try {
                const docs = await apiFetch('get_customer_documents?customer_id=' + encodeURIComponent(c.id));
                const quotes = docs.quotes || [];
                const invoices = docs.invoices || [];
                const parts = [];
                quotes.forEach(q => {
                    const dateStr = q.date ? new Date(q.date).toLocaleDateString('es-ES') : '';
                    const status = (q.status || 'draft').toLowerCase();
                    const label = status === 'accepted' ? 'Aceptado' : status === 'sent' ? 'Enviado' : status === 'waiting_client' ? 'En espera de cliente' : status === 'rejected' ? 'Rechazado' : 'Borrador';
                    parts.push(`<div class="history-item" style="padding:0.4rem;"><a href="#" onclick="event.preventDefault();loadQuote('${(q.id||'').replace(/'/g,"\\'")}');document.getElementById('modal-customer-overlay').classList.add('hidden');">Presupuesto ${(q.id||'').replace(/</g,'&lt;')}</a> · ${formatCurrency(q.total_amount||0)} · ${label}${dateStr?' · '+dateStr:''}</div>`);
                });
                invoices.forEach(inv => {
                    const dateStr = inv.date ? new Date(inv.date).toLocaleDateString('es-ES') : '';
                    const status = (inv.status || 'pending').toLowerCase();
                    const label = status === 'paid' ? 'Pagada' : status === 'pending' ? 'Pendiente' : 'Anulada';
                    parts.push(`<div class="history-item" style="padding:0.4rem;"><a href="#" onclick="event.preventDefault();loadInvoice('${(inv.id||'').replace(/'/g,"\\'")}');document.getElementById('modal-customer-overlay').classList.add('hidden');">Factura ${(inv.id||'').replace(/</g,'&lt;')}</a> · ${formatCurrency(inv.total_amount||0)} · ${label}${dateStr?' · '+dateStr:''}</div>`);
                });
                if (parts.length) docsEl.innerHTML = parts.join('');
                else docsEl.innerHTML = '<p style="color:var(--text-muted);padding:0.5rem;">Ningún presupuesto ni factura con este cliente.</p>';
            } catch (e) {
                if (docsEl) docsEl.innerHTML = '<p style="color:var(--text-muted);padding:0.5rem;">No se pudo cargar el historial.</p>';
            }
            const auditEl = document.getElementById('modal-customer-audit');
            const log = await apiFetch('get_audit_log?table_name=customers&record_id=' + encodeURIComponent(c.id));
            if (log && log.length > 0) {
                auditEl.innerHTML = log.map(l => `<div class="history-item" style="padding:0.5rem;"><small>${l.created_at || ''} — ${l.username || ''}: ${l.changes || l.action || ''}</small></div>`).join('');
            } else {
                auditEl.innerHTML = '<p style="color:var(--text-muted);">Sin registros de actividad.</p>';
            }
            document.getElementById('modal-customer-overlay').classList.remove('hidden');
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            showToast('Error al cargar cliente', 'error');
        }
    };

    var modalCustomerOverlay = document.getElementById('modal-customer-overlay');
    function closeCustomerModal() {
        if (modalCustomerOverlay) modalCustomerOverlay.classList.add('hidden');
    }
    document.getElementById('modal-customer-close').addEventListener('click', closeCustomerModal);
    if (modalCustomerOverlay) {
        modalCustomerOverlay.addEventListener('click', function (e) {
            if (e.target === modalCustomerOverlay) closeCustomerModal();
        });
    }
    document.addEventListener('keydown', function customerModalEscape(e) {
        if (e.key === 'Escape' && modalCustomerOverlay && !modalCustomerOverlay.classList.contains('hidden')) {
            closeCustomerModal();
        }
    });
    document.getElementById('modal-customer-link-docs')?.addEventListener('click', async () => {
        if (!currentEditingCustomerId) return;
        try {
            const fd = new FormData();
            fd.append('action', 'generate_client_view_token');
            fd.append('customer_id', currentEditingCustomerId);
            const r = await fetch(getApiEndpoint() + '?t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
            const res = await r.json();
            if (res.status === 'success' && res.url) {
                await navigator.clipboard.writeText(res.url);
                showToast('Enlace copiado. El cliente puede abrirlo para ver sus documentos.');
            } else {
                showToast(res.message || 'Error al generar enlace', 'error');
            }
        } catch (e) {
            const msg = (e && e.message || '').toString();
            if (msg.includes('504') || msg.includes('Timeout')) {
                showToast('El servidor ha tardado demasiado. Intenta de nuevo en un momento.', 'error');
            } else {
                showToast('Error: ' + (msg || 'al generar enlace'), 'error');
            }
        }
    });

    document.getElementById('modal-customer-edit').addEventListener('click', async () => {
        if (!currentEditingCustomerId) return;
        let data = getCachedData('customers');
        if (!data) data = await apiFetch('get_customers');
        const c = data.find(x => x.id == currentEditingCustomerId);
        if (c) {
            document.getElementById('cust-name').value = c.name || '';
            document.getElementById('cust-tax-id').value = c.tax_id || '';
            document.getElementById('cust-email').value = c.email || '';
            document.getElementById('cust-phone').value = c.phone || '';
            document.getElementById('cust-address').value = c.address || '';
            document.getElementById('cust-notes').value = c.notes || '';
            document.getElementById('cust-category').value = c.category || '';
            document.getElementById('cust-lead-source').value = c.lead_source || '';
            document.getElementById('cust-birthday').value = c.birthday || '';
            document.getElementById('modal-customer-overlay').classList.add('hidden');
            document.getElementById('cust-name').focus();
        }
    });

    document.getElementById('customers-filter-category').addEventListener('change', () => {
        invalidateCache('customers');
        loadCustomers();
    });

    window.setClientFromAgenda = async (id) => {
        try {
            const data = await apiFetch('get_customers');
            const c = data.find(x => x.id == id);
            if (c) {
                clientNameInput.value = c.name;
                clientIdInput.value = c.tax_id || '';
                clientAddressInput.value = c.address || '';
                clientEmailInput.value = c.email || '';
                clientPhoneInput.value = c.phone || '';
                updatePreview();
                switchSection('section-editor', navEditor);
            }
        } catch (e) { }
    };

    // Guardar en Agenda: tomar datos del cliente del editor y crear/actualizar en Agenda (Clientes)
    document.getElementById('btn-save-as-customer')?.addEventListener('click', async () => {
        const name = (clientNameInput && clientNameInput.value) ? clientNameInput.value.trim() : '';
        if (!name) {
            showToast('Indica al menos el nombre del cliente', 'error');
            return;
        }
        const fd = new FormData();
        fd.append('name', name);
        fd.append('tax_id', (clientIdInput && clientIdInput.value) ? clientIdInput.value.trim() : '');
        fd.append('address', (clientAddressInput && clientAddressInput.value) ? clientAddressInput.value.trim() : '');
        fd.append('email', (clientEmailInput && clientEmailInput.value) ? clientEmailInput.value.trim() : '');
        fd.append('phone', (clientPhoneInput && clientPhoneInput.value) ? clientPhoneInput.value.trim() : '');
        try {
            const result = await apiFetch('save_customer', { method: 'POST', body: fd });
            if (result && result.status === 'error') {
                showToast(result.message || 'Error al guardar en Agenda', 'error');
                return;
            }
            showToast('Cliente guardado en Agenda', 'success');
            invalidateCache('customers');
        } catch (e) {
            showToast(e && e.message ? e.message : 'Error al guardar en Agenda', 'error');
        }
    });

    document.getElementById('btn-add-customer').addEventListener('click', async () => {
        const fd = new FormData();
        fd.append('name', document.getElementById('cust-name').value);
        fd.append('tax_id', document.getElementById('cust-tax-id').value);
        fd.append('email', document.getElementById('cust-email').value);
        fd.append('phone', document.getElementById('cust-phone').value);
        fd.append('address', document.getElementById('cust-address').value);
        const notesEl = document.getElementById('cust-notes');
        const catEl = document.getElementById('cust-category');
        const leadEl = document.getElementById('cust-lead-source');
        const bdayEl = document.getElementById('cust-birthday');
        if (notesEl) fd.append('notes', notesEl.value);
        if (catEl) fd.append('category', catEl.value);
        if (leadEl) fd.append('lead_source', leadEl.value);
        if (bdayEl) fd.append('birthday', bdayEl.value);
        if (currentEditingCustomerId) fd.append('id', currentEditingCustomerId);
        try {
            await apiFetch('save_customer', { method: 'POST', body: fd });
            showToast(currentEditingCustomerId ? 'Cliente actualizado' : 'Cliente guardado', 'success');
            currentEditingCustomerId = null;
            invalidateCache('customers');
            document.getElementById('cust-name').value = '';
            document.getElementById('cust-tax-id').value = '';
            document.getElementById('cust-email').value = '';
            document.getElementById('cust-phone').value = '';
            document.getElementById('cust-address').value = '';
            if (notesEl) notesEl.value = '';
            if (catEl) catEl.value = '';
            if (leadEl) leadEl.value = '';
            if (bdayEl) bdayEl.value = '';
            loadCustomers();
            loadCustomersBirthdays();
        } catch (e) {
            showToast(e.message || 'Error al guardar', 'error');
        }
    });

    // Integración de Leads/Vendomia eliminada: ya no se capturan leads externos

    window.deleteCustomer = async (id) => {
        if (!confirm('¿Eliminar cliente?')) return;
        const fd = new FormData(); fd.append('id', id);
        await apiFetch('delete_customer', { method: 'POST', body: fd });
        invalidateCache('customers');
        loadCustomers();
    };

    function downloadAppointmentIcs(id, clientName, dateStr, description) {
        const d = dateStr ? new Date(dateStr) : new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const y = d.getFullYear(), m = pad(d.getMonth() + 1), day = pad(d.getDate());
        const h = pad(d.getHours()), min = pad(d.getMinutes()), sec = pad(d.getSeconds());
        const dtStart = `${y}${m}${day}T${h}${min}${sec}`;
        const endD = new Date(d.getTime() + 60 * 60 * 1000);
        const dtEnd = `${endD.getFullYear()}${pad(endD.getMonth()+1)}${pad(endD.getDate())}T${pad(endD.getHours())}${pad(endD.getMinutes())}${pad(endD.getSeconds())}`;
        const summary = (clientName || 'Cita').replace(/[,;\n]/g, ' ');
        const desc = (description || '').replace(/\n/g, '\\n');
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//NAVEGA360PRO//Cita//ES',
            'BEGIN:VEVENT',
            'UID:presup-cita-' + id + '@navega360pro',
            'DTSTAMP:' + dtStart,
            'DTSTART:' + dtStart,
            'DTEND:' + dtEnd,
            'SUMMARY:' + summary,
            (desc ? 'DESCRIPTION:' + desc : ''),
            'END:VEVENT',
            'END:VCALENDAR'
        ].filter(Boolean).join('\r\n');
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cita_' + (clientName || 'cita').replace(/\s+/g, '_').replace(/[^\w\-_]/g, '') + '.ics';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Descargado .ics para el calendario', 'success');
    }
    window.downloadAppointmentIcs = downloadAppointmentIcs;

    let calendarState = { year: new Date().getFullYear(), month: new Date().getMonth(), selectedDate: null, viewMode: 'month' };
    let lastAppointmentsData = [];
    let confirmationAppointmentForIcs = null;

    function getMonthName(monthIndex) {
        const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        return names[monthIndex] || '';
    }

    function buildCalendarDays(year, month) {
        const first = new Date(year, month, 1);
        const last = new Date(year, month + 1, 0);
        const firstDay = (first.getDay() + 6) % 7;
        const daysInMonth = last.getDate();
        const prevLast = new Date(year, month, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstDay; i++) {
            const d = prevLast - firstDay + 1 + i;
            const p = new Date(year, month - 1, d);
            cells.push({ day: d, otherMonth: true, dateKey: p.getFullYear() + '-' + String(p.getMonth() + 1).padStart(2, '0') + '-' + String(p.getDate()).padStart(2, '0') });
        }
        for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, otherMonth: false, dateKey: year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0') });
        const rest = 42 - cells.length;
        for (let i = 0; i < rest; i++) {
            const n = new Date(year, month + 1, i + 1);
            cells.push({ day: i + 1, otherMonth: true, dateKey: n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0') });
        }
        return { cells, year, month, daysInMonth };
    }

    function renderAppointmentsCalendar(appointments) {
        lastAppointmentsData = appointments || lastAppointmentsData;
        const appts = lastAppointmentsData || [];
        const byDate = {};
        appts.forEach(a => {
            const raw = (a.date || '').toString().trim();
            const d = raw.indexOf('T') !== -1
                ? (() => { const x = new Date(raw); return isNaN(x.getTime()) ? raw.slice(0, 10) : x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); })()
                : raw.slice(0, 10);
            if (d && d.length >= 10) {
                const key = d.slice(0, 10);
                if (!byDate[key]) byDate[key] = [];
                byDate[key].push(a);
            }
        });

        const gridEl = document.getElementById('appointments-calendar-grid');
        const titleEl = document.getElementById('calendar-month-title');
        if (!gridEl || !titleEl) return;

        const { year, month, cells } = buildCalendarDays(calendarState.year, calendarState.month);
        titleEl.textContent = getMonthName(month) + ' ' + year;

        const today = new Date();
        const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

        let html = '';
        ['L','M','X','J','V','S','D'].forEach(w => { html += `<span class="calendar-weekday">${w}</span>`; });
        // Determinar semana seleccionada si estamos en vista semana
        let weekIndex = null;
        if (calendarState.viewMode === 'week' && calendarState.selectedDate) {
            const sel = new Date(calendarState.selectedDate);
            if (!isNaN(sel.getTime()) && sel.getFullYear() === calendarState.year && sel.getMonth() === calendarState.month) {
                const first = new Date(calendarState.year, calendarState.month, 1);
                const firstDay = (first.getDay() + 6) % 7;
                const day = sel.getDate();
                const cellIndex = firstDay + day - 1;
                weekIndex = Math.floor(cellIndex / 7);
            }
        }
        cells.forEach((c, idx) => {
            if (calendarState.viewMode === 'week' && weekIndex !== null && Math.floor(idx / 7) !== weekIndex) {
                return;
            }
            const dateKey = c.dateKey || (year + '-' + String(month + 1).padStart(2, '0') + '-' + String(c.day).padStart(2, '0'));
            const hasAppt = byDate[dateKey] && byDate[dateKey].length > 0;
            const isToday = dateKey === todayStr;
            const isSelected = calendarState.selectedDate === dateKey;
            const cls = ['calendar-day'] + (c.otherMonth ? ' other-month' : '') + (hasAppt ? ' has-appointments' : '') + (isToday ? ' today' : '') + (isSelected ? ' selected' : '');
            html += `<button type="button" class="${cls}" data-date="${dateKey}">${c.day}</button>`;
        });
        gridEl.innerHTML = html;
        gridEl.querySelectorAll('.calendar-day').forEach(btn => {
            const dateKey = btn.getAttribute('data-date');
            if (!dateKey) return;
            btn.addEventListener('click', () => {
                calendarState.selectedDate = dateKey;
                renderAppointmentsCalendar(lastAppointmentsData);
                renderCalendarDayDetail(lastAppointmentsData, dateKey);
                // Prefijar creación de cita en el día pulsado
                const apptDateInput = document.getElementById('appt-date');
                if (apptDateInput) {
                    // Si ya tiene hora, la conservamos; si no, ponemos 09:00
                    const current = apptDateInput.value || '';
                    const timePart = (current.length >= 16 && current.indexOf('T') === 10) ? current.slice(11, 16) : '09:00';
                    apptDateInput.value = `${dateKey}T${timePart}`;
                    apptDateInput.focus();
                }
                const apptSection = document.getElementById('section-appointments');
                if (apptSection) {
                    apptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
        if (calendarState.selectedDate) renderCalendarDayDetail(appts, calendarState.selectedDate);
        else {
            const wrap = document.getElementById('calendar-day-appointments');
            const ph = document.querySelector('#calendar-day-detail .calendar-day-detail-placeholder');
            if (wrap) wrap.innerHTML = '';
            if (ph) ph.style.display = '';
        }
        if (window.lucide) lucide.createIcons();
    }

    function renderCalendarDayDetail(appointments, dateStr) {
        const wrap = document.getElementById('calendar-day-appointments');
        const placeholder = document.querySelector('#calendar-day-detail .calendar-day-detail-placeholder');
        if (!wrap) return;
        if (placeholder) placeholder.style.display = 'none';
        const list = (appointments || []).filter(a => (a.date || '').toString().slice(0, 10) === dateStr);
        list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        if (list.length === 0) {
            wrap.innerHTML = '<p class="calendar-day-detail-placeholder">No hay citas este día</p>';
            return;
        }
        const safe = (s) => (s || '').replace(/</g, '&lt;').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        wrap.innerHTML = list.map(a => {
            const time = (a.date || '').toString().slice(11, 16);
            const safeName = safe(a.client_name);
            const safeDate = (a.date || '').replace(/'/g, "\\'");
            const safeDesc = safe(a.description);
            return `<div class="calendar-day-appt-item">
                <span class="appt-time">${time}</span>
                <div><span class="appt-client">${(a.client_name || '').replace(/</g, '&lt;')}</span>${a.description ? `<p class="appt-desc">${(a.description || '').replace(/</g, '&lt;')}</p>` : ''}</div>
                <div class="appt-actions">
                    <button class="btn btn-secondary btn-sm" onclick="downloadAppointmentIcs(${a.id}, '${safeName}', '${safeDate}', '${safeDesc}')" title=".ics"><i data-lucide="calendar"></i></button>
                    <button class="btn btn-remove btn-sm" onclick="deleteAppointment(${a.id})">🗑️</button>
                </div>
            </div>`;
        }).join('');
        if (placeholder) placeholder.style.display = 'none';
        if (window.lucide) lucide.createIcons();
    }

    function showAppointmentConfirmation(apt) {
        confirmationAppointmentForIcs = apt;
        const overlay = document.getElementById('appointment-confirmation-overlay');
        const detailsEl = document.getElementById('confirmation-details');
        const miniCal = document.getElementById('confirmation-calendar-mini');
        if (!overlay || !detailsEl) return;
        const d = new Date(apt.date);
        const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
        const monthName = getMonthName(m);
        const timeStr = d.toTimeString().slice(0, 5);
        let dateStr = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

        miniCal.innerHTML = '';
        const weekdays = ['L','M','X','J','V','S','D'];
        weekdays.forEach(w => { const s = document.createElement('span'); s.className = 'cal-mini-weekday'; s.textContent = w; miniCal.appendChild(s); });
        const first = new Date(y, m, 1);
        const firstDay = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        for (let i = 0; i < firstDay; i++) { const s = document.createElement('span'); s.className = 'cal-mini-day'; s.textContent = ''; miniCal.appendChild(s); }
        for (let d = 1; d <= daysInMonth; d++) {
            const s = document.createElement('span');
            s.className = 'cal-mini-day' + (d === day ? ' highlight' : '');
            s.textContent = d;
            miniCal.appendChild(s);
        }
        const total = 7 + firstDay + daysInMonth;
        const pad = (42 - total % 42) % 42;
        if (pad < 42) for (let i = 0; i < pad; i++) { const s = document.createElement('span'); s.className = 'cal-mini-day'; s.textContent = ''; miniCal.appendChild(s); }

        detailsEl.innerHTML = `
            <div class="conf-row"><strong>Fecha</strong><span class="conf-datetime">${dateStr}</span></div>
            <div class="conf-row"><strong>Hora</strong><span class="conf-datetime">${timeStr}</span></div>
            <div class="conf-row"><strong>Con</strong> ${(apt.client_name || '').replace(/</g, '&lt;')}</div>
            ${apt.phone ? `<div class="conf-row"><strong>Tel.</strong> ${(apt.phone || '').replace(/</g, '&lt;')}</div>` : ''}
            ${apt.description ? `<div class="conf-row"><strong>Notas</strong> ${(apt.description || '').replace(/</g, '&lt;')}</div>` : ''}
        `;
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        document.getElementById('confirmation-download-ics').onclick = () => {
            if (confirmationAppointmentForIcs) downloadAppointmentIcs(confirmationAppointmentForIcs.id, (confirmationAppointmentForIcs.client_name || '').replace(/'/g, "\\'"), (confirmationAppointmentForIcs.date || '').replace(/'/g, "\\'"), (confirmationAppointmentForIcs.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'));
        };
        document.getElementById('confirmation-close').onclick = () => {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        };
    }

    async function loadAppointments() {
        try {
            // Intentar usar caché primero
            let data = getCachedData('appointments');
            
            if (!data) {
                data = await apiFetch('get_appointments');
                setCachedData('appointments', data);
            }
            
            renderList(
                document.getElementById('appointments-list'),
                data,
                (a) => {
                    const userBadge = a.username ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${a.username}</span>` : '';
                    const safeName = (a.client_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const safeDate = (a.date || '').replace(/'/g, "\\'");
                    const safeDesc = (a.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    return `
                        <div class="history-item">
                            <div style="flex:1"><strong>${(a.client_name || '').replace(/</g, '&lt;')}</strong>${userBadge}<br><small>${new Date(a.date).toLocaleString()} - ${(a.description || '').replace(/</g, '&lt;')}</small></div>
                            <div style="display:flex;gap:0.25rem;align-items:center;">
                                <button class="btn btn-secondary btn-sm" onclick="downloadAppointmentIcs(${a.id}, '${safeName}', '${safeDate}', '${safeDesc}')" title="Añadir a mi calendario">
                                    <i data-lucide="calendar" style="width:14px;height:14px;"></i> .ics
                                </button>
                                <button class="btn btn-remove btn-sm" onclick="deleteAppointment(${a.id})">🗑️</button>
                            </div>
                        </div>
                    `;
                },
                'No hay citas programadas'
            );
            const calendarWrap = document.getElementById('appointments-calendar-wrap');
            const listWrap = document.getElementById('appointments-list-wrap');
            if (calendarWrap && !calendarWrap.classList.contains('hidden')) renderAppointmentsCalendar(data);
            if (window.lucide) lucide.createIcons();
        } catch (e) { 
            console.error('Error cargando citas:', e);
        }
    }

    async function loadMeetings() {
        const listEl = document.getElementById('meetings-list');
        const filterEl = document.getElementById('meetings-filter');
        const adminCard = document.getElementById('meetings-admin-card');
        const requestsCard = document.getElementById('meetings-requests-admin-card');
        if (!listEl) return;
        try {
            const [meetings, users, requests] = await Promise.all([
                apiFetch('get_meetings'),
                apiFetch('get_users_for_assignment'),
                apiFetch('get_meeting_requests')
            ]);
            // Mostrar/ocultar tarjetas admin según rol
            if (currentUser && currentUser.role === 'admin') {
                if (adminCard) adminCard.classList.remove('hidden');
                if (requestsCard) requestsCard.classList.remove('hidden');
            } else {
                if (adminCard) adminCard.classList.add('hidden');
                if (requestsCard) requestsCard.classList.add('hidden');
            }

            // Rellenar select de asistentes (solo admin)
            const attendeesSelect = document.getElementById('meeting-attendees');
            if (attendeesSelect && Array.isArray(users)) {
                const prev = Array.from(attendeesSelect.selectedOptions).map(o => o.value);
                attendeesSelect.innerHTML = '';
                users.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = (u.username || '').replace(/</g, '&lt;');
                    if (prev.includes(String(u.id))) opt.selected = true;
                    attendeesSelect.appendChild(opt);
                });
                updateMeetingAttendeesCount();
            }

            const now = new Date();
            const rawList = Array.isArray(meetings) ? meetings : [];
            const view = filterEl ? filterEl.value : 'upcoming';
            const filtered = rawList.filter(m => {
                if (view !== 'upcoming') return true;
                const d = m.date ? new Date(m.date) : null;
                return d && d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
            });
            if (filtered.length === 0) {
                listEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">No hay reuniones.</div></div>';
            } else {
                listEl.innerHTML = filtered.map(m => {
                    const title = (m.title || '').replace(/</g, '&lt;');
                    const desc = (m.description || '').replace(/</g, '&lt;');
                    const dateStr = m.date ? new Date(m.date).toLocaleString('es-ES') : '';
                    const createdBy = (m.created_by_username || '').replace(/</g, '&lt;');
                    const attendees = Array.isArray(m.attendees) ? m.attendees : [];
                    const attendeesNames = attendees.map(a => (a.username || '').replace(/</g, '&lt;')).filter(Boolean);
                    const attendeesLabel = attendeesNames.length ? attendeesNames.join(', ') : 'Sin asistentes asignados';
                    const countLabel = attendeesNames.length ? ` (${attendeesNames.length} asistentes)` : '';
                    const canDelete = currentUser && currentUser.role === 'admin';
                    return `
                        <div class="history-item" data-meeting-id="${m.id}">
                            <div style="flex:1">
                                <strong>${title}</strong><br>
                                <small>${dateStr}${createdBy ? ' · Creador: ' + createdBy : ''}</small>
                                ${desc ? '<br><span style="font-size:0.85rem;color:var(--text-muted);">' + desc + '</span>' : ''}
                                <br><span style="font-size:0.85rem;color:var(--text-muted);">Asistentes${countLabel}: ${attendeesLabel}</span>
                            </div>
                            ${canDelete ? `<button class="btn btn-remove btn-sm" onclick="deleteMeeting(${m.id})" title="Eliminar reunión"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>` : ''}
                        </div>
                    `;
                }).join('');
            }

            // Rellenar solicitudes para admin
            const requestsListEl = document.getElementById('meetings-requests-list');
            if (requestsListEl) {
                const reqs = Array.isArray(requests) ? requests : [];
                if (!currentUser || currentUser.role !== 'admin' || reqs.length === 0) {
                    requestsListEl.innerHTML = currentUser && currentUser.role === 'admin'
                        ? '<div class="history-item"><div style="flex:1;color:var(--text-muted);">No hay solicitudes pendientes.</div></div>'
                        : '';
                } else {
                    requestsListEl.innerHTML = reqs.map(r => {
                        const title = (r.title || '').replace(/</g, '&lt;');
                        const user = (r.requested_by_username || '').replace(/</g, '&lt;');
                        const dateStr = r.date ? new Date(r.date).toLocaleString('es-ES') : '';
                        const notes = (r.notes || '').replace(/</g, '&lt;');
                        return `
                            <div class="history-item" data-request-id="${r.id}">
                                <div style="flex:1">
                                    <strong>${title}</strong><br>
                                    <small>Solicitado por: ${user || 'Usuario'} · ${dateStr}</small>
                                    ${notes ? '<br><span style="font-size:0.85rem;color:var(--text-muted);">' + notes + '</span>' : ''}
                                </div>
                                <div style="display:flex;gap:0.25rem;">
                                    <button type="button" class="btn btn-primary btn-sm" onclick="createMeetingFromRequest(${r.id})"><i data-lucide="check" style="width:14px;height:14px;"></i> Crear reunión</button>
                                    <button type="button" class="btn btn-remove btn-sm" onclick="deleteMeetingRequest(${r.id})" title="Rechazar solicitud"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            console.error('Error cargando reuniones:', e);
            listEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--danger);">No se pudieron cargar las reuniones.</div></div>';
        }
    }

    document.getElementById('calendar-prev-month')?.addEventListener('click', () => {
        if (calendarState.month === 0) { calendarState.year--; calendarState.month = 11; } else calendarState.month--;
        renderAppointmentsCalendar(lastAppointmentsData);
    });
    document.getElementById('calendar-next-month')?.addEventListener('click', () => {
        if (calendarState.month === 11) { calendarState.year++; calendarState.month = 0; } else calendarState.month++;
        renderAppointmentsCalendar(lastAppointmentsData);
    });
    document.getElementById('calendar-today')?.addEventListener('click', () => {
        const t = new Date();
        calendarState.year = t.getFullYear();
        calendarState.month = t.getMonth();
        calendarState.selectedDate = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
        renderAppointmentsCalendar(lastAppointmentsData);
        renderCalendarDayDetail(lastAppointmentsData, calendarState.selectedDate);
    });
    document.getElementById('calendar-view-month-btn')?.addEventListener('click', () => {
        calendarState.viewMode = 'month';
        document.getElementById('calendar-view-month-btn')?.classList.add('active');
        document.getElementById('calendar-view-week-btn')?.classList.remove('active');
        renderAppointmentsCalendar(lastAppointmentsData);
    });
    document.getElementById('calendar-view-week-btn')?.addEventListener('click', () => {
        calendarState.viewMode = 'week';
        // si no hay día seleccionado, usar hoy
        if (!calendarState.selectedDate) {
            const t = new Date();
            calendarState.year = t.getFullYear();
            calendarState.month = t.getMonth();
            calendarState.selectedDate = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
        }
        document.getElementById('calendar-view-week-btn')?.classList.add('active');
        document.getElementById('calendar-view-month-btn')?.classList.remove('active');
        renderAppointmentsCalendar(lastAppointmentsData);
        renderCalendarDayDetail(lastAppointmentsData, calendarState.selectedDate);
    });
    document.getElementById('btn-appts-calendar-view')?.addEventListener('click', () => {
        document.getElementById('appointments-calendar-wrap')?.classList.remove('hidden');
        document.getElementById('appointments-list-wrap')?.classList.add('hidden');
        document.getElementById('btn-appts-calendar-view')?.classList.add('active');
        document.getElementById('btn-appts-list-view')?.classList.remove('active');
        renderAppointmentsCalendar(lastAppointmentsData);
    });
    document.getElementById('btn-appts-list-view')?.addEventListener('click', () => {
        document.getElementById('appointments-list-wrap')?.classList.remove('hidden');
        document.getElementById('appointments-calendar-wrap')?.classList.add('hidden');
        document.getElementById('btn-appts-list-view')?.classList.add('active');
        document.getElementById('btn-appts-calendar-view')?.classList.remove('active');
    });
    document.getElementById('confirmation-close')?.addEventListener('click', () => {
        document.getElementById('appointment-confirmation-overlay')?.classList.add('hidden');
        document.getElementById('appointment-confirmation-overlay')?.setAttribute('aria-hidden', 'true');
    });

    document.getElementById('btn-add-appt').addEventListener('click', async () => {
        const fd = new FormData();
        fd.append('client_name', document.getElementById('appt-client').value);
        fd.append('phone', document.getElementById('appt-phone').value);
        fd.append('date', document.getElementById('appt-date').value);
        fd.append('description', document.getElementById('appt-desc').value);
        try {
            const res = await apiFetch('save_appointment', { method: 'POST', body: fd });
            invalidateCache('appointments');
            await loadAppointments();
            if (res && res.appointment) showAppointmentConfirmation(res.appointment);
            else showToast('Cita programada', 'success');
            document.getElementById('appt-client').value = '';
            document.getElementById('appt-phone').value = '';
            document.getElementById('appt-date').value = '';
            document.getElementById('appt-desc').value = '';
        } catch (e) { showToast(e?.message || 'Error al guardar', 'error'); }
    });

    window.deleteAppointment = async (id) => {
        const fd = new FormData(); fd.append('id', id);
        await apiFetch('delete_appointment', { method: 'POST', body: fd });
        invalidateCache('appointments');
        loadAppointments();
    };

    function updateMeetingAttendeesCount() {
        const sel = document.getElementById('meeting-attendees');
        const label = document.getElementById('meeting-attendees-count');
        if (!sel || !label) return;
        const count = Array.from(sel.selectedOptions).length;
        if (count === 0) label.textContent = 'No hay usuarios seleccionados.';
        else if (count === 1) label.textContent = '1 usuario seleccionado para asistir.';
        else label.textContent = count + ' usuarios seleccionados para asistir.';
    }
    document.getElementById('meeting-attendees')?.addEventListener('change', updateMeetingAttendeesCount);

    document.getElementById('meetings-filter')?.addEventListener('change', () => {
        loadMeetings();
    });

    document.getElementById('btn-send-meeting-request')?.addEventListener('click', async () => {
        const titleEl = document.getElementById('meeting-request-title');
        const dateEl = document.getElementById('meeting-request-date');
        const notesEl = document.getElementById('meeting-request-notes');
        if (!titleEl || !dateEl) return;
        const title = (titleEl.value || '').trim();
        const date = (dateEl.value || '').trim();
        const notes = (notesEl?.value || '').trim();
        if (!title) { showToast('Indica el título o motivo de la reunión.', 'error'); titleEl.focus(); return; }
        if (!date) { showToast('Indica la fecha y hora preferidas.', 'error'); dateEl.focus(); return; }
        const fd = new FormData();
        fd.append('title', title);
        fd.append('date', date);
        fd.append('notes', notes);
        try {
            const res = await apiFetch('create_meeting_request', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast('Solicitud de reunión enviada al administrador.', 'success');
                titleEl.value = '';
                dateEl.value = '';
                if (notesEl) notesEl.value = '';
                // Refrescar solicitudes por si el usuario es admin
                loadMeetings();
            } else {
                showToast((res && res.message) || 'No se pudo enviar la solicitud.', 'error');
            }
        } catch (e) {
            showToast(e?.message || 'No se pudo enviar la solicitud.', 'error');
        }
    });

    document.getElementById('btn-save-meeting')?.addEventListener('click', async () => {
        if (!currentUser || currentUser.role !== 'admin') {
            showToast('Solo el administrador puede crear reuniones.', 'error');
            return;
        }
        const titleEl = document.getElementById('meeting-title');
        const dateEl = document.getElementById('meeting-date');
        const descEl = document.getElementById('meeting-description');
        const attendeesEl = document.getElementById('meeting-attendees');
        if (!titleEl || !dateEl || !attendeesEl) return;
        const title = (titleEl.value || '').trim();
        const date = (dateEl.value || '').trim();
        const desc = (descEl?.value || '').trim();
        if (!title) { showToast('Indica el título de la reunión.', 'error'); titleEl.focus(); return; }
        if (!date) { showToast('Indica la fecha y hora de la reunión.', 'error'); dateEl.focus(); return; }
        const selected = Array.from(attendeesEl.selectedOptions).map(o => o.value).filter(Boolean);
        const fd = new FormData();
        fd.append('title', title);
        fd.append('date', date);
        fd.append('description', desc);
        fd.append('attendees', selected.join(','));
        try {
            const res = await apiFetch('save_meeting', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast('Reunión creada correctamente.', 'success');
                titleEl.value = '';
                dateEl.value = '';
                if (descEl) descEl.value = '';
                attendeesEl.selectedIndex = -1;
                updateMeetingAttendeesCount();
                loadMeetings();
            } else {
                showToast((res && res.message) || 'No se pudo guardar la reunión.', 'error');
            }
        } catch (e) {
            showToast(e?.message || 'No se pudo guardar la reunión.', 'error');
        }
    });

    window.deleteMeeting = async (id) => {
        if (!id) return;
        const fd = new FormData();
        fd.append('id', id);
        try {
            const res = await apiFetch('delete_meeting', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast('Reunión eliminada.', 'success');
                loadMeetings();
            } else {
                showToast((res && res.message) || 'No se pudo eliminar la reunión.', 'error');
            }
        } catch (e) {
            showToast(e?.message || 'No se pudo eliminar la reunión.', 'error');
        }
    };

    window.deleteMeetingRequest = async (id) => {
        if (!id) return;
        const fd = new FormData();
        fd.append('id', id);
        try {
            const res = await apiFetch('delete_meeting_request', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast('Solicitud eliminada.', 'success');
                loadMeetings();
            } else {
                showToast((res && res.message) || 'No se pudo eliminar la solicitud.', 'error');
            }
        } catch (e) {
            showToast(e?.message || 'No se pudo eliminar la solicitud.', 'error');
        }
    };

    window.createMeetingFromRequest = async (requestId) => {
        if (!currentUser || currentUser.role !== 'admin') {
            showToast('Solo el administrador puede crear reuniones.', 'error');
            return;
        }
        const requests = await apiFetch('get_meeting_requests');
        const req = (Array.isArray(requests) ? requests : []).find(r => String(r.id) === String(requestId));
        if (!req) {
            showToast('No se encontró la solicitud.', 'error');
            return;
        }
        const titleEl = document.getElementById('meeting-title');
        const dateEl = document.getElementById('meeting-date');
        const descEl = document.getElementById('meeting-description');
        if (titleEl) titleEl.value = req.title || '';
        if (dateEl) dateEl.value = (req.date || '').toString().replace(' ', 'T').slice(0, 16);
        if (descEl) descEl.value = (req.notes || '');
        // El administrador ya decide qué usuarios deben asistir
        const fd = new FormData();
        fd.append('id', requestId);
        try {
            await apiFetch('delete_meeting_request', { method: 'POST', body: fd });
            loadMeetings();
            showToast('Solicitud preparada como reunión. Completa los asistentes y guarda.', 'info');
            if (navMeetings) {
                switchSection('section-meetings', navMeetings);
            }
        } catch (e) {
            // Si falla el borrado no bloqueamos la creación
        }
    };

    // Abrir factura en el editor y hacer scroll a la sección "Factura recurrente"
    window.openInvoiceRecurring = async function (id) {
        if (!id) return;
        await loadInvoice(id);
        setTimeout(() => {
            const card = document.getElementById('recurring-invoice-card');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400);
    };

    function setRecurringInvoiceUI(visible, data = null) {
        if (!recurringInvoiceCard) return;
        if (!visible) {
            recurringInvoiceCard.classList.add('hidden');
            if (recurringInvoiceEnabledInput) recurringInvoiceEnabledInput.checked = false;
            if (recurringInvoiceFrequencyInput) recurringInvoiceFrequencyInput.value = 'monthly';
            if (recurringInvoiceNextDateInput) recurringInvoiceNextDateInput.value = '';
            if (recurringInvoiceStartDateInput) recurringInvoiceStartDateInput.value = '';
            if (recurringInvoiceEndDateInput) recurringInvoiceEndDateInput.value = '';
            return;
        }
        recurringInvoiceCard.classList.remove('hidden');
        const enabled = data && typeof data.enabled !== 'undefined' ? !!data.enabled : false;
        if (recurringInvoiceEnabledInput) recurringInvoiceEnabledInput.checked = enabled;
        if (recurringInvoiceFrequencyInput) {
            const freq = data && data.frequency ? data.frequency : 'monthly';
            recurringInvoiceFrequencyInput.value = freq;
        }
        if (recurringInvoiceNextDateInput) {
            const next = data && data.next_date ? data.next_date : '';
            recurringInvoiceNextDateInput.value = next;
        }
        if (recurringInvoiceStartDateInput) {
            const start = data && data.start_date ? data.start_date : '';
            recurringInvoiceStartDateInput.value = start;
        }
        if (recurringInvoiceEndDateInput) {
            const end = data && data.end_date ? data.end_date : '';
            recurringInvoiceEndDateInput.value = end;
        }
    }

    window.loadInvoice = async (id) => {
        try {
            const i = await apiFetch(`get_invoice?id=${id}`);
            if (i) {
                currentQuoteId = i.id;
                currentDocumentIsInvoice = true;
                currentDocumentDate = (i.date || '').toString().trim() || null;
                clientNameInput.value = i.client_name;
                clientIdInput.value = i.client_id;
                clientAddressInput.value = i.client_address;
                clientEmailInput.value = i.client_email;
                clientPhoneInput.value = i.client_phone || '';
                quoteNotesInput.value = i.notes || '';
                items = i.items.map(it => ({ id: it.id, description: it.description, image_url: it.image_url, quantity: parseFloat(it.quantity), price: parseFloat(it.price), tax: parseFloat(it.tax_percent) }));
                renderItems();
                updatePreview();
                await ensureEditorProjectsLoaded();
                const invProjectSel = document.getElementById('editor-project-id');
                if (invProjectSel) invProjectSel.value = (i.project_id != null && i.project_id !== '') ? String(i.project_id) : '';
                // Establecer el estado DESPUÉS de updatePreview para que las opciones ya estén generadas
                setTimeout(() => {
                    const statusSelect = document.getElementById('quote-status');
                    if (statusSelect) statusSelect.value = i.status || 'pending';
                }, 10);

                // Configurar UI de factura recurrente si hay datos
                const isRecurring = i.is_recurring === 1 || i.is_recurring === '1' || i.is_recurring === true;
                const freq = i.recurrence_frequency || 'monthly';
                const nextDate = (i.next_date || '').substring(0, 10);
                const startDate = (i.recurrence_start_date || '').substring(0, 10);
                const endDate = (i.recurrence_end_date || '').substring(0, 10);
                setRecurringInvoiceUI(true, {
                    enabled: isRecurring,
                    frequency: freq,
                    next_date: nextDate,
                    start_date: startDate,
                    end_date: endDate
                });
                // Configurar UI de REBU
                if (rebuInvoiceCard) {
                    rebuInvoiceCard.classList.remove('hidden');
                    if (rebuInvoiceEnabledInput) {
                        rebuInvoiceEnabledInput.checked = i.is_rebu === 1 || i.is_rebu === '1' || i.is_rebu === true;
                    }
                }
                // Volver a pintar vista previa con el estado de REBU ya aplicado
                updatePreview();
                const tagsInput = document.getElementById('editor-document-tags');
                if (tagsInput) tagsInput.value = (i.tags || '').trim();
                // Mostrar historial de cambios si existe
                if (i.audit_log && Array.isArray(i.audit_log) && i.audit_log.length > 0) {
                    const auditCard = document.getElementById('audit-log-card');
                    const auditList = document.getElementById('audit-log-list');
                    if (auditCard && auditList) {
                        auditCard.style.display = 'block';
                        auditList.innerHTML = i.audit_log.map(log => {
                            const actionText = log.action === 'create' ? 'Creado' : log.action === 'update' ? 'Modificado' : 'Eliminado';
                            const actionIcon = log.action === 'create' ? 'plus' : log.action === 'update' ? 'edit-3' : 'trash-2';
                            const changes = log.changes ? JSON.parse(log.changes) : [];
                            const date = new Date(log.created_at).toLocaleString('es-ES');
                            return `
                                <div class="history-item" style="padding: 0.75rem;">
                                    <div style="flex:1">
                                        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
                                            <i data-lucide="${actionIcon}" style="width:14px;height:14px;"></i>
                                            <strong>${actionText}</strong>
                                            ${log.username ? `<span style="color:var(--text-muted);font-size:0.8rem;">por ${log.username}</span>` : ''}
                                        </div>
                                        ${changes.length > 0 ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem;">${changes.join(', ')}</div>` : ''}
                                        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">${date}</div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                        // Inicializar iconos
                        if (typeof lucide !== 'undefined') {
                            requestAnimationFrame(() => lucide.createIcons());
                        }
                    }
                } else {
                    const auditCard = document.getElementById('audit-log-card');
                    if (auditCard) auditCard.style.display = 'none';
                }

                // Pagos parciales (solo facturas)
                const paymentsCard = document.getElementById('invoice-payments-card');
                const isInv = (i.id || '').toString().startsWith('FAC-');
                if (paymentsCard) {
                    if (isInv) {
                        paymentsCard.style.display = 'block';
                        const totalAmount = parseFloat(i.total_amount) || 0;
                        const totalPaid = parseFloat(i.total_paid) || 0;
                        const payments = Array.isArray(i.payments) ? i.payments : [];
                        renderInvoicePayments(totalPaid, totalAmount, payments);
                        const dateInput = document.getElementById('invoice-payment-date');
                        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
                    } else {
                        paymentsCard.style.display = 'none';
                    }
                }
                
                switchSection('section-editor', navEditor);
            }
            updatePayButtonVisibility();
        } catch (e) { }
    };

    function renderInvoicePayments(totalPaid, totalAmount, payments) {
        const summaryEl = document.getElementById('invoice-payments-summary');
        const listEl = document.getElementById('invoice-payments-list');
        if (!summaryEl) return;
        summaryEl.textContent = '';
        summaryEl.innerHTML = 'Pagado: <strong>' + formatCurrency(totalPaid) + '</strong> / Total: <strong>' + formatCurrency(totalAmount) + '</strong>';
        if (totalAmount > 0 && totalPaid >= totalAmount - 0.01) summaryEl.innerHTML += ' <span style="color:var(--accent);font-size:0.9rem;">(Factura cobrada)</span>';
        if (listEl) {
            if (!payments || payments.length === 0) {
                listEl.innerHTML = '<div class="history-item" style="color:var(--text-muted);">Aún no hay pagos registrados.</div>';
            } else {
                listEl.innerHTML = payments.map(p => {
                    const d = (p.payment_date || '').toString().slice(0, 10);
                    const dateStr = d ? new Date(d).toLocaleDateString('es-ES') : '';
                    const notes = (p.notes || '').toString().trim() ? ' · ' + (p.notes || '').replace(/</g, '&lt;') : '';
                    return '<div class="history-item"><div style="flex:1;">' + dateStr + notes + '</div><strong>' + formatCurrency(parseFloat(p.amount) || 0) + '</strong></div>';
                }).join('');
            }
        }
    }

    document.getElementById('btn-add-invoice-payment')?.addEventListener('click', async () => {
        const invId = currentQuoteId;
        if (!invId || !invId.toString().startsWith('FAC-')) { showToast('Abre una factura para registrar pagos.', 'error'); return; }
        const amountEl = document.getElementById('invoice-payment-amount');
        const dateEl = document.getElementById('invoice-payment-date');
        const notesEl = document.getElementById('invoice-payment-notes');
        const amount = parseFloat(amountEl?.value?.replace(',', '.') || 0);
        if (!amount || amount <= 0) { showToast('Indica un importe mayor que 0.', 'error'); return; }
        const paymentDate = (dateEl?.value || '').trim() || new Date().toISOString().slice(0, 10);
        const notes = (notesEl?.value || '').trim();
        try {
            const fd = new FormData();
            fd.append('action', 'add_invoice_payment');
            fd.append('invoice_id', invId);
            fd.append('amount', amount);
            fd.append('payment_date', paymentDate);
            if (notes) fd.append('notes', notes);
            const r = await fetch(getApiEndpoint() + '?t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
            const res = await r.json();
            if (res && res.status === 'error') { showToast(res.message || 'Error al registrar el pago', 'error'); return; }
            if (res && res.total_paid != null) {
                const totalAmount = res.total_amount != null ? parseFloat(res.total_amount) : 0;
                renderInvoicePayments(res.total_paid, totalAmount, res.payments || []);
                const statusSelect = document.getElementById('quote-status');
                if (res.total_paid >= totalAmount - 0.01 && statusSelect) statusSelect.value = 'paid';
                if (amountEl) amountEl.value = '';
                if (notesEl) notesEl.value = '';
                showToast('Pago registrado', 'success');
            }
        } catch (e) {
            showToast('Error: ' + (e.message || ''), 'error');
        }
    });

    // --- DUPLICAR PRESUPUESTO ---
    window.duplicateQuote = async (id) => {
        if (!id) {
            showToast('ID de presupuesto no válido', 'error');
            return;
        }
        
        try {
            showToast('Duplicando presupuesto...', 'info');
            const q = await apiFetch(`get_quote?id=${encodeURIComponent(id)}`);
            
            if (q && q.error) {
                showToast(q.error || 'Presupuesto no encontrado', 'error');
                return;
            }
            
            if (!q || !q.id) {
                showToast('Presupuesto no encontrado', 'error');
                return;
            }
            
            // Crear nuevo ID
            currentQuoteId = null; // Forzar nuevo ID
            currentQuoteSignature = null;
            currentDocumentDate = null;
            clientNameInput.value = q.client_name || '';
            clientIdInput.value = q.client_id || '';
            clientAddressInput.value = q.client_address || '';
            clientEmailInput.value = q.client_email || '';
            clientPhoneInput.value = q.client_phone || '';
            quoteNotesInput.value = q.notes || '';
            
            // Copiar items
            if (q.items && Array.isArray(q.items)) {
                items = q.items.map(i => ({
                    id: Date.now() + Math.random(),
                    description: i.description || '',
                    image_url: i.image_url || null,
                    quantity: parseFloat(i.quantity) || 1,
                    price: parseFloat(i.price) || 0,
                    tax: parseFloat(i.tax_percent) || companyData.defaultTax,
                    catalog_item_id: i.catalog_item_id != null ? parseInt(i.catalog_item_id, 10) : null
                }));
            } else {
                items = [{ id: Date.now(), description: 'Nuevo Servicio', quantity: 1, price: 0, tax: companyData.defaultTax }];
            }
            
            // Resetear estado a borrador
            document.getElementById('quote-status').value = 'draft';

            // Un presupuesto no usa opciones de factura recurrente
            setRecurringInvoiceUI(false);
            
            renderItems();
            updatePreview();
            switchSection('section-editor', navEditor);
            showToast('Presupuesto duplicado. Puedes editarlo y guardarlo como nuevo.', 'success');
            
            // Scroll suave al inicio del editor
            document.getElementById('section-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            console.error('Error duplicando presupuesto:', e);
            showToast('Error al duplicar presupuesto: ' + (e.message || 'Error desconocido'), 'error');
        }
    };

    // Marcar presupuesto como aceptado desde el historial (abre modal de firma)
    let pendingAcceptQuoteId = null;
    window.markQuoteAccepted = (id) => {
        if (!id) {
            showToast('ID de presupuesto no válido', 'error');
            return;
        }
        pendingAcceptQuoteId = id;
        const canvas = document.getElementById('signature-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2;
        }
        document.getElementById('modal-signature-overlay').classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    };

    // Canvas firma: dibujo con ratón/táctil
    (function initSignatureCanvas() {
        const canvas = document.getElementById('signature-canvas');
        if (!canvas) return;
        let drawing = false;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            if (e.touches) {
                return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
            }
            return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
        }
        function start(e) { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
        function move(e) { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
        function end(e) { e.preventDefault(); drawing = false; }
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', end, { passive: false });
    })();

    // Generar factura directamente a partir de un presupuesto (sin pasar por el editor)
    async function createInvoiceFromQuoteId(quoteId) {
        try {
            const q = await apiFetch(`get_quote?id=${encodeURIComponent(quoteId)}`);
            if (!q || q.error) {
                throw new Error(q && q.error ? q.error : 'Presupuesto no encontrado');
            }
            const itemsSrc = Array.isArray(q.items) ? q.items : [];
            if (itemsSrc.length === 0) {
                throw new Error('El presupuesto no tiene líneas para facturar.');
            }
            const itemsForInvoice = itemsSrc.map(i => ({
                description: i.description || '',
                image_url: i.image_url || null,
                quantity: parseFloat(i.quantity) || 1,
                price: parseFloat(i.price) || 0,
                tax: parseFloat(i.tax_percent) || companyData.defaultTax
            }));
            const nextId = await getNextInvoiceId();
            const invoiceId = nextId || `FAC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
            const invoiceDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const invoice = {
                id: invoiceId,
                quote_id: q.id,
                date: invoiceDate,
                client: {
                    name: q.client_name || '',
                    id: q.client_id || '',
                    address: q.client_address || '',
                    email: q.client_email || '',
                    phone: q.client_phone || ''
                },
                notes: q.notes || '',
                status: 'pending',
                items: itemsForInvoice,
                totals: {
                    subtotal: itemsForInvoice.reduce((acc, it) => acc + (it.quantity * it.price), 0),
                    tax: itemsForInvoice.reduce((acc, it) => acc + (it.quantity * it.price * (it.tax / 100)), 0),
                    total: itemsForInvoice.reduce((acc, it) => acc + (it.quantity * it.price * (1 + it.tax / 100)), 0)
                },
                project_id: (q.project_id != null && q.project_id !== '') ? q.project_id : ''
            };
            if (q.tags && String(q.tags).trim() !== '') {
                invoice.tags = String(q.tags).trim();
            }
            const res = await fetch(`${getApiEndpoint()}?action=save_invoice&t=${Date.now()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invoice)
            });
            const result = await res.json().catch(() => null);
            if (!result || result.status !== 'success') {
                throw new Error((result && (result.message || result.error)) || 'Error al guardar la factura');
            }
            return result.id || invoiceId;
        } catch (e) {
            console.error('Error generando factura desde presupuesto aceptado:', e);
            throw e;
        }
    }
    
    document.getElementById('signature-clear').addEventListener('click', () => {
        const canvas = document.getElementById('signature-canvas');
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    });
    var modalSignatureOverlay = document.getElementById('modal-signature-overlay');
    function closeSignatureModal() {
        if (modalSignatureOverlay) modalSignatureOverlay.classList.add('hidden');
        pendingAcceptQuoteId = null;
    }
    document.getElementById('modal-signature-cancel').addEventListener('click', closeSignatureModal);
    if (modalSignatureOverlay) {
        modalSignatureOverlay.addEventListener('click', function (e) {
            if (e.target === modalSignatureOverlay) closeSignatureModal();
        });
    }
    document.addEventListener('keydown', function signatureModalEscape(e) {
        if (e.key === 'Escape' && modalSignatureOverlay && !modalSignatureOverlay.classList.contains('hidden')) {
            closeSignatureModal();
        }
    });
    document.getElementById('modal-signature-ok').addEventListener('click', async () => {
        const id = pendingAcceptQuoteId;
        if (!id) return;
        const canvas = document.getElementById('signature-canvas');
        let base64 = '';
        if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl.length > 100) base64 = dataUrl;
        }
        const fd = new FormData();
        fd.append('id', id);
        fd.append('status', 'accepted');
        if (base64) fd.append('quote_signature', base64);
        try {
            await apiFetch('update_quote_status', { method: 'POST', body: fd });
            let createdInvoiceId = null;
            try {
                createdInvoiceId = await createInvoiceFromQuoteId(id);
            } catch (err) {
                showToast('Presupuesto aceptado, pero hubo un problema al generar la factura. Revisa el editor.', 'error');
            }
            closeSignatureModal();
            if (createdInvoiceId) {
                showToast(`Presupuesto aceptado y factura ${createdInvoiceId} generada.`, 'success');
            } else {
                showToast('Presupuesto marcado como aceptado.', 'success');
            }
            invalidateCache('history');
            invalidateCache('invoices');
            if (!document.getElementById('section-history').classList.contains('hidden')) navHistory.click();
        } catch (e) {
            console.error('Error al aceptar presupuesto:', e);
            showToast('No se pudo actualizar el estado del presupuesto', 'error');
        }
    });

    // --- DUPLICAR FACTURA ---
    window.duplicateInvoice = async (id) => {
        if (!id) {
            showToast('ID de factura no válido', 'error');
            return;
        }
        
        try {
            showToast('Duplicando factura...', 'info');
            const i = await apiFetch(`get_invoice?id=${encodeURIComponent(id)}`);
            
            if (i && i.error) {
                showToast(i.error || 'Factura no encontrada', 'error');
                return;
            }
            
            if (!i || !i.id) {
                showToast('Factura no encontrada', 'error');
                return;
            }
            
            // Crear nuevo ID (será factura nueva)
            const nextInvId = await getNextInvoiceId();
            currentQuoteId = nextInvId || (`FAC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);
            currentDocumentDate = null; // Nueva factura, fecha al guardar
            clientNameInput.value = i.client_name || '';
            clientIdInput.value = i.client_id || '';
            clientAddressInput.value = i.client_address || '';
            clientEmailInput.value = i.client_email || '';
            clientPhoneInput.value = i.client_phone || '';
            quoteNotesInput.value = i.notes || '';
            
            // Copiar items
            if (i.items && Array.isArray(i.items)) {
                items = i.items.map(it => ({
                    id: Date.now() + Math.random(),
                    description: it.description || '',
                    image_url: it.image_url || null,
                    quantity: parseFloat(it.quantity) || 1,
                    price: parseFloat(it.price) || 0,
                    tax: parseFloat(it.tax_percent) || companyData.defaultTax
                }));
            } else {
                items = [{ id: Date.now(), description: 'Nuevo Servicio', quantity: 1, price: 0, tax: companyData.defaultTax }];
            }
            
            // Resetear estado a pendiente (para factura)
            document.getElementById('quote-status').value = 'pending';
            currentQuoteSignature = null;

            // Al duplicar, mostrar opciones de recurrencia pero desactivadas por defecto
            setRecurringInvoiceUI(true, {
                enabled: false,
                frequency: i.recurrence_frequency || 'monthly',
                next_date: ''
            });
            
            renderItems();
            updatePreview();
            switchSection('section-editor', navEditor);
            showToast('Factura duplicada. Puedes editarla y guardarla como nueva.', 'success');
            
            // Scroll suave al inicio del editor
            document.getElementById('section-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            console.error('Error duplicando factura:', e);
            showToast('Error al duplicar factura: ' + (e.message || 'Error desconocido'), 'error');
        }
    };

    // Marcar factura como pagada desde la lista
    window.markInvoicePaid = async (id) => {
        if (!id) {
            showToast('ID de factura no válido', 'error');
            return;
        }
        if (!confirm('¿Marcar esta factura como PAGADA?')) return;
        const fd = new FormData();
        fd.append('id', id);
        fd.append('status', 'paid');
        try {
            await apiFetch('update_invoice_status', { method: 'POST', body: fd });
            showToast('Factura marcada como pagada', 'success');
            // Actualizar cachés para que el dashboard e historial reflejen el cambio
            invalidateCache('invoices');
            invalidateCache('history');
            // Recargar lista de facturas si estamos en esa sección
            if (!document.getElementById('section-invoices').classList.contains('hidden')) {
                navInvoices.click();
            }
        } catch (e) {
            console.error('Error marcando factura como pagada:', e);
            showToast('No se pudo actualizar el estado de la factura', 'error');
        }
    };

    window.deleteQuote = async (id) => {
        if (!id) { showToast('ID no válido', 'error'); return; }
        const isAdmin = currentUser && currentUser.role === 'admin';
        if (isAdmin) {
            if (!confirm('¿Eliminar este presupuesto? Esta acción no se puede deshacer.')) return;
            const fd = new FormData();
            fd.append('id', id);
            try {
                const res = await apiFetch('delete_quote', { method: 'POST', body: fd });
                if (res && res.status === 'success') {
                    showToast('Presupuesto eliminado', 'success');
                    invalidateCache('history');
                    loadHistoryPage(historyCurrentPage);
                } else {
                    showToast(res && res.message ? res.message : 'No se pudo eliminar', 'error');
                }
            } catch (e) {
                showToast('Error al eliminar: ' + (e.message || 'Error desconocido'), 'error');
            }
        } else {
            if (!confirm('¿Enviar solicitud de eliminación al administrador? Él podrá borrar este presupuesto desde el panel de Inicio.')) return;
            const fd = new FormData();
            fd.append('table_name', 'quotes');
            fd.append('record_id', id);
            try {
                const res = await apiFetch('create_deletion_request', { method: 'POST', body: fd });
                if (res && res.status === 'success') {
                    showToast(res.message || 'Solicitud enviada al administrador.', 'success');
                } else {
                    showToast(res && res.message ? res.message : 'No se pudo enviar la solicitud', 'error');
                }
            } catch (e) {
                showToast('Error: ' + (e.message || 'Error desconocido'), 'error');
            }
        }
    };

    window.deleteInvoice = async (id) => {
        if (!id) { showToast('ID no válido', 'error'); return; }
        const isAdmin = currentUser && currentUser.role === 'admin';
        if (isAdmin) {
            if (!confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.')) return;
            const fd = new FormData();
            fd.append('id', id);
            try {
                const res = await apiFetch('delete_invoice', { method: 'POST', body: fd });
                if (res && res.status === 'success') {
                    showToast('Factura eliminada', 'success');
                    invalidateCache('invoices');
                    loadInvoicesPage(invoicesCurrentPage);
                } else {
                    showToast(res && res.message ? res.message : 'No se pudo eliminar', 'error');
                }
            } catch (e) {
                showToast('Error al eliminar: ' + (e.message || 'Error desconocido'), 'error');
            }
        } else {
            if (!confirm('¿Enviar solicitud de eliminación al administrador? Él podrá borrar esta factura desde el panel de Inicio.')) return;
            const fd = new FormData();
            fd.append('table_name', 'invoices');
            fd.append('record_id', id);
            try {
                const res = await apiFetch('create_deletion_request', { method: 'POST', body: fd });
                if (res && res.status === 'success') {
                    showToast(res.message || 'Solicitud enviada al administrador.', 'success');
                } else {
                    showToast(res && res.message ? res.message : 'No se pudo enviar la solicitud', 'error');
                }
            } catch (e) {
                showToast('Error: ' + (e.message || 'Error desconocido'), 'error');
            }
        }
    };

    window.processDeletionRequest = async (requestId, action) => {
        if (!requestId || !action) return;
        if (action === 'approve' && !confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
        const fd = new FormData();
        fd.append('id', requestId);
        fd.append('request_action', action);  // no usar 'action' para no sobrescribir la acción del API
        try {
            const res = await apiFetch('process_deletion_request', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast(res.message || (action === 'approve' ? 'Registro eliminado' : 'Solicitud rechazada'), 'success');
                invalidateCache('history');
                invalidateCache('invoices');
                loadDashboard();
            } else {
                showToast(res && res.message ? res.message : 'Error', 'error');
            }
        } catch (e) {
            showToast('Error: ' + (e.message || ''), 'error');
        }
    };

    window.loadQuote = async (id) => {
        if (!id) {
            showToast('ID de presupuesto no válido', 'error');
            return;
        }
        
        try {
            showToast('Cargando presupuesto...', 'info');
            // Construir la URL correctamente: action=get_quote&id=XXX
            const q = await apiFetch(`get_quote?id=${encodeURIComponent(id)}`);
            
            // Verificar si hay error en la respuesta
            if (q && q.error) {
                showToast(q.error || 'Presupuesto no encontrado', 'error');
                return;
            }
            
            if (!q || !q.id) {
                showToast('Presupuesto no encontrado o sin datos', 'error');
                console.error('Respuesta de get_quote:', q);
                return;
            }
            
            // Validar que los campos necesarios existan
            currentQuoteId = q.id || null;
            currentDocumentIsInvoice = false;
            currentQuoteSignature = (q.quote_signature && String(q.quote_signature).trim()) ? q.quote_signature : null;
            currentDocumentDate = (q.date || '').toString().trim() || null;
            clientNameInput.value = q.client_name || '';
            clientIdInput.value = q.client_id || '';
            clientAddressInput.value = q.client_address || '';
            clientEmailInput.value = q.client_email || '';
            clientPhoneInput.value = q.client_phone || '';
            quoteNotesInput.value = q.notes || '';
            const tagsInputQ = document.getElementById('editor-document-tags');
            if (tagsInputQ) tagsInputQ.value = (q.tags || '').trim();
            const validUntilInput = document.getElementById('editor-valid-until');
            if (validUntilInput) validUntilInput.value = (q.valid_until && String(q.valid_until).substring(0, 10)) || '';
            const validUntilWrap = document.getElementById('editor-valid-until-wrap');
            if (validUntilWrap) validUntilWrap.style.display = '';
            // Validar y mapear items
            if (q.items && Array.isArray(q.items)) {
                items = q.items.map(i => ({
                    id: i.id || Date.now() + Math.random(),
                    description: i.description || '',
                    image_url: i.image_url || null,
                    quantity: parseFloat(i.quantity) || 1,
                    price: parseFloat(i.price) || 0,
                    tax: parseFloat(i.tax_percent) || companyData.defaultTax,
                    catalog_item_id: i.catalog_item_id != null ? parseInt(i.catalog_item_id, 10) : null
                }));
            } else {
                // Si no hay items, crear uno por defecto
                items = [{ id: Date.now(), description: 'Nuevo Servicio', quantity: 1, price: 0, tax: companyData.defaultTax }];
            }
            
            // Asegurar que haya al menos un item
            if (items.length === 0) {
                items = [{ id: Date.now(), description: 'Nuevo Servicio', quantity: 1, price: 0, tax: companyData.defaultTax }];
            }
            
            renderItems();
            updatePreview();
            
            await ensureEditorProjectsLoaded();
            const projectSel = document.getElementById('editor-project-id');
            if (projectSel) projectSel.value = (q.project_id != null && q.project_id !== '') ? String(q.project_id) : '';
            // Establecer el estado DESPUÉS de updatePreview para que las opciones ya estén generadas
            setTimeout(() => {
                const statusSelect = document.getElementById('quote-status');
                if (statusSelect) {
                    statusSelect.value = q.status || 'draft';
                }
            }, 10);
            
            // Mostrar historial de cambios si existe
            if (q.audit_log && Array.isArray(q.audit_log) && q.audit_log.length > 0) {
                const auditCard = document.getElementById('audit-log-card');
                const auditList = document.getElementById('audit-log-list');
                if (auditCard && auditList) {
                    auditCard.style.display = 'block';
                    auditList.innerHTML = q.audit_log.map(log => {
                        const actionText = log.action === 'create' ? 'Creado' : log.action === 'update' ? 'Modificado' : 'Eliminado';
                        const actionIcon = log.action === 'create' ? 'plus' : log.action === 'update' ? 'edit-3' : 'trash-2';
                        const changes = log.changes ? JSON.parse(log.changes) : [];
                        const date = new Date(log.created_at).toLocaleString('es-ES');
                        return `
                            <div class="history-item" style="padding: 0.75rem;">
                                <div style="flex:1">
                                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
                                        <i data-lucide="${actionIcon}" style="width:14px;height:14px;"></i>
                                        <strong>${actionText}</strong>
                                        ${log.username ? `<span style="color:var(--text-muted);font-size:0.8rem;">por ${log.username}</span>` : ''}
                                    </div>
                                    ${changes.length > 0 ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem;">${changes.join(', ')}</div>` : ''}
                                    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">${date}</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                    // Inicializar iconos
                    if (typeof lucide !== 'undefined') {
                        requestAnimationFrame(() => lucide.createIcons());
                    }
                }
            } else {
                const auditCard = document.getElementById('audit-log-card');
                if (auditCard) auditCard.style.display = 'none';
            }

            // Ocultar bloque de pagos (solo para facturas)
            const paymentsCardQ = document.getElementById('invoice-payments-card');
            if (paymentsCardQ) paymentsCardQ.style.display = 'none';
            // Un presupuesto no usa opciones de factura recurrente
            setRecurringInvoiceUI(false);
            switchSection('section-editor', navEditor);
            updatePayButtonVisibility();
            showToast('Presupuesto cargado correctamente', 'success');
            
            // Scroll suave al inicio del editor
            document.getElementById('section-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            console.error('Error cargando presupuesto:', e);
            showToast('Error al cargar presupuesto: ' + (e.message || 'Error desconocido'), 'error');
        }
    };

    saveBtn.addEventListener('click', async () => {
        // Validación básica antes de guardar
        if (!clientNameInput.value.trim()) {
            showToast('Por favor, indica el nombre del cliente', 'error');
            clientNameInput.focus();
            return;
        }
        
        if (items.length === 0 || items.every(i => !i.description.trim() && i.price === 0)) {
            showToast('Añade al menos un artículo con descripción', 'error');
            return;
        }
        
        const projectSelect = document.getElementById('editor-project-id');
        const tagsEl = document.getElementById('editor-document-tags');
        const validUntilEl = document.getElementById('editor-valid-until');
        const quote = {
            id: currentQuoteId || `PRE-${Date.now()}`,
            date: new Date().toISOString().slice(0, 19).replace('T', ' '),
            client: { name: clientNameInput.value, id: clientIdInput.value, address: clientAddressInput.value, email: clientEmailInput.value, phone: clientPhoneInput.value },
            notes: quoteNotesInput.value,
            status: document.getElementById('quote-status').value,
            items: items,
            totals: { subtotal: items.reduce((a, b) => a + (b.quantity * b.price), 0), tax: items.reduce((a, b) => a + (b.quantity * b.price * (b.tax / 100)), 0), total: items.reduce((a, b) => a + (b.quantity * b.price * (1 + b.tax / 100)), 0) },
            project_id: (projectSelect && projectSelect.value) ? projectSelect.value : '',
            tags: (tagsEl && tagsEl.value) ? tagsEl.value.trim() : '',
            valid_until: (validUntilEl && validUntilEl.value) ? validUntilEl.value : ''
        };
        try {
            const isInvoice = currentDocumentIsInvoice || (currentQuoteId && currentQuoteId.startsWith('FAC-'));
            const recurring = isInvoice && recurringInvoiceEnabledInput ? {
                enabled: !!recurringInvoiceEnabledInput.checked,
                frequency: recurringInvoiceFrequencyInput ? recurringInvoiceFrequencyInput.value : null,
                next_date: (recurringInvoiceNextDateInput && recurringInvoiceNextDateInput.value) ? recurringInvoiceNextDateInput.value : null,
                start_date: (recurringInvoiceStartDateInput && recurringInvoiceStartDateInput.value) ? recurringInvoiceStartDateInput.value : null,
                end_date: (recurringInvoiceEndDateInput && recurringInvoiceEndDateInput.value) ? recurringInvoiceEndDateInput.value : null
            } : null;
            const rebu = isInvoice && rebuInvoiceEnabledInput ? !!rebuInvoiceEnabledInput.checked : false;
            const action = isInvoice ? 'save_invoice' : 'save_quote';
            const res = await fetch(`${getApiEndpoint()}?action=${action}&t=${Date.now()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isInvoice ? { ...quote, quote_id: null, recurring, rebu } : quote)
            });
            const result = await res.json();
            if (result.status === 'success') { 
                currentQuoteId = result.id;
                currentDocumentDate = quote.date || new Date().toISOString().slice(0, 19);
                showToast('¡Guardado con éxito!', 'success');
                invalidateCache('history');
                invalidateCache('invoices');
                updatePreview();
                const savedStatus = document.getElementById('quote-status')?.value;
                if (!(currentQuoteId && currentQuoteId.startsWith('FAC-')) && savedStatus === 'accepted') {
                    if (confirm('Presupuesto aceptado. ¿Crear contrato desde este presupuesto? Se rellenarán cliente e importe.')) {
                        openContractFromQuote(currentQuoteId);
                    }
                }
            } else {
                showToast(result.message || 'Error al guardar', 'error');
            }
        } catch (e) { 
            console.error('Error guardando:', e);
            showToast('Error al guardar: ' + (e.message || 'Error desconocido'), 'error'); 
        }
    });

    // Botón de duplicar desde el editor actual
    if (duplicateBtn) {
        duplicateBtn.addEventListener('click', () => {
            if (!currentQuoteId) {
                showToast('Primero guarda el presupuesto o factura para poder duplicarlo.', 'error');
                return;
            }

            if (currentQuoteId.startsWith('FAC-')) {
                window.duplicateInvoice(currentQuoteId);
            } else {
                window.duplicateQuote(currentQuoteId);
            }
        });
    }

    if (exportEinvoiceBtn) {
        exportEinvoiceBtn.addEventListener('click', () => {
            if (!currentQuoteId || !currentQuoteId.startsWith('FAC-')) {
                showToast('Para generar factura electrónica, abre una factura existente (ID que empiece por FAC-).', 'error');
                return;
            }
            try {
                const payload = buildElectronicDocumentPayload(true);
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${currentQuoteId}_verifactu.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Factura electrónica generada (JSON con bloque Verifactu). Revisa o envía a tu gestoría.', 'success');
            } catch (e) {
                console.error('Error generando factura electrónica:', e);
                showToast('No se pudo generar la factura electrónica.', 'error');
            }
        });
    }

    if (exportEinvoiceXmlBtn) {
        exportEinvoiceXmlBtn.addEventListener('click', () => {
            if (!currentQuoteId || !currentQuoteId.startsWith('FAC-')) {
                showToast('Para generar XML Facturae, abre una factura existente (ID que empiece por FAC-).', 'error');
                return;
            }
            try {
                const payload = buildElectronicDocumentPayload(true);
                const xml = buildFacturaeXmlFromPayload(payload);
                const blob = new Blob([xml], { type: 'application/xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${currentQuoteId}_facturae.xml`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('XML Facturae generado. Revisa el fichero o envíalo a tu gestoría.', 'success');
            } catch (e) {
                console.error('Error generando XML Facturae:', e);
                showToast('No se pudo generar el XML Facturae.', 'error');
            }
        });
    }

    // Cambiar estado y detectar "Aceptado" para generar factura
    const statusSelector = document.getElementById('quote-status');
    if (statusSelector) {
        statusSelector.addEventListener('change', async (e) => {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('Estado cambiado a:', e.target.value, 'Quote ID:', currentQuoteId);
            }
            if (e.target.value === 'accepted' && currentQuoteId && !currentQuoteId.startsWith('FAC-')) {
                if (confirm('¿Deseas generar una factura electrónica a partir de este presupuesto?')) {
                    await generateInvoiceFromQuote();
                }
                return;
            }

            // Si estamos en una factura, actualizar solo el estado de forma rápida
            if (currentQuoteId && currentQuoteId.startsWith('FAC-')) {
                const newStatus = e.target.value;
                const fd = new FormData();
                fd.append('id', currentQuoteId);
                fd.append('status', newStatus);
                try {
                    await apiFetch('update_invoice_status', { method: 'POST', body: fd });
                    invalidateCache('invoices');
                    invalidateCache('history');
                    showToast('Estado de la factura actualizado', 'success');
                } catch (err) {
                    console.error('Error actualizando estado de factura desde el editor:', err);
                    showToast('No se pudo actualizar el estado de la factura', 'error');
                }
            }
        });
    }

    async function generateInvoiceFromQuote() {
        const nextId = await getNextInvoiceId();
        const invoiceId = nextId || `FAC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        const invoiceDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const editorProjectSelect = document.getElementById('editor-project-id');
        const invoice = {
            id: invoiceId,
            quote_id: currentQuoteId,
            date: invoiceDate,
            client: { name: clientNameInput.value, id: clientIdInput.value, address: clientAddressInput.value, email: clientEmailInput.value, phone: clientPhoneInput.value },
            notes: quoteNotesInput.value,
            status: 'pending',
            items: items,
            totals: { subtotal: items.reduce((a, b) => a + (b.quantity * b.price), 0), tax: items.reduce((a, b) => a + (b.quantity * b.price * (b.tax / 100)), 0), total: items.reduce((a, b) => a + (b.quantity * b.price * (1 + b.tax / 100)), 0) },
            project_id: (editorProjectSelect && editorProjectSelect.value) ? editorProjectSelect.value : ''
        };

        try {
            const res = await fetch(`${getApiEndpoint()}?action=save_invoice&t=${Date.now()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invoice)
            });
            const result = await res.json();
            if (result.status === 'success') {
                showToast('¡Factura generada con éxito!', 'success');
                currentQuoteId = result.id;
                invalidateCache('invoices');
                invalidateCache('history');
                updatePreview();
                switchSection('section-editor', navEditor);
            }
        } catch (e) { showToast('Error al generar factura', 'error'); }
    }

    btnLogout.addEventListener('click', async () => { try { await apiFetch('logout'); } finally { location.reload(); } });
    btnLogin.addEventListener('click', login);
    function setTheme(isLight) {
        if (isLight) document.body.classList.add('light-theme');
        else document.body.classList.remove('light-theme');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        const loginIcon = document.getElementById('login-theme-icon');
        if (loginIcon) {
            loginIcon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
            if (typeof lucide !== 'undefined') requestAnimationFrame(() => lucide.createIcons());
        }
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
            if (typeof lucide !== 'undefined') requestAnimationFrame(() => lucide.createIcons());
        }
    }
    themeToggle.addEventListener('click', () => setTheme(!document.body.classList.contains('light-theme')));
    const loginThemeToggle = document.getElementById('login-theme-toggle');
    if (loginThemeToggle) {
        loginThemeToggle.addEventListener('click', () => setTheme(!document.body.classList.contains('light-theme')));
    }

    function updateCompanyDisplay() {
        const prevComp = document.getElementById('preview-company-name');
        if (prevComp) prevComp.textContent = companyData.name;
    }

    // --- PDF & PRINTING ---
    async function downloadPDF() {
        // Verificar que las librerías estén cargadas
        if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
            showToast('Cargando librerías PDF...', 'info');
            await new Promise(resolve => {
                const checkLibs = setInterval(() => {
                    if (typeof html2canvas !== 'undefined' && typeof window.jspdf !== 'undefined') {
                        clearInterval(checkLibs);
                        resolve();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkLibs);
                    resolve();
                }, 5000);
            });
        }
        
        const element = document.getElementById('quote-preview');
        const isInvoice = currentDocumentIsInvoice || (currentQuoteId && String(currentQuoteId).startsWith('FAC-'));
        const filename = `${isInvoice ? 'Factura' : 'Presupuesto'}_${currentQuoteId || 'nuevo'}.pdf`;

        showToast('Generando PDF...', 'info');

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                removeContainer: true,
                imageTimeout: 5000,
                // No incluir controles de UI (botones, etc.) en el PDF
                ignoreElements: (el) => {
                    if (!el) return false;
                    if (el.id === 'btn-copy-summary' || el.id === 'btn-edit-on-document' || el.id === 'btn-open-preview-page') return true;
                    if (el.classList && el.classList.contains('no-print')) return true;
                    if (typeof el.closest === 'function' && el.closest('.no-print')) return true;
                    return false;
                }
            });

            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(filename);
            showToast('¡PDF descargado!', 'success');
        } catch (e) {
            console.error('Error al generar PDF:', e);
            showToast('Error al generar PDF. Intenta imprimir directamente.', 'error');
        }
    }

    async function getPDFBlob() {
        const element = document.getElementById('quote-preview');
        const canvas = await html2canvas(element, {
            scale: 1,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            removeContainer: true,
            imageTimeout: 5000,
            ignoreElements: (el) => {
                if (!el) return false;
                if (el.id === 'btn-copy-summary' || el.id === 'btn-edit-on-document' || el.id === 'btn-open-preview-page') return true;
                if (el.classList && el.classList.contains('no-print')) return true;
                if (typeof el.closest === 'function' && el.closest('.no-print')) return true;
                return false;
            }
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.6);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        return pdf.output('blob');
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl;
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Error al convertir PDF a base64'));
            reader.readAsDataURL(blob);
        });
    }

    downloadBtn.addEventListener('click', downloadPDF);

    // --- ENVIAR POR EMAIL ---
    const modalEmailOverlay = document.getElementById('modal-email-overlay');
    const modalEmailTo = document.getElementById('modal-email-to');
    const modalEmailSubject = document.getElementById('modal-email-subject');
    const modalEmailBody = document.getElementById('modal-email-body');
    window._emailContext = null;
    const DEFAULT_EMAIL_BODY = `Buenos días,

Le enviamos el {{tipo}} {{id}} en el archivo adjunto ({{nombre_archivo}}).

Puede revisarlo y, si tiene alguna duda o desea realizar cualquier cambio, no dude en contactarnos.

Un cordial saludo.`;
    const DEFAULT_EMAIL_SUBJECT = '{{tipo}} {{id}}';

    document.getElementById('btn-send-email').addEventListener('click', () => {
        window._emailContext = null;
        modalEmailTo.value = clientEmailInput.value.trim() || '';
        const tipo = (currentQuoteId && currentQuoteId.startsWith('FAC-')) ? 'Factura' : 'Presupuesto';
        const id = currentQuoteId || '';
        const nombreArchivo = (tipo === 'Factura' ? 'Factura' : 'Presupuesto') + '_' + (id || 'nuevo') + '.pdf';
        const settings = getCachedData('settings') || {};
        const subjectTemplate = (settings.document_email_subject || '').trim() || DEFAULT_EMAIL_SUBJECT;
        const bodyTemplate = (settings.document_email_body || '').trim() || DEFAULT_EMAIL_BODY;
        modalEmailSubject.value = subjectTemplate.replace(/\{\{tipo\}\}/g, tipo).replace(/\{\{id\}\}/g, id).replace(/\{\{nombre_archivo\}\}/g, nombreArchivo);
        modalEmailBody.value = bodyTemplate.replace(/\{\{tipo\}\}/g, tipo).replace(/\{\{id\}\}/g, id).replace(/\{\{nombre_archivo\}\}/g, nombreArchivo);
        modalEmailOverlay.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
        setTimeout(function () { if (modalEmailTo) modalEmailTo.focus(); }, 100);
    });
    document.getElementById('modal-email-cancel').addEventListener('click', () => modalEmailOverlay.classList.add('hidden'));
    modalEmailOverlay.addEventListener('click', function (e) {
        if (e.target === modalEmailOverlay) modalEmailOverlay.classList.add('hidden');
    });
    document.addEventListener('keydown', function emailModalEscape(e) {
        console.log('[Email] Clic en Enviar (servidor)');
    }
    const to = modalEmailTo.value.trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        showToast('Indica un email de destino válido', 'error');
        return;
    }
    if (modalEmailSendBtn.disabled) return;
    modalEmailSendBtn.disabled = true;
    const isInvoice = currentDocumentIsInvoice || (currentQuoteId && String(currentQuoteId).startsWith('FAC-'));
    const ctx = window._emailContext;
    const filename = ctx && ctx.filename
        ? ctx.filename
        : ((isInvoice ? 'Factura' : 'Presupuesto') + '_' + (currentQuoteId || 'nuevo') + '.pdf');
    const getBlob = ctx && ctx.getPDFBlob
        ? ctx.getPDFBlob
        : getPDFBlob;
    const showResult = (result) => {
        if (result && result.status === 'success') {
            modalEmailOverlay.classList.add('hidden');
            showToast('Email enviado correctamente con el PDF adjunto', 'success');
        } else {
            let msg = result?.message || 'No se pudo enviar el email';
            if (result?.smtp_status) {
                const s = result.smtp_status;
                if (!s.smtp_enabled) msg += ' (En servidor: SMTP desactivado. Actívalo y Guardar configuración.)';
                else if (!s.has_user) msg += ' (En servidor: falta Usuario SMTP. Rellena y Guardar.)';
                else if (!s.has_pass) msg += ' (En servidor: falta Contraseña. Pon la contraseña de aplicación y Guardar.)';
            }
            console.error('[Email] Error del servidor:', msg);
            if (/rechazado|rechazó/i.test(msg)) {
                showToast('Gmail rechazó el envío. Usa «Abrir mi correo»: se descargará el PDF y se abrirá tu correo para que lo envíes tú. (Detalle en consola F12)', 'error');
            } else {
                showToast(msg, 'error');
            }
        }
    };
    let blob;
    try {
        showToast('Generando PDF...', 'info');
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('[Email] Generando PDF...');
        }
        blob = await getBlob();
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('[Email] PDF listo, tamaño:', blob.size, 'bytes');
        }
        showToast('Subiendo PDF...', 'info');
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('[Email] Subiendo adjunto...');
        }
        const fdUpload = new FormData();
        fdUpload.append('pdf', blob, filename);
        const uploadRes = await apiFetch('upload_email_attachment', { method: 'POST', body: fdUpload, timeout: 90000 });
        if (!uploadRes || uploadRes.status !== 'success' || !uploadRes.token) {
            console.error('[Email] Subida fallida:', uploadRes?.message);
            showToast(uploadRes?.message || 'No se pudo subir el adjunto', 'error');
            return;
        }
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('[Email] Adjunto subido, enviando correo... (puede tardar hasta 2 min)');
        }
        showToast('Enviando correo por SMTP... (puede tardar 1-2 min)', 'info');
        const fd = new FormData();
        fd.append('to', to);
        fd.append('subject', modalEmailSubject.value);
        fd.append('body', modalEmailBody.value);
        fd.append('pdf_token', uploadRes.token);
        fd.append('pdf_filename', filename);
        const result = await apiFetch('send_email', { method: 'POST', body: fd, timeout: 120000 });
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('[Email] Respuesta:', result?.status, result?.message || '');
        }
        showResult(result);
    } catch (e) {
        console.error('[Email] Error:', e.message || e);
        const msg = e.message || 'Error al enviar el email';
        const noResponde = /no responde|timeout|tardó demasiado|respuesta vacía/i.test(String(msg));
        showToast(noResponde ? 'El servidor no responde. Usa «Abrir mi correo» para descargar el PDF y enviarlo desde tu correo.' : msg, 'error');
    } finally {
        modalEmailSendBtn.disabled = false;
    }
});

document.getElementById('modal-email-open-mailto').addEventListener('click', async () => {
    const to = modalEmailTo.value.trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        showToast('Indica un email de destino válido', 'error');
        return;
    }
    try {
        showToast('Generando PDF...', 'info');
        if (modalEmailSendBtn.disabled) return;
        modalEmailSendBtn.disabled = true;
        const isInvoice = currentDocumentIsInvoice || (currentQuoteId && String(currentQuoteId).startsWith('FAC-'));
        const ctx = window._emailContext;
        const filename = ctx && ctx.filename
            ? ctx.filename
            : ((isInvoice ? 'Factura' : 'Presupuesto') + '_' + (currentQuoteId || 'nuevo') + '.pdf');
        const getBlob = ctx && ctx.getPDFBlob
            ? ctx.getPDFBlob
            : getPDFBlob;
        const showResult = (result) => {
            if (result && result.status === 'success') {
                modalEmailOverlay.classList.add('hidden');
                showToast('Email enviado correctamente con el PDF adjunto', 'success');
            } else {
                let msg = result?.message || 'No se pudo enviar el email';
                if (result?.smtp_status) {
                    const s = result.smtp_status;
                    if (!s.smtp_enabled) msg += ' (En servidor: SMTP desactivado. Actívalo y Guardar configuración.)';
                    else if (!s.has_user) msg += ' (En servidor: falta Usuario SMTP. Rellena y Guardar.)';
                    else if (!s.has_pass) msg += ' (En servidor: falta Contraseña. Pon la contraseña de aplicación y Guardar.)';
                }
                console.error('[Email] Error del servidor:', msg);
                if (/rechazado|rechazó/i.test(msg)) {
                    showToast('Gmail rechazó el envío. Usa «Abrir mi correo»: se descargará el PDF y se abrirá tu correo para que lo envíes tú. (Detalle en consola F12)', 'error');
                } else {
                    showToast(msg, 'error');
                }
            }
        };
        let blob;
        try {
            showToast('Generando PDF...', 'info');
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('[Email] Generando PDF...');
            }
            blob = await getBlob();
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('[Email] PDF listo, tamaño:', blob.size, 'bytes');
            }
            showToast('Subiendo PDF...', 'info');
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('[Email] Subiendo adjunto...');
            }
            const fdUpload = new FormData();
            fdUpload.append('pdf', blob, filename);
            const uploadRes = await apiFetch('upload_email_attachment', { method: 'POST', body: fdUpload, timeout: 90000 });
            if (!uploadRes || uploadRes.status !== 'success' || !uploadRes.token) {
                console.error('[Email] Subida fallida:', uploadRes?.message);
                showToast(uploadRes?.message || 'No se pudo subir el adjunto', 'error');
                return;
            }
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('[Email] Adjunto subido, enviando correo... (puede tardar hasta 2 min)');
            }
            showToast('Enviando correo por SMTP... (puede tardar 1-2 min)', 'info');
            const fd = new FormData();
            fd.append('to', to);
            fd.append('subject', modalEmailSubject.value);
            fd.append('body', modalEmailBody.value);
            fd.append('pdf_token', uploadRes.token);
            fd.append('pdf_filename', filename);
            const result = await apiFetch('send_email', { method: 'POST', body: fd, timeout: 120000 });
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('[Email] Respuesta:', result?.status, result?.message || '');
            }
            showResult(result);
        } catch (e) {
            console.error('[Email] Error:', e.message || e);
            const msg = e.message || 'Error al enviar el email';
            const noResponde = /no responde|timeout|tardó demasiado|respuesta vacía/i.test(String(msg));
            showToast(noResponde ? 'El servidor no responde. Usa «Abrir mi correo» para descargar el PDF y enviarlo desde tu correo.' : msg, 'error');
        } finally {
            modalEmailSendBtn.disabled = false;
        }
    });

    document.getElementById('modal-email-open-mailto').addEventListener('click', async () => {
        const to = modalEmailTo.value.trim();
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            showToast('Indica un email de destino válido', 'error');
            return;
        }
        try {
            showToast('Generando PDF...', 'info');
            const ctx = window._emailContext;
            const getBlob = ctx && ctx.getPDFBlob ? ctx.getPDFBlob : getPDFBlob;
            const blob = await getBlob();
            const filename = ctx && ctx.filename
                ? ctx.filename
                : ((currentDocumentIsInvoice || (currentQuoteId && String(currentQuoteId).startsWith('FAC-'))) ? 'Factura' : 'Presupuesto') + '_' + (currentQuoteId || 'nuevo') + '.pdf';
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            const subject = (modalEmailSubject.value || 'Presupuesto / Factura').trim();
            const bodyRaw = (modalEmailBody.value || 'Adjunto encontrará el documento.').trim();
            const body = bodyRaw.replace(/\r?\n/g, '\r\n');
            const mailto = 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
            window.location.href = mailto;
            showToast('PDF descargado. El correo se abrirá con destinatario, asunto y mensaje rellenados. Solo adjunta el archivo "' + filename + '" y pulsa Enviar.', 'success');
        } catch (e) {
            console.error('Error:', e);
            showToast(e.message || 'Error al generar el PDF', 'error');
        }
    });

    // --- PRINTING ---
    function printDocument() {
        const content = document.getElementById('quote-preview').innerHTML;
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
                <head>
                    <title>Imprimir documento</title>
                    <style>
                        body { font-family: 'Outfit', sans-serif; padding: 20px; color: #1e293b; }
                        .preview-card { background: white; padding: 0; box-shadow: none; width: 100%; }
                        .preview-header { display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 30px; }
                        .header-main { display: flex; flex-direction: column; gap: 15px; }
                        .company-info h1 { font-size: 1.5rem; margin: 0; }
                        .quote-meta { text-align: right; }
                        .quote-meta h2 { color: #d21f2b; margin: 0; }
                        .preview-parties { margin-bottom: 30px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        th { background: #f8fafc; padding: 10px; text-align: left; font-size: 0.8rem; }
                        td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
                        .preview-summary { margin-left: auto; width: 200px; }
                        .summary-line { display: flex; justify-content: space-between; margin-bottom: 5px; }
                        .total { border-top: 2px solid #f1f5f9; padding-top: 10px; font-weight: bold; font-size: 1.1rem; }
                        .preview-notes { margin-top: 30px; font-size: 0.8rem; border-top: 1px solid #f1f5f9; padding-top: 10px; }
                        .preview-footer { margin-top: 40px; font-size: 0.7rem; color: #94a3b8; text-align: center; }
                        @media print { .no-print { display: none; } #btn-copy-summary { display: none !important; } }
                    </style>
                </head>
                <body>
                    <div class="preview-card">${content}</div>
                    <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
                </body>
            </html>
        `);
        win.document.close();
    }

    document.getElementById('btn-print').addEventListener('click', printDocument);

    function updatePayButtonVisibility() {
        const btn = document.getElementById('btn-pay-invoice');
        if (btn) {
            const settings = getCachedData('settings');
            const isInvoice = currentQuoteId && String(currentQuoteId).startsWith('FAC-');
            const enabled = settings && settings.payment_enabled && (settings.payment_link_url || '').trim();
            if (isInvoice && enabled) {
                btn.classList.remove('hidden');
                const url = (settings.payment_link_url || '').trim().replace(/\{id\}/g, currentQuoteId || '');
                btn.onclick = () => window.open(url, '_blank');
            } else {
                btn.classList.add('hidden');
            }
        }
        const btnAcceptLink = document.getElementById('btn-copy-accept-link');
        if (btnAcceptLink) {
            const isQuote = currentQuoteId && !String(currentQuoteId).startsWith('FAC-');
            if (isQuote) btnAcceptLink.classList.remove('hidden'); else btnAcceptLink.classList.add('hidden');
        }
        const validUntilWrap = document.getElementById('editor-valid-until-wrap');
        if (validUntilWrap) validUntilWrap.style.display = (currentQuoteId && !String(currentQuoteId).startsWith('FAC-')) ? '' : 'none';
    }

    const btnCopyAcceptLink = document.getElementById('btn-copy-accept-link');
    if (btnCopyAcceptLink) btnCopyAcceptLink.addEventListener('click', async () => {
        if (!currentQuoteId || currentQuoteId.startsWith('FAC-')) return;
        try {
            const obj = await apiFetch('get_accept_quote_link?id=' + encodeURIComponent(currentQuoteId), { timeout: 25000 });
            if (obj && obj.status === 'success' && obj.url) {
                await navigator.clipboard.writeText(obj.url);
                showToast('Enlace copiado. Envíalo al cliente para que firme y acepte el presupuesto.', 'success');
            } else {
                showToast((obj && obj.message) || 'No se pudo generar el enlace', 'error');
            }
        } catch (e) {
            const msg = (e && e.message || '').toString();
            if (msg.includes('504') || msg.includes('Timeout')) {
                showToast('El servidor ha tardado demasiado. Intenta de nuevo en un momento.', 'error');
            } else {
                showToast('Error al obtener el enlace', 'error');
            }
        }
    });

    // --- WHATSAPP ---
    document.getElementById('btn-whatsapp').addEventListener('click', () => {
        const phone = clientPhoneInput.value.replace(/\D/g, '');
        if (!phone) {
            showToast('Por favor, indica un teléfono válido', 'error');
            return;
        }
        const isInvoice = currentQuoteId && currentQuoteId.startsWith('FAC-');
        const docType = isInvoice ? 'Factura' : 'Presupuesto';
        const id = currentQuoteId || 'nuevo';
        const text = `Hola ${clientNameInput.value || 'cliente'},\n\nTe envío tu ${docType} ${id}.\n\nPuedes descargar el PDF desde el enlace que te hemos enviado por email, o solicitarlo si no lo has recibido.\n\nGracias por tu confianza.`;
        window.open(`https://wa.me/${phone.startsWith('34') ? phone : '34' + phone}?text=${encodeURIComponent(text)}`, '_blank');
    });

    navExpenses.addEventListener('click', async () => { loadExpenses(); switchSection('section-expenses', navExpenses); });
    if (navRemittances) navRemittances.addEventListener('click', () => { loadRemittances(); switchSection('section-remittances', navRemittances); });

    if (navTpv) navTpv.addEventListener('click', () => { loadTpv(); switchSection('section-tpv', navTpv); });
    if (navTickets) navTickets.addEventListener('click', () => { loadTickets(); switchSection('section-tickets', navTickets); });
    if (navReceipts) navReceipts.addEventListener('click', () => { loadReceipts(); switchSection('section-receipts', navReceipts); });

    async function loadExpenses() {
        try {
            // Intentar usar caché primero
            let data = getCachedData('expenses');
            
            if (!data) {
                data = await apiFetch('get_expenses');
                setCachedData('expenses', data);
            }
            
            renderList(
                document.getElementById('expenses-list'),
                data,
                (e) => {
                    const userBadge = e.username ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${e.username}</span>` : '';
                    return `
                        <div class="history-item">
                            <div style="flex:1"><strong>${e.description}</strong>${userBadge}<br><small>${e.category} • ${e.date.split(' ')[0]}</small></div>
                            <div style="text-align:right">
                                <strong style="color:var(--danger)">-${formatCurrency(e.amount)}</strong><br>
                                <button class="btn btn-remove btn-sm" onclick="deleteExpense(${e.id})" style="padding:2px">🗑️</button>
                            </div>
                        </div>
                    `;
                },
                'No hay gastos registrados'
            );
        } catch (e) { 
            showToast('Error al cargar gastos', 'error');
        }
    }

    document.getElementById('btn-add-expense').addEventListener('click', async () => {
        const desc = document.getElementById('expense-desc').value;
        const amount = document.getElementById('expense-amount').value;
        const category = document.getElementById('expense-category').value;
        const date = document.getElementById('expense-date').value || new Date().toISOString().split('T')[0];

        if (!desc || !amount) return showToast('Completa los campos obligatorios', 'error');

        const fd = new FormData();
        fd.append('description', desc);
        fd.append('amount', amount);
        fd.append('category', category);
        fd.append('date', date);
        if (expenseCustomerSelect && expenseCustomerSelect.value) fd.append('customer_id', expenseCustomerSelect.value);
        if (expenseProjectSelect && expenseProjectSelect.value) fd.append('project_id', expenseProjectSelect.value);

        try {
            await apiFetch('save_expense', { method: 'POST', body: fd });
            showToast('Gasto guardado', 'success');
            document.getElementById('expense-desc').value = '';
            document.getElementById('expense-amount').value = '';
            invalidateCache('expenses');
            loadExpenses();
        } catch (e) { showToast('Error al guardar gasto', 'error'); }
    });

    window.deleteExpense = async (id) => {
        if (!confirm('¿Eliminar este gasto?')) return;
        const fd = new FormData(); fd.append('id', id);
        try {
            await apiFetch('delete_expense', { method: 'POST', body: fd });
            invalidateCache('expenses');
            await loadExpenses();
            showToast('Gasto eliminado', 'success');
        } catch (e) {
            showToast(e && e.message ? e.message : 'Error al eliminar', 'error');
        }
    };

    // --- REMESAS Y CARGOS ---
    let remittancesCache = null;
    async function loadRemittances() {
        const listEl = document.getElementById('remittances-list');
        const summaryIn = document.getElementById('remittances-summary-incoming');
        const summaryOut = document.getElementById('remittances-summary-outgoing');
        const summaryBal = document.getElementById('remittances-summary-balance');
        const periodSelect = document.getElementById('remittances-summary-period');
        const filterType = document.getElementById('remittances-filter-type');
        const filterStatus = document.getElementById('remittances-filter-status');
        const invoiceSelect = document.getElementById('remittance-invoice-id');
        if (!listEl) return;
        try {
            const qParts = [];
            if (filterType && filterType.value) qParts.push('type=' + encodeURIComponent(filterType.value));
            if (filterStatus && filterStatus.value) qParts.push('status=' + encodeURIComponent(filterStatus.value));
            const query = qParts.length ? '?' + qParts.join('&') : '';
            const [remittances, summary, invoicesData] = await Promise.all([
                apiFetch('get_remittances' + query),
                (() => {
                    const period = periodSelect && periodSelect.value;
                    let q = '';
                    if (period === 'month') {
                        const d = new Date();
                        q = '?year=' + d.getFullYear() + '&month=' + (d.getMonth() + 1);
                    }
                    return apiFetch('get_remittances_summary' + q);
                })(),
                apiFetch('get_invoices?limit=500&offset=0')
            ]);
            remittancesCache = Array.isArray(remittances) ? remittances : [];
            if (summaryIn) summaryIn.textContent = formatCurrency(summary.incoming || 0);
            if (summaryOut) summaryOut.textContent = formatCurrency(summary.outgoing || 0);
            if (summaryBal) {
                summaryBal.textContent = formatCurrency(summary.balance || 0);
                summaryBal.style.color = (summary.balance || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
            }
            const invoices = (invoicesData && invoicesData.items) ? invoicesData.items : [];
            if (invoiceSelect) {
                const cur = invoiceSelect.value;
                invoiceSelect.innerHTML = '<option value="">— Sin factura —</option>';
                invoices.forEach(inv => {
                    const opt = document.createElement('option');
                    opt.value = inv.id;
                    opt.textContent = (inv.id || '') + ' · ' + (inv.client_name || '').replace(/</g, '&lt;') + ' · ' + formatCurrency(inv.total_amount || 0);
                    if (String(inv.id) === cur) opt.selected = true;
                    invoiceSelect.appendChild(opt);
                });
            }
            if (remittancesCache.length === 0) {
                listEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">No hay remesas ni cargos.</div></div>';
            } else {
                listEl.innerHTML = remittancesCache.map(r => {
                    const typeLabel = (r.type || 'incoming') === 'outgoing' ? 'Saliente' : 'Entrante';
                    const typeColor = (r.type || 'incoming') === 'outgoing' ? 'var(--danger)' : 'var(--success)';
                    const userBadge = r.username ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${(r.username || '').replace(/</g, '&lt;')}</span>` : '';
                    const desc = (r.description || '').replace(/</g, '&lt;');
                    const ref = (r.bank_reference || '').replace(/</g, '&lt;');
                    const statusLabel = (r.status || 'completed') === 'pending' ? 'Pendiente' : (r.status === 'cancelled' ? 'Anulada' : 'Completada');
                    const amountStr = (r.type || 'incoming') === 'outgoing' ? '-' + formatCurrency(r.amount) : '+' + formatCurrency(r.amount);
                    return `
                        <div class="history-item" data-remittance-id="${r.id}">
                            <div style="flex:1">
                                <strong>${desc || '—'}</strong>${userBadge}<br>
                                <small>${typeLabel} · ${r.date || ''} · ${statusLabel}${ref ? ' · Ref: ' + ref : ''}</small>
                            </div>
                            <div style="text-align:right;display:flex;align-items:center;gap:0.5rem;">
                                <strong style="color:${typeColor}">${amountStr}</strong>
                                <button type="button" class="btn btn-secondary btn-sm" onclick="editRemittance(${r.id})" title="Editar"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
                                <button type="button" class="btn btn-remove btn-sm" onclick="deleteRemittance(${r.id})" title="Eliminar"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            console.error('Error cargando remesas:', e);
            listEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--danger);">No se pudieron cargar las remesas.</div></div>';
        }
    }

    document.getElementById('remittances-filter-type')?.addEventListener('change', () => loadRemittances());
    document.getElementById('remittances-filter-status')?.addEventListener('change', () => loadRemittances());
    document.getElementById('remittances-summary-period')?.addEventListener('change', () => loadRemittances());

    document.getElementById('btn-save-remittance')?.addEventListener('click', async () => {
        const idEl = document.getElementById('remittance-id');
        const typeEl = document.getElementById('remittance-type');
        const amountEl = document.getElementById('remittance-amount');
        const dateEl = document.getElementById('remittance-date');
        const descEl = document.getElementById('remittance-description');
        const refEl = document.getElementById('remittance-bank-reference');
        const statusEl = document.getElementById('remittance-status');
        const invEl = document.getElementById('remittance-invoice-id');
        const cancelBtn = document.getElementById('btn-remittance-cancel');
        if (!amountEl || !dateEl) return;
        const amount = parseFloat(amountEl.value);
        if (!amount || amount <= 0) { showToast('Indica un importe mayor que 0.', 'error'); amountEl.focus(); return; }
        const date = (dateEl.value || '').trim();
        if (!date) { showToast('Indica la fecha.', 'error'); dateEl.focus(); return; }
        const fd = new FormData();
        if (idEl && idEl.value) fd.append('id', idEl.value);
        fd.append('type', (typeEl && typeEl.value) || 'incoming');
        fd.append('amount', amount);
        fd.append('date', date);
        fd.append('description', (descEl && descEl.value) || '');
        fd.append('bank_reference', (refEl && refEl.value) || '');
        fd.append('status', (statusEl && statusEl.value) || 'completed');
        fd.append('invoice_id', (invEl && invEl.value) || '');
        try {
            const res = await apiFetch('save_remittance', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast('Remesa guardada.', 'success');
                if (idEl) idEl.value = '';
                if (amountEl) amountEl.value = '';
                if (dateEl) dateEl.value = '';
                if (descEl) descEl.value = '';
                if (refEl) refEl.value = '';
                if (statusEl) statusEl.value = 'completed';
                if (invEl) invEl.value = '';
                if (cancelBtn) cancelBtn.classList.add('hidden');
                loadRemittances();
            } else {
                showToast((res && res.message) || 'Error al guardar.', 'error');
            }
        } catch (e) {
            showToast(e && e.message ? e.message : 'Error al guardar remesa.', 'error');
        }
    });

    document.getElementById('btn-remittance-cancel')?.addEventListener('click', () => {
        const idEl = document.getElementById('remittance-id');
        const cancelBtn = document.getElementById('btn-remittance-cancel');
        if (idEl) idEl.value = '';
        document.getElementById('remittance-amount').value = '';
        document.getElementById('remittance-description').value = '';
        document.getElementById('remittance-bank-reference').value = '';
        if (cancelBtn) cancelBtn.classList.add('hidden');
    });

    window.editRemittance = function(id) {
        const r = (remittancesCache || []).find(x => x.id == id);
        if (!r) return;
        document.getElementById('remittance-id').value = r.id;
        const typeEl = document.getElementById('remittance-type');
        const amountEl = document.getElementById('remittance-amount');
        const dateEl = document.getElementById('remittance-date');
        const descEl = document.getElementById('remittance-description');
        const refEl = document.getElementById('remittance-bank-reference');
        const statusEl = document.getElementById('remittance-status');
        const invEl = document.getElementById('remittance-invoice-id');
        const cancelBtn = document.getElementById('btn-remittance-cancel');
        if (typeEl) typeEl.value = r.type || 'incoming';
        if (amountEl) amountEl.value = r.amount;
        if (dateEl) dateEl.value = (r.date || '').toString().slice(0, 10);
        if (descEl) descEl.value = r.description || '';
        if (refEl) refEl.value = r.bank_reference || '';
        if (statusEl) statusEl.value = r.status || 'completed';
        if (invEl) invEl.value = r.invoice_id || '';
        if (cancelBtn) cancelBtn.classList.remove('hidden');
    };

    window.deleteRemittance = async function(id) {
        if (!confirm('¿Eliminar esta remesa o cargo?')) return;
        const fd = new FormData();
        fd.append('id', id);
        try {
            const res = await apiFetch('delete_remittance', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast('Remesa eliminada.', 'success');
                loadRemittances();
            } else {
                showToast((res && res.message) || 'Error al eliminar.', 'error');
            }
        } catch (e) {
            showToast(e && e.message ? e.message : 'Error al eliminar.', 'error');
        }
    };

    document.getElementById('btn-export-remittances-csv')?.addEventListener('click', () => {
        const rows = remittancesCache || [];
        if (rows.length === 0) { showToast('No hay datos para exportar.', 'info'); return; }
        const headers = ['id', 'tipo', 'importe', 'fecha', 'descripcion', 'referencia_bancaria', 'estado', 'factura_id'];
        const csvRows = [headers.join(';')];
        rows.forEach(r => {
            csvRows.push([
                r.id,
                r.type || 'incoming',
                (r.amount != null ? r.amount : 0).toString().replace('.', ','),
                (r.date || '').toString().slice(0, 10),
                (r.description || '').replace(/;/g, ','),
                (r.bank_reference || '').replace(/;/g, ','),
                r.status || 'completed',
                r.invoice_id || ''
            ].join(';'));
        });
        const csv = csvRows.join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'remesas_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        showToast('CSV descargado.', 'success');
    });

    // Inicializar fecha por defecto en formulario remesas
    const remittanceDateInput = document.getElementById('remittance-date');
    if (remittanceDateInput && !remittanceDateInput.value) {
        remittanceDateInput.value = new Date().toISOString().slice(0, 10);
    }

    // --- TPV profesional ---
    let tpvCart = [];
    let tpvCatalogData = [];
    let tpvLastSaleId = null;
    let tpvLastSaleNumber = null;

    function tpvSubtotal() {
        return tpvCart.reduce((s, i) => s + (i.quantity * i.price), 0);
    }
    function tpvDiscount() {
        const el = document.getElementById('tpv-discount');
        return el ? Math.max(0, parseFloat(el.value) || 0) : 0;
    }
    function tpvTotal() {
        return Math.max(0, tpvSubtotal() - tpvDiscount());
    }

    async function loadTpv() {
        const catalogList = document.getElementById('tpv-catalog-list');
        const searchEl = document.getElementById('tpv-search');
        if (!catalogList) return;
        try {
            let data = getCachedData('catalog');
            if (!data) {
                data = await apiFetch('get_catalog');
                setCachedData('catalog', data);
            }
            tpvCatalogData = Array.isArray(data) ? data : [];
            renderTpvCatalog(tpvCatalogData);
            const customers = await apiFetch('get_customers');
            const datalist = document.getElementById('tpv-customers-datalist');
            if (datalist && Array.isArray(customers)) {
                datalist.innerHTML = '';
                const seen = new Set();
                customers.forEach(c => {
                    const name = (c.name || '').trim();
                    if (name && !seen.has(name)) {
                        seen.add(name);
                        const opt = document.createElement('option');
                        opt.value = name;
                        datalist.appendChild(opt);
                    }
                });
            }
            if (searchEl) {
                searchEl.value = '';
                searchEl.addEventListener('input', () => {
                    const q = (searchEl.value || '').trim().toLowerCase();
                    if (!q) {
                        renderTpvCatalog(tpvCatalogData);
                        return;
                    }
                    const filtered = tpvCatalogData.filter(i => {
                        const desc = (i.description || '').toLowerCase();
                        return desc.includes(q);
                    });
                    renderTpvCatalog(filtered);
                });
            }
        } catch (e) {
            catalogList.innerHTML = '<p class="tpv-cart-empty" style="grid-column:1/-1;">Error al cargar catálogo</p>';
        }
        renderTpvCart();
        tpvUpdatePaymentUI();
        if (window.lucide) lucide.createIcons();
    }
    (function initTpvListeners() {
        document.getElementById('tpv-payment-method')?.addEventListener('change', tpvUpdatePaymentUI);
        document.getElementById('tpv-discount')?.addEventListener('input', () => { renderTpvCart(); tpvUpdateChange(); });
        document.getElementById('tpv-amount-received')?.addEventListener('input', tpvUpdateChange);
    })();

    function renderTpvCatalog(list) {
        const catalogList = document.getElementById('tpv-catalog-list');
        if (!catalogList) return;
        if (list.length === 0) {
            catalogList.innerHTML = '<p class="tpv-cart-empty" style="grid-column:1/-1;">No hay productos. Añade líneas manualmente abajo.</p>';
            return;
        }
        catalogList.innerHTML = list.map(i => {
            const stockNum = typeof i.stock_qty !== 'undefined' && i.stock_qty !== null ? parseInt(i.stock_qty, 10) : null;
            const noStock = stockNum !== null && stockNum <= 0;
            const cls = noStock ? ' tpv-product-no-stock' : '';
            return `
                <button type="button" class="tpv-product-card${cls}" data-id="${i.id || ''}" data-desc="${escapeHtml(i.description || '')}" data-price="${i.price}" data-tax="${i.tax || 21}" data-stock="${stockNum !== null ? stockNum : ''}" role="listitem">
                    <span class="tpv-product-name">${escapeHtml(i.description || 'Producto')}</span>
                    <span class="tpv-product-price">${formatCurrency(i.price)}</span>
                    ${typeof i.stock_qty !== 'undefined' ? `<span class="tpv-product-stock">Stock: ${i.stock_qty ?? 0}</span>` : ''}
                </button>
            `;
        }).join('');
        catalogList.querySelectorAll('.tpv-product-card:not(.tpv-product-no-stock)').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                const desc = el.dataset.desc || 'Producto';
                const price = parseFloat(el.dataset.price) || 0;
                const tax = parseFloat(el.dataset.tax) || 21;
                tpvCart.push({ id: Date.now(), description: desc, quantity: 1, price, tax, catalog_item_id: id ? parseInt(id, 10) : null });
                renderTpvCart();
            });
        });
        catalogList.querySelectorAll('.tpv-product-no-stock').forEach(el => {
            el.addEventListener('click', () => showToast('Sin stock', 'error'));
        });
    }

    function renderTpvCart() {
        const listEl = document.getElementById('tpv-cart-list');
        const totalEl = document.getElementById('tpv-cart-total');
        const subtotalEl = document.getElementById('tpv-cart-subtotal');
        const subtotalLine = document.getElementById('tpv-subtotal-line');
        const discount = tpvDiscount();
        const subtotal = tpvSubtotal();
        const total = tpvTotal();
        if (!listEl) return;
        if (tpvCart.length === 0) {
            listEl.innerHTML = '<p class="tpv-cart-empty" id="tpv-cart-empty">Carrito vacío</p>';
            if (totalEl) totalEl.textContent = '0,00 €';
            if (subtotalEl) subtotalEl.textContent = '0,00 €';
            if (subtotalLine) subtotalLine.style.display = 'none';
            tpvUpdateChange();
            return;
        }
        listEl.innerHTML = tpvCart.map((i, idx) => {
            const subtotalLineItem = i.quantity * i.price;
            return `
                <div class="tpv-cart-item" data-idx="${idx}">
                    <span class="tpv-cart-item-desc">${escapeHtml(i.description)}</span>
                    <input type="number" class="tpv-cart-item-qty" value="${i.quantity}" min="0.01" step="0.01" data-idx="${idx}" aria-label="Cantidad">
                    <span class="tpv-cart-item-subtotal">${formatCurrency(subtotalLineItem)}</span>
                    <button type="button" class="tpv-cart-item-remove" data-idx="${idx}" title="Quitar línea" aria-label="Quitar"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
                </div>
            `;
        }).join('');
        listEl.querySelectorAll('.tpv-cart-item-qty').forEach(input => {
            input.addEventListener('change', function() {
                const idx = parseInt(this.dataset.idx, 10);
                const val = parseFloat(this.value);
                if (val > 0) tpvCart[idx].quantity = val;
                else tpvCart.splice(idx, 1);
                renderTpvCart();
            });
        });
        listEl.querySelectorAll('.tpv-cart-item-remove').forEach(btn => {
            btn.addEventListener('click', function() {
                const idx = parseInt(this.dataset.idx, 10);
                tpvCart.splice(idx, 1);
                renderTpvCart();
            });
        });
        if (totalEl) totalEl.textContent = formatCurrency(total);
        if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
        if (subtotalLine) subtotalLine.style.display = discount > 0 ? 'flex' : 'none';
        tpvUpdateChange();
        if (window.lucide) lucide.createIcons();
    }

    function tpvUpdatePaymentUI() {
        const method = document.getElementById('tpv-payment-method')?.value || 'cash';
        const cashBlock = document.getElementById('tpv-cash-block');
        const detailsBlock = document.getElementById('tpv-payment-details-block');
        const showDetails = ['transfer', 'other', 'bizum'].indexOf(method) !== -1;
        if (cashBlock) cashBlock.style.display = method === 'cash' ? '' : 'none';
        if (detailsBlock) {
            if (showDetails) {
                detailsBlock.classList.remove('hidden');
            } else {
                detailsBlock.classList.add('hidden');
            }
        }
        tpvUpdateChange();
    }
    function tpvUpdateChange() {
        const method = document.getElementById('tpv-payment-method')?.value || 'cash';
        const changeRow = document.getElementById('tpv-change-row');
        const changeVal = document.getElementById('tpv-change-value');
        if (method !== 'cash' || !changeRow || !changeVal) return;
        const received = parseFloat(document.getElementById('tpv-amount-received')?.value || 0) || 0;
        const total = tpvTotal();
        const change = received >= total ? received - total : 0;
        changeVal.textContent = change > 0 ? formatCurrency(change) : '—';
    }

    document.getElementById('tpv-btn-add-line')?.addEventListener('click', () => {
        const desc = document.getElementById('tpv-manual-desc');
        const qty = document.getElementById('tpv-manual-qty');
        const price = document.getElementById('tpv-manual-price');
        if (!desc || !desc.value.trim()) { showToast('Escribe una descripción', 'error'); return; }
        const quantity = parseFloat(qty?.value || 1) || 1;
        const p = parseFloat(price?.value || 0) || 0;
        tpvCart.push({ id: Date.now(), description: desc.value.trim(), quantity, price, tax: 21 });
        renderTpvCart();
        if (desc) desc.value = '';
        if (qty) qty.value = '1';
        if (price) price.value = '';
    });

    document.getElementById('tpv-btn-vaciar')?.addEventListener('click', () => {
        if (tpvCart.length === 0) return;
        if (confirm('¿Vaciar el carrito?')) {
            tpvCart = [];
            const discEl = document.getElementById('tpv-discount');
            if (discEl) discEl.value = '0';
            renderTpvCart();
            document.getElementById('tpv-success-panel')?.classList.add('hidden');
            showToast('Carrito vaciado', 'success');
        }
    });

    document.getElementById('tpv-quick-amounts')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.tpv-quick-btn');
        if (!btn) return;
        const amountInput = document.getElementById('tpv-amount-received');
        if (!amountInput) return;
        if (btn.id === 'tpv-quick-exact') {
            amountInput.value = tpvTotal().toFixed(2);
        } else {
            const amount = parseFloat(btn.dataset.amount || 0) || 0;
            const current = parseFloat(amountInput.value || 0) || 0;
            amountInput.value = (current + amount).toFixed(2);
        }
        tpvUpdateChange();
        amountInput.focus();
    });

    document.getElementById('tpv-btn-cobrar')?.addEventListener('click', async () => {
        if (tpvCart.length === 0) { showToast('Añade al menos una línea al carrito', 'error'); return; }
        const paymentSelect = document.getElementById('tpv-payment-method');
        const payment = (paymentSelect?.value || 'cash').toLowerCase();
        const clientName = (document.getElementById('tpv-client-name')?.value || '').trim() || null;
        const notes = (document.getElementById('tpv-notes')?.value || '').trim() || null;
        const discountAmount = tpvDiscount();
        if (payment === 'cash') {
            const received = parseFloat(document.getElementById('tpv-amount-received')?.value || 0) || 0;
            if (received < tpvTotal()) {
                showToast('Importe recibido insuficiente', 'error');
                return;
            }
        }
        try {
                const paymentDetails = (document.getElementById('tpv-payment-details')?.value || '').trim() || null;
                const body = JSON.stringify({
                items: tpvCart.map(i => ({ description: i.description, quantity: i.quantity, price: i.price, tax: i.tax || 21, catalog_item_id: i.catalog_item_id || null })),
                payment_method: payment,
                client_name: clientName,
                notes: notes,
                discount_amount: discountAmount,
                payment_details: paymentDetails
            });
            const res = await apiFetch('save_tpv_sale', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
            if (res && res.status === 'success') {
                tpvLastSaleId = res.id;
                tpvLastSaleNumber = res.sale_number || '';
                tpvCart = [];
                document.getElementById('tpv-discount').value = '0';
                document.getElementById('tpv-amount-received').value = '';
                const paymentDetailsEl = document.getElementById('tpv-payment-details');
                if (paymentDetailsEl) paymentDetailsEl.value = '';
                renderTpvCart();
                const successPanel = document.getElementById('tpv-success-panel');
                const successMsg = document.getElementById('tpv-success-msg');
                const successNumber = document.getElementById('tpv-success-number');
                if (successPanel) {
                    if (successMsg) successMsg.textContent = 'Venta registrada';
                    if (successNumber) successNumber.textContent = tpvLastSaleNumber;
                    successPanel.classList.remove('hidden');
                }
                showToast('Venta registrada: ' + tpvLastSaleNumber, 'success');
            }
        } catch (e) {
            showToast(e && e.message ? e.message : 'Error al registrar la venta', 'error');
        }
    });

    document.getElementById('tpv-btn-print-after')?.addEventListener('click', () => {
        if (tpvLastSaleId) printTicket(tpvLastSaleId);
    });
    document.getElementById('tpv-btn-new-sale')?.addEventListener('click', () => {
        document.getElementById('tpv-success-panel')?.classList.add('hidden');
        tpvLastSaleId = null;
        tpvLastSaleNumber = null;
    });

    document.addEventListener('keydown', function tpvKeyboard(e) {
        const section = document.getElementById('section-tpv');
        if (!section || section.classList.contains('hidden')) return;
        if (e.key === 'F2') {
            e.preventDefault();
            document.getElementById('tpv-btn-cobrar')?.click();
        }
        if (e.key === 'Escape') {
            const successPanel = document.getElementById('tpv-success-panel');
            if (successPanel && !successPanel.classList.contains('hidden')) {
                document.getElementById('tpv-btn-new-sale')?.click();
            } else if (tpvCart.length > 0) {
                document.getElementById('tpv-btn-vaciar')?.click();
            }
        }
    });

    function getCompanyForPreview() {
        const s = getCachedData('settings') || {};
        const name = s.name || 'Mi Empresa';
        const parts = [];
        if (s.address && s.address.trim()) parts.push(s.address.trim());
        if (s.cif && s.cif.trim()) parts.push('CIF: ' + s.cif.trim());
        const details = parts.length ? parts.join(' · ') : '—';
        return { name, details };
    }

    async function showTicketPreview(saleId) {
        const wrap = document.getElementById('ticket-preview-wrap');
        if (!wrap) return;
        try {
            const sale = await apiFetch('get_tpv_sale?id=' + saleId);
            if (!sale || sale.status === 'error') { showToast('Ticket no encontrado', 'error'); return; }
            const company = getCompanyForPreview();
            document.getElementById('ticket-preview-company-name').textContent = company.name;
            document.getElementById('ticket-preview-company-details').textContent = company.details;
            document.getElementById('ticket-preview-number').textContent = sale.sale_number || '—';
            document.getElementById('ticket-preview-date').textContent = sale.date ? new Date(sale.date).toLocaleString('es-ES') : '—';
            document.getElementById('ticket-preview-payment').textContent = (sale.payment_method || 'efectivo').replace(/_/g, ' ');
            const paymentDetailsWrap = document.getElementById('ticket-preview-payment-details-wrap');
            const paymentDetailsEl = document.getElementById('ticket-preview-payment-details');
            if (paymentDetailsWrap && paymentDetailsEl) {
                if (sale.payment_details && String(sale.payment_details).trim()) {
                    paymentDetailsEl.textContent = String(sale.payment_details).trim();
                    paymentDetailsWrap.style.display = '';
                    paymentDetailsWrap.classList.remove('hidden');
                } else {
                    paymentDetailsWrap.style.display = 'none';
                    paymentDetailsWrap.classList.add('hidden');
                }
            }
            const clientWrap = document.getElementById('ticket-preview-client-wrap');
            const clientNameEl = document.getElementById('ticket-preview-client-name');
            if (sale.client_name && sale.client_name.trim()) {
                clientWrap.style.display = '';
                clientNameEl.textContent = sale.client_name.trim();
            } else {
                clientWrap.style.display = 'none';
            }
            const tbody = document.getElementById('ticket-preview-items');
            tbody.innerHTML = (sale.items || []).map(i => {
                const total = (i.quantity || 0) * (i.price || 0);
                return `<tr><td>${escapeHtml(i.description || '')}</td><td>${i.quantity || 0}</td><td>${formatCurrency(i.price || 0)}</td><td>${formatCurrency(total)}</td></tr>`;
            }).join('');
            document.getElementById('ticket-preview-total').textContent = formatCurrency(sale.total != null ? sale.total : 0);
            wrap.classList.remove('hidden');
            wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            showToast(e && e.message ? e.message : 'Error al cargar ticket', 'error');
        }
    }

    function printPreviewCard(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        const css = `
            .preview-card{background:#fff;color:#1e293b;padding:3rem;border-radius:0.5rem;min-height:auto;box-shadow:0 25px 50px -12px rgba(0,0,0,0.15);}
            .preview-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;border-bottom:2px solid #f1f5f9;padding-bottom:1.5rem;}
            .company-info h1{font-size:1.5rem;margin-bottom:0.5rem;color:#0f172a;}
            .company-info p{color:#64748b;font-size:0.9rem;}
            .quote-meta{text-align:right;}
            .quote-meta h2{color:#0f172a;font-size:1.2rem;margin-bottom:0.5rem;}
            .quote-meta p{font-size:0.9rem;color:#64748b;}
            .preview-parties{margin-bottom:1.5rem;}
            .preview-client h4{color:#94a3b8;font-size:0.8rem;text-transform:uppercase;margin-bottom:0.25rem;}
            .preview-client p{font-size:1rem;line-height:1.5;}
            .preview-table{width:100%;border-collapse:collapse;margin-bottom:1.5rem;}
            .preview-table th,.preview-table td{padding:0.75rem;text-align:left;border-bottom:1px solid #eef2ff;}
            .preview-table th{background:#f8fafc;color:#64748b;font-size:0.8rem;}
            .preview-table td:nth-child(2),.preview-table td:nth-child(3),.preview-table td:nth-child(4){text-align:right;}
            .preview-summary{margin-left:auto;width:220px;}
            .summary-line{display:flex;justify-content:space-between;margin-bottom:0.5rem;}
            .summary-line.total{border-top:2px solid #f1f5f9;padding-top:0.75rem;font-weight:700;font-size:1.2rem;}
            .preview-footer{margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e2e8f0;font-size:0.9rem;color:#64748b;}
        `;
        const win = window.open('', '_blank');
        win.document.write(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><title>Imprimir</title><style>body{font-family:system-ui,sans-serif;padding:20px;margin:0;background:#f1f5f9;}${css}</style></head>
            <body>${card.outerHTML}
            <script>setTimeout(function(){window.print();window.close();}, 400);<\/script>
            </body></html>
        `);
        win.document.close();
    }

    document.getElementById('ticket-preview-print')?.addEventListener('click', () => printPreviewCard('ticket-preview-card'));

    function getDefaultDateRange() {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return {
            from: start.toISOString().slice(0, 10),
            to: end.toISOString().slice(0, 10)
        };
    }
    async function loadTickets() {
        const listEl = document.getElementById('tickets-list');
        const fromEl = document.getElementById('tickets-date-from');
        const toEl = document.getElementById('tickets-date-to');
        if (!listEl) return;
        if (!fromEl?.value && !toEl?.value) {
            const def = getDefaultDateRange();
            if (fromEl) fromEl.value = def.from;
            if (toEl) toEl.value = def.to;
        }
        const from = fromEl?.value || '';
        const to = toEl?.value || '';
        try {
            let q = 'limit=50&offset=0';
            if (from) q += '&date_from=' + encodeURIComponent(from);
            if (to) q += '&date_to=' + encodeURIComponent(to);
            const data = await apiFetch('get_tpv_sales?' + q);
            const items = (data && data.items) ? data.items : [];
            if (items.length === 0) {
                listEl.innerHTML = '<p class="history-list-empty">No hay tickets en este periodo. Crea ventas desde <strong>TPV</strong> o amplía el rango de fechas.</p>';
                document.getElementById('ticket-preview-wrap')?.classList.add('hidden');
            } else {
                document.getElementById('ticket-preview-wrap')?.classList.add('hidden');
                listEl.innerHTML = items.map(t => `
                    <div class="history-item" style="justify-content:space-between;flex-wrap:wrap;">
                        <div style="flex:1;"><strong>${escapeHtml(t.sale_number || '')}</strong><br><small>${t.date ? new Date(t.date).toLocaleString('es-ES') : ''} · ${formatCurrency(t.total || 0)} · ${(t.payment_method || 'efectivo').replace(/_/g, ' ')}</small></div>
                        <button type="button" class="btn btn-secondary btn-sm" data-id="${t.id}" title="Ver e imprimir"><i data-lucide="eye"></i> Ver</button>
                    </div>
                `).join('');
                listEl.querySelectorAll('button[data-id]').forEach(btn => {
                    btn.addEventListener('click', () => showTicketPreview(parseInt(btn.dataset.id, 10)));
                });
            }
        } catch (e) {
            listEl.innerHTML = '<p class="history-list-error">Error al cargar tickets. Comprueba la conexión.</p>';
        }
        if (window.lucide) lucide.createIcons();
    }
    document.getElementById('tickets-btn-reload')?.addEventListener('click', () => loadTickets());
    document.getElementById('tickets-date-from')?.addEventListener('change', () => loadTickets());
    document.getElementById('tickets-date-to')?.addEventListener('change', () => loadTickets());

    async function printTicket(saleId) {
        await showTicketPreview(saleId);
        setTimeout(() => printPreviewCard('ticket-preview-card'), 300);
    }

    async function showReceiptPreview(receiptId) {
        const wrap = document.getElementById('receipt-preview-wrap');
        if (!wrap) return;
        try {
            const r = await apiFetch('get_receipt?id=' + receiptId);
            if (!r || r.status === 'error') { showToast('Recibo no encontrado', 'error'); return; }
            const company = getCompanyForPreview();
            document.getElementById('receipt-preview-company-name').textContent = company.name;
            document.getElementById('receipt-preview-company-details').textContent = company.details;
            document.getElementById('receipt-preview-number').textContent = r.receipt_number || '—';
            document.getElementById('receipt-preview-date').textContent = r.date || '—';
            document.getElementById('receipt-preview-amount').textContent = formatCurrency(r.amount != null ? r.amount : 0);
            document.getElementById('receipt-preview-concept').textContent = r.concept || '—';
            document.getElementById('receipt-preview-client').textContent = r.client_name || '—';
            document.getElementById('receipt-preview-payment').textContent = (r.payment_method || 'efectivo').replace(/_/g, ' ');
            const paymentDetailsWrap = document.getElementById('receipt-preview-payment-details-wrap');
            const paymentDetailsEl = document.getElementById('receipt-preview-payment-details');
            if (paymentDetailsWrap && paymentDetailsEl) {
                if (r.payment_details && String(r.payment_details).trim()) {
                    paymentDetailsEl.textContent = String(r.payment_details).trim();
                    paymentDetailsWrap.classList.remove('hidden');
                } else {
                    paymentDetailsWrap.classList.add('hidden');
                }
            }
            const invWrap = document.getElementById('receipt-preview-invoice-wrap');
            const invEl = document.getElementById('receipt-preview-invoice');
            if (r.invoice_id && r.invoice_id.trim()) {
                invWrap.classList.remove('hidden');
                invEl.textContent = r.invoice_id.trim();
            } else {
                invWrap.classList.add('hidden');
            }
            wrap.classList.remove('hidden');
            wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            showToast(e && e.message ? e.message : 'Error al cargar recibo', 'error');
        }
    }

    document.getElementById('receipt-preview-print')?.addEventListener('click', () => printPreviewCard('receipt-preview-card'));

    async function loadReceipts() {
        const listEl = document.getElementById('receipts-list');
        const fromEl = document.getElementById('receipts-date-from');
        const toEl = document.getElementById('receipts-date-to');
        if (!listEl) return;
        if (!fromEl?.value && !toEl?.value) {
            const def = getDefaultDateRange();
            if (fromEl) fromEl.value = def.from;
            if (toEl) toEl.value = def.to;
        }
        const from = fromEl?.value || '';
        const to = toEl?.value || '';
        try {
            let q = 'limit=50&offset=0';
            if (from) q += '&date_from=' + encodeURIComponent(from);
            if (to) q += '&date_to=' + encodeURIComponent(to);
            const data = await apiFetch('get_receipts?' + q);
            const items = (data && data.items) ? data.items : [];
            if (items.length === 0) {
                listEl.innerHTML = '<p class="history-list-empty">No hay recibos en este periodo. Crea uno arriba o amplía el rango de fechas.</p>';
                document.getElementById('receipt-preview-wrap')?.classList.add('hidden');
            } else {
                document.getElementById('receipt-preview-wrap')?.classList.add('hidden');
                listEl.innerHTML = items.map(r => `
                    <div class="history-item" style="justify-content:space-between;flex-wrap:wrap;">
                        <div style="flex:1;"><strong>${escapeHtml(r.receipt_number || '')}</strong><br><small>${r.date || ''} · ${formatCurrency(r.amount || 0)} · ${escapeHtml((r.concept || '').slice(0, 30))}${(r.concept && r.concept.length > 30) ? '…' : ''} ${escapeHtml(r.client_name || '') ? '· ' + escapeHtml(r.client_name) : ''}</small></div>
                        <button type="button" class="btn btn-secondary btn-sm" data-id="${r.id}" title="Ver e imprimir"><i data-lucide="eye"></i> Ver</button>
                    </div>
                `).join('');
                listEl.querySelectorAll('button[data-id]').forEach(btn => {
                    btn.addEventListener('click', () => showReceiptPreview(parseInt(btn.dataset.id, 10)));
                });
            }
        } catch (e) {
            listEl.innerHTML = '<p class="history-list-error">Error al cargar recibos. Comprueba la conexión.</p>';
        }
        if (window.lucide) lucide.createIcons();
    }
    document.getElementById('receipts-btn-reload')?.addEventListener('click', () => loadReceipts());
    document.getElementById('receipts-date-from')?.addEventListener('change', () => loadReceipts());
    document.getElementById('receipts-date-to')?.addEventListener('change', () => loadReceipts());

    const receiptDateEl = document.getElementById('receipt-date');
    if (receiptDateEl) receiptDateEl.value = new Date().toISOString().slice(0, 10);
    function receiptUpdatePaymentUI() {
        const method = document.getElementById('receipt-payment-method')?.value || 'cash';
        const block = document.getElementById('receipt-payment-details-block');
        if (block) block.classList.toggle('hidden', ['transfer', 'other', 'bizum'].indexOf(method) === -1);
    }
    document.getElementById('receipt-payment-method')?.addEventListener('change', receiptUpdatePaymentUI);
    receiptUpdatePaymentUI();
    document.getElementById('receipt-btn-save')?.addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('receipt-amount')?.value || 0);
        if (amount <= 0) { showToast('Indica un importe mayor que 0', 'error'); return; }
        const fd = new FormData();
        fd.append('date', document.getElementById('receipt-date')?.value || new Date().toISOString().slice(0, 10));
        fd.append('amount', amount);
        fd.append('concept', document.getElementById('receipt-concept')?.value?.trim() || 'Recibo');
        fd.append('client_name', document.getElementById('receipt-client-name')?.value?.trim() || '');
        fd.append('payment_method', document.getElementById('receipt-payment-method')?.value || 'cash');
        fd.append('payment_details', document.getElementById('receipt-payment-details')?.value?.trim() || '');
        fd.append('invoice_id', document.getElementById('receipt-invoice-id')?.value?.trim() || '');
        fd.append('notes', document.getElementById('receipt-notes')?.value?.trim() || '');
        try {
            const res = await apiFetch('save_receipt', { method: 'POST', body: fd });
            if (res && res.status === 'success') {
                showToast('Recibo ' + (res.receipt_number || '') + ' guardado', 'success');
                document.getElementById('receipt-amount').value = '';
                document.getElementById('receipt-concept').value = '';
                document.getElementById('receipt-client-name').value = '';
                document.getElementById('receipt-invoice-id').value = '';
                document.getElementById('receipt-notes').value = '';
                const receiptPaymentDetailsEl = document.getElementById('receipt-payment-details');
                if (receiptPaymentDetailsEl) receiptPaymentDetailsEl.value = '';
                await loadReceipts();
                if (res.id) await showReceiptPreview(res.id);
            } else {
                showToast(res?.message || 'Error al guardar', 'error');
            }
        } catch (e) {
            showToast(e && e.message ? e.message : 'Error al guardar recibo', 'error');
        }
    });

    async function printReceipt(receiptId) {
        await showReceiptPreview(receiptId);
    }

    async function loadDashboard() {
        const $ = (id) => document.getElementById(id);
        const statsSection = document.getElementById('dashboard-stats-section');
        const isAdmin = currentUser && currentUser.role === 'admin';
        if (statsSection) statsSection.style.display = isAdmin ? '' : 'none';

        const statEls = { income: $('stat-income'), pending: $('stat-pending'), expenses: $('stat-expenses'), balance: $('stat-balance'), quotes: $('stat-quotes-count'), invoices: $('stat-invoices-count') };
        const setStats = (stats) => {
            const bal = (stats.income ?? 0) - (stats.expenses ?? 0);
            if (statEls.income) statEls.income.textContent = formatCurrency(stats.income ?? 0);
            if (statEls.pending) statEls.pending.textContent = formatCurrency(stats.pending ?? 0);
            if (statEls.expenses) statEls.expenses.textContent = formatCurrency(stats.expenses ?? 0);
            if (statEls.balance) {
                statEls.balance.textContent = formatCurrency(bal);
                statEls.balance.style.color = bal >= 0 ? 'var(--accent)' : 'var(--danger)';
            }
            if (statEls.quotes && typeof stats.quotes_count !== 'undefined') statEls.quotes.textContent = stats.quotes_count;
            if (statEls.invoices && typeof stats.invoices_count !== 'undefined') statEls.invoices.textContent = stats.invoices_count;
        };
        if (isAdmin) {
            try {
                const stats = await apiFetch('get_dashboard_stats');
                setStats(stats);
            } catch (e) {
                console.error('Error cargando estadísticas dashboard:', e);
                setStats({ income: 0, pending: 0, expenses: 0 });
                if (statEls.balance) statEls.balance.style.color = 'var(--text-muted)';
            }
        }

        const monthQuotesEl = document.getElementById('month-stat-quotes');
        const monthInvoicesEl = document.getElementById('month-stat-invoices');
        const monthInvoicedEl = document.getElementById('month-stat-invoiced');
        if (monthQuotesEl || monthInvoicesEl || monthInvoicedEl) {
            try {
                const monthSummary = await apiFetch('get_month_summary');
                if (monthQuotesEl) monthQuotesEl.textContent = monthSummary.quotes_count ?? 0;
                if (monthInvoicesEl) monthInvoicesEl.textContent = monthSummary.invoices_count ?? 0;
                if (monthInvoicedEl) monthInvoicedEl.textContent = formatCurrency(monthSummary.total_invoiced ?? 0);
                const prevBlock = document.getElementById('dashboard-month-summary-prev');
                const prevQuotes = document.getElementById('month-stat-quotes-prev');
                const prevInvoices = document.getElementById('month-stat-invoices-prev');
                const prevInvoiced = document.getElementById('month-stat-invoiced-prev');
                if (prevBlock && (prevQuotes || prevInvoices || prevInvoiced)) {
                    prevBlock.style.display = 'block';
                    if (prevQuotes) prevQuotes.textContent = monthSummary.quotes_count_prev ?? 0;
                    if (prevInvoices) prevInvoices.textContent = monthSummary.invoices_count_prev ?? 0;
                    if (prevInvoiced) prevInvoiced.textContent = formatCurrency(monthSummary.total_invoiced_prev ?? 0);
                }
            } catch (e) {
                if (monthQuotesEl) monthQuotesEl.textContent = '0';
                if (monthInvoicesEl) monthInvoicesEl.textContent = '0';
                if (monthInvoicedEl) monthInvoicedEl.textContent = '0,00 €';
                const prevBlock = document.getElementById('dashboard-month-summary-prev');
                if (prevBlock) prevBlock.style.display = 'none';
            }
        }

        // Mis tareas asignadas (todos los usuarios)
        const dashboardMyTasksList = document.getElementById('dashboard-my-tasks-list');
        if (dashboardMyTasksList) {
            try {
                const myTasks = await apiFetch('get_my_tasks');
                const arr = Array.isArray(myTasks) ? myTasks : [];
                if (arr.length === 0) {
                    dashboardMyTasksList.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">No tienes tareas asignadas.</div></div>';
                } else {
                    dashboardMyTasksList.innerHTML = arr.map(t => {
                        const projName = (t.project_name || 'Proyecto').replace(/</g, '&lt;');
                        const title = (t.title || '').replace(/</g, '&lt;');
                        const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('es-ES') : '';
                        const done = t.completed === 1 || t.completed === '1';
                        const assignedBy = (t.assigned_by_username || '').trim() ? ' · ' + (t.assigned_by_username || '').replace(/</g, '&lt;') : '';
                        return `
                            <div class="history-item" style="cursor:pointer;" onclick="document.getElementById('nav-projects').click(); setTimeout(() => openProjectDetail(${t.project_id}), 300)">
                                <div style="flex:1">
                                    <strong>${title}</strong><br>
                                    <small>${projName}${dueStr ? ' · ' + dueStr : ''}${assignedBy}</small>
                                    ${done ? '<br><span style="color:var(--accent);font-size:0.8rem;">Completada</span>' : ''}
                                </div>
                                <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-muted);"></i>
                            </div>
                        `;
                    }).join('');
                    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                }
            } catch (e) {
                dashboardMyTasksList.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);">No se pudieron cargar tus tareas.</div></div>';
            }
        }
        const btnDashboardGoProjects = document.getElementById('btn-dashboard-go-projects');
        if (btnDashboardGoProjects) btnDashboardGoProjects.onclick = () => navProjects.click();
        const btnDashboardGoActivities = document.getElementById('btn-dashboard-go-activities');
        if (btnDashboardGoActivities) btnDashboardGoActivities.onclick = () => { navActivities.click(); };

        // Facturas pendientes de cobro (+30 días)
        const overdueCard = document.getElementById('dashboard-overdue-card');
        const overdueList = document.getElementById('dashboard-overdue-list');
        const btnOverdueGo = document.getElementById('btn-dashboard-go-invoices-overdue');
        if (overdueList) {
            try {
                const overdueDaysCfg = (getCachedData('settings') || {}).overdue_invoice_days || 30;
                const overdueCardTitle = overdueCard?.querySelector('h3');
                const overdueCardDesc = overdueCard?.querySelector('p');
                if (overdueCardTitle) overdueCardTitle.innerHTML = '<i data-lucide="alert-circle"></i> Facturas pendientes de cobro (+' + overdueDaysCfg + ' días)';
                if (overdueCardDesc) overdueCardDesc.textContent = 'Facturas no cobradas con más de ' + overdueDaysCfg + ' días de antigüedad.';
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                const overdue = await apiFetch('get_overdue_invoices');
                const arr = Array.isArray(overdue) ? overdue : [];
                if (arr.length === 0) {
                    if (overdueCard) overdueCard.style.display = 'none';
                } else {
                    if (overdueCard) overdueCard.style.display = '';
                    overdueList.innerHTML = arr.map(inv => {
                        const dateStr = inv.date ? new Date(inv.date).toLocaleDateString('es-ES') : '';
                        const safeId = String(inv.id || '').replace(/'/g, "\\'");
                        return `<div class="history-item" style="cursor:pointer;" onclick="loadInvoice('${safeId}')">
                            <div style="flex:1"><strong>${(inv.client_name || 'Sin nombre').replace(/</g,'&lt;')}</strong><br><small>${(inv.id||'').replace(/</g,'&lt;')} · ${dateStr}</small></div>
                            <strong>${formatCurrency(inv.total_amount||0)}</strong>
                        </div>`;
                    }).join('');
                }
                if (btnOverdueGo) btnOverdueGo.onclick = () => navInvoices.click();
            } catch (e) { if (overdueCard) overdueCard.style.display = 'none'; }
        }

        // Gráfico ingresos por mes
        const chartCard = document.getElementById('dashboard-chart-card');
        const chartContainer = document.getElementById('dashboard-chart-container');
        if (chartContainer) {
            try {
                const monthly = await apiFetch('get_monthly_revenue?months=6');
                const data = Array.isArray(monthly) ? monthly : [];
                const maxVal = data.length ? Math.max(...data.map(d => d.total), 1) : 1;
                const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                if (data.length === 0) {
                    chartContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;">Sin datos de ingresos aún.</p>';
                } else {
                    chartContainer.innerHTML = `
                        <div style="display:flex;align-items:flex-end;gap:0.5rem;height:160px;padding:0.5rem 0;">
                            ${data.map(d => {
                                const pct = (d.total / maxVal) * 100;
                                const parts = d.month.split('-');
                                const label = parts.length === 2 ? monthNames[parseInt(parts[1],10)-1] + ' ' + parts[0].slice(2) : d.month;
                                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0.25rem;">
                                    <div style="width:100%;max-width:40px;height:${Math.max(pct, 4)}%;min-height:4px;background:var(--primary);border-radius:6px 6px 0 0;" title="${formatCurrency(d.total)}"></div>
                                    <span style="font-size:0.7rem;color:var(--text-muted);">${label}</span>
                                </div>`;
                            }).join('')}
                        </div>
                    `;
                }
            } catch (e) {
                if (chartContainer) chartContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No se pudo cargar el gráfico.</p>';
            }
        }

        // Gastos por categoría (admin: todos; user: propios)
        const expensesCategoryCard = document.getElementById('dashboard-expenses-category-card');
        const expensesCategoryList = document.getElementById('dashboard-expenses-category-list');
        if (expensesCategoryList) {
            try {
                const expensesRes = await apiFetch('get_expenses');
                const expenses = Array.isArray(expensesRes) ? expensesRes : (expensesRes && expensesRes.items) ? expensesRes.items : [];
                const byCat = {};
                expenses.forEach(e => {
                    const cat = (e.category || 'Sin categoría').trim() || 'Sin categoría';
                    byCat[cat] = (byCat[cat] || 0) + (parseFloat(e.amount) || 0);
                });
                const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
                if (entries.length === 0) {
                    if (expensesCategoryCard) expensesCategoryCard.style.display = 'none';
                } else {
                    if (expensesCategoryCard) expensesCategoryCard.style.display = '';
                    const totalAll = entries.reduce((s, [, v]) => s + v, 0);
                    expensesCategoryList.innerHTML = entries.map(([cat, total]) => {
                        const pct = totalAll > 0 ? Math.round((total / totalAll) * 100) : 0;
                        return `<div class="history-item" style="align-items:center;">
                            <div style="flex:1;"><strong>${(cat || '').replace(/</g, '&lt;')}</strong></div>
                            <div style="width:80px;height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:var(--primary);"></div></div>
                            <span style="min-width:80px;text-align:right;">${formatCurrency(total)}</span>
                        </div>`;
                    }).join('');
                }
            } catch (e) {
                if (expensesCategoryCard) expensesCategoryCard.style.display = 'none';
            }
        }

        if (isAdmin) {
            // Solicitudes de eliminación (solo admin)
            const deletionListEl = document.getElementById('dashboard-deletion-requests-list');
            const deletionCardEl = document.getElementById('dashboard-deletion-requests-card');
            if (deletionListEl) {
                try {
                    const requests = await apiFetch('get_deletion_requests');
                    if (requests && requests.length > 0) {
                        deletionCardEl.style.display = '';
                        deletionListEl.innerHTML = requests.map(r => {
                            const tipo = r.table_name === 'quotes' ? 'Presupuesto' : 'Factura';
                            const fecha = r.requested_at ? new Date(r.requested_at).toLocaleString('es-ES') : '';
                            const user = (r.requested_by_username || 'Usuario').replace(/</g, '&lt;');
                            return `
                                <div class="history-item" data-request-id="${r.id}">
                                    <div style="flex:1">
                                        <strong>${tipo}</strong> ${(r.record_id || '').replace(/</g, '&lt;')}<br>
                                        <small>Solicitado por ${user} · ${fecha}</small>
                                    </div>
                                    <div style="display:flex;gap:0.5rem;">
                                        <button type="button" class="btn btn-accent btn-sm" onclick="processDeletionRequest(${r.id}, 'approve')" title="Eliminar">Eliminar</button>
                                        <button type="button" class="btn btn-remove btn-sm" onclick="processDeletionRequest(${r.id}, 'reject')" title="Rechazar">Rechazar</button>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    } else {
                        if (deletionCardEl) deletionCardEl.style.display = '';
                        deletionListEl.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">No hay solicitudes de eliminación pendientes.</div></div>';
                    }
                    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                } catch (e) {
                    if (deletionCardEl) deletionCardEl.style.display = 'none';
                }
            }
        } else {
            const deletionCardEl = document.getElementById('dashboard-deletion-requests-card');
            if (deletionCardEl) deletionCardEl.style.display = 'none';
        }

        // 2. Actividad reciente (siempre cargar al entrar)
        const recentContainer = document.getElementById('dashboard-recent-list');
        if (recentContainer) {
            try {
                let historyData = getCachedData('history');
                let history = Array.isArray(historyData) ? historyData : (historyData && historyData.items) ? historyData.items : [];
                if (history.length === 0) {
                    historyData = await apiFetch('get_history?limit=20&offset=0');
                    history = (historyData && historyData.items) ? historyData.items : [];
                    if (historyData) setCachedData('history', historyData);
                }
                if (!history || history.length === 0) {
                    recentContainer.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">Todavía no hay presupuestos guardados.</div></div>';
                } else {
                    const top = history.slice(0, 5);
                    recentContainer.innerHTML = top.map(q => {
                        const safeId = String(q.id || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const client = (q.client_name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const total = formatCurrency(q.total_amount || 0);
                        const dateStr = q.date ? new Date(q.date).toLocaleDateString('es-ES') : '';
                        const userBadge = (q.username && currentUser && currentUser.role === 'admin')
                            ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${q.username}</span>`
                            : '';
                        return `
                            <div class="history-item" style="cursor:pointer;" onclick="loadQuote('${safeId}')">
                                <div style="flex:1">
                                    <strong>${client}</strong>${userBadge}<br>
                                    <small>${safeId} • ${total}${dateStr ? ' • ' + dateStr : ''}</small>
                                </div>
                                <button class="btn btn-secondary btn-sm" type="button">Editar</button>
                            </div>
                        `;
                    }).join('');
                }
            } catch (e) {
                console.error('Error cargando actividad reciente:', e);
                recentContainer.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">No se pudo cargar la actividad reciente.</div></div>';
            }
        }

        // 3. Top clientes recientes (siempre cargar al entrar)
        const topClientsContainer = document.getElementById('dashboard-top-clients');
        if (topClientsContainer) {
            try {
                let invoicesData = getCachedData('invoices');
                let invoices = Array.isArray(invoicesData) ? invoicesData : (invoicesData && invoicesData.items) ? invoicesData.items : [];
                if (invoices.length === 0) {
                    invoicesData = await apiFetch('get_invoices?limit=20&offset=0');
                    invoices = (invoicesData && invoicesData.items) ? invoicesData.items : [];
                    if (invoicesData) setCachedData('invoices', invoicesData);
                }
                if (!invoices || invoices.length === 0) {
                    topClientsContainer.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">Todavía no hay facturas registradas.</div></div>';
                } else {
                    const totalsByClient = {};
                    invoices.forEach(inv => {
                        if (inv.status && inv.status.toLowerCase() === 'cancelled') return;
                        const name = inv.client_name || 'Sin nombre';
                        const key = name.toLowerCase();
                        totalsByClient[key] = (totalsByClient[key] || { name, total: 0 });
                        totalsByClient[key].total += Number(inv.total_amount || 0);
                    });
                    const top = Object.values(totalsByClient)
                        .sort((a, b) => b.total - a.total)
                        .slice(0, 5);
                    if (top.length === 0) {
                        topClientsContainer.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">Sin datos suficientes todavía.</div></div>';
                    } else {
                        topClientsContainer.innerHTML = top.map((c, idx) => `
                            <div class="history-item">
                                <div style="flex:1">
                                    <strong>${idx + 1}. ${c.name}</strong><br>
                                    <small>Total facturado: ${formatCurrency(c.total)}</small>
                                </div>
                            </div>
                        `).join('');
                    }
                }
            } catch (e) {
                console.error('Error cargando top clientes:', e);
                topClientsContainer.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--danger);text-align:center;">No se pudo cargar el top de clientes.</div></div>';
            }
        }

        // 4. Top servicios recientes (siempre cargar al entrar)
        const topServicesContainer = document.getElementById('dashboard-top-services');
        if (topServicesContainer) {
            try {
                const services = await apiFetch('get_top_services');
                if (!services || !Array.isArray(services) || services.length === 0) {
                    topServicesContainer.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">Todavía no hay servicios con datos suficientes.</div></div>';
                } else {
                    topServicesContainer.innerHTML = services.map((s, idx) => `
                        <div class="history-item">
                            <div style="flex:1">
                                <strong>${idx + 1}. ${(s.description || 'Sin descripción').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong><br>
                                <small>Importe total estimado: ${formatCurrency(s.total || 0)}</small>
                            </div>
                        </div>
                    `).join('');
                }
            } catch (e) {
                console.error('Error cargando top servicios:', e);
                topServicesContainer.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--danger);text-align:center;">No se pudo cargar el top de servicios.</div></div>';
            }
        }

        // 5. Próximas facturas recurrentes
        const recurringCard = document.getElementById('dashboard-recurring-card');
        const recurringList = document.getElementById('dashboard-recurring-list');
        const btnDashboardGoInvoices = document.getElementById('btn-dashboard-go-invoices');
        if (recurringCard && recurringList) {
            try {
                let invData = getCachedData('invoices');
                if (!invData || !invData.items) {
                    invData = await apiFetch('get_invoices?limit=200&offset=0');
                    if (invData) setCachedData('invoices', invData);
                }
                const allInvoices = (invData && invData.items) ? invData.items : [];
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const in30 = new Date(today);
                in30.setDate(in30.getDate() + 30);
                const upcoming = allInvoices.filter(i => {
                    if (!(i.is_recurring === 1 || i.is_recurring === '1' || i.is_recurring === true)) return false;
                    const nd = i.next_date ? new Date(i.next_date) : null;
                    if (!nd) return false;
                    nd.setHours(0, 0, 0, 0);
                    return nd >= today && nd <= in30;
                }).sort((a, b) => new Date(a.next_date) - new Date(b.next_date)).slice(0, 8);
                if (upcoming.length === 0) {
                    recurringList.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;font-size:0.9rem;">No hay facturas recurrentes con próxima emisión en los próximos 30 días.</div></div>';
                } else {
                    recurringList.innerHTML = upcoming.map(i => {
                        const client = (i.client_name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const nextStr = i.next_date ? new Date(i.next_date).toLocaleDateString('es-ES') : '';
                        const safeId = String(i.id).replace(/'/g, "\\'");
                        return `<div class="history-item" style="cursor:pointer;" onclick="loadInvoice('${safeId}')">
                            <div style="flex:1"><strong>${client}</strong><br><small>Próx. ${nextStr} · ${formatCurrency(i.total_amount || 0)}</small></div>
                            <button class="btn btn-secondary btn-sm" type="button">Editar</button>
                        </div>`;
                    }).join('');
                }
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } catch (e) {
                recurringList.innerHTML = '<div class="history-item"><div style="flex:1;color:var(--text-muted);text-align:center;">No se pudo cargar.</div></div>';
            }
        }
        if (btnDashboardGoInvoices) {
            btnDashboardGoInvoices.onclick = () => navInvoices.click();
        }
    }

    function updateDocumentLogoPreview(urlOrData) {
        const wrap = document.getElementById('settings-document-logo-preview');
        const img = document.getElementById('settings-document-logo-img');
        if (!wrap || !img) return;
        const u = (urlOrData || '').trim();
        if (!u) {
            wrap.style.display = 'none';
            img.src = '';
            return;
        }
        img.onerror = () => { wrap.style.display = 'none'; };
        img.onload = () => { wrap.style.display = 'block'; };
        img.src = u;
    }

    document.getElementById('settings-document-logo-url')?.addEventListener('input', function () {
        const fileInput = document.getElementById('settings-document-logo-file');
        if (fileInput) fileInput.value = '';
        updateDocumentLogoPreview(this.value);
    });

    document.getElementById('settings-document-logo-file')?.addEventListener('change', function () {
        const file = this.files && this.files[0];
        const urlInput = document.getElementById('settings-document-logo-url');
        if (urlInput && urlInput.value) urlInput.value = '';
        if (!file) {
            updateDocumentLogoPreview('');
            try {
                const s = getCachedData('settings') || {};
                delete s.document_logo_data_url;
                setCachedData('settings', s);
            } catch (e) {}
            return;
        }
        if (!file.type.startsWith('image/')) {
            showToast('El archivo debe ser una imagen (PNG, JPG, SVG).', 'error');
            this.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            const dataUrl = e.target && e.target.result ? String(e.target.result) : '';
            updateDocumentLogoPreview(dataUrl);
            try {
                const s = getCachedData('settings') || {};
                s.document_logo_data_url = dataUrl;
                setCachedData('settings', s);
            } catch (err) {}
        };
        reader.readAsDataURL(file);
    });

    async function loadSettings() {
        try {
            let settings = getCachedData('settings');
            if (!settings) {
                settings = await apiFetch('get_settings');
                if (settings && !settings.status) setCachedData('settings', settings);
            }
            if (settings && settings.name !== undefined) {
                document.getElementById('settings-company-name').value = settings.name || '';
                document.getElementById('settings-company-cif').value = settings.cif || '';
                document.getElementById('settings-company-email').value = settings.email || 'belchote2025@gmail.com';
                document.getElementById('settings-company-address').value = settings.address || '';
                document.getElementById('settings-default-tax').value = settings.default_tax ?? 21;
                const vendomiaInput = document.getElementById('settings-vendomia-api-key');
                if (vendomiaInput) vendomiaInput.value = settings.vendomia_api_key || '';
                const senderNameEl = document.getElementById('settings-sender-name');
                if (senderNameEl) senderNameEl.value = settings.sender_name || '';
                const docLangEl = document.getElementById('settings-document-language');
                if (docLangEl) docLangEl.value = (settings.document_language === 'en' ? 'en' : 'es');
                const paymentEnabledEl = document.getElementById('settings-payment-enabled');
                if (paymentEnabledEl) paymentEnabledEl.checked = !!(settings.payment_enabled * 1);
                const paymentUrlEl = document.getElementById('settings-payment-link-url');
                if (paymentUrlEl) paymentUrlEl.value = settings.payment_link_url || '';
                const paymentMethodsStr = (settings.payment_methods || '').toString().trim();
                const paymentMethodsList = paymentMethodsStr ? paymentMethodsStr.split(/\s*,\s*/) : [];
                ['transferencia', 'efectivo', 'online', 'bizum', 'cheque'].forEach(m => {
                    const el = document.getElementById('settings-payment-method-' + m);
                    if (el) el.checked = paymentMethodsList.indexOf(m) !== -1;
                });
                const paymentTransferEl = document.getElementById('settings-payment-transfer-details');
                if (paymentTransferEl) paymentTransferEl.value = settings.payment_transfer_details || '';
                const backupEmailEl = document.getElementById('settings-backup-email');
                if (backupEmailEl) backupEmailEl.value = settings.backup_email || '';
                const documentFooterEl = document.getElementById('settings-document-footer');
                if (documentFooterEl) documentFooterEl.value = settings.document_footer || '';
                const rebuFooterEl = document.getElementById('settings-rebu-footer');
                if (rebuFooterEl) rebuFooterEl.value = settings.rebu_footer_text || '';
                const docEmailSubjEl = document.getElementById('settings-document-email-subject');
                if (docEmailSubjEl) docEmailSubjEl.value = settings.document_email_subject || '';
                const docEmailBodyEl = document.getElementById('settings-document-email-body');
                if (docEmailBodyEl) docEmailBodyEl.value = settings.document_email_body || '';
                const documentLogoUrlEl = document.getElementById('settings-document-logo-url');
                if (documentLogoUrlEl) {
                    documentLogoUrlEl.value = settings.document_logo_url || '';
                }
                const docLogoData = settings.document_logo_data_url || (getCachedData('settings') || {}).document_logo_data_url || '';
                if (docLogoData) {
                    updateDocumentLogoPreview(docLogoData);
                } else if (documentLogoUrlEl && documentLogoUrlEl.value) {
                    updateDocumentLogoPreview(documentLogoUrlEl.value);
                } else {
                    updateDocumentLogoPreview('');
                }

                const invoicePrefixEl = document.getElementById('settings-invoice-prefix');
                if (invoicePrefixEl) invoicePrefixEl.value = settings.invoice_prefix || '';
                const invoiceNextEl = document.getElementById('settings-invoice-next-number');
                if (invoiceNextEl) invoiceNextEl.value = (settings.invoice_next_number != null && settings.invoice_next_number !== '') ? settings.invoice_next_number : '';

                // Plantillas de documento
                if (settingsDefaultTemplateSelect) {
                    settingsDefaultTemplateSelect.value = settings.default_template || 'classic';
                }
                if (settingsTemplateScopeSelect) {
                    settingsTemplateScopeSelect.value = settings.template_scope || 'both';
                }
                const alertsEnabledEl = document.getElementById('settings-alerts-enabled');
                if (alertsEnabledEl) alertsEnabledEl.checked = (settings.alerts_enabled !== 0 && settings.alerts_enabled !== '0');
                const remindersEl = document.getElementById('settings-appointment-reminders-enabled');
                if (remindersEl) remindersEl.checked = (settings.appointment_reminders_enabled !== 0 && settings.appointment_reminders_enabled !== '0');
                const overdueDaysEl = document.getElementById('settings-overdue-invoice-days');
                if (overdueDaysEl) overdueDaysEl.value = Math.max(1, Math.min(365, parseInt(settings.overdue_invoice_days, 10) || 30));
                const emailProviderEl = document.getElementById('settings-email-provider');
                const emailApiKeyEl = document.getElementById('settings-email-api-key');
                const emailMailgunDomainEl = document.getElementById('settings-email-mailgun-domain');
                if (emailProviderEl) emailProviderEl.value = (settings.email_provider || 'smtp').toLowerCase();
                if (emailApiKeyEl) emailApiKeyEl.value = settings.email_api_key || '';
                if (emailMailgunDomainEl) emailMailgunDomainEl.value = settings.email_mailgun_domain || '';
                updateEmailMethodVisibility();
                const smtpEnabledEl = document.getElementById('settings-smtp-enabled');
                if (smtpEnabledEl) smtpEnabledEl.checked = !!(settings.smtp_enabled * 1);
                const smtpHostEl = document.getElementById('settings-smtp-host');
                if (smtpHostEl) smtpHostEl.value = settings.smtp_host || '';
                const smtpPortEl = document.getElementById('settings-smtp-port');
                if (smtpPortEl) smtpPortEl.value = (settings.smtp_port != null && settings.smtp_port !== '') ? settings.smtp_port : '587';
                const smtpUserEl = document.getElementById('settings-smtp-user');
                if (smtpUserEl) smtpUserEl.value = settings.smtp_user || '';
                const smtpSecureEl = document.getElementById('settings-smtp-secure');
                if (smtpSecureEl) smtpSecureEl.value = (settings.smtp_secure || 'tls');
                const smtpProviderEl = document.getElementById('settings-smtp-provider');
                if (smtpProviderEl) {
                    const h = (settings.smtp_host || '').toLowerCase();
                    smtpProviderEl.value = h.includes('hostinger') ? 'hostinger' : (h.includes('gmail') ? 'gmail' : '');
                }
                const smtpGmailHint = document.getElementById('settings-smtp-gmail-hint');
                if (smtpGmailHint) smtpGmailHint.classList.toggle('hidden', (settings.smtp_host || '').toLowerCase().indexOf('gmail') === -1);

                const certStatusEl = document.getElementById('settings-cert-status');
                if (certStatusEl) {
                    const path = (settings.cert_file_path || '').toString().trim();
                    const type = (settings.cert_file_type || '').toString().trim();
                    const hasPwd = (settings.cert_has_password === 1 || settings.cert_has_password === '1');
                    if (path) {
                        certStatusEl.textContent = 'Certificado guardado (' + (type || 'formato desconocido') + ')' + (hasPwd ? ' · requiere contraseña' : '');
                    } else {
                        certStatusEl.textContent = 'No hay certificado guardado.';
                    }
                }

                // PWA / Chatbot
                const pwaInstallEnabledEl = document.getElementById('settings-pwa-install-enabled');
                if (pwaInstallEnabledEl) {
                    const val = settings.pwa_install_enabled;
                    pwaInstallEnabledEl.checked = !(val === 0 || val === '0');
                }
                const chatbotEnabledEl = document.getElementById('settings-chatbot-enabled');
                if (chatbotEnabledEl) {
                    const val = settings.chatbot_enabled;
                    chatbotEnabledEl.checked = !(val === 0 || val === '0');
                }
                const backupSchedEl = document.getElementById('settings-backup-schedule');
                if (backupSchedEl) backupSchedEl.value = settings.backup_schedule || 'off';
                const backupDayEl = document.getElementById('settings-backup-schedule-day');
                if (backupDayEl) backupDayEl.value = String(settings.backup_schedule_day ?? 0);
                const backupMonthDayEl = document.getElementById('settings-backup-schedule-monthday');
                if (backupMonthDayEl) backupMonthDayEl.value = String(settings.backup_schedule_monthday ?? 1);
                const backupHourEl = document.getElementById('settings-backup-schedule-hour');
                if (backupHourEl) backupHourEl.value = String(settings.backup_schedule_hour ?? 8);
                const backupDestEmailEl = document.getElementById('settings-backup-dest-email');
                if (backupDestEmailEl) backupDestEmailEl.checked = (settings.backup_dest_email !== 0 && settings.backup_dest_email !== '0');
                const backupDestWebhookEl = document.getElementById('settings-backup-dest-webhook');
                if (backupDestWebhookEl) backupDestWebhookEl.checked = !!(settings.backup_dest_webhook * 1);
                const backupWebhookUrlEl = document.getElementById('settings-backup-webhook-url');
                if (backupWebhookUrlEl) backupWebhookUrlEl.value = settings.backup_webhook_url || '';
                updateBackupScheduleVisibility();
            }
            try {
                const companies = await apiFetch('get_companies');
                const card = document.getElementById('settings-multi-company-card');
                if (card && companies && companies.length > 0) card.classList.remove('hidden');
            } catch (e) { }

            // Activar primera pestaña por defecto
            if (settingsTabs && settingsTabs.length > 0 && settingsTabPanels && settingsTabPanels.length > 0) {
                const firstTab = settingsTabs[0];
                const firstPanel = document.querySelector(`.settings-tab-panel[data-settings-panel="${firstTab.dataset.settingsTab}"]`);
                settingsTabs.forEach(t => t.classList.remove('active'));
                settingsTabPanels.forEach(p => p.classList.add('hidden'));
                if (firstTab) firstTab.classList.add('active');
                if (firstPanel) firstPanel.classList.remove('hidden');
            }
        } catch (e) { console.error("Error cargando configuración:", e); }
    }

    document.getElementById('btn-create-company')?.addEventListener('click', async () => {
        const nameEl = document.getElementById('new-company-name');
        const name = nameEl && nameEl.value ? nameEl.value.trim() : '';
        if (!name) { showToast('Indica el nombre de la empresa', 'error'); return; }
        const fd = new FormData();
        fd.append('name', name);
        fd.append('cif', (document.getElementById('new-company-cif') && document.getElementById('new-company-cif').value) || '');
        fd.append('email', (document.getElementById('new-company-email') && document.getElementById('new-company-email').value) || '');
        fd.append('address', (document.getElementById('new-company-address') && document.getElementById('new-company-address').value) || '');
        fd.append('default_tax', (document.getElementById('new-company-default-tax') && document.getElementById('new-company-default-tax').value) || '21');
        try {
            const res = await apiFetch('create_company', { method: 'POST', body: fd });
            showToast('Empresa creada', 'success');
            if (nameEl) nameEl.value = '';
            const cifEl = document.getElementById('new-company-cif'); if (cifEl) cifEl.value = '';
            const emailEl = document.getElementById('new-company-email'); if (emailEl) emailEl.value = '';
            const addrEl = document.getElementById('new-company-address'); if (addrEl) addrEl.value = '';
            const boot = await apiFetch('get_boot_data');
            if (boot && boot.companies && boot.companies.length > 1) {
                const sel = document.getElementById('company-switcher');
                const wrap = document.getElementById('company-switcher-wrap');
                if (sel && wrap) {
                    wrap.classList.remove('hidden');
                    sel.innerHTML = boot.companies.map(c => `<option value="${c.id}" ${c.id == (boot.current_company_id || 1) ? 'selected' : ''}>${escapeHtml(c.name || 'Empresa ' + c.id)}</option>`).join('');
                }
            }
        } catch (e) { showToast(e.message || 'Error al crear empresa', 'error'); }
    });

    function updateEmailMethodVisibility() {
        const providerEl = document.getElementById('settings-email-provider');
        const smtpBlock = document.getElementById('settings-smtp-block');
        const apiBlock = document.getElementById('settings-api-email-block');
        const mailgunWrap = document.getElementById('settings-mailgun-domain-wrap');
        const resendHint = document.getElementById('settings-resend-hint');
        const method = (providerEl && providerEl.value) ? providerEl.value.toLowerCase() : 'smtp';
        if (smtpBlock) smtpBlock.classList.toggle('hidden', method !== 'smtp');
        if (apiBlock) apiBlock.classList.toggle('hidden', method === 'smtp');
        if (mailgunWrap) mailgunWrap.style.display = method === 'mailgun' ? '' : 'none';
        if (resendHint) resendHint.classList.toggle('hidden', method !== 'resend');
    }

    document.getElementById('settings-email-provider')?.addEventListener('change', updateEmailMethodVisibility);

    function updateBackupScheduleVisibility() {
        const sched = document.getElementById('settings-backup-schedule');
        const dayWrap = document.getElementById('settings-backup-day-wrap');
        const monthdayWrap = document.getElementById('settings-backup-monthday-wrap');
        if (!sched || !dayWrap || !monthdayWrap) return;
        const v = sched.value;
        dayWrap.style.display = v === 'weekly' ? 'block' : 'none';
        monthdayWrap.style.display = v === 'monthly' ? 'block' : 'none';
    }
    document.getElementById('settings-backup-schedule')?.addEventListener('change', updateBackupScheduleVisibility);

    // Navegación de pestañas en Configuración
    if (settingsTabs && settingsTabs.length > 0) {
        settingsTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.settingsTab;
                if (!target) return;
                settingsTabs.forEach(t => t.classList.remove('active'));
                settingsTabPanels.forEach(p => {
                    if (p.dataset.settingsPanel === target) {
                        p.classList.remove('hidden');
                    } else {
                        p.classList.add('hidden');
                    }
                });
                tab.classList.add('active');
            });
        });
    }

    // Procesar facturas recurrentes (generar nuevas según próxima fecha)
    if (processRecurringInvoicesBtn) {
        processRecurringInvoicesBtn.addEventListener('click', async () => {
            if (!confirm('¿Quieres procesar las facturas recurrentes pendientes?\nSe crearán nuevas facturas para las que tengan próxima fecha vencida.')) {
                return;
            }
            try {
                showToast('Procesando facturas recurrentes...', 'info');
                const res = await apiFetch('process_recurring_invoices');
                if (res && res.status === 'success') {
                    const created = res.created || 0;
                    const updated = res.updated || 0;
                    showToast(`Recurrentes procesadas: ${created} nuevas, ${updated} actualizadas.`, 'success');
                    invalidateCache('invoices');
                    invalidateCache('history');
                    // Recargar lista de facturas si estamos en esa sección
                    if (!document.getElementById('section-invoices').classList.contains('hidden')) {
                        navInvoices.click();
                    }
                } else {
                    showToast(res.message || 'No se pudieron procesar las facturas recurrentes.', 'error');
                }
            } catch (e) {
                console.error('Error procesando facturas recurrentes:', e);
                showToast('Error al procesar recurrentes: ' + (e.message || 'Error desconocido'), 'error');
            }
        });
    }

    document.getElementById('settings-smtp-provider')?.addEventListener('change', function () {
        const hostEl = document.getElementById('settings-smtp-host');
        const portEl = document.getElementById('settings-smtp-port');
        const secureEl = document.getElementById('settings-smtp-secure');
        const gmailHint = document.getElementById('settings-smtp-gmail-hint');
        const v = (this.value || '').toLowerCase();
        if (v === 'hostinger') {
            if (hostEl) hostEl.value = 'smtp.hostinger.com';
            if (portEl) portEl.value = '587';
            if (secureEl) secureEl.value = 'tls';
            if (gmailHint) gmailHint.classList.add('hidden');
        } else if (v === 'gmail') {
            if (hostEl) hostEl.value = 'smtp.gmail.com';
            if (portEl) portEl.value = '587';
            if (secureEl) secureEl.value = 'tls';
            if (gmailHint) gmailHint.classList.remove('hidden');
        } else {
            if (gmailHint) gmailHint.classList.add('hidden');
        }
    });

    document.getElementById('btn-save-settings').addEventListener('click', async () => {
        const fd = new FormData();
        fd.append('name', document.getElementById('settings-company-name').value);
        fd.append('cif', document.getElementById('settings-company-cif').value);
        fd.append('email', document.getElementById('settings-company-email').value);
        fd.append('address', document.getElementById('settings-company-address').value);
        fd.append('default_tax', document.getElementById('settings-default-tax').value);
        const vendomiaInput = document.getElementById('settings-vendomia-api-key');
        if (vendomiaInput) fd.append('vendomia_api_key', vendomiaInput.value);
        const senderNameEl = document.getElementById('settings-sender-name');
        if (senderNameEl) fd.append('sender_name', senderNameEl.value);
        const docLangEl = document.getElementById('settings-document-language');
        if (docLangEl) fd.append('document_language', docLangEl.value);
        const paymentEnabledEl = document.getElementById('settings-payment-enabled');
        if (paymentEnabledEl) fd.append('payment_enabled', paymentEnabledEl.checked ? '1' : '0');
        const paymentUrlEl = document.getElementById('settings-payment-link-url');
        if (paymentUrlEl) fd.append('payment_link_url', paymentUrlEl.value);
        const paymentMethodIds = ['transferencia', 'efectivo', 'online', 'bizum', 'cheque'];
        const paymentMethodsVal = paymentMethodIds.filter(m => document.getElementById('settings-payment-method-' + m)?.checked).join(',');
        fd.append('payment_methods', paymentMethodsVal);
        const paymentTransferEl = document.getElementById('settings-payment-transfer-details');
        if (paymentTransferEl) fd.append('payment_transfer_details', paymentTransferEl.value.trim());
        const backupEmailEl = document.getElementById('settings-backup-email');
        if (backupEmailEl) fd.append('backup_email', backupEmailEl.value);
        const documentFooterEl = document.getElementById('settings-document-footer');
        if (documentFooterEl) fd.append('document_footer', documentFooterEl.value);
        const rebuFooterEl = document.getElementById('settings-rebu-footer');
        if (rebuFooterEl) fd.append('rebu_footer_text', rebuFooterEl.value.trim());
        const docEmailSubjEl = document.getElementById('settings-document-email-subject');
        if (docEmailSubjEl) fd.append('document_email_subject', docEmailSubjEl.value.trim());
        const docEmailBodyEl = document.getElementById('settings-document-email-body');
        if (docEmailBodyEl) fd.append('document_email_body', docEmailBodyEl.value.trim());
        const documentLogoUrlEl = document.getElementById('settings-document-logo-url');
        if (documentLogoUrlEl) fd.append('document_logo_url', documentLogoUrlEl.value.trim());
        const invoicePrefixEl = document.getElementById('settings-invoice-prefix');
        if (invoicePrefixEl) fd.append('invoice_prefix', invoicePrefixEl.value.trim());
        const invoiceNextEl = document.getElementById('settings-invoice-next-number');
        if (invoiceNextEl) fd.append('invoice_next_number', invoiceNextEl.value !== '' ? String(Math.max(1, parseInt(invoiceNextEl.value, 10) || 1)) : '');
        // Plantillas de documento
        if (settingsDefaultTemplateSelect) {
            fd.append('default_template', settingsDefaultTemplateSelect.value || 'classic');
        }
        if (settingsTemplateScopeSelect) {
            fd.append('template_scope', settingsTemplateScopeSelect.value || 'both');
        }
        const alertsEnabledEl = document.getElementById('settings-alerts-enabled');
        if (alertsEnabledEl) fd.append('alerts_enabled', alertsEnabledEl.checked ? '1' : '0');
        const remindersEl = document.getElementById('settings-appointment-reminders-enabled');
        if (remindersEl) fd.append('appointment_reminders_enabled', remindersEl.checked ? '1' : '0');
        const overdueDaysEl = document.getElementById('settings-overdue-invoice-days');
        if (overdueDaysEl) fd.append('overdue_invoice_days', Math.max(1, Math.min(365, parseInt(overdueDaysEl.value, 10) || 30)));
        const backupSchedEl = document.getElementById('settings-backup-schedule');
        if (backupSchedEl) fd.append('backup_schedule', backupSchedEl.value || 'off');
        const backupDayEl = document.getElementById('settings-backup-schedule-day');
        if (backupDayEl) fd.append('backup_schedule_day', backupDayEl.value);
        const backupMonthDayEl = document.getElementById('settings-backup-schedule-monthday');
        if (backupMonthDayEl) fd.append('backup_schedule_monthday', backupMonthDayEl.value);
        const backupHourEl = document.getElementById('settings-backup-schedule-hour');
        if (backupHourEl) fd.append('backup_schedule_hour', backupHourEl.value);
        const backupDestEmailEl = document.getElementById('settings-backup-dest-email');
        if (backupDestEmailEl) fd.append('backup_dest_email', backupDestEmailEl.checked ? '1' : '0');
        const backupDestWebhookEl = document.getElementById('settings-backup-dest-webhook');
        if (backupDestWebhookEl) fd.append('backup_dest_webhook', backupDestWebhookEl.checked ? '1' : '0');
        const backupWebhookUrlEl = document.getElementById('settings-backup-webhook-url');
        if (backupWebhookUrlEl) fd.append('backup_webhook_url', backupWebhookUrlEl.value.trim());
        const smtpEnabledEl = document.getElementById('settings-smtp-enabled');
        if (smtpEnabledEl) fd.append('smtp_enabled', smtpEnabledEl.checked ? '1' : '0');
        const smtpHostEl = document.getElementById('settings-smtp-host');
        if (smtpHostEl) fd.append('smtp_host', smtpHostEl.value.trim());
        const smtpPortEl = document.getElementById('settings-smtp-port');
        if (smtpPortEl) fd.append('smtp_port', smtpPortEl.value || '587');
        const smtpUserEl = document.getElementById('settings-smtp-user');
        if (smtpUserEl) fd.append('smtp_user', smtpUserEl.value.trim());
        const smtpPassEl = document.getElementById('settings-smtp-pass');
        if (smtpPassEl) fd.append('smtp_pass', smtpPassEl.value);
        const smtpSecureEl = document.getElementById('settings-smtp-secure');
        if (smtpSecureEl) fd.append('smtp_secure', smtpSecureEl.value || 'tls');
        const emailProviderEl = document.getElementById('settings-email-provider');
        if (emailProviderEl) fd.append('email_provider', (emailProviderEl.value || 'smtp').toLowerCase());
        const emailApiKeyEl = document.getElementById('settings-email-api-key');
        if (emailApiKeyEl) fd.append('email_api_key', emailApiKeyEl.value.trim());
        const emailMailgunDomainEl = document.getElementById('settings-email-mailgun-domain');
        if (emailMailgunDomainEl) fd.append('email_mailgun_domain', emailMailgunDomainEl.value.trim());

        const pwaInstallEnabledEl = document.getElementById('settings-pwa-install-enabled');
        if (pwaInstallEnabledEl) fd.append('pwa_install_enabled', pwaInstallEnabledEl.checked ? '1' : '0');
        const chatbotEnabledEl = document.getElementById('settings-chatbot-enabled');
        if (chatbotEnabledEl) fd.append('chatbot_enabled', chatbotEnabledEl.checked ? '1' : '0');
        try {
            await apiFetch('save_settings', { method: 'POST', body: fd });
            // Guardar envío de correo (SMTP + proveedor API) de forma explícita
            const smtpFd = new FormData();
            if (smtpEnabledEl) smtpFd.append('smtp_enabled', smtpEnabledEl.checked ? '1' : '0');
            if (smtpHostEl) smtpFd.append('smtp_host', smtpHostEl.value.trim());
            if (smtpPortEl) smtpFd.append('smtp_port', smtpPortEl.value || '587');
            if (smtpUserEl) smtpFd.append('smtp_user', smtpUserEl.value.trim());
            if (smtpPassEl) smtpFd.append('smtp_pass', smtpPassEl.value);
            if (smtpSecureEl) smtpFd.append('smtp_secure', smtpSecureEl.value || 'tls');
            const emailProviderFormEl = document.getElementById('settings-email-provider');
            if (emailProviderFormEl) smtpFd.append('email_provider', (emailProviderFormEl.value || 'smtp').toLowerCase());
            const emailApiKeyFormEl = document.getElementById('settings-email-api-key');
            if (emailApiKeyFormEl) smtpFd.append('email_api_key', emailApiKeyFormEl.value.trim());
            const emailMailgunDomainFormEl = document.getElementById('settings-email-mailgun-domain');
            if (emailMailgunDomainFormEl) smtpFd.append('email_mailgun_domain', emailMailgunDomainFormEl.value.trim());
            try {
                await apiFetch('save_smtp_only', { method: 'POST', body: smtpFd });
            } catch (e) { /* ignorar si falla, ya guardamos con save_settings */ }
            showToast('Configuración guardada', 'success');
            const saved = {
                name: document.getElementById('settings-company-name').value,
                cif: document.getElementById('settings-company-cif').value,
                email: document.getElementById('settings-company-email').value,
                address: document.getElementById('settings-company-address').value,
                default_tax: parseFloat(document.getElementById('settings-default-tax').value) || 21
            };
            if (senderNameEl) saved.sender_name = senderNameEl.value;
            if (docLangEl) saved.document_language = docLangEl.value;
            if (paymentEnabledEl) saved.payment_enabled = paymentEnabledEl.checked ? 1 : 0;
            if (paymentUrlEl) saved.payment_link_url = paymentUrlEl.value;
            saved.payment_methods = paymentMethodsVal || null;
            if (paymentTransferEl) saved.payment_transfer_details = paymentTransferEl.value.trim() || null;
            if (backupEmailEl) saved.backup_email = backupEmailEl.value;
            if (documentFooterEl) saved.document_footer = documentFooterEl.value;
            if (docEmailSubjEl) saved.document_email_subject = docEmailSubjEl.value.trim() || null;
            if (docEmailBodyEl) saved.document_email_body = docEmailBodyEl.value.trim() || null;
            if (documentLogoUrlEl) saved.document_logo_url = documentLogoUrlEl.value.trim() || null;
            if (settingsDefaultTemplateSelect) saved.default_template = settingsDefaultTemplateSelect.value || 'classic';
            if (settingsTemplateScopeSelect) saved.template_scope = settingsTemplateScopeSelect.value || 'both';
            if (alertsEnabledEl) saved.alerts_enabled = alertsEnabledEl.checked ? 1 : 0;
            if (remindersEl) saved.appointment_reminders_enabled = remindersEl.checked ? 1 : 0;
            if (overdueDaysEl) saved.overdue_invoice_days = Math.max(1, Math.min(365, parseInt(overdueDaysEl.value, 10) || 30));
            if (pwaInstallEnabledEl) saved.pwa_install_enabled = pwaInstallEnabledEl.checked ? 1 : 0;
            if (chatbotEnabledEl) saved.chatbot_enabled = chatbotEnabledEl.checked ? 1 : 0;
            setCachedData('settings', saved);
            companyData = { ...saved, defaultTax: saved.default_tax };
            updateCompanyDisplay();
            updatePreview();
            // Aplicar visibilidad del chatbot y botón Instalar app al instante
            const chatbotWrap = document.getElementById('chatbot-wrap');
            if (chatbotWrap) chatbotWrap.classList.toggle('hidden', saved.chatbot_enabled === 0 || saved.chatbot_enabled === '0');
            const navPwaInstall = document.getElementById('nav-pwa-install');
            if (navPwaInstall) navPwaInstall.classList.toggle('hidden', saved.pwa_install_enabled === 0 || saved.pwa_install_enabled === '0');
        } catch (e) { showToast(e.message || 'Error al guardar configuración', 'error'); }
    });

    document.getElementById('btn-test-smtp')?.addEventListener('click', async function () {
        const smtpHostEl = document.getElementById('settings-smtp-host');
        const smtpPortEl = document.getElementById('settings-smtp-port');
        const smtpUserEl = document.getElementById('settings-smtp-user');
        const smtpPassEl = document.getElementById('settings-smtp-pass');
        const smtpSecureEl = document.getElementById('settings-smtp-secure');
        const smtpEnabledEl = document.getElementById('settings-smtp-enabled');
        const to = smtpUserEl?.value?.trim() || '';
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            showToast('Rellena el usuario (email) SMTP para enviar la prueba a ese correo.', 'error');
            return;
        }
        const btn = this;
        btn.disabled = true;
        try {
            const smtpFd = new FormData();
            if (smtpEnabledEl) smtpFd.append('smtp_enabled', smtpEnabledEl.checked ? '1' : '0');
            if (smtpHostEl) smtpFd.append('smtp_host', smtpHostEl.value.trim());
            if (smtpPortEl) smtpFd.append('smtp_port', smtpPortEl.value || '587');
            if (smtpUserEl) smtpFd.append('smtp_user', smtpUserEl.value.trim());
            if (smtpPassEl) smtpFd.append('smtp_pass', smtpPassEl.value);
            if (smtpSecureEl) smtpFd.append('smtp_secure', smtpSecureEl.value || 'tls');
            const emailProviderTestEl = document.getElementById('settings-email-provider');
            if (emailProviderTestEl) smtpFd.append('email_provider', (emailProviderTestEl.value || 'smtp').toLowerCase());
            const emailApiKeyTestEl = document.getElementById('settings-email-api-key');
            if (emailApiKeyTestEl) smtpFd.append('email_api_key', emailApiKeyTestEl.value.trim());
            const emailMailgunDomainTestEl = document.getElementById('settings-email-mailgun-domain');
            if (emailMailgunDomainTestEl) smtpFd.append('email_mailgun_domain', emailMailgunDomainTestEl.value.trim());
            await apiFetch('save_smtp_only', { method: 'POST', body: smtpFd });
            showToast('Enviando correo de prueba...', 'info');
            const testFd = new FormData();
            testFd.append('to', to);
            const res = await apiFetch('test_smtp', { method: 'POST', body: testFd, timeout: 60000 });
            if (res && res.status === 'success') {
                showToast(res.message || 'Correo de prueba enviado. Revisa la bandeja (y spam).', 'success');
            } else {
                showToast(res?.message || 'No se pudo enviar.', 'error');
            }
        } catch (e) {
            showToast(e.message || 'Error al probar el correo', 'error');
        } finally {
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    });

    document.getElementById('btn-test-smtp-api')?.addEventListener('click', async function () {
        const toEl = document.getElementById('settings-api-test-email');
        const to = toEl?.value?.trim() || '';
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            showToast('Indica un email de destino para la prueba.', 'error');
            return;
        }
        const btn = this;
        btn.disabled = true;
        try {
            const smtpFd = new FormData();
            const smtpEnabledEl = document.getElementById('settings-smtp-enabled');
            const smtpHostEl = document.getElementById('settings-smtp-host');
            const smtpPortEl = document.getElementById('settings-smtp-port');
            const smtpUserEl = document.getElementById('settings-smtp-user');
            const smtpPassEl = document.getElementById('settings-smtp-pass');
            const smtpSecureEl = document.getElementById('settings-smtp-secure');
            if (smtpEnabledEl) smtpFd.append('smtp_enabled', smtpEnabledEl.checked ? '1' : '0');
            if (smtpHostEl) smtpFd.append('smtp_host', smtpHostEl.value.trim());
            if (smtpPortEl) smtpFd.append('smtp_port', smtpPortEl.value || '587');
            if (smtpUserEl) smtpFd.append('smtp_user', smtpUserEl.value.trim());
            if (smtpPassEl) smtpFd.append('smtp_pass', smtpPassEl.value);
            if (smtpSecureEl) smtpFd.append('smtp_secure', smtpSecureEl.value || 'tls');
            const emailProviderEl = document.getElementById('settings-email-provider');
            if (emailProviderEl) smtpFd.append('email_provider', (emailProviderEl.value || 'smtp').toLowerCase());
            const emailApiKeyEl = document.getElementById('settings-email-api-key');
            if (emailApiKeyEl) smtpFd.append('email_api_key', emailApiKeyEl.value.trim());
            const emailMailgunDomainEl = document.getElementById('settings-email-mailgun-domain');
            if (emailMailgunDomainEl) smtpFd.append('email_mailgun_domain', emailMailgunDomainEl.value.trim());
            await apiFetch('save_smtp_only', { method: 'POST', body: smtpFd });
            showToast('Enviando correo de prueba...', 'info');
            const testFd = new FormData();
            testFd.append('to', to);
            const res = await apiFetch('test_smtp', { method: 'POST', body: testFd, timeout: 60000 });
            if (res && res.status === 'success') {
                showToast(res.message || 'Correo de prueba enviado. Revisa la bandeja (y spam).', 'success');
            } else {
                showToast(res?.message || 'No se pudo enviar.', 'error');
            }
        } catch (e) {
            showToast(e.message || 'Error al probar el correo', 'error');
        } finally {
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    });

    // Subida / borrado de certificado digital
    (function initCertUpload() {
        const fileInput = document.getElementById('settings-cert-file');
        const passInput = document.getElementById('settings-cert-password');
        const statusEl = document.getElementById('settings-cert-status');
        const btnUpload = document.getElementById('btn-upload-cert');
        const btnDelete = document.getElementById('btn-delete-cert');
        if (!btnUpload && !btnDelete) return;

        if (btnUpload && fileInput) {
            btnUpload.addEventListener('click', async () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) {
                    showToast('Selecciona un archivo de certificado (.p12, .pfx, .cer, .crt, .pem, .key).', 'error');
                    return;
                }
                const fd = new FormData();
                fd.append('cert', file);
                if (passInput && passInput.value) fd.append('cert_password', passInput.value);
                try {
                    const res = await fetch(getApiEndpoint() + '?action=upload_certificate&t=' + Date.now(), {
                        method: 'POST',
                        body: fd,
                        credentials: 'same-origin'
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showToast('Certificado subido correctamente.', 'success');
                        if (statusEl) {
                            const type = (data.type || '').toString();
                            const hasPwd = !!data.has_password;
                            statusEl.textContent = 'Certificado guardado (' + (type || 'formato desconocido') + ')' + (hasPwd ? ' · requiere contraseña' : '');
                        }
                    } else {
                        showToast(data.message || 'No se pudo subir el certificado.', 'error');
                    }
                } catch (e) {
                    showToast(e.message || 'Error al subir el certificado.', 'error');
                }
            });
        }
        if (btnDelete) {
            btnDelete.addEventListener('click', async () => {
                if (!confirm('¿Seguro que quieres quitar el certificado guardado?')) return;
                const fd = new FormData();
                fd.append('action', 'delete_certificate');
                try {
                    const res = await fetch(getApiEndpoint() + '?t=' + Date.now(), {
                        method: 'POST',
                        body: fd,
                        credentials: 'same-origin'
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showToast('Certificado eliminado.', 'success');
                        if (statusEl) statusEl.textContent = 'No hay certificado guardado.';
                        if (fileInput) fileInput.value = '';
                        if (passInput) passInput.value = '';
                    } else {
                        showToast(data.message || 'No se pudo eliminar el certificado.', 'error');
                    }
                } catch (e) {
                    showToast(e.message || 'Error al eliminar el certificado.', 'error');
                }
            });
        }
    })();

    // Exportar CSV y backup
    function downloadExport(type) {
        const url = `${getApiEndpoint()}?action=export_csv&type=${encodeURIComponent(type)}&t=${Date.now()}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `export_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    document.getElementById('btn-export-history-csv')?.addEventListener('click', () => { downloadExport('quotes'); invalidateCache('history'); });
    document.getElementById('btn-export-invoices-csv')?.addEventListener('click', () => { downloadExport('invoices'); invalidateCache('invoices'); });

    async function downloadExportExcel(type) {
        if (typeof window.XLSX === 'undefined') { showToast('Biblioteca Excel no cargada. Recarga la página.', 'error'); return; }
        try {
            showToast('Generando Excel...', 'info');
            const XLSX = window.XLSX;
            let data = [];
            let sheetName = 'Datos';
            if (type === 'quotes') {
                const res = await apiFetch('get_history?limit=5000&offset=0');
                data = (res && res.items) ? res.items : [];
                const rows = [['ID', 'Fecha', 'Cliente', 'NIF/CIF', 'Estado', 'Subtotal', 'IVA', 'Total']];
                data.forEach(q => rows.push([q.id || '', (q.date || '').toString().slice(0, 10), q.client_name || '', q.client_id || '', q.status || '', q.subtotal ?? '', q.tax_amount ?? '', q.total_amount ?? '']));
                data = rows;
                sheetName = 'Presupuestos';
            } else if (type === 'invoices') {
                const res = await apiFetch('get_invoices?limit=5000&offset=0');
                data = (res && res.items) ? res.items : [];
                const rows = [['ID', 'Fecha', 'Cliente', 'NIF/CIF', 'Estado', 'Subtotal', 'IVA', 'Total']];
                data.forEach(i => rows.push([i.id || '', (i.date || '').toString().slice(0, 10), i.client_name || '', i.client_id || '', i.status || '', i.subtotal ?? '', i.tax_amount ?? '', i.total_amount ?? '']));
                data = rows;
                sheetName = 'Facturas';
            }
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, `export_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`);
            showToast('Excel descargado', 'success');
        } catch (e) {
            showToast('Error al generar Excel: ' + (e.message || ''), 'error');
        }
    }
    document.getElementById('btn-export-history-excel')?.addEventListener('click', () => { invalidateCache('history'); downloadExportExcel('quotes'); });
    document.getElementById('btn-export-invoices-excel')?.addEventListener('click', () => { invalidateCache('invoices'); downloadExportExcel('invoices'); });

    document.getElementById('btn-download-month-pdf')?.addEventListener('click', async () => {
        if (typeof window.jspdf === 'undefined') { showToast('Biblioteca PDF no cargada. Recarga la página.', 'error'); return; }
        try {
            showToast('Generando informe PDF...', 'info');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            let y = 20;
            const lineH = 7;
            const add = (text, opts = {}) => {
                pdf.setFontSize(opts.size || 10);
                pdf.text(text, 20, y);
                y += lineH;
            };
            const now = new Date();
            const monthStr = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            add('Informe mensual – ' + monthStr, { size: 14 });
            y += 4;
            const monthSummary = await apiFetch('get_month_summary') || {};
            add('Presupuestos del mes: ' + (monthSummary.quotes_count ?? 0));
            add('Facturas del mes: ' + (monthSummary.invoices_count ?? 0));
            add('Total facturado (mes): ' + formatCurrency(monthSummary.total_invoiced ?? 0));
            if (monthSummary.quotes_count_prev != null) {
                add('Presupuestos mes anterior: ' + monthSummary.quotes_count_prev);
                add('Facturas mes anterior: ' + monthSummary.invoices_count_prev);
                add('Total facturado (mes ant.): ' + formatCurrency(monthSummary.total_invoiced_prev ?? 0));
            }
            if (currentUser && currentUser.role === 'admin') {
                try {
                    const stats = await apiFetch('get_dashboard_stats') || {};
                    y += 4;
                    add('Resumen global (admin)');
                    add('Ingresos totales: ' + formatCurrency(stats.income ?? 0));
                    add('Pendiente de cobro: ' + formatCurrency(stats.pending ?? 0));
                    add('Gastos: ' + formatCurrency(stats.expenses ?? 0));
                } catch (_) {}
            }
            y += 4;
            add('Generado: ' + now.toLocaleString('es-ES'));
            pdf.save('informe_mensual_' + now.toISOString().slice(0, 10) + '.pdf');
            showToast('PDF descargado', 'success');
        } catch (e) {
            showToast('Error al generar PDF: ' + (e.message || ''), 'error');
        }
    });
    document.getElementById('btn-export-invoices-accounting')?.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = `${getApiEndpoint()}?action=export_invoices_accounting&t=${Date.now()}`;
        a.download = `facturas_contabilidad_${new Date().toISOString().slice(0, 10)}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Exportación para contabilidad descargada', 'success');
    });
    document.getElementById('btn-export-customers-csv')?.addEventListener('click', () => downloadExport('customers'));
    document.getElementById('btn-export-expenses-csv')?.addEventListener('click', () => downloadExport('expenses'));

    // Exportar remesa / pagos para GoCardless (CSV sencillo a partir de facturas pendientes)
    document.getElementById('btn-export-invoices-gocardless')?.addEventListener('click', async () => {
        try {
            showToast('Generando CSV de remesa GoCardless...', 'info');
            const res = await apiFetch('get_invoices?limit=5000&offset=0');
            const items = (res && res.items) ? res.items : [];
            const pending = items.filter(i => (i.status || '').toLowerCase() === 'pending');
            if (!pending.length) {
                showToast('No hay facturas pendientes para remesa.', 'info');
                return;
            }
            const rows = [];
            rows.push(['invoice_id', 'client_name', 'client_tax_id', 'amount', 'currency', 'description', 'charge_date']);
            const today = new Date().toISOString().slice(0, 10);
            pending.forEach(inv => {
                const id = inv.id || '';
                const name = inv.client_name || '';
                const taxId = inv.client_id || '';
                const amount = inv.total_amount != null ? Number(inv.total_amount) : 0;
                const desc = `Factura ${id}`.trim();
                rows.push([id, name, taxId, amount.toString().replace('.', ','), 'EUR', desc, today]);
            });
            const csv = rows.map(r => r.map(v => {
                const s = (v == null ? '' : String(v));
                return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(';')).join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `remesa_gocardless_${new Date().toISOString().slice(0, 10)}.csv`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('CSV de remesa GoCardless descargado.', 'success');
        } catch (e) {
            console.error('Error exportando remesa GoCardless:', e);
            showToast('Error al generar remesa GoCardless: ' + (e.message || ''), 'error');
        }
    });

    document.getElementById('btn-backup-data')?.addEventListener('click', async () => {
        try {
            showToast('Generando copia de seguridad...', 'info');
            const res = await fetch(`${getApiEndpoint()}?action=backup_data&t=${Date.now()}`, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Error al generar backup');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_presup_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Copia de seguridad descargada', 'success');
        } catch (e) {
            showToast('Error al descargar backup: ' + (e.message || ''), 'error');
        }
    });

    document.getElementById('btn-backup-email')?.addEventListener('click', async () => {
        try {
            showToast('Enviando copia por email...', 'info');
            const fd = new FormData();
            const settings = getCachedData('settings');
            if (settings && settings.backup_email) fd.append('to', settings.backup_email);
            const result = await apiFetch('send_backup_email', { method: 'POST', body: fd });
            if (result && result.status === 'success') {
                showToast('Copia de seguridad enviada por email', 'success');
            } else {
                showToast(result?.message || 'No se pudo enviar. Configura el email de backup en Configuración.', 'error');
            }
        } catch (e) {
            showToast('Error: ' + (e.message || ''), 'error');
        }
    });

    document.getElementById('btn-upgrade-database')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-upgrade-database');
        if (btn) btn.disabled = true;
        try {
            const result = await apiFetch('upgrade_database');
            if (result && result.status === 'success') {
                const msg = result.changes && result.changes.length ? result.message + ' Cambios: ' + result.changes.join(', ') : result.message || 'Base de datos al día.';
                showToast(msg, 'success');
            } else {
                showToast(result?.message || 'Error al actualizar la base de datos', 'error');
            }
        } catch (e) {
            showToast('Error: ' + (e.message || ''), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    function isExcelFile(file) {
        const name = (file.name || '').toLowerCase();
        const type = (file.type || '').toLowerCase();
        return name.endsWith('.xlsx') || name.endsWith('.xls') ||
            type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            type === 'application/vnd.ms-excel' || type === 'application/vnd.ms-excel.sheet.macroEnabled.12';
    }

    async function excelFileToCsvBlob(file) {
        const XLSX = window.XLSX;
        if (!XLSX) {
            showToast('Librería Excel no cargada. Usa CSV o recarga la página.', 'error');
            return null;
        }
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array', cellDates: true, raw: false });
        const firstSheetName = wb.SheetNames && wb.SheetNames[0];
        if (!firstSheetName) return null;
        const sheet = wb.Sheets[firstSheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n', blankrows: false });
        const BOM = '\uFEFF';
        return new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    }

    async function doImportCsv(action, fileInputId) {
        const input = document.getElementById(fileInputId);
        if (!input || !input.files || !input.files[0]) {
            showToast('Selecciona un archivo CSV o Excel', 'error');
            return;
        }
        const file = input.files[0];
        let blobToSend = file;
        if (isExcelFile(file)) {
            try {
                blobToSend = await excelFileToCsvBlob(file);
                if (!blobToSend) {
                    showToast('No se pudo leer la hoja de cálculo', 'error');
                    return;
                }
            } catch (e) {
                showToast('Error al leer Excel: ' + (e.message || ''), 'error');
                return;
            }
        }
        const fd = new FormData();
        fd.append('csv', blobToSend, blobToSend instanceof File ? file.name : 'import.csv');
        try {
            showToast('Importando...', 'info');
            const res = await fetch(`${getApiEndpoint()}?action=${action}&t=${Date.now()}`, { method: 'POST', body: fd, credentials: 'same-origin' });
            const text = await res.text();
            let result;
            try { result = JSON.parse(text); } catch (e) { showToast('Respuesta no válida del servidor', 'error'); return; }
            if (result.status === 'success') {
                const n = result.imported || 0;
                const errs = result.errors && result.errors.length ? ' Advertencias: ' + result.errors.join('; ') : '';
                showToast(`Importados: ${n}${errs}`, n ? 'success' : 'info');
                if (action === 'import_customers') invalidateCache('customers');
                if (action === 'import_projects') { try { window._projectsCache = null; } catch (e) {} }
                if (action === 'import_invoices') { invalidateCache('invoices'); invalidateCache('history'); }
                if (action === 'import_quotes') { invalidateCache('history'); }
                input.value = '';
            } else {
                showToast(result.message || 'Error al importar', 'error');
            }
        } catch (e) {
            showToast('Error: ' + (e.message || ''), 'error');
        }
    }
    document.getElementById('btn-import-customers')?.addEventListener('click', () => doImportCsv('import_customers', 'import-customers-csv'));
    document.getElementById('btn-import-projects')?.addEventListener('click', () => doImportCsv('import_projects', 'import-projects-csv'));
    document.getElementById('btn-import-invoices')?.addEventListener('click', () => doImportCsv('import_invoices', 'import-invoices-csv'));
    document.getElementById('btn-import-quotes')?.addEventListener('click', () => doImportCsv('import_quotes', 'import-quotes-csv'));

    function downloadCsvTemplate(name, headers) {
        const BOM = '\uFEFF';
        const line = Array.isArray(headers) ? headers.join(';') : headers;
        const blob = new Blob([BOM + line + '\n'], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_' + name + '.csv';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    document.getElementById('link-template-customers')?.addEventListener('click', (e) => { e.preventDefault(); downloadCsvTemplate('clientes', ['name', 'tax_id', 'address', 'email', 'phone']); });
    document.getElementById('link-template-projects')?.addEventListener('click', (e) => { e.preventDefault(); downloadCsvTemplate('proyectos', ['name', 'description', 'client_name', 'status', 'start_date', 'end_date', 'budget']); });
    document.getElementById('link-template-invoices')?.addEventListener('click', (e) => { e.preventDefault(); downloadCsvTemplate('facturas', ['id', 'date', 'client_name', 'client_id', 'client_address', 'client_email', 'client_phone', 'notes', 'status', 'subtotal', 'tax_amount', 'total_amount']); });
    document.getElementById('link-template-quotes')?.addEventListener('click', (e) => { e.preventDefault(); downloadCsvTemplate('presupuestos', ['id', 'date', 'client_name', 'client_id', 'client_address', 'client_email', 'client_phone', 'notes', 'status', 'subtotal', 'tax_amount', 'total_amount']); });

    document.getElementById('btn-export-projects-csv')?.addEventListener('click', () => { downloadExport('projects'); invalidateCache('projects'); });

    document.getElementById('btn-upgrade-projects-schema')?.addEventListener('click', async () => {
        try {
            const result = await apiFetch('upgrade_projects_schema');
            if (result && result.status === 'success') {
                showToast(result.changes && result.changes.length ? 'Esquema actualizado: ' + result.changes.join(', ') : result.message || 'OK', 'success');
            } else {
                showToast(result?.message || 'Error al actualizar esquema', 'error');
            }
        } catch (e) {
            showToast('Error: ' + (e.message || ''), 'error');
        }
    });

    document.getElementById('btn-upgrade-deletion-requests-schema')?.addEventListener('click', async () => {
        try {
            const result = await apiFetch('upgrade_deletion_requests_schema');
            if (result && result.status === 'success') {
                showToast(result.changes && result.changes.length ? 'Esquema actualizado: ' + result.changes.join(', ') : result.message || 'OK', 'success');
            } else {
                showToast(result?.message || 'Error al actualizar esquema', 'error');
            }
        } catch (e) {
            showToast('Error: ' + (e.message || ''), 'error');
        }
    });

    function openAdminSection() {
        if (currentUser && currentUser.role === 'admin') {
            loadUsers().then(async () => {
                const selMsg = document.getElementById('admin-message-to-user');
                const selTimeUser = document.getElementById('admin-timeclock-user');
                try {
                    const users = await apiFetch('get_users');
                    if (selMsg) {
                        selMsg.innerHTML = '<option value="">— Selecciona usuario —</option>';
                        (users || []).forEach(u => {
                            const o = document.createElement('option');
                            o.value = u.id;
                            o.textContent = (u.username || 'Usuario ' + u.id) + (u.role === 'admin' ? ' (admin)' : '');
                            selMsg.appendChild(o);
                        });
                    }
                    if (selTimeUser) {
                        const current = selTimeUser.value;
                        selTimeUser.innerHTML = '<option value=\"\">Todos</option>';
                        (users || []).forEach(u => {
                            const o = document.createElement('option');
                            o.value = u.id;
                            o.textContent = u.username || ('Usuario ' + u.id);
                            selTimeUser.appendChild(o);
                        });
                        if (current && selTimeUser.querySelector(`option[value=\"${current}\"]`)) {
                            selTimeUser.value = current;
                        }
                    }
                } catch (e) {}
                await refreshAdminTimeClock();
                switchSection('section-admin', navAdmin);
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        }
    }
    let adminTimeclockLastItems = [];

    async function refreshAdminTimeClock() {
        const tbody = document.getElementById('admin-timeclock-body');
        const empty = document.getElementById('admin-timeclock-empty');
        const selUser = document.getElementById('admin-timeclock-user');
        const selStatus = document.getElementById('admin-timeclock-status');
        const inputFrom = document.getElementById('admin-timeclock-from');
        const inputTo = document.getElementById('admin-timeclock-to');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan=\"6\" style=\"text-align:center;color:var(--text-muted);font-size:0.85rem;\">Cargando…</td></tr>';
        if (empty) empty.style.display = 'none';
        const params = new URLSearchParams();
        params.set('limit', '100');
        if (selUser && selUser.value) params.set('user_id', selUser.value);
        if (selStatus && selStatus.value) params.set('status', selStatus.value);
        if (inputFrom && inputFrom.value) params.set('date_from', inputFrom.value);
        if (inputTo && inputTo.value) params.set('date_to', inputTo.value);
        try {
            const data = await apiFetch('get_work_sessions', params);
            const items = (data && data.items) || [];
            adminTimeclockLastItems = items;
            if (!items.length) {
                tbody.innerHTML = '';
                if (empty) empty.style.display = 'block';
                const totalEl = document.getElementById('admin-timeclock-total-hours');
                const openEl = document.getElementById('admin-timeclock-open-count');
                const usersEl = document.getElementById('admin-timeclock-users-count');
                if (totalEl) totalEl.textContent = '00:00:00';
                if (openEl) openEl.textContent = '0';
                if (usersEl) usersEl.textContent = '0';
                return;
            }
            const fmtDuration = (sec) => {
                sec = Math.max(0, Math.floor(sec || 0));
                const h = String(Math.floor(sec / 3600)).padStart(2, '0');
                const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
                const s = String(sec % 60).padStart(2, '0');
                return h + ':' + m + ':' + s;
            };
            const totalEl = document.getElementById('admin-timeclock-total-hours');
            const openEl = document.getElementById('admin-timeclock-open-count');
            const usersEl = document.getElementById('admin-timeclock-users-count');

            const totalSeconds = items.reduce((sum, ws) => {
                const sec = (typeof ws.duration_seconds === 'number' ? ws.duration_seconds : 0);
                return sum + sec;
            }, 0);
            const openCount = items.filter(ws => !ws.end_time).length;
            const usersCount = new Set(items.map(ws => ws.user_id)).size;

            if (totalEl) totalEl.textContent = fmtDuration(totalSeconds);
            if (openEl) openEl.textContent = String(openCount);
            if (usersEl) usersEl.textContent = String(usersCount);

            const rows = items.map((ws) => {
                const user = ws.username || ('ID ' + ws.user_id);
                const start = ws.start_time ? ws.start_time.replace('T', ' ') : '';
                const end = ws.end_time ? ws.end_time.replace('T', ' ') : '—';
                const dur = ws.duration_seconds != null ? fmtDuration(ws.duration_seconds) : (ws.end_time ? '—' : 'En curso');
                const source = ws.source || '';
                const canClose = !ws.end_time;
                return `<tr>
                    <td>${user}</td>
                    <td>${start}</td>
                    <td>${end}</td>
                    <td>${dur}</td>
                    <td>${source}</td>
                    <td>${canClose ? `<button type="button" class="btn btn-secondary btn-xs admin-timeclock-close" data-id="${ws.id}">Cerrar</button>` : ''}</td>
                </tr>`;
            }).join('');
            tbody.innerHTML = rows;
            tbody.querySelectorAll('.admin-timeclock-close').forEach(btn => {
                btn.addEventListener('click', async (ev) => {
                    ev.preventDefault();
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    if (!confirm('¿Cerrar esta jornada ahora?')) return;
                    try {
                        const fd = new FormData();
                        fd.append('action', 'force_close_work_session');
                        fd.append('id', id);
                        const res = await fetch(getApiEndpoint() + '?t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
                        const data = await res.json();
                        if (data.status === 'success') {
                            showToast('Jornada cerrada correctamente.', 'success');
                            refreshAdminTimeClock();
                        } else {
                            showToast(data.message || 'No se pudo cerrar la jornada.', 'error');
                        }
                    } catch (e) {
                        showToast(e.message || 'Error al cerrar la jornada.', 'error');
                    }
                });
            });
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan=\"6\" style=\"text-align:center;color:var(--danger);font-size:0.85rem;\">Error al cargar los registros.</td></tr>';
        }
    }

    navAdmin.addEventListener('click', openAdminSection);

    document.getElementById('btn-admin-timeclock-refresh')?.addEventListener('click', (e) => {
        e.preventDefault();
        refreshAdminTimeClock();
    });

    document.getElementById('btn-admin-timeclock-today')?.addEventListener('click', (e) => {
        e.preventDefault();
        const inputFrom = document.getElementById('admin-timeclock-from');
        const inputTo = document.getElementById('admin-timeclock-to');
        const today = new Date();
        const iso = today.toISOString().slice(0, 10);
        if (inputFrom) inputFrom.value = iso;
        if (inputTo) inputTo.value = iso;
        refreshAdminTimeClock();
    });

    document.getElementById('btn-admin-timeclock-month')?.addEventListener('click', (e) => {
        e.preventDefault();
        const inputFrom = document.getElementById('admin-timeclock-from');
        const inputTo = document.getElementById('admin-timeclock-to');
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const pad = (n) => String(n).padStart(2, '0');
        const fromStr = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(first.getDate())}`;
        const toStr = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
        if (inputFrom) inputFrom.value = fromStr;
        if (inputTo) inputTo.value = toStr;
        refreshAdminTimeClock();
    });

    document.getElementById('btn-admin-timeclock-export')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!adminTimeclockLastItems || !adminTimeclockLastItems.length) {
            showToast('No hay datos para exportar con los filtros actuales.', 'info');
            return;
        }
        const header = ['id','user_id','username','start_time','end_time','duration_seconds','source'];
        const rows = [header.join(';')];
        adminTimeclockLastItems.forEach(ws => {
            const row = [
                ws.id ?? '',
                ws.user_id ?? '',
                (ws.username || '').replace(/;/g, ','),
                ws.start_time ?? '',
                ws.end_time ?? '',
                ws.duration_seconds ?? '',
                (ws.source || '').replace(/;/g, ','),
            ];
            rows.push(row.join(';'));
        });
        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'control_horario_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    });

    document.getElementById('btn-admin-timeclock-print')?.addEventListener('click', (e) => {
        e.preventDefault();
        const card = document.getElementById('admin-timeclock-card');
        if (!card) {
            showToast('No se encontró la tarjeta de control horario.', 'error');
            return;
        }
        const html = card.outerHTML;
        const w = window.open('', '_blank');
        if (!w) {
            showToast('El navegador ha bloqueado la ventana de impresión (popup).', 'error');
            return;
        }
        const cssHref = (function () {
            const basePath = (location.pathname || '').replace(/[^/]+$/, '');
            return basePath + 'style.css?v=6';
        })();
        w.document.open();
        w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Control horario</title>
<link rel="stylesheet" href="${cssHref}">
</head>
<body style="background:#fff;padding:2rem;">
<div class="admin-timeclock-print">
${html}
</div>
<script>
window.addEventListener('load', function() {
  window.print();
});
</script>
</body>
</html>`);
        w.document.close();
    });

    document.getElementById('btn-admin-timeclock-pdf')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const card = document.getElementById('admin-timeclock-card');
        if (!card) {
            showToast('No se encontró la tarjeta de control horario.', 'error');
            return;
        }
        if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
            showToast('Cargando librerías PDF...', 'info');
            return;
        }
        showToast('Generando PDF de control horario...', 'info');
        try {
            const canvas = await html2canvas(card, { scale: 2, useCORS: true });
            const img = canvas.toDataURL('image/png');
            const PdfCtor = window.jspdf && (window.jspdf.jsPDF || window.jspdf.js);
            if (!PdfCtor) {
                showToast('No se pudo inicializar la librería PDF.', 'error');
                return;
            }
            const pdf = new PdfCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const w = pdf.internal.pageSize.getWidth();
            const h = (canvas.height * w) / canvas.width;
            pdf.addImage(img, 'PNG', 0, 0, w, Math.min(h, 297));
            const today = new Date().toISOString().slice(0, 10);
            pdf.save('control_horario_' + today + '.pdf');
            showToast('PDF descargado.', 'success');
        } catch (err) {
            showToast('Error al generar el PDF.', 'error');
        }
    });

    document.getElementById('btn-admin-timeclock-import')?.addEventListener('click', (e) => {
        e.preventDefault();
        const input = document.getElementById('admin-timeclock-import-file');
        if (input) input.click();
    });

    document.getElementById('admin-timeclock-import-file')?.addEventListener('change', async (e) => {
        const input = e.target;
        const file = input.files && input.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('action', 'import_work_sessions');
        fd.append('file', file);
        try {
            const res = await fetch(getApiEndpoint() + '?t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
            const data = await res.json();
            if (data.status === 'success') {
                showToast('Importación completada. Registros insertados: ' + (data.inserted || 0), 'success');
                refreshAdminTimeClock();
            } else {
                showToast(data.message || 'No se pudo importar el CSV.', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Error al importar el CSV.', 'error');
        } finally {
            input.value = '';
        }
    });

    document.getElementById('btn-open-send-message')?.addEventListener('click', () => {
        openAdminSection();
    });

    // --- CONFIGURACIÓN: Tema de documento (fondo) ---
    if (docThemeSelect) {
        docThemeSelect.addEventListener('change', (e) => {
            docTheme = e.target.value || 'none';
            try {
                localStorage.setItem('docTheme', docTheme);
            } catch (err) {
                console.warn('No se pudo guardar docTheme en localStorage', err);
            }
            if ((docTheme === 'full' || docTheme === 'side') && !docBgImage) {
                showToast('Selecciona una imagen de fondo para el documento.', 'info');
            }
            applyDocTheme();
        });
    }

    if (docBgFileInput) {
        docBgFileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showToast('Selecciona un archivo de imagen válido.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                docBgImage = reader.result;
                try {
                    localStorage.setItem('docBgImage', docBgImage);
                } catch (err) {
                    console.warn('No se pudo guardar la imagen de fondo en localStorage', err);
                }
                applyDocTheme();
                showToast('Imagen de fondo aplicada correctamente (solo en este dispositivo).', 'success');
            };
            reader.onerror = () => {
                showToast('No se pudo leer la imagen seleccionada.', 'error');
            };
            reader.readAsDataURL(file);
        });
    }

    // Acciones rápidas del dashboard (solo cambian de sección, no tocan servidor)
    if (quickNewQuoteBtn) {
        quickNewQuoteBtn.addEventListener('click', () => {
            resetEditor();
            switchSection('section-editor', navEditor);
        });
    }

    if (quickNewInvoiceBtn) {
        quickNewInvoiceBtn.addEventListener('click', () => {
            navInvoices.click();
        });
    }

    if (quickNewInvoiceCreateBtn) {
        quickNewInvoiceCreateBtn.addEventListener('click', async () => {
            try {
                await startNewInvoice();
            } catch (e) {
                showToast(e.message || 'No se pudo crear la factura', 'error');
            }
        });
    }

    if (quickNewExpenseBtn) {
        quickNewExpenseBtn.addEventListener('click', () => {
            navExpenses.click();
        });
    }

    if (quickNewApptBtn) {
        quickNewApptBtn.addEventListener('click', () => {
            navAppointments.click();
        });
    }

    async function uploadExpenseTicket(file, source) {
        if (!file) {
            showToast('Selecciona un ticket o foto de gasto.', 'error');
            return;
        }
        const fd = new FormData();
        fd.append('ticket', file);
        const catEl = document.getElementById('expense-category');
        if (catEl && catEl.value) fd.append('category', catEl.value);
        if (source) fd.append('source', source);
        if (expenseCustomerSelect && expenseCustomerSelect.value) fd.append('customer_id', expenseCustomerSelect.value);
        if (expenseProjectSelect && expenseProjectSelect.value) fd.append('project_id', expenseProjectSelect.value);
        try {
            showToast('Subiendo ticket de gasto...', 'info');
            const res = await fetch(getApiEndpoint() + '?action=upload_expense_ticket&t=' + Date.now(), {
                method: 'POST',
                body: fd,
                credentials: 'same-origin'
            });
            const data = await res.json();
            if (data.status === 'success') {
                const amt = typeof data.amount !== 'undefined' ? Number(data.amount) : 0;
                const msg = amt > 0
                    ? 'Gasto creado desde ticket (' + formatCurrency(amt) + ').'
                    : 'Ticket subido. Revisa y completa el importe si es necesario.';
                showToast(msg, 'success');
                invalidateCache('expenses');
                await loadExpenses();
                // Actualizar estadísticas del dashboard
                try { await loadDashboard(); } catch (e) {}
            } else {
                showToast(data.message || 'No se pudo procesar el ticket.', 'error');
            }
        } catch (e) {
            showToast(e.message || 'Error al subir el ticket.', 'error');
        }
    }

    if (expenseTicketUploadBtn && expenseTicketFileInput) {
        expenseTicketUploadBtn.addEventListener('click', async () => {
            const file = expenseTicketFileInput.files && expenseTicketFileInput.files[0];
            await uploadExpenseTicket(file, 'expenses_form');
        });
    }

    if (dashboardScanExpenseBtn && dashboardExpenseCameraInput) {
        dashboardScanExpenseBtn.addEventListener('click', () => {
            dashboardExpenseCameraInput.click();
        });
        dashboardExpenseCameraInput.addEventListener('change', async () => {
            const file = dashboardExpenseCameraInput.files && dashboardExpenseCameraInput.files[0];
            if (!file) return;
            await uploadExpenseTicket(file, 'dashboard_camera');
            dashboardExpenseCameraInput.value = '';
        });
    }
    if (dashboardTimeclockBtn && navAdmin) {
        dashboardTimeclockBtn.addEventListener('click', () => {
            if (!currentUser || currentUser.role !== 'admin') {
                showToast('Solo el administrador puede ver el panel de control horario.', 'info');
                return;
            }
            openAdminSection();
            const card = document.getElementById('admin-timeclock-card');
            if (card) {
                setTimeout(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 300);
            }
        });
    }
    const btnDashboardVerAvisos = document.getElementById('btn-dashboard-ver-avisos');
    if (btnDashboardVerAvisos) {
        btnDashboardVerAvisos.addEventListener('click', () => fetchAndShowDashboardAlerts(true));
    }

    // Modo "solo vista previa" en móvil (sin overlay)
    if (previewToggleBtn && editorLayout) {
        previewToggleBtn.addEventListener('click', () => {
            editorLayout.classList.toggle('preview-only-mode');
            const isOn = editorLayout.classList.contains('preview-only-mode');
            const icon = previewToggleBtn.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', isOn ? 'minimize-2' : 'maximize-2');
            }
            previewToggleBtn.title = isOn ? 'Volver al editor' : 'Ver documento a pantalla completa';
            if (typeof lucide !== 'undefined') {
                requestAnimationFrame(() => lucide.createIcons());
            }
            if (isOn) {
                const prev = document.getElementById('quote-preview-container');
                if (prev) prev.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    const editOnDocumentBtn = document.getElementById('btn-edit-on-document');
    const openPreviewPageBtn = document.getElementById('btn-open-preview-page');
    if (editOnDocumentBtn && quotePreviewContainer) {
        const editableIds = [
            { id: 'preview-company-name', type: 'companyName' },
            { id: 'preview-company-details', type: 'companyDetails' },
            { id: 'preview-client-name', type: 'clientName' },
            { id: 'preview-client-details', type: 'clientDetails' },
            { id: 'preview-notes-text', type: 'notes' },
            { id: 'preview-quote-id', type: 'metaId' },
            { id: 'preview-date', type: 'metaDate' }
        ];

        const syncEditableBack = () => {
            editableIds.forEach(cfg => {
                const el = document.getElementById(cfg.id);
                if (!el) return;
                const text = el.innerText.trim();
                switch (cfg.type) {
                    case 'clientName':
                        if (clientNameInput) clientNameInput.value = text;
                        break;
                    case 'clientDetails':
                        if (clientAddressInput) {
                            const parts = text.split(/\n/);
                            clientAddressInput.value = parts[0] || '';
                        }
                        break;
                    case 'companyName': {
                        const settingsName = document.getElementById('settings-company-name');
                        if (settingsName && text) settingsName.value = text;
                        break;
                    }
                    case 'companyDetails': {
                        const settingsAddr = document.getElementById('settings-company-address');
                        if (settingsAddr) settingsAddr.value = text.replace(/\n/g, '\n');
                        break;
                    }
                    case 'notes':
                        if (quoteNotesInput) quoteNotesInput.value = text;
                        break;
                    case 'metaId':
                        // Solo actualizar vista interna si existe input de ID
                        {
                            const idInput = document.getElementById('quote-id');
                            if (idInput && text) idInput.value = text;
                        }
                        break;
                    case 'metaDate':
                        {
                            const dateInput = document.getElementById('quote-date');
                            if (dateInput && text) {
                                // Intentar parsear formato dd/mm/yyyy
                                const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                                if (m) {
                                    dateInput.value = `${m[3]}-${m[2]}-${m[1]}`;
                                }
                            }
                        }
                        break;
                }
            });
            // Sincronizar líneas de detalle con items
            try {
                const rows = Array.from(document.querySelectorAll('#preview-items-body tr'));
                rows.forEach((tr, idx) => {
                    if (!items[idx]) items[idx] = { description: '', quantity: 1, price: 0, tax: companyData.defaultTax || 21 };
                    const base = items[idx];
                    const descSpan = tr.querySelector('.preview-item-desc');
                    if (descSpan) base.description = descSpan.innerText.trim();
                    const tdQty = tr.querySelector('td[data-field="quantity"]');
                    if (tdQty) {
                        const num = parseFloat(tdQty.innerText.replace(',', '.'));
                        if (!isNaN(num) && num > 0) base.quantity = num;
                    }
                    const tdPrice = tr.querySelector('td[data-field="price"]');
                    if (tdPrice) {
                        const raw = tdPrice.innerText.replace(/[^\d,.-]/g, '').replace(',', '.');
                        const num = parseFloat(raw);
                        if (!isNaN(num)) base.price = num;
                    }
                    const tdTax = tr.querySelector('td[data-field="tax"]');
                    if (tdTax) {
                        const raw = tdTax.innerText.replace('%', '').replace(',', '.');
                        const num = parseFloat(raw);
                        if (!isNaN(num)) base.tax = num;
                    }
                });
            } catch (e) {
                console.error('Error sincronizando items desde vista previa editable:', e);
            }
            if (typeof updatePreview === 'function') {
                updatePreview();
            }
        };

        const setEditMode = (on) => {
            editOnDocumentMode = on;
            if (on) {
                quotePreviewContainer.classList.add('edit-on-document-mode');
                editableIds.forEach(cfg => {
                    const el = document.getElementById(cfg.id);
                    if (el) {
                        el.setAttribute('contenteditable', 'true');
                    }
                });
                const lineCells = quotePreviewContainer.querySelectorAll('#preview-items-body .preview-editable');
                lineCells.forEach(el => el.setAttribute('contenteditable', 'true'));
                editOnDocumentBtn.innerHTML = '<i data-lucide="save"></i> Guardar cambios';
                editOnDocumentBtn.title = 'Guardar y salir del modo edición';
            } else {
                quotePreviewContainer.classList.remove('edit-on-document-mode');
                editableIds.forEach(cfg => {
                    const el = document.getElementById(cfg.id);
                    if (el) {
                        el.setAttribute('contenteditable', 'false');
                    }
                });
                const lineCells = quotePreviewContainer.querySelectorAll('#preview-items-body .preview-editable');
                lineCells.forEach(el => el.setAttribute('contenteditable', 'false'));
                editOnDocumentBtn.innerHTML = '<i data-lucide="edit-3"></i> Editar sobre documento';
                editOnDocumentBtn.title = 'Editar directamente sobre el documento';
            }
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                requestAnimationFrame(() => lucide.createIcons());
            }
        };

        editOnDocumentBtn.addEventListener('click', () => {
            if (!editOnDocumentMode) {
                setEditMode(true);
            } else {
                syncEditableBack();
                setEditMode(false);
            }
        });

        // Al salir de una celda editable (cantidad, precio, IVA, descripción), sincronizar y recalcular totales
        quotePreviewContainer.addEventListener('blur', (e) => {
            if (!editOnDocumentMode) return;
            const target = e.target;
            if (!target.closest('#preview-items-body')) return;
            if (!target.classList.contains('preview-editable') && !target.querySelector('.preview-editable')) return;
            syncEditableBack();
        }, true);
    }

    if (openPreviewPageBtn) {
        openPreviewPageBtn.addEventListener('click', () => {
            try {
                const prev = document.getElementById('quote-preview');
                if (!prev) return;
                if (typeof updatePreview === 'function') updatePreview();
                const w = window.open('', '_blank');
                if (!w) {
                    showToast('No se pudo abrir la vista en otra pestaña (popup bloqueado).', 'error');
                    return;
                }
                const basePath = (location.pathname || '').replace(/[^/]+$/, '');
                const cssHref = `${basePath}style.css?v=6`;
                const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Vista previa documento</title>
    <link rel="stylesheet" href="${cssHref}">
</head>
<body style="background:#0f172a;display:flex;align-items:center;justify-content:center;padding:2rem;">
    <div class="preview-card">
        ${prev.innerHTML}
    </div>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script>
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    </script>
</body>
</html>`;
                w.document.open();
                w.document.write(html);
                w.document.close();
            } catch (e) {
                console.error('Error abriendo vista previa en otra página:', e);
                showToast('No se pudo abrir la vista previa en otra página.', 'error');
            }
        });
    }

    // Filtros por estado en historial e invoices (client-side, sin pedir más al servidor)
    if (historyStatusFilter) {
        historyStatusFilter.addEventListener('change', () => {
            const all = getCachedData('history');
            if (!all || !Array.isArray(all)) return;
            const val = historyStatusFilter.value;
            const filtered = val === 'all' ? all : all.filter(q => (q.status || 'draft') === val);
            // Reutilizar la misma lógica que navHistory (llamando a su renderer interno)
            navHistory.click();
            // navHistory volverá a usar caché y aplicar el filtro seleccionado en el próximo render
        });
    }

    if (invoicesStatusFilter) {
        invoicesStatusFilter.addEventListener('change', () => {
            const cached = getCachedData('invoices');
            const items = Array.isArray(cached) ? cached : (cached && cached.items) ? cached.items : [];
            const val = invoicesStatusFilter.value;
            const filtered = val === 'all' ? items : items.filter(i => (i.status || '').toLowerCase() === val);
            renderList(
                invoicesList,
                filtered,
                (i) => {
                    const userBadge = (i.username && currentUser && currentUser.role === 'admin') ? `<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:5px">${i.username}</span>` : '';
                    const safeInvoiceId = String(i.id).replace(/'/g, "\\'");
                    const dateStr = i.date ? new Date(i.date).toLocaleDateString('es-ES') : '';
                    const status = (i.status || '').toLowerCase();
                    const statusLabel = status === 'paid' ? 'Pagada' : status === 'pending' ? 'Pendiente' : status === 'cancelled' ? 'Anulada' : status || 'Desconocido';
                    const statusColor = status === 'paid'
                        ? 'background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.3);'
                        : status === 'pending'
                            ? 'background:rgba(245,158,11,0.1);color:#f59e0b;border-color:rgba(245,158,11,0.3);'
                            : status === 'cancelled'
                                ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3);'
                                : 'background:rgba(148,163,184,0.1);color:#94a3b8;border-color:rgba(148,163,184,0.3);';
                    return `
                        <div class="history-item">
                            <div style="flex:1">
                                <strong>${(i.client_name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong>${userBadge}
                                <br>
                                <small>${safeInvoiceId} • ${formatCurrency(i.total_amount || 0)}${dateStr ? ' • ' + dateStr : ''}</small>
                                <br>
                                <span style="display:inline-block;margin-top:0.25rem;padding:0.1rem 0.6rem;border-radius:999px;font-size:0.7rem;font-weight:600;border:1px solid;${statusColor}">
                                    ${statusLabel}
                                </span>
                            </div>
                            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                                ${status !== 'paid' ? `
                                <button class="btn btn-accent btn-sm" onclick="markInvoicePaid('${safeInvoiceId}')" title="Marcar como pagada">
                                    <i data-lucide="check-circle" style="width:14px;height:14px;"></i>
                                    <span style="font-size:0.75rem;">Pagada</span>
                                </button>` : ''}
                                <button class="btn btn-secondary btn-sm" onclick="openInvoiceRecurring('${safeInvoiceId}')" title="Configurar o editar recurrencia">
                                    <i data-lucide="repeat" style="width:14px;height:14px;"></i> Recurrente
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="loadInvoice('${safeInvoiceId}')" title="Editar">
                                    <i data-lucide="edit-3" style="width:14px;height:14px;"></i> Editar
                                </button>
                                <button class="btn btn-accent btn-sm" onclick="duplicateInvoice('${safeInvoiceId}')" title="Duplicar">
                                    <i data-lucide="copy" style="width:14px;height:14px;"></i> Duplicar
                                </button>
                            </div>
                        </div>
                    `;
                },
                'No hay facturas registradas',
                'Error al cargar facturas. Intenta recargar la página.'
            );
        });
    }

    // Copiar resumen del presupuesto / factura al portapapeles
    if (copySummaryBtn) {
        copySummaryBtn.addEventListener('click', async () => {
            try {
                const isInvoice = currentQuoteId && currentQuoteId.startsWith('FAC-');
                const docId = currentQuoteId || (isInvoice ? 'FACTURA NUEVA' : 'PRESUPUESTO NUEVO');
                const clientName = clientNameInput.value || 'Sin nombre';
                const subtotal = items.reduce((a, b) => a + (b.quantity * b.price), 0);
                const tax = items.reduce((a, b) => a + (b.quantity * b.price * (b.tax / 100)), 0);
                const total = subtotal + tax;

                const lines = items.map(i => {
                    const qty = Number(i.quantity) || 0;
                    const price = Number(i.price) || 0;
                    const lineTotal = qty * price;
                    return `- ${i.description || 'Sin descripción'} (x${qty}) ${formatCurrency(lineTotal)}`;
                });

                const summary = [
                    `${isInvoice ? 'FACTURA' : 'PRESUPUESTO'}: ${docId}`,
                    `Cliente: ${clientName}`,
                    '',
                    'Conceptos:',
                    ...lines,
                    '',
                    `Subtotal: ${formatCurrency(subtotal)}`,
                    `IVA: ${formatCurrency(tax)}`,
                    `TOTAL: ${formatCurrency(total)}`,
                    '',
                    quoteNotesInput.value ? `Notas: ${quoteNotesInput.value}` : ''
                ].join('\n');

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(summary);
                    showToast('Resumen copiado al portapapeles.', 'success');
                } else {
                    // Fallback para navegadores antiguos
                    const ta = document.createElement('textarea');
                    ta.value = summary;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showToast('Resumen copiado al portapapeles.', 'success');
                }
            } catch (e) {
                console.error('Error copiando resumen:', e);
                showToast('No se pudo copiar el resumen.', 'error');
            }
        });
    }

    async function loadUsers() {
        try {
            const users = await apiFetch('get_users');
            const list = document.getElementById('admin-users-list');
            if (list) {
                list.innerHTML = users.map(u => {
                    const safeName = (u.username || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    const roleLabel = u.role === 'admin' ? 'Administrador' : 'Usuario';
                    return `
                    <div class="history-item" data-user-id="${u.id}" data-username="${safeName}" data-role="${u.role || 'user'}">
                        <div style="flex:1">
                            <strong>${(u.username || '').replace(/</g, '&lt;')}</strong><br>
                            <small>Rol: ${roleLabel}</small>
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm admin-btn-edit" data-action="edit">Editar</button>
                        <button type="button" class="btn btn-remove btn-sm admin-btn-delete" data-action="delete">Eliminar</button>
                    </div>
                `;
                }).join('');
            }
        } catch (e) { showToast('Error al cargar usuarios', 'error'); }
    }

    document.getElementById('admin-users-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const row = btn.closest('.history-item');
        if (!row) return;
        const id = row.dataset.userId;
        const username = row.dataset.username ? row.dataset.username.replace(/&quot;/g, '"') : '';
        const role = row.dataset.role || 'user';
        if (btn.dataset.action === 'edit') {
            document.getElementById('admin-username').value = username;
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-role').value = role;
            document.getElementById('admin-username').dataset.userId = id;
            document.getElementById('admin-username').focus();
        } else if (btn.dataset.action === 'delete') {
            if (!confirm('¿Eliminar este usuario?')) return;
            const fd = new FormData();
            fd.append('id', id);
            apiFetch('delete_user', { method: 'POST', body: fd }).then(() => {
                showToast('Usuario eliminado', 'success');
                loadUsers();
            }).catch(() => showToast('Error al eliminar usuario', 'error'));
        }
    });

    document.getElementById('btn-save-user')?.addEventListener('click', async () => {
        const username = document.getElementById('admin-username').value;
        const password = document.getElementById('admin-password').value;
        const role = document.getElementById('admin-role').value;
        const userId = document.getElementById('admin-username').dataset.userId;

        if (!username || !password) {
            showToast('Completa todos los campos', 'error');
            return;
        }

        const fd = new FormData();
        fd.append('username', username);
        fd.append('password', password);
        fd.append('role', role);
        if (userId) fd.append('id', userId);

        try {
            await apiFetch('save_user', { method: 'POST', body: fd });
            showToast('Usuario guardado', 'success');
            document.getElementById('admin-username').value = '';
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-role').value = 'user';
            delete document.getElementById('admin-username').dataset.userId;
            loadUsers();
        } catch (e) { showToast('Error al guardar usuario', 'error'); }
    });

    document.getElementById('btn-send-user-message')?.addEventListener('click', async () => {
        const toId = document.getElementById('admin-message-to-user')?.value;
        const subject = document.getElementById('admin-message-subject')?.value?.trim() || '';
        const body = document.getElementById('admin-message-body')?.value?.trim() || '';
        if (!toId) {
            showToast('Selecciona un usuario', 'error');
            return;
        }
        if (!subject && !body) {
            showToast('Escribe asunto o mensaje', 'error');
            return;
        }
        try {
            const fd = new FormData();
            fd.append('to_user_id', toId);
            fd.append('subject', subject);
            fd.append('body', body);
            const result = await apiFetch('send_user_message', { method: 'POST', body: fd });
            if (result && result.status === 'error') throw new Error(result.message || 'Error');
            showToast('Mensaje enviado. El usuario lo verá al iniciar sesión.', 'success');
            document.getElementById('admin-message-subject').value = '';
            document.getElementById('admin-message-body').value = '';
        } catch (e) {
            showToast(e.message || 'Error al enviar mensaje', 'error');
        }
    });

    // --- BÚSQUEDA GLOBAL ---
    let searchTimeout = null;
    if (globalSearch) {
        globalSearch.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);

            searchTimeout = setTimeout(() => {
                invalidateCache('history');
                if (query.length >= 2) {
                    switchSection('section-history', navHistory);
                    loadHistoryPage(0);
                } else {
                    if (!document.getElementById('section-history').classList.contains('hidden')) {
                        loadHistoryPage(0);
                    }
                }
            }, 400);
        });

        globalSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                globalSearch.value = '';
                invalidateCache('history');
                if (!document.getElementById('section-history').classList.contains('hidden')) {
                    loadHistoryPage(historyCurrentPage);
                }
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = globalSearch.value.trim();
                invalidateCache('history');
                switchSection('section-history', navHistory);
                loadHistoryPage(0);
            }
        });
    }

    // --- CONFIRMACIONES MEJORADAS ---
    // Interceptar eliminaciones para confirmar
    const originalDeleteCustomer = window.deleteCustomer;
    window.deleteCustomer = async function(id) {
        if (!confirm('¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.')) return;
        await originalDeleteCustomer(id);
    };

    const originalDeleteExpense = window.deleteExpense;
    window.deleteExpense = async function(id) {
        if (!confirm('¿Estás seguro de que deseas eliminar este gasto?')) return;
        await originalDeleteExpense(id);
    };

    const originalDeleteAppointment = window.deleteAppointment;
    window.deleteAppointment = async function(id) {
        if (!confirm('¿Estás seguro de que deseas eliminar esta cita?')) return;
        await originalDeleteAppointment(id);
    };

    // --- ATAJOS DE TECLADO ---
    document.addEventListener('keydown', (e) => {
        const inInput = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName);
        // Ctrl+S o Cmd+S para guardar
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (!document.getElementById('section-editor').classList.contains('hidden')) {
                saveBtn.click();
            }
        }
        // Ctrl+Shift+I → Ir a Facturas
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            if (navInvoices) navInvoices.click();
        }
        // Ctrl+Shift+H → Ir a Historial
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
            e.preventDefault();
            if (navHistory) navHistory.click();
        }
        // Ctrl+Shift+E → Ir al Editor
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            if (navEditor) navEditor.click();
        }
        // Ctrl+Shift+N → Nueva factura (solo si no estamos escribiendo en un campo)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            if (!inInput && document.getElementById('btn-new-invoice')) document.getElementById('btn-new-invoice').click();
        }
        // Ctrl+P o Cmd+P para imprimir (solo en editor)
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            if (!document.getElementById('section-editor').classList.contains('hidden')) {
                e.preventDefault();
                document.getElementById('btn-print').click();
            }
        }
        // Ctrl+F o Ctrl+K / Cmd+F o Cmd+K para buscar
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'k')) {
            e.preventDefault();
            if (globalSearch) {
                globalSearch.focus();
                globalSearch.select();
            }
        }
    });

    // --- MEJORAS DE VALIDACIÓN ---
    // Validar email en tiempo real
    const emailInputs = [clientEmailInput, document.getElementById('cust-email'), document.getElementById('settings-company-email')];
    emailInputs.forEach(input => {
        if (input) {
            input.addEventListener('blur', function() {
                const email = this.value.trim();
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    this.style.borderColor = 'var(--danger)';
                    showToast('Email no válido', 'error');
                } else {
                    this.style.borderColor = '';
                }
            });
        }
    });

    // Validar teléfono en tiempo real
    const phoneInputs = [clientPhoneInput, document.getElementById('cust-phone'), document.getElementById('appt-phone')];
    phoneInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                // Solo números y espacios
                this.value = this.value.replace(/[^\d\s\+\-]/g, '');
            });
        }
    });

    // --- MEJORAS DE UX: Auto-guardado visual ---
    let autoSaveIndicator = null;
    const originalSave = saveBtn.onclick;
    saveBtn.addEventListener('click', async function() {
        if (autoSaveIndicator) {
            autoSaveIndicator.remove();
        }
        autoSaveIndicator = document.createElement('div');
        autoSaveIndicator.className = 'toast info';
        autoSaveIndicator.innerHTML = '<span>Guardando...</span>';
        document.getElementById('toast-container').appendChild(autoSaveIndicator);
        
        try {
            await originalSave;
            autoSaveIndicator.className = 'toast success';
            autoSaveIndicator.innerHTML = '<span>✓ Guardado</span>';
            setTimeout(() => autoSaveIndicator.remove(), 2000);
        } catch (e) {
            autoSaveIndicator.className = 'toast error';
            autoSaveIndicator.innerHTML = '<span>✗ Error al guardar</span>';
            setTimeout(() => autoSaveIndicator.remove(), 3000);
        }
    });

    // ========== CHATBOT ASISTENTE ==========
    (function initChatbot() {
        const wrap = document.getElementById('chatbot-wrap');
        const fab = document.getElementById('chatbot-fab');
        const panel = document.getElementById('chatbot-panel');
        const closeBtn = document.getElementById('chatbot-close');
        const messagesEl = document.getElementById('chatbot-messages');
        const inputEl = document.getElementById('chatbot-input');
        const sendBtn = document.getElementById('chatbot-send');
        const voiceBtn = document.getElementById('chatbot-voice');
        let lastUserFromVoice = false;
        const chips = document.querySelectorAll('.chatbot-chip');

        const CHATBOT_WELCOME = 'Soy el asistente de NAVEGA360PRO.\nPuedo crear clientes, presupuestos, facturas (y marcarlas pagadas en la misma frase), proyectos y citas; listar, abrir y eliminar; asignar tareas; resúmenes y avisos.\nEjemplos: "Crea factura para Juan por 300€ y márcala pagada", "Próxima cita", "Ayuda factura", "Qué tengo hoy". Di "Cancelar" si quieres dejar lo que estabas haciendo.';

        function escapeChatHtml(s) {
            if (typeof s !== 'string') return '';
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        let chatbotVoice = null;

        function pickChatbotVoice() {
            if (!('speechSynthesis' in window) || !window.speechSynthesis) return null;
            const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
            if (!voices || !voices.length) return null;
            const preferred = voices.find(v => /es-ES/i.test(v.lang) && /Google|Microsoft/i.test(v.name))
                || voices.find(v => /es/i.test(v.lang) && /Google|Microsoft/i.test(v.name))
                || voices.find(v => /es-ES/i.test(v.lang))
                || voices.find(v => /^es/i.test(v.lang));
            return preferred || null;
        }

        const HELP_VIDEO_MAP = {
            presupuesto: {
                title: 'Ayuda: Presupuestos',
                description: 'Cómo crear, editar, enviar y hacer seguimiento de presupuestos.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_PRESUPUESTOS'
            },
            factura: {
                title: 'Ayuda: Facturas',
                description: 'Cómo crear facturas, registrar cobros y ver su estado.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_FACTURAS'
            },
            clientes: {
                title: 'Ayuda: Clientes',
                description: 'Cómo registrar clientes, ver su historial y datos de contacto.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_CLIENTES'
            },
            proyectos: {
                title: 'Ayuda: Proyectos',
                description: 'Cómo organizar trabajos por proyectos y tareas.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_PROYECTOS'
            },
            actividades: {
                title: 'Ayuda: Actividades y tareas',
                description: 'Cómo asignar tareas al equipo y hacer seguimiento.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_ACTIVIDADES'
            },
            citas: {
                title: 'Ayuda: Citas y agenda',
                description: 'Cómo gestionar citas, recordatorios y la agenda.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_CITAS'
            },
            tpv: {
                title: 'Ayuda: TPV y tickets',
                description: 'Cómo usar el TPV, tickets y cobros rápidos.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_TPV'
            },
            gastos: {
                title: 'Ayuda: Gastos',
                description: 'Cómo registrar gastos y controlar el flujo de caja.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_GASTOS'
            },
            ajustes: {
                title: 'Ayuda: Ajustes',
                description: 'Configuración básica de empresa, impuestos y correo.',
                url: 'https://www.youtube.com/embed/VIDEO_ID_AJUSTES'
            }
        };

        function openHelpVideo(sectionKey) {
            const overlay = document.getElementById('help-video-overlay');
            const iframe = document.getElementById('help-video-iframe');
            const titleEl = document.getElementById('help-video-title');
            const descEl = document.getElementById('help-video-description');
            if (!overlay || !iframe || !titleEl || !descEl) return;
            const key = (sectionKey || '').toLowerCase();
            const cfg = HELP_VIDEO_MAP[key] || HELP_VIDEO_MAP.presupuesto;
            titleEl.textContent = cfg.title;
            descEl.textContent = cfg.description;
            iframe.src = cfg.url;
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
        }

        (function initHelpVideoModal() {
            const overlay = document.getElementById('help-video-overlay');
            const closeBtn = document.getElementById('help-video-close');
            const iframe = document.getElementById('help-video-iframe');
            if (!overlay || !closeBtn || !iframe) return;
            function close() {
                overlay.classList.add('hidden');
                overlay.setAttribute('aria-hidden', 'true');
                iframe.src = '';
            }
            closeBtn.addEventListener('click', close);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
            });
        })();

        function addMessage(role, text, options = {}) {
            const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const bubbleClass = options.error ? ' chatbot-msg-bubble error' : 'chatbot-msg-bubble';
            let actionsHtml = '';
            if (options.openQuoteId) actionsHtml += `<button type="button" class="btn btn-primary btn-sm" data-open-quote="${escapeChatHtml(options.openQuoteId)}">Abrir presupuesto</button>`;
            if (options.openInvoiceId) actionsHtml += `<button type="button" class="btn btn-primary btn-sm" data-open-invoice="${escapeChatHtml(options.openInvoiceId)}">Abrir factura</button>`;
            if (options.openCustomerId) actionsHtml += `<button type="button" class="btn btn-primary btn-sm" data-open-customer="${options.openCustomerId}">Ver cliente</button>`;
            if (options.openProjectId) actionsHtml += `<button type="button" class="btn btn-primary btn-sm" data-open-project="${options.openProjectId}">Ver proyecto</button>`;
            const actionsWrap = actionsHtml ? `<div class="chatbot-msg-actions">${actionsHtml}</div>` : '';
            const div = document.createElement('div');
            div.className = 'chatbot-msg ' + role;
            const safeText = escapeChatHtml(text).replace(/\n/g, '<br>');
            div.innerHTML = `<div class="${bubbleClass}">${safeText}<div class="chatbot-msg-time">${time}</div>${actionsWrap}</div>`;
            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            div.querySelectorAll('[data-open-quote]').forEach(btn => {
                btn.addEventListener('click', () => { switchSection('section-editor', document.getElementById('nav-editor')); if (window.loadQuote) window.loadQuote(btn.dataset.openQuote); panel.classList.add('hidden'); });
            });
            div.querySelectorAll('[data-open-invoice]').forEach(btn => {
                btn.addEventListener('click', () => { switchSection('section-invoices', document.getElementById('nav-invoices')); if (window.loadInvoice) window.loadInvoice(btn.dataset.openInvoice); panel.classList.add('hidden'); });
            });
            div.querySelectorAll('[data-open-customer]').forEach(btn => {
                btn.addEventListener('click', () => { switchSection('section-customers', document.getElementById('nav-customers')); loadCustomers(); if (window.showCustomerModal) window.showCustomerModal(parseInt(btn.dataset.openCustomer, 10)); panel.classList.add('hidden'); });
            });
            div.querySelectorAll('[data-open-project]').forEach(btn => {
                btn.addEventListener('click', () => { switchSection('section-projects', document.getElementById('nav-projects')); if (window.openProjectDetail) window.openProjectDetail(parseInt(btn.dataset.openProject, 10)); panel.classList.add('hidden'); });
            });
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

            // Respuesta por voz cuando el usuario habló por voz
            if (role === 'bot' && lastUserFromVoice && 'speechSynthesis' in window && window.speechSynthesis) {
                try {
                    const plain = (text || '').replace(/[*_`]/g, ' ').replace(/\s+/g, ' ').trim();
                    if (plain) {
                        window.speechSynthesis.cancel();
                        if (!chatbotVoice) {
                            chatbotVoice = pickChatbotVoice();
                        }
                        const u = new SpeechSynthesisUtterance(plain);
                        u.lang = (chatbotVoice && chatbotVoice.lang) || 'es-ES';
                        if (chatbotVoice) u.voice = chatbotVoice;
                        u.rate = 0.97;
                        u.pitch = 1.02;
                        window.speechSynthesis.speak(u);
                    }
                } catch (e) { /* ignorar errores de síntesis */ }
            }
        }

        function showTyping() {
            const div = document.createElement('div');
            div.className = 'chatbot-msg bot';
            div.id = 'chatbot-typing-indicator';
            div.innerHTML = '<div class="chatbot-typing"><span></span><span></span><span></span></div>';
            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        function hideTyping() {
            document.getElementById('chatbot-typing-indicator')?.remove();
        }

        function parseAmount(str) {
            if (!str || typeof str !== 'string') return null;
            const m = str.replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?/i);
            return m ? parseFloat(m[1].replace(',', '.')) : null;
        }

        function normalizeForMatching(str) {
            if (!str || typeof str !== 'string') return '';
            let s = str.toLowerCase().trim();
            // Quitar acentos de forma sencilla (para matching más flexible)
            const map = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };
            s = s.replace(/[áéíóúüñ]/g, (c) => map[c] || c);
            return s
                // Correcciones típicas de dictado
                .replace(/\brear\b/g, 'crear').replace(/\bcreer\b/g, 'crear')
                .replace(/\baser\b/g, 'hacer').replace(/\bhaser\b/g, 'hacer')
                .replace(/\blista\b/g, 'listar')
                .replace(/\bfacturacion\b/g, 'facturacion')
                .replace(/\bproyec?to\b/g, 'proyecto');
        }

        // Memoria corta de la última acción del asistente
        const assistantMemory = {
            lastQuoteId: null,
            lastInvoiceId: null,
            lastCustomerId: null,
            lastProjectId: null,
            lastAppointmentId: null,
            lastExpenseId: null
        };

        // Estado de conversación pendiente (para completar datos que faltan, sobre todo en voz)
        let pendingConversation = null;

        function parseIntent(text) {
            const raw = (text || '').trim();
            const t = normalizeForMatching(raw);
            const amount = parseAmount(text) || parseAmount(t);

            // Si solo se dice un ID tipo FAC-2025-001 o PRE-2025-001, abrir directamente
            if (/^[A-Za-z]{2,5}[-0-9]+$/.test(raw)) {
                const id = raw.trim();
                if (/^fac/i.test(id)) return { intent: 'abrir_factura', id };
                if (/^pre/i.test(id)) return { intent: 'abrir_presupuesto', id };
            }

            // Cancelar conversación pendiente
            if (/^(cancelar|nada|olv[ií]dalo|no\s+(quiero|lo\s+hago)|d[eé]jalo|para\s+nada|no,\s+nada)$/i.test(t)) {
                return { intent: 'cancelar_pendiente' };
            }

            if (/^(crear?|nuevo|añadir|agregar|registrar)\s*(un?\s*)?cliente/i.test(t) || /cliente\s+(llamado?|nombre|con nombre)/i.test(t)) {
                let name = '';
                const m = t.match(/(?:cliente|nombre)\s+([^,]+?)(?:\s*,\s*|\s+email\s+|\s+teléfono|$)/i) || t.match(/(?:crear|nuevo)\s+(?:un\s*)?cliente\s+([^,]+?)(?:\s*,\s*|$)/i);
                if (m) name = m[1].replace(/\b(email|teléfono|telefono|tlf)\b.*$/i, '').trim();
                const emailM = text.match(/(?:email|e-?mail|correo)\s*[:\s]*([^\s,]+@[^\s,]+)/i);
                const phoneM = text.match(/(?:tel[ée]fono|tlf|m[óo]vil)\s*[:\s]*([0-9\s+]+)/i);
                return { intent: 'crear_cliente', name: name || null, email: emailM ? emailM[1].trim() : '', phone: phoneM ? phoneM[1].trim() : '' };
            }
            if (/^(crear?|nuevo|hacer?|haz|genera?r?)\s*(un?\s*)?presupuesto/i.test(t) || /presupuesto\s+(?:para\s+|a\s+)/i.test(t) || /(?:hazme?|dame|m[eé]\s+un)\s*(un?\s*)?presupuesto/i.test(t)) {
                let clientName = '';
                const paraM = raw.match(/(?:para|cliente|a)\s+([^0-9]+?)(?:\s+por\s+|\s*[\d,.]+\s*€?|$)/i) || raw.match(/(?:presupuesto)\s+(?:para\s+|a\s+)?([^0-9]+?)(?:\s+por\s+|\s*[\d,.]+\s*€?|$)/i);
                if (paraM) clientName = paraM[1].replace(/\s+por\s+.*$/i, '').replace(/\d+(?:[.,]\d+)?\s*€?/g, '').trim();
                if (!clientName && amount) {
                    const nameBeforeNum = raw.match(/(?:presupuesto|para)\s+([A-Za-záéíóúñ\s]+?)\s+(\d+(?:[.,]\d+)?)\s*€?/i);
                    if (nameBeforeNum) clientName = nameBeforeNum[1].trim();
                }
                return { intent: 'crear_presupuesto', clientName: clientName || null, amount };
            }
            if (/^(crear?|nuevo|hacer?|haz|genera?r?)\s*(una?\s*)?factura/i.test(t) || /factura\s+(?:para\s+|a\s+)/i.test(t) || /(?:hazme?|dame|m[eé]\s+una)\s*(una?\s*)?factura/i.test(t)) {
                let clientName = '';
                const paraM = raw.match(/(?:para|cliente|a)\s+([^0-9]+?)(?:\s+por\s+|\s*[\d,.]+\s*€?|$)/i);
                if (paraM) clientName = paraM[1].replace(/\s+por\s+.*$/i, '').replace(/\d+(?:[.,]\d+)?\s*€?/g, '').trim();
                if (!clientName && amount) {
                    const nameBeforeNum = raw.match(/(?:factura|para)\s+([A-Za-záéíóúñ\s]+?)\s+(\d+(?:[.,]\d+)?)\s*€?/i);
                    if (nameBeforeNum) clientName = nameBeforeNum[1].trim();
                }
                const andMarkPaid = /\s+y\s+(m[aá]rcala\s+(como\s+)?pagada|ponla\s+pagada)/i.test(raw);
                return { intent: 'crear_factura', clientName: clientName || null, amount, andMarkPaid };
            }
            if (/^(lista?r?|ver|mostrar|cuantos?|mu[eé]strame)\s*(los?\s*)?(clientes?)/i.test(t)) return { intent: 'listar_clientes' };
            if (/^(lista?r?|ver|mostrar|ens[eé]ame|ensename|mu[eé]strame)\s*(los?\s*)?(presupuestos?)/i.test(t)) return { intent: 'listar_presupuestos' };
            if (/^(lista?r?|ver|mostrar|ens[eé]ame|ensename|mu[eé]strame)\s*(las?\s*)?(facturas?)/i.test(t)) return { intent: 'listar_facturas' };
            if (/^(crear?|nuevo)\s*(un?\s*)?proyecto/i.test(t) || /proyecto\s+(llamado?|nombre)/i.test(t)) {
                let name = '';
                const m = text.match(/(?:proyecto|nombre)\s+([^,]+?)(?:\s+para\s+|\s*,\s*|$)/i) || text.match(/(?:crear|nuevo)\s+(?:un\s*)?proyecto\s+([^,]+?)(?:\s+para\s+|\s*,\s*|$)/i);
                if (m) name = m[1].replace(/\s+para\s+.*$/i, '').trim();
                const paraM = text.match(/(?:para|cliente)\s+([^,]+?)(?:\s*$|,)/i);
                return { intent: 'crear_proyecto', projectName: name || null, clientName: paraM ? paraM[1].trim() : null };
            }
            if (/^(crear?|nuevo|agendar?)\s*(una?\s*)?cita/i.test(t) || /cita\s+(para|con)\s+/i.test(t) || /agenda(r)?\s+/i.test(t)) {
                let clientName = '';
                const paraM = text.match(/(?:para|con|cliente)\s+([^,]+?)(?:\s+(?:a las|mañana|el|\d)|$)/i) || text.match(/(?:cita)\s+([^,]+?)(?:\s+(?:a las|mañana|el|\d)|$)/i);
                if (paraM) clientName = paraM[1].trim();
                let dateStr = '';
                const hoy = new Date();
                if (/mañana/i.test(text)) {
                    const d = new Date(hoy); d.setDate(d.getDate() + 1);
                    dateStr = d.toISOString().slice(0, 10);
                } else if (/pasado\s*mañana/i.test(text)) {
                    const d = new Date(hoy); d.setDate(d.getDate() + 2);
                    dateStr = d.toISOString().slice(0, 10);
                } else if (/hoy/i.test(text)) {
                    dateStr = hoy.toISOString().slice(0, 10);
                } else {
                    const dateM = text.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
                    if (dateM) dateStr = dateM[0].length === 10 ? dateM[0] : '';
                }
                const timeM = text.match(/(?:a las?|a las)\s*(\d{1,2})(?:\s*:\s*(\d{2}))?(?:\s*h)?/i) || text.match(/(\d{1,2})\s*:\s*(\d{2})/);
                let time = '10:00';
                if (timeM) time = (timeM[1] || '10') + ':' + (timeM[2] || '00');
                return { intent: 'crear_cita', clientName: clientName || null, dateStr, time };
            }
            if (/^(añadir|agregar|crear?)\s*(un?\s*)?(artículo|articulo|producto|servicio)\s+(al\s+)?catálogo/i.test(t) || /catálogo\s+.*\s+(\d+(?:[.,]\d+)?)\s*€/i.test(text)) {
                const priceM = text.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euros?)/i);
                let desc = '';
                const descM = text.replace(/(\d+(?:[.,]\d+)?)\s*€.*$/i, '').replace(/^(?:añadir|agregar|crear|al?\s*catálogo)\s*/i, '').trim();
                if (descM.length > 0) desc = descM.slice(0, 200);
                return { intent: 'crear_articulo_catalogo', description: desc || null, amount: priceM ? parseFloat(priceM[1].replace(',', '.')) : null };
            }
            if (/^(lista?r?|ver|mostrar|ens[eé]ame|ensename|mu[eé]strame)\s*(los?\s*)?(proyectos?)/i.test(t)) return { intent: 'listar_proyectos' };
            if (/^(lista?r?|ver|mostrar|ens[eé]ame|ensename|mu[eé]strame)\s*(los?\s*)?(contratos?)/i.test(t)) return { intent: 'listar_contratos' };
            if (/^(lista?r?|ver|mostrar|ens[eé]ame|ensename|mu[eé]strame)\s*(las?\s*)?(citas?)/i.test(t)) return { intent: 'listar_citas' };
            if (/^(lista?r?|ver|mostrar|ens[eé]ame|ensename|mu[eé]strame)\s*(el\s+)?cat[aá]logo/i.test(t)) return { intent: 'listar_catalogo' };
            if (/^(ir\s+a|abre?|abrir|ve\s+a|navegar\s+a|ponme\s+en|ll[eé]vame\s+a)\s*(la\s+)?(facturas?|presupuestos?|historial|clientes?|proyectos?|contratos?|citas?|agenda|dashboard|inicio|actividades?|tareas?|gastos?|tpv|tickets?|recibos?|ajustes?|configuraci[oó]n)/i.test(t)) {
                const m = text.match(/(?:ir\s+a|abre?|abrir|ve\s+a|navegar\s+a|ponme\s+en|ll[eé]vame\s+a)\s*(?:la\s+)?(facturas?|presupuestos?|historial|clientes?|proyectos?|contratos?|citas?|agenda|dashboard|inicio|actividades?|tareas?|gastos?|tpv|tickets?|recibos?|ajustes?|configuraci[oó]n)/i);
                const dest = (m && m[1]) ? m[1].toLowerCase() : '';
                return { intent: 'ir_a', destino: dest };
            }
            if (/(?:marca?r?|poner?)\s+(?:el\s+)?presupuesto\s+([A-Za-z0-9\-]+)\s+(?:como\s+)?aceptado/i.test(text)) {
                const m = text.match(/presupuesto\s+([A-Za-z0-9\-]+)\s+(?:como\s+)?aceptado/i);
                return { intent: 'marcar_presupuesto_aceptado', id: m ? m[1].trim() : null };
            }
            if (/(?:marca?r?|poner?)\s+(?:la\s+)?factura\s+([A-Za-z0-9\-]+)\s+(?:como\s+)?pagada/i.test(text)) {
                const m = text.match(/factura\s+([A-Za-z0-9\-]+)\s+(?:como\s+)?pagada/i);
                return { intent: 'marcar_factura_pagada', id: m ? m[1].trim() : null };
            }
            if (/^(resumen|este mes|cuántos? presupuestos|cuántas? facturas|c[oó]mo va el mes)/i.test(t)) return { intent: 'resumen_mes' };
            if (/^(comparativa|mes pasado|vs mes anterior)/i.test(t)) return { intent: 'resumen_comparativo' };
            if (/(este\s+trimestre|trimestre\s+actual|c[oó]mo\s+va\s+el\s+trimestre)/i.test(t)) return { intent: 'resumen_trimestre' };
            if (/(este\s+a[nñ]o|este\s+ano|a[nñ]o\s+actual|facturaci[oó]n\s+anual)/i.test(t)) return { intent: 'resumen_anual' };
            if (/(facturas?\s+grandes\s+pendientes|facturas?\s+gordas\s+pendientes|facturas?\s+de\s+importe\s+alto\s+pendientes)/i.test(t)) return { intent: 'facturas_grandes_pendientes' };
            if (/(?:duplicar?|copiar)\s+(?:el\s+)?presupuesto\s+([A-Za-z0-9\-]+)/i.test(text)) {
                const m = text.match(/presupuesto\s+([A-Za-z0-9\-]+)/i);
                return { intent: 'duplicar_presupuesto', id: m ? m[1].trim() : null };
            }
            if (/(?:duplicar?|copiar)\s+(?:la\s+)?factura\s+([A-Za-z0-9\-]+)/i.test(text)) {
                const m = text.match(/factura\s+([A-Za-z0-9\-]+)/i);
                return { intent: 'duplicar_factura', id: m ? m[1].trim() : null };
            }
            if (/^(qué\s+tengo\s+hoy|avisos?|citas?\s+de\s+hoy|hoy\s+tengo\b)/i.test(t)) return { intent: 'avisos_hoy' };
            if (/^(qu[eé]\s+tengo\s+asignado|mis\s+tareas|mis\s+actividades|qu[eé]\s+tengo\s+pendiente)/i.test(t)) return { intent: 'mis_tareas' };
            if (/(proyectos?\s+abiertos|proyectos?\s+en\s+curso|proyectos?\s+activos)/i.test(t)) return { intent: 'resumen_proyectos_abiertos' };
            if (/^(facturas?\s+pendientes?|pendientes? de cobro|qu[eé]\s+me\s+deben)/i.test(t)) return { intent: 'facturas_pendientes' };
            if (/^(presupuestos?\s+enviados?|enviados?\s+sin\s+respuesta|presupuestos?\s+sin\s+contestar)/i.test(t)) return { intent: 'presupuestos_enviados' };
            if (/^(edita?r?|abrir|ver)\s*(el\s*)?(presupuesto|factura)\s+([A-Za-z0-9\-]+)/i.test(t)) {
                const m = text.match(/(?:edita?r?|abrir|ver)\s*(?:el\s*)?(?:presupuesto|factura)\s+([A-Za-z0-9\-]+)/i);
                const tipo = /presupuesto/i.test(text) ? 'presupuesto' : 'factura';
                return { intent: tipo === 'presupuesto' ? 'abrir_presupuesto' : 'abrir_factura', id: m ? m[1].trim() : null };
            }
            if (/^(edita?r?|abrir|ver)\s*(el\s*)?proyecto\s+(\d+)/i.test(t)) {
                const m = text.match(/proyecto\s+(\d+)/i);
                return { intent: 'abrir_proyecto', id: m ? m[1].trim() : null };
            }
            if (/(?:crea?r?|asignar?|manda?r?)\s+(?:una?\s+)?(?:actividad|tarea)\s+a\s+([^\s,]+?)\s+(?:para\s+que\s+|\s+para\s+|de\s+|que\s+)(.+)/i.test(text)) {
                const m = text.match(/(?:crea?r?|asignar?|manda?r?)\s+(?:una?\s+)?(?:actividad|tarea)\s+a\s+([^\s,]+?)\s+(?:para\s+que\s+|\s+para\s+|de\s+|que\s+)(.+)/i);
                const assignee = m ? m[1].trim() : '';
                let instruction = m ? m[2].trim() : '';
                if (instruction) {
                    instruction = instruction.replace(/^que\s+/i, '').replace(/\s*\.\s*$/, '');
                    instruction = instruction.replace(/\brear\b/gi, 'crear').replace(/\bcreer\b/gi, 'crear');
                }
                return { intent: 'crear_actividad', assignee, instruction };
            }
            if (/(?:asignar?|manda?r?)\s+a\s+([^\s,]+?)\s+(?:que\s+)?(.+)/i.test(text) && !/^(ir|abre|ve|lista|ver|mostrar)/i.test(text)) {
                const m = text.match(/(?:asignar?|manda?r?)\s+a\s+([^\s,]+?)\s+(?:que\s+)?(.+)/i);
                if (m && m[2].length > 5) {
                    let instruction = m[2].trim().replace(/\s*\.\s*$/, '').replace(/\brear\b/gi, 'crear').replace(/\bcreer\b/gi, 'crear');
                    return { intent: 'crear_actividad', assignee: m[1].trim(), instruction };
                }
            }
            // Eliminaciones directas por ID compuesto (ej: "Elimina FAC-2025-001")
            if (/(elimina|borra|borrar|eliminar|quitar)\s+([A-Za-z]{2,5}-[0-9\-]+)/i.test(text)) {
                const m = text.match(/(elimina|borra|borrar|eliminar|quitar)\s+([A-Za-z]{2,5}-[0-9\-]+)/i);
                const id = m ? m[2].trim() : '';
                if (/^fac/i.test(id)) return { intent: 'eliminar_factura', id };
                if (/^pre/i.test(id)) return { intent: 'eliminar_presupuesto', id };
            }
            // Eliminaciones directas por ID o referencia con palabra clave
            if (/(elimina|borra|borrar|eliminar|quitar)\s+(?:el\s+)?presupuesto\s+([A-Za-z0-9\-]+)/i.test(text)) {
                const m = text.match(/presupuesto\s+([A-Za-z0-9\-]+)/i);
                return { intent: 'eliminar_presupuesto', id: m ? m[1].trim() : null };
            }
            if (/(elimina|borra|borrar|eliminar|quitar)\s+(?:la\s+)?factura\s+([A-Za-z0-9\-]+)/i.test(text)) {
                const m = text.match(/factura\s+([A-Za-z0-9\-]+)/i);
                return { intent: 'eliminar_factura', id: m ? m[1].trim() : null };
            }
            if (/(elimina|borra|borrar|eliminar|quitar)\s+(?:el\s+)?proyecto\s+(\d+)/i.test(text)) {
                const m = text.match(/proyecto\s+(\d+)/i);
                return { intent: 'eliminar_proyecto', id: m ? m[1].trim() : null };
            }
            if (/(elimina|borra|borrar|eliminar|quitar)\s+(?:la\s+)?cita\s+(\d+)/i.test(text)) {
                const m = text.match(/cita\s+(\d+)/i);
                return { intent: 'eliminar_cita', id: m ? m[1].trim() : null };
            }
            if (/(elimina|borra|borrar|eliminar|quitar)\s+(?:el\s+)?gasto\s+(\d+)/i.test(text)) {
                const m = text.match(/gasto\s+(\d+)/i);
                return { intent: 'eliminar_gasto', id: m ? m[1].trim() : null };
            }
            if (/(elimina|borra|borrar|eliminar|quitar)\s+(?:el\s+)?cliente\s+(.+)/i.test(text)) {
                const m = text.match(/cliente\s+(.+)/i);
                return { intent: 'eliminar_cliente', nameOrId: m ? m[1].trim() : null };
            }
            // Enviar documentos por email y WhatsApp
            if (/(env[ií]a|manda|m[aá]ndame)\s+(el\s+)?presupuesto\s+([A-Za-z0-9\-]+)\s+(?:al?|a)\s+([^\s,]+@[^\s,]+)/i.test(text)) {
                const m = text.match(/presupuesto\s+([A-Za-z0-9\-]+)\s+(?:al?|a)\s+([^\s,]+@[^\s,]+)/i);
                return { intent: 'enviar_presupuesto_email', id: m ? m[1].trim() : null, email: m ? m[2].trim() : null };
            }
            if (/(env[ií]a|manda|m[aá]ndame)\s+(la\s+)?factura\s+([A-Za-z0-9\-]+)\s+(?:al?|a)\s+([^\s,]+@[^\s,]+)/i.test(text)) {
                const m = text.match(/factura\s+([A-Za-z0-9\-]+)\s+(?:al?|a)\s+([^\s,]+@[^\s,]+)/i);
                return { intent: 'enviar_factura_email', id: m ? m[1].trim() : null, email: m ? m[2].trim() : null };
            }
            if (/(env[ií]a|manda|m[aá]ndame)\s+(el\s+)?presupuesto\s+([A-Za-z0-9\-]+)\s+por\s+whatsapp/i.test(text)) {
                const m = text.match(/presupuesto\s+([A-Za-z0-9\-]+)/i);
                return { intent: 'enviar_presupuesto_whatsapp', id: m ? m[1].trim() : null };
            }
            if (/(env[ií]a|manda|m[aá]ndame)\s+(la\s+)?factura\s+([A-Za-z0-9\-]+)\s+por\s+whatsapp/i.test(text)) {
                const m = text.match(/factura\s+([A-Za-z0-9\-]+)/i);
                return { intent: 'enviar_factura_whatsapp', id: m ? m[1].trim() : null };
            }
            // Fallback inteligente: inferir intención básica si hay palabras clave, aunque la frase sea rara
            if (raw) {
                if (/presupuesto/i.test(t) && amount) {
                    return { intent: 'crear_presupuesto', clientName: null, amount };
                }
                if (/factura/i.test(t) && amount) {
                    return { intent: 'crear_factura', clientName: null, amount };
                }
                if (/cliente/i.test(t) && /@[^\s,]+/i.test(text)) {
                    const emailM = text.match(/[^\s,]+@[^\s,]+/);
                    return { intent: 'crear_cliente', name: null, email: emailM ? emailM[0] : '' };
                }
            }
            // Referencias contextuales a lo último que se hizo/abrió
            if (/^marcala\s+como\s+pagada|marcala\s+pagada|ponla\s+pagada|m[aá]rcala\s+pagada/i.test(t)) {
                return { intent: 'marcar_ultima_factura_pagada' };
            }
            if (/^abre\s+el\s+ultimo\s+presupuesto|abre\s+el\s+último\s+presupuesto|abre\s+el\s+ultimo\s+que\s+he\s+creado/i.test(t)) {
                return { intent: 'abrir_ultimo_presupuesto' };
            }
            if (/^abre\s+la\s+ultima\s+factura|abre\s+la\s+última\s+factura|abre\s+la\s+ultima\s+que\s+he\s+creado/i.test(t)) {
                return { intent: 'abrir_ultima_factura' };
            }
            if (/^otro\s+igual|crea\s+otro\s+igual|duplica\s+el\s+ultimo\s+presupuesto|duplica\s+el\s+último\s+presupuesto/i.test(t)) {
                return { intent: 'duplicar_ultimo_presupuesto' };
            }

            if (/^(pr[oó]xima\s+cita|siguiente\s+cita|cu[aá]ndo\s+es\s+mi\s+pr[oó]xima\s+cita)/i.test(t)) return { intent: 'proxima_cita' };
            if (/(factura\s+m[aá]s\s+antigua\s+pendiente|qu[eé]\s+factura\s+llevo\s+m[aá]s\s+sin\s+cobrar|factura\s+m[aá]s\s+vieja\s+pendiente)/i.test(t)) return { intent: 'factura_mas_antigua_pendiente' };
            const ayudaSeccionM = text.match(/ayuda\s+(factura|presupuesto|clientes?|proyectos?|actividades?|tareas?|citas?|tpv|gastos?|ajustes?)/i);
            if (ayudaSeccionM) {
                let sec = (ayudaSeccionM[1] || '').toLowerCase();
                if (sec === 'cliente') sec = 'clientes';
                if (sec === 'actividad' || sec === 'tarea') sec = 'actividades';
                if (sec === 'cita') sec = 'citas';
                if (sec === 'gasto') sec = 'gastos';
                if (sec === 'ajuste') sec = 'ajustes';
                return { intent: 'ayuda_seccion', seccion: sec };
            }
            if (/^(ayuda|qué puedes|qué sabes|comandos|help)/i.test(t)) return { intent: 'ayuda' };
            if (/^(hola|hey|buenas|buenos\s*días|buenas\s*tardes|adiós|gracias|ok|vale|perfecto|genial|de\s*nada)/i.test(t)) return { intent: 'cortesia' };
            if (/^(cómo|como)\s*(creo|crear|hago|hacer|genero|añado|agrego)\s*(un?\s*)?(presupuesto|factura|cliente|proyecto|cita)/i.test(t)) return { intent: 'como_crear', tipo: (t.match(/(presupuesto|factura|cliente|proyecto|cita)/i) || [])[1] };
            if (/^(dónde|donde)\s*(están?|veo|está|ver|puedo\s+ver)\s*(las?\s*)?(facturas?|presupuestos?|clientes?|proyectos?|citas?)/i.test(t)) return { intent: 'donde_ver', tipo: (t.match(/(facturas?|presupuestos?|clientes?|proyectos?|citas?)/i) || [])[1] };
            if (/^(qué|que)\s*es\s*(un?\s*)?(presupuesto|factura)/i.test(t)) return { intent: 'que_es', tipo: (t.match(/(presupuesto|factura)/i) || [])[1] };
            if (/^(cuánto|cuanto)\s*(he\s*)?(facturado|cobrado|vendido)\s*(este\s*mes)?/i.test(t) || /^(facturación|facturacion)\s*(del\s*)?mes/i.test(t)) return { intent: 'resumen_mes' };
            if (/^(quién|quien)\s*me\s*debe|(clientes?\s*)?(que\s*)?deben\s*(dinero|pagar)/i.test(t)) return { intent: 'facturas_pendientes' };
            if (/^(cuántos?|cuantos?)\s*(clientes?|presupuestos?|facturas?|proyectos?)\s*(tengo|hay)/i.test(t)) return { intent: 'cuantos', tipo: (t.match(/(clientes?|presupuestos?|facturas?|proyectos?)/i) || [])[1] };
            if (/^(quiero|necesito|dame|hazme|genera?r?)\s*(un?\s*)?(presupuesto|factura)\s+(para\s+)?([^0-9]+?)\s*(por\s+)?(\d+(?:[.,]\d+)?)\s*€?/i.test(text)) {
                const m = text.match(/(?:quiero|necesito|dame|hazme|genera?r?)\s*(?:un?\s*)?(presupuesto|factura)\s+(?:para\s+)?([^0-9]+?)\s*(?:por\s+)?(\d+(?:[.,]\d+)?)\s*€?/i);
                const tipo = m ? m[1].toLowerCase() : '';
                const clientName = m ? m[2].trim().replace(/\s+por\s+.*$/i, '') : '';
                const amount = m ? parseFloat(m[3].replace(',', '.')) : parseAmount(text);
                if (tipo.includes('presupuesto')) return { intent: 'crear_presupuesto', clientName: clientName || null, amount: amount || null };
                if (tipo.includes('factura')) return { intent: 'crear_factura', clientName: clientName || null, amount: amount || null };
            }
            if (/^(registra?r?|añade|agrega|pon)\s+(el\s+)?cliente\s+([^,]+?)(?:\s*,\s*|\s+email\s+|\s+tel|$)/i.test(text)) {
                const m = text.match(/(?:registra?r?|añade|agrega|pon)\s+(?:el\s+)?cliente\s+([^,]+?)(?:\s*,\s*|\s+email\s+|\s+tel|$)/i);
                const name = m ? m[1].trim() : '';
                const emailM = text.match(/(?:email|correo)\s*[:\s]*([^\s,]+@[^\s,]+)/i);
                const phoneM = text.match(/(?:tel[ée]fono|tlf|m[óo]vil)\s*[:\s]*([0-9\s+]+)/i);
                return { intent: 'crear_cliente', name: name || null, email: emailM ? emailM[1].trim() : '', phone: phoneM ? phoneM[1].trim() : '' };
            }
            if (/^(añade|agrega|pon)\s+(una?\s*)?(cita|reunión)\s+(con|para)\s+([^,]+?)(?:\s+(?:el|mañana|pasado|\d)|$)/i.test(text)) {
                const m = text.match(/(?:cita|reunión)\s+(?:con|para)\s+([^,]+?)(?:\s+(?:el|mañana|pasado|\d)|$)/i) || text.match(/(?:con|para)\s+([^,]+?)(?:\s+(?:el|mañana|pasado|\d)|$)/i);
                const clientName = m ? m[1].trim() : '';
                let dateStr = '';
                const hoy = new Date();
                if (/mañana/i.test(text)) { const d = new Date(hoy); d.setDate(d.getDate() + 1); dateStr = d.toISOString().slice(0, 10); }
                else if (/pasado\s*mañana/i.test(text)) { const d = new Date(hoy); d.setDate(d.getDate() + 2); dateStr = d.toISOString().slice(0, 10); }
                else if (/hoy/i.test(text)) dateStr = hoy.toISOString().slice(0, 10);
                else { const dateM = text.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if (dateM) dateStr = dateM[0].length === 10 ? dateM[0] : ''; }
                const timeM = text.match(/(\d{1,2})\s*:\s*(\d{2})/) || text.match(/a\s+las\s*(\d{1,2})(?:\s*:\s*(\d{2}))?/i);
                const time = timeM ? (timeM[1] || '10') + ':' + (timeM[2] || '00') : '10:00';
                return { intent: 'crear_cita', clientName: clientName || null, dateStr: dateStr || hoy.toISOString().slice(0, 10), time };
            }
            return inferIntentFromKeywords(text) || { intent: 'desconocido' };
        }

        function inferIntentFromKeywords(text) {
            const raw = (text || '').trim();
            const t = normalizeForMatching(raw);
            const has = (words) => words.some(w => t.includes(w));
            if (has(['cliente']) && has(['crear', 'añadir', 'nuevo', 'registrar', 'añade', 'agrega', 'pon'])) {
                const nameM = raw.match(/(?:cliente|llamado?|nombre)\s+([^,.\n]+?)(?:\s*[,.]|\s+email|$)/i) || raw.match(/(?:crear|nuevo|añadir)\s+(?:un\s*)?cliente\s+([^,.\n]+?)(?:\s*[,.]|$)/i);
                const name = nameM ? nameM[1].trim() : '';
                const emailM = raw.match(/(?:email|correo)\s*[:\s]*([^\s,]+@[^\s,]+)/i);
                const phoneM = raw.match(/(?:tel[ée]fono|tlf)\s*[:\s]*([0-9\s+]+)/i);
                return { intent: 'crear_cliente', name: name || null, email: emailM ? emailM[1].trim() : '', phone: phoneM ? phoneM[1].trim() : '' };
            }
            const amt = parseAmount(raw) || parseAmount(t);
            if (has(['presupuesto']) && (has(['crear', 'hacer', 'quiero', 'necesito', 'dame', 'para', 'genera']) || amt) && amt) {
                let clientName = null;
                const paraM = raw.match(/(?:para|cliente)\s+([^0-9]+?)(?:\s+por\s+|\s*€|$)/i);
                if (paraM) clientName = paraM[1].replace(/\s+por\s+.*$/i, '').trim();
                if (!clientName) {
                    const nameAmt = raw.match(/(?:presupuesto)\s+(?:para\s+)?([A-Za-záéíóúñÁÉÍÓÚÑ\s]{2,50}?)\s+(\d+(?:[.,]\d+)?)\s*€?/i) || raw.match(/(?:presupuesto)\s+(?:para\s+)?(.+?)\s+por\s+(\d+(?:[.,]\d+)?)\s*€?/i);
                    if (nameAmt) clientName = nameAmt[1].replace(/\s+por\s+.*$/i, '').trim();
                }
                return { intent: 'crear_presupuesto', clientName, amount: amt };
            }
            if (has(['factura']) && (has(['crear', 'hacer', 'quiero', 'necesito', 'dame', 'para', 'genera']) || amt) && amt) {
                let clientName = null;
                const paraM = raw.match(/(?:para|cliente)\s+([^0-9]+?)(?:\s+por\s+|\s*€|$)/i);
                if (paraM) clientName = paraM[1].replace(/\s+por\s+.*$/i, '').trim();
                if (!clientName) {
                    const nameAmt = raw.match(/(?:factura)\s+(?:para\s+)?([A-Za-záéíóúñÁÉÍÓÚÑ\s]{2,50}?)\s+(\d+(?:[.,]\d+)?)\s*€?/i) || raw.match(/(?:factura)\s+(?:para\s+)?(.+?)\s+por\s+(\d+(?:[.,]\d+)?)\s*€?/i);
                    if (nameAmt) clientName = nameAmt[1].replace(/\s+por\s+.*$/i, '').trim();
                }
                return { intent: 'crear_factura', clientName, amount: amt };
            }
            if (has(['proyecto']) && has(['crear', 'nuevo', 'añadir'])) {
                const nameM = text.match(/(?:proyecto)\s+([^,.\n]+?)(?:\s+para|$)/i) || text.match(/(?:crear|nuevo)\s+(?:un\s*)?proyecto\s+([^,.\n]+?)(?:\s+para|$)/i);
                const paraM = text.match(/(?:para|cliente)\s+([^,.\n]+?)(?:\s*$|,)/i);
                return { intent: 'crear_proyecto', projectName: nameM ? nameM[1].trim() : null, clientName: paraM ? paraM[1].trim() : null };
            }
            if (has(['cita', 'reunión']) && has(['crear', 'añadir', 'agendar', 'poner', 'para', 'nueva'])) return { intent: 'crear_cita', clientName: null, dateStr: '', time: '10:00' };
            if (has(['catálogo', 'catalogo']) && has(['añadir', 'agregar', 'crear']) && (parseAmount(text) || parseAmount(t))) {
                const priceM = text.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euros?)/i);
                let desc = text.replace(/(\d+(?:[.,]\d+)?)\s*€.*$/i, '').replace(/^(?:añadir|agregar|crear|al?\s*catálogo)\s*/i, '').trim().slice(0, 200);
                return { intent: 'crear_articulo_catalogo', description: desc || null, amount: priceM ? parseFloat(priceM[1].replace(',', '.')) : null };
            }
            if (has(['cuánto', 'cuanto', 'facturado', 'cobrado']) && has(['mes', 'este'])) return { intent: 'resumen_mes' };
            if (has(['pendiente', 'debe', 'cobrar']) && has(['factura'])) return { intent: 'facturas_pendientes' };
            if (has(['lista', 'listar', 'ver', 'mostrar']) && has(['cliente'])) return { intent: 'listar_clientes' };
            if (has(['lista', 'listar', 'ver', 'mostrar']) && has(['presupuesto'])) return { intent: 'listar_presupuestos' };
            if (has(['lista', 'listar', 'ver', 'mostrar']) && has(['factura'])) return { intent: 'listar_facturas' };
            if (has(['ir', 'abrir', 've']) && has(['factura'])) return { intent: 'ir_a', destino: 'facturas' };
            if (has(['ir', 'abrir', 've']) && has(['cliente'])) return { intent: 'ir_a', destino: 'clientes' };
            if (has(['ir', 'abrir', 've']) && has(['presupuesto'])) return { intent: 'ir_a', destino: 'presupuestos' };
            if ((has(['tarea']) || has(['actividad'])) && (has(['asignar']) || has(['asigna']) || /\s+a\s+[a-záéíóúñ]+\s+(?:de|para|que)\s+/i.test(raw))) {
                const m = raw.match(/(?:asigna|crear|manda).*?(?:tarea|actividad)\s+a\s+([^\s,]+?)\s+(?:de\s+|para\s+que\s+|para\s+|que\s+)(.+)/i)
                    || raw.match(/asignar?\s+a\s+([^\s,]+?)\s+(?:que\s+)?(.+)/i);
                if (m && m[2] && m[2].trim().length > 3) {
                    let instruction = m[2].trim().replace(/\s*\.\s*$/, '').replace(/\brear\b/gi, 'crear').replace(/\bcreer\b/gi, 'crear');
                    return { intent: 'crear_actividad', assignee: m[1].trim(), instruction };
                }
            }
            if (has(['presupuesto']) && has(['crear', 'hacer', 'quiero', 'dame']) && !amt) {
                const paraM = raw.match(/(?:para|cliente)\s+([^0-9]+?)(?:\s+por\s+|\s*€|$)/i);
                const clientName = paraM ? paraM[1].replace(/\s+por\s+.*$/i, '').trim() : null;
                if (clientName) return { intent: 'crear_presupuesto', clientName, amount: null };
            }
            if (has(['factura']) && has(['crear', 'hacer', 'quiero', 'dame']) && !amt) {
                const paraM = raw.match(/(?:para|cliente)\s+([^0-9]+?)(?:\s+por\s+|\s*€|$)/i);
                const clientName = paraM ? paraM[1].replace(/\s+por\s+.*$/i, '').trim() : null;
                if (clientName) return { intent: 'crear_factura', clientName, amount: null };
            }
            return null;
        }

        async function executeIntent(intent, entities) {
            try {
                if (intent.intent === 'cancelar_pendiente') {
                    pendingConversation = null;
                    return { ok: true, text: 'De acuerdo.' };
                }
                if (intent.intent === 'crear_cliente') {
                    let name = intent.name;
                    if (!name) {
                        pendingConversation = { type: 'crear_cliente', step: 'ask_name', data: intent };
                        return { ok: true, text: '¿Cómo se llama el cliente?' };
                    }
                    const fd = new FormData();
                    fd.append('name', name);
                    fd.append('email', intent.email || '');
                    fd.append('phone', intent.phone || '');
                    fd.append('tax_id', '');
                    fd.append('address', '');
                    const res = await apiFetch('save_customer', { method: 'POST', body: fd });
                    if (res && res.status === 'success') {
                        invalidateCache('customers');
                        const id = res.id;
                        assistantMemory.lastCustomerId = id;
                        return { ok: true, text: `Cliente "${name}" creado correctamente.`, openCustomerId: id };
                    }
                    return { ok: false, text: res?.message || 'Error al crear el cliente.' };
                }

                if (intent.intent === 'crear_presupuesto') {
                    let clientName = intent.clientName;
                    const amount = intent.amount;
                    if (!clientName && (amount == null || amount <= 0)) {
                        pendingConversation = { type: 'crear_presupuesto', step: 'ask_client_and_amount', data: {} };
                        return { ok: true, text: '¿Para qué cliente y por qué importe es el presupuesto?' };
                    }
                    if (!clientName) {
                        pendingConversation = { type: 'crear_presupuesto', step: 'ask_client', data: { amount } };
                        return { ok: true, text: '¿Para qué cliente es el presupuesto?' };
                    }
                    if (amount == null || amount <= 0) {
                        pendingConversation = { type: 'crear_presupuesto', step: 'ask_amount', data: { clientName } };
                        return { ok: true, text: '¿De qué importe es el presupuesto?' };
                    }
                    const quoteId = 'PRE-' + new Date().getFullYear() + '-' + Date.now().toString(36);
                    const date = new Date().toISOString().slice(0, 10);
                    const payload = {
                        id: quoteId,
                        date,
                        client: { name: clientName, id: '', address: '', email: '', phone: '' },
                        notes: '',
                        status: 'draft',
                        project_id: null,
                        items: [{ description: 'Importe indicado', quantity: 1, price: amount, tax: 0 }],
                        totals: { subtotal: amount, tax: 0, total: amount }
                    };
                    const res = await apiFetch('save_quote', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
                    if (res && res.status === 'success') {
                        invalidateCache('history');
                        assistantMemory.lastQuoteId = quoteId;
                        return { ok: true, text: `Presupuesto ${quoteId} creado para ${clientName} por ${formatCurrency(amount)}.`, openQuoteId: quoteId };
                    }
                    return { ok: false, text: res?.message || 'Error al crear el presupuesto.' };
                }

                if (intent.intent === 'crear_factura') {
                    let clientName = intent.clientName;
                    if (!clientName) return { ok: false, text: 'Indica para qué cliente es la factura. Ej: "Crea una factura para López SL por 800€".' };
                    const amount = intent.amount;
                    if (!clientName && (amount == null || amount <= 0)) {
                        pendingConversation = { type: 'crear_factura', step: 'ask_client_and_amount', data: {} };
                        return { ok: true, text: '¿Para qué cliente y por qué importe es la factura?' };
                    }
                    if (!clientName) {
                        pendingConversation = { type: 'crear_factura', step: 'ask_client', data: { amount } };
                        return { ok: true, text: '¿Para qué cliente es la factura?' };
                    }
                    if (amount == null || amount <= 0) {
                        pendingConversation = { type: 'crear_factura', step: 'ask_amount', data: { clientName } };
                        return { ok: true, text: '¿De qué importe es la factura?' };
                    }
                    let invId;
                    try {
                        const next = await apiFetch('get_next_invoice_number');
                        invId = (next && next.next_id) ? next.next_id : 'FAC-' + new Date().getFullYear() + '-' + Date.now();
                    } catch (e) {
                        invId = 'FAC-' + new Date().getFullYear() + '-' + Date.now();
                    }
                    const date = new Date().toISOString().slice(0, 10);
                    const payload = {
                        id: invId,
                        date,
                        client: { name: clientName, id: '', address: '', email: '', phone: '' },
                        notes: '',
                        status: 'pending',
                        items: [{ description: 'Importe indicado', quantity: 1, price: amount, tax: 0 }],
                        totals: { subtotal: amount, tax: 0, total: amount }
                    };
                    const res = await apiFetch('save_invoice', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
                    if (res && res.status === 'success') {
                        invalidateCache('invoices');
                        invalidateCache('history');
                        assistantMemory.lastInvoiceId = invId;
                        if (intent.andMarkPaid) {
                            try {
                                const fd = new FormData();
                                fd.append('id', invId);
                                fd.append('status', 'paid');
                                await apiFetch('update_invoice_status', { method: 'POST', body: fd });
                                invalidateCache('invoices');
                                invalidateCache('history');
                                return { ok: true, text: `Factura ${invId} creada y marcada como pagada.`, openInvoiceId: invId };
                            } catch (e) { /* fallback sin marcar */ }
                        }
                        return { ok: true, text: `Factura ${invId} creada para ${clientName} por ${formatCurrency(amount)}.`, openInvoiceId: invId };
                    }
                    return { ok: false, text: res?.message || 'Error al crear la factura.' };
                }

                if (intent.intent === 'listar_clientes') {
                    const list = await apiFetch('get_customers') || [];
                    const n = list.length;
                    if (n === 0) return { ok: true, text: 'No hay clientes registrados.' };
                    const names = list.slice(0, 10).map(c => c.name || '—').join(', ');
                    return { ok: true, text: `Hay ${n} cliente(s). Primeros: ${names}${n > 10 ? '...' : '.'}` };
                }
                if (intent.intent === 'listar_presupuestos') {
                    const data = await apiFetch('get_history?limit=15&offset=0') || {};
                    const list = (data.items || []);
                    if (list.length === 0) return { ok: true, text: 'No hay presupuestos.' };
                    const lines = list.slice(0, 8).map(q => `${q.id} · ${q.client_name || '—'} · ${formatCurrency(q.total_amount || 0)}`);
                    return { ok: true, text: 'Últimos presupuestos:\n' + lines.join('\n') };
                }
                if (intent.intent === 'listar_facturas') {
                    const data = await apiFetch('get_invoices?limit=15&offset=0') || {};
                    const list = (data.items || []);
                    if (list.length === 0) return { ok: true, text: 'No hay facturas.' };
                    const lines = list.slice(0, 8).map(i => `${i.id} · ${i.client_name || '—'} · ${formatCurrency(i.total_amount || 0)}`);
                    return { ok: true, text: 'Últimas facturas:\n' + lines.join('\n') };
                }
                if (intent.intent === 'resumen_mes') {
                    const m = await apiFetch('get_month_summary') || {};
                    const q = m.quotes_count ?? 0;
                    const inv = m.invoices_count ?? 0;
                    const tot = m.total_invoiced ?? 0;
                    return { ok: true, text: `Este mes: ${q} presupuestos, ${inv} facturas, ${formatCurrency(tot)} cobrado.` };
                }
                if (intent.intent === 'resumen_comparativo') {
                    const m = await apiFetch('get_month_summary') || {};
                    const q = m.quotes_count ?? 0;
                    const inv = m.invoices_count ?? 0;
                    const tot = m.total_invoiced ?? 0;
                    const qp = m.quotes_count_prev ?? 0;
                    const invp = m.invoices_count_prev ?? 0;
                    const totp = m.total_invoiced_prev ?? 0;
                    let diff = '';
                    if (qp !== undefined) diff = `\nMes pasado: ${qp} presupuestos, ${invp} facturas, ${formatCurrency(totp)} cobrado.`;
                    return { ok: true, text: `Este mes: ${q} presupuestos, ${inv} facturas, ${formatCurrency(tot)} cobrado.${diff}` };
                }
                if (intent.intent === 'resumen_trimestre') {
                    const data = await apiFetch('get_invoices?limit=500&offset=0') || {};
                    const list = (data.items || []);
                    const now = new Date();
                    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    let count = 0;
                    let total = 0;
                    list.forEach(i => {
                        const status = (i.status || '').toLowerCase();
                        const d = i.date ? new Date(i.date) : null;
                        if (status === 'paid' && d && d >= cutoff) {
                            count++;
                            total += Number(i.total_amount || 0);
                        }
                    });
                    return { ok: true, text: `Últimos 3 meses: ${count} facturas pagadas, ${formatCurrency(total)} cobrado.` };
                }
                if (intent.intent === 'resumen_anual') {
                    const data = await apiFetch('get_invoices?limit=500&offset=0') || {};
                    const list = (data.items || []);
                    const now = new Date();
                    const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    let count = 0;
                    let total = 0;
                    list.forEach(i => {
                        const status = (i.status || '').toLowerCase();
                        const d = i.date ? new Date(i.date) : null;
                        if (status === 'paid' && d && d >= cutoff) {
                            count++;
                            total += Number(i.total_amount || 0);
                        }
                    });
                    return { ok: true, text: `Últimos 12 meses: ${count} facturas pagadas, ${formatCurrency(total)} cobrado.` };
                }
                if (intent.intent === 'duplicar_presupuesto' && intent.id) {
                    if (typeof window.duplicateQuote === 'function') {
                        window.duplicateQuote(intent.id);
                        assistantMemory.lastQuoteId = intent.id;
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        panel.classList.add('hidden');
                        return { ok: true, text: 'Presupuesto duplicado. Abriendo en el editor para que lo guardes como nuevo.' };
                    }
                    return { ok: false, text: 'No se pudo duplicar.' };
                }
                if (intent.intent === 'duplicar_factura' && intent.id) {
                    if (typeof window.duplicateInvoice === 'function') {
                        window.duplicateInvoice(intent.id);
                        assistantMemory.lastInvoiceId = intent.id;
                        panel.classList.add('hidden');
                        return { ok: true, text: 'Factura duplicada. Abriendo en el editor para que la guardes como nueva.' };
                    }
                    return { ok: false, text: 'No se pudo duplicar.' };
                }
                if (intent.intent === 'abrir_presupuesto' && intent.id) {
                    if (typeof window.loadQuote === 'function') {
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        assistantMemory.lastQuoteId = intent.id;
                        await window.loadQuote(intent.id);
                        panel.classList.add('hidden');
                        return { ok: true, text: 'Abriendo el presupuesto en el editor.' };
                    }
                    return { ok: false, text: 'No se pudo abrir el presupuesto.' };
                }
                if (intent.intent === 'abrir_factura' && intent.id) {
                    if (typeof window.loadInvoice === 'function') {
                        switchSection('section-invoices', document.getElementById('nav-invoices'));
                        assistantMemory.lastInvoiceId = intent.id;
                        await window.loadInvoice(intent.id);
                        panel.classList.add('hidden');
                        return { ok: true, text: 'Abriendo la factura.' };
                    }
                    return { ok: false, text: 'No se pudo abrir la factura.' };
                }
                if (intent.intent === 'crear_proyecto') {
                    const name = intent.projectName;
                    if (!name) return { ok: false, text: 'Dime el nombre del proyecto. Ej: "Crear proyecto Rediseño web para López SL".' };
                    const fd = new FormData();
                    fd.append('name', name);
                    fd.append('description', '');
                    fd.append('client_name', intent.clientName || '');
                    fd.append('status', 'planning');
                    fd.append('start_date', '');
                    fd.append('end_date', '');
                    fd.append('budget', '');
                    try {
                        const res = await apiFetch('save_project', { method: 'POST', body: fd });
                        if (res && res.status === 'success') {
                            const id = res.id;
                            invalidateCache('projects');
                            return { ok: true, text: `Proyecto "${name}" creado.`, openProjectId: id };
                        }
                        return { ok: false, text: res?.message || 'Error al crear el proyecto.' };
                    } catch (e) {
                        return { ok: false, text: 'Los proyectos pueden no estar disponibles. Ejecuta actualización de base de datos si hace falta.' };
                    }
                }
                if (intent.intent === 'crear_cita') {
                    const clientName = intent.clientName;
                    if (!clientName) return { ok: false, text: 'Indica para quién es la cita. Ej: "Cita mañana a las 10 para María García".' };
                    let dateStr = intent.dateStr;
                    if (!dateStr) {
                        const d = new Date();
                        dateStr = d.toISOString().slice(0, 10);
                    }
                    const time = (intent.time || '10:00').replace(/^(\d)$/, '0$1:00').replace(/^(\d{2})$/, '$1:00');
                    const dateTime = dateStr + 'T' + time + ':00';
                    const fd = new FormData();
                    fd.append('client_name', clientName);
                    fd.append('date', dateTime);
                    fd.append('phone', '');
                    fd.append('description', '');
                    try {
                        await apiFetch('save_appointment', { method: 'POST', body: fd });
                        invalidateCache('appointments');
                        return { ok: true, text: `Cita agendada para ${clientName} el ${dateStr} a las ${time}.` };
                    } catch (e) {
                        return { ok: false, text: e?.message || 'Error al crear la cita.' };
                    }
                }
                if (intent.intent === 'crear_articulo_catalogo') {
                    const desc = intent.description;
                    const price = intent.amount;
                    if (!desc) return { ok: false, text: 'Indica la descripción del artículo. Ej: "Añadir al catálogo Mantenimiento web 50€".' };
                    if (price == null || price < 0) return { ok: false, text: 'Indica el precio. Ej: "Añadir al catálogo Servicio X 50€".' };
                    const fd = new FormData();
                    fd.append('description', desc);
                    fd.append('price', price);
                    fd.append('long_description', '');
                    fd.append('tax', '0');
                    try {
                        const res = await apiFetch('save_catalog_item', { method: 'POST', body: fd });
                        invalidateCache('catalog');
                        return { ok: true, text: `Artículo "${desc}" añadido al catálogo por ${formatCurrency(price)}.` };
                    } catch (e) {
                        return { ok: false, text: e?.message || 'Error al añadir al catálogo.' };
                    }
                }
                if (intent.intent === 'crear_actividad') {
                    const assignee = intent.assignee;
                    let instruction = intent.instruction;
                    if (!assignee) return { ok: false, text: 'Indica a qué usuario asignar. Ej: "Crea una actividad a María para que cree un presupuesto" o "Asigna a Juan la tarea de revisar el contrato".' };
                    if (!instruction || instruction.length < 3) return { ok: false, text: 'Indica qué debe hacer. Ej: "Crea una tarea a María para que cree un presupuesto de Luis Pérez".' };
                    instruction = instruction.charAt(0).toUpperCase() + instruction.slice(1);
                    const fd = new FormData();
                    fd.append('to_user', assignee);
                    fd.append('title', instruction);
                    fd.append('description', '');
                    try {
                        const res = await apiFetch('create_assigned_activity', { method: 'POST', body: fd });
                        if (res && res.status === 'success') {
                            return { ok: true, text: `Actividad/tarea asignada a ${assignee}: "${instruction}". La verá en Actividades y tareas.` };
                        }
                        return { ok: false, text: res?.message || 'No se pudo crear la actividad.' };
                    } catch (e) {
                        return { ok: false, text: e?.message || 'Error al asignar. Comprueba que el usuario exista (nombre de usuario exacto).' };
                    }
                }
                if (intent.intent === 'listar_proyectos') {
                    const list = await apiFetch('get_projects') || [];
                    if (list.length === 0) return { ok: true, text: 'No hay proyectos.' };
                    const lines = list.slice(0, 8).map(p => `${p.name || '—'} · ${p.client_name || '—'} · ${p.status || '—'}`);
                    return { ok: true, text: 'Proyectos:\n' + lines.join('\n') };
                }
                if (intent.intent === 'listar_contratos') {
                    const list = await apiFetch('get_contracts') || [];
                    if (list.length === 0) return { ok: true, text: 'No hay contratos.' };
                    const lines = list.slice(0, 8).map(c => `${c.title || c.id || '—'} · ${c.client_name || '—'} · ${formatCurrency(c.amount || 0)}`);
                    return { ok: true, text: 'Contratos:\n' + lines.join('\n') };
                }
                if (intent.intent === 'listar_citas') {
                    const list = await apiFetch('get_appointments') || [];
                    const next = (list || []).slice(0, 10).map(a => {
                        const d = (a.date || '').toString();
                        const fecha = d.slice(0, 10);
                        const hora = d.slice(11, 16);
                        return `${fecha} ${hora} · ${a.client_name || '—'}`;
                    });
                    if (next.length === 0) return { ok: true, text: 'No hay citas agendadas.' };
                    return { ok: true, text: 'Próximas citas:\n' + next.join('\n') };
                }
                if (intent.intent === 'listar_catalogo') {
                    const list = await apiFetch('get_catalog') || [];
                    if (list.length === 0) return { ok: true, text: 'El catálogo está vacío.' };
                    const lines = list.slice(0, 10).map(a => `${a.description || '—'} · ${formatCurrency(a.price || 0)}`);
                    return { ok: true, text: 'Catálogo:\n' + lines.join('\n') };
                }
                if (intent.intent === 'ir_a') {
                    const dest = (intent.destino || '').toLowerCase();
                    const map = {
                        factura: ['section-invoices', 'nav-invoices'],
                        facturas: ['section-invoices', 'nav-invoices'],
                        clientes: ['section-customers', 'nav-customers'],
                        cliente: ['section-customers', 'nav-customers'],
                        presupuestos: ['section-history', 'nav-history'],
                        presupuesto: ['section-history', 'nav-history'],
                        historial: ['section-history', 'nav-history'],
                        proyectos: ['section-projects', 'nav-projects'],
                        proyecto: ['section-projects', 'nav-projects'],
                        actividades: ['section-activities', 'nav-activities'],
                        actividad: ['section-activities', 'nav-activities'],
                        tareas: ['section-activities', 'nav-activities'],
                        'mis tareas': ['section-activities', 'nav-activities'],
                        contratos: ['section-contracts', 'nav-contracts'],
                        contrato: ['section-contracts', 'nav-contracts'],
                        citas: ['section-appointments', 'nav-appointments'],
                        cita: ['section-appointments', 'nav-appointments'],
                        agenda: ['section-appointments', 'nav-appointments'],
                        gastos: ['section-expenses', 'nav-expenses'],
                        remesas: ['section-remittances', 'nav-remittances'],
                        cargos: ['section-remittances', 'nav-remittances'],
                        tpv: ['section-tpv', 'nav-tpv'],
                        tickets: ['section-tickets', 'nav-tickets'],
                        ticket: ['section-tickets', 'nav-tickets'],
                        recibos: ['section-receipts', 'nav-receipts'],
                        recibo: ['section-receipts', 'nav-receipts'],
                        ajustes: ['section-settings', 'nav-settings'],
                        configuracion: ['section-settings', 'nav-settings'],
                        configuración: ['section-settings', 'nav-settings'],
                        dashboard: ['section-dashboard', 'nav-dashboard'],
                        inicio: ['section-dashboard', 'nav-dashboard']
                    };
                    const key = dest.replace(/\s/g, '');
                    const pair = map[key] || map[dest];
                    if (pair) {
                        const [sectionId, navId] = pair;
                        switchSection(sectionId, document.getElementById(navId));
                        panel.classList.add('hidden');
                        if (sectionId === 'section-invoices') openHelpVideo('factura');
                        else if (sectionId === 'section-history' || sectionId === 'section-editor') openHelpVideo('presupuesto');
                        else if (sectionId === 'section-customers') openHelpVideo('clientes');
                        else if (sectionId === 'section-projects') openHelpVideo('proyectos');
                        else if (sectionId === 'section-activities') openHelpVideo('actividades');
                        else if (sectionId === 'section-appointments') openHelpVideo('citas');
                        else if (sectionId === 'section-tpv' || sectionId === 'section-tickets' || sectionId === 'section-receipts') openHelpVideo('tpv');
                        else if (sectionId === 'section-expenses') openHelpVideo('gastos');
                        else if (sectionId === 'section-settings') openHelpVideo('ajustes');
                        return { ok: true, text: 'Hecho.' };
                    }
                    return { ok: false, text: 'Puedo ir a: facturas, clientes, presupuestos/historial, proyectos, contratos, citas/agenda, dashboard/inicio.' };
                }
                if (intent.intent === 'marcar_presupuesto_aceptado' && intent.id) {
                    try {
                        const fd = new FormData();
                        fd.append('id', intent.id);
                        fd.append('status', 'accepted');
                        await apiFetch('update_quote_status', { method: 'POST', body: fd });
                        invalidateCache('history');
                        return { ok: true, text: `Presupuesto ${intent.id} marcado como aceptado.` };
                    } catch (e) {
                        return { ok: false, text: e?.message || 'No se pudo actualizar. Comprueba el ID.' };
                    }
                }
                if (intent.intent === 'marcar_factura_pagada' && intent.id) {
                    try {
                        const fd = new FormData();
                        fd.append('id', intent.id);
                        fd.append('status', 'paid');
                        await apiFetch('update_invoice_status', { method: 'POST', body: fd });
                        invalidateCache('invoices');
                        invalidateCache('history');
                        assistantMemory.lastInvoiceId = intent.id;
                        return { ok: true, text: `Factura ${intent.id} marcada como pagada.` };
                    } catch (e) {
                        return { ok: false, text: e?.message || 'No se pudo actualizar. Comprueba el ID.' };
                    }
                }
                if (intent.intent === 'marcar_ultima_factura_pagada') {
                    const id = assistantMemory.lastInvoiceId;
                    if (!id) return { ok: false, text: 'No tengo ninguna factura reciente en memoria. Indica el ID, por ejemplo: FAC-2025-001.' };
                    try {
                        const fd = new FormData();
                        fd.append('id', id);
                        fd.append('status', 'paid');
                        await apiFetch('update_invoice_status', { method: 'POST', body: fd });
                        invalidateCache('invoices');
                        invalidateCache('history');
                        return { ok: true, text: `He marcado la última factura (${id}) como pagada.` };
                    } catch (e) {
                        return { ok: false, text: e?.message || 'No se pudo actualizar. Comprueba la factura.' };
                    }
                }
                if (intent.intent === 'abrir_ultimo_presupuesto') {
                    const id = assistantMemory.lastQuoteId;
                    if (!id) return { ok: false, text: 'No tengo ningún presupuesto reciente en memoria.' };
                    if (typeof window.loadQuote === 'function') {
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        await window.loadQuote(id);
                        panel.classList.add('hidden');
                        return { ok: true, text: 'He abierto tu último presupuesto.' };
                    }
                    return { ok: false, text: 'No se pudo abrir el presupuesto.' };
                }
                if (intent.intent === 'abrir_ultima_factura') {
                    const id = assistantMemory.lastInvoiceId;
                    if (!id) return { ok: false, text: 'No tengo ninguna factura reciente en memoria.' };
                    if (typeof window.loadInvoice === 'function') {
                        switchSection('section-invoices', document.getElementById('nav-invoices'));
                        await window.loadInvoice(id);
                        panel.classList.add('hidden');
                        return { ok: true, text: 'He abierto tu última factura.' };
                    }
                    return { ok: false, text: 'No se pudo abrir la factura.' };
                }
                if (intent.intent === 'duplicar_ultimo_presupuesto') {
                    const id = assistantMemory.lastQuoteId;
                    if (!id) return { ok: false, text: 'No tengo ningún presupuesto reciente en memoria.' };
                    if (typeof window.duplicateQuote === 'function') {
                        window.duplicateQuote(id);
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        panel.classList.add('hidden');
                        return { ok: true, text: 'He duplicado tu último presupuesto.' };
                    }
                    return { ok: false, text: 'No se pudo duplicar.' };
                }
                if (intent.intent === 'facturas_grandes_pendientes') {
                    const data = await apiFetch('get_invoices?limit=200&offset=0') || {};
                    const list = (data.items || []).filter(i => (i.status || '').toLowerCase() === 'pending');
                    const threshold = 1000;
                    const big = list.filter(i => Number(i.total_amount || 0) >= threshold);
                    if (big.length === 0) return { ok: true, text: 'No tienes facturas grandes pendientes.' };
                    const total = big.reduce((s, i) => s + Number(i.total_amount || 0), 0);
                    const lines = big.slice(0, 5).map(i => `${i.id} · ${i.client_name || '—'} · ${formatCurrency(i.total_amount || 0)}`);
                    return { ok: true, text: `Facturas pendientes ≥ ${formatCurrency(threshold)}: ${big.length} por ${formatCurrency(total)}.\n` + lines.join('\n') };
                }
                if (intent.intent === 'avisos_hoy') {
                    const data = (await getDashboardAlerts()) || {};
                    const citas = data.appointments_today || [];
                    const borradores = data.draft_quotes || [];
                    const pendientes = data.pending_invoices || [];
                    const vencidas = data.overdue_invoices || [];
                    const sinRespuesta = data.sent_quotes_no_response || [];
                    const mensajes = data.messages || [];
                    let tareasPendientes = 0;
                    try {
                        const myTasks = await apiFetch('get_my_tasks') || [];
                        tareasPendientes = Array.isArray(myTasks) ? myTasks.filter(t => !(t.completed === 1 || t.completed === '1' || t.completed === true)).length : 0;
                    } catch (e) {}
                    const parts = [];
                    if (citas.length > 0) parts.push('Citas hoy: ' + citas.length);
                    if (borradores.length > 0) parts.push('Presupuestos sin cerrar: ' + borradores.length);
                    if (pendientes.length > 0) parts.push('Facturas pendientes: ' + pendientes.length);
                    if (vencidas.length > 0) parts.push('Facturas impagadas (+días): ' + vencidas.length);
                    if (sinRespuesta.length > 0) parts.push('Enviados sin respuesta (7+ días): ' + sinRespuesta.length);
                    if (tareasPendientes > 0) parts.push('Tareas asignadas pendientes: ' + tareasPendientes);
                    if (mensajes.length > 0) parts.push('Mensajes nuevos: ' + mensajes.length);
                    if (parts.length === 0) return { ok: true, text: 'Nada pendiente para hoy. Todo al día.' };
                    return { ok: true, text: 'Hoy:\n' + parts.join('\n') };
                }
                if (intent.intent === 'facturas_pendientes') {
                    const data = await apiFetch('get_invoices?limit=50&offset=0') || {};
                    const list = (data.items || []).filter(i => (i.status || '').toLowerCase() === 'pending');
                    if (list.length === 0) return { ok: true, text: 'No hay facturas pendientes de cobro.' };
                    const lines = list.slice(0, 10).map(i => `${i.id} · ${i.client_name || '—'} · ${formatCurrency(i.total_amount || 0)}`);
                    return { ok: true, text: 'Facturas pendientes:\n' + lines.join('\n') };
                }
                if (intent.intent === 'presupuestos_enviados') {
                    const data = (await getDashboardAlerts()) || {};
                    const list = data.sent_quotes_no_response || [];
                    if (list.length === 0) return { ok: true, text: 'No hay presupuestos enviados sin respuesta (7+ días).' };
                    const lines = list.slice(0, 8).map(q => `${q.id} · ${q.client_name || '—'} · ${formatCurrency(q.total_amount || 0)}`);
                    return { ok: true, text: 'Enviados sin respuesta:\n' + lines.join('\n') };
                }
                if (intent.intent === 'mis_tareas') {
                    const arr = await apiFetch('get_my_tasks') || [];
                    const list = Array.isArray(arr) ? arr : [];
                    if (list.length === 0) return { ok: true, text: 'No tienes tareas pendientes.' };
                    const lines = list.slice(0, 8).map(t => `${t.title || 'Tarea'}${t.due_date ? ' · ' + new Date(t.due_date).toLocaleDateString('es-ES') : ''}`);
                    return { ok: true, text: 'Tus tareas:\n' + lines.join('\n') };
                }
                if (intent.intent === 'resumen_proyectos_abiertos') {
                    const list = await apiFetch('get_projects') || [];
                    const arr = Array.isArray(list) ? list : [];
                    const open = arr.filter(p => {
                        const s = (p.status || '').toLowerCase();
                        return s !== 'completed' && s !== 'cancelled' && s !== 'cerrado';
                    });
                    if (open.length === 0) return { ok: true, text: 'No tienes proyectos abiertos.' };
                    const lines = open.slice(0, 8).map(p => `${p.id} · ${p.name || 'Proyecto'}${p.client_name ? ' · ' + p.client_name : ''}`);
                    return { ok: true, text: `Proyectos abiertos: ${open.length}.\n` + lines.join('\n') };
                }
                if (intent.intent === 'abrir_proyecto' && intent.id) {
                    switchSection('section-projects', document.getElementById('nav-projects'));
                    if (window.openProjectDetail) window.openProjectDetail(parseInt(intent.id, 10));
                    panel.classList.add('hidden');
                    return { ok: true, text: 'Abriendo el proyecto.' };
                }
                if (intent.intent === 'enviar_presupuesto_email' && intent.id && intent.email) {
                    const id = intent.id;
                    const email = intent.email;
                    if (typeof window.loadQuote === 'function' && document.getElementById('btn-send-email')) {
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        await window.loadQuote(id);
                        if (clientEmailInput) clientEmailInput.value = email;
                        document.getElementById('btn-send-email').click();
                        return { ok: true, text: `He preparado el email del presupuesto ${id} para ${email}. Revisa y pulsa Enviar.` };
                    }
                    return { ok: false, text: 'No puedo preparar el email ahora mismo. Abre el presupuesto y usa la opción de enviar por email.' };
                }
                if (intent.intent === 'enviar_factura_email' && intent.id && intent.email) {
                    const id = intent.id;
                    const email = intent.email;
                    if (typeof window.loadInvoice === 'function' && document.getElementById('btn-send-email')) {
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        await window.loadInvoice(id);
                        if (clientEmailInput) clientEmailInput.value = email;
                        document.getElementById('btn-send-email').click();
                        return { ok: true, text: `He preparado el email de la factura ${id} para ${email}. Revisa y pulsa Enviar.` };
                    }
                    return { ok: false, text: 'No puedo preparar el email ahora mismo. Abre la factura y usa la opción de enviar por email.' };
                }
                if (intent.intent === 'enviar_presupuesto_whatsapp' && intent.id) {
                    const id = intent.id;
                    if (typeof window.loadQuote === 'function' && document.getElementById('btn-whatsapp')) {
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        await window.loadQuote(id);
                        document.getElementById('btn-whatsapp').click();
                        return { ok: true, text: `He preparado el WhatsApp del presupuesto ${id}. Completa el envío en la ventana de WhatsApp.` };
                    }
                    return { ok: false, text: 'No puedo preparar el WhatsApp ahora mismo. Abre el presupuesto y usa el botón de WhatsApp.' };
                }
                if (intent.intent === 'enviar_factura_whatsapp' && intent.id) {
                    const id = intent.id;
                    if (typeof window.loadInvoice === 'function' && document.getElementById('btn-whatsapp')) {
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        await window.loadInvoice(id);
                        document.getElementById('btn-whatsapp').click();
                        return { ok: true, text: `He preparado el WhatsApp de la factura ${id}. Completa el envío en la ventana de WhatsApp.` };
                    }
                    return { ok: false, text: 'No puedo preparar el WhatsApp ahora mismo. Abre la factura y usa el botón de WhatsApp.' };
                }
                if (intent.intent === 'eliminar_presupuesto') {
                    const id = intent.id;
                    if (!id) return { ok: false, text: 'Indica el ID del presupuesto. Ej: "Elimina el presupuesto PRE-2025-001".' };
                    if (window.deleteQuote) {
                        await window.deleteQuote(id);
                        return { ok: true, text: `He lanzado la eliminación del presupuesto ${id}.` };
                    }
                    return { ok: false, text: 'No puedo eliminar presupuestos desde aquí.' };
                }
                if (intent.intent === 'eliminar_factura') {
                    const id = intent.id;
                    if (!id) return { ok: false, text: 'Indica el ID de la factura. Ej: "Elimina la factura FAC-2025-001".' };
                    if (window.deleteInvoice) {
                        await window.deleteInvoice(id);
                        return { ok: true, text: `He lanzado la eliminación de la factura ${id}.` };
                    }
                    return { ok: false, text: 'No puedo eliminar facturas desde aquí.' };
                }
                if (intent.intent === 'eliminar_proyecto') {
                    const id = intent.id;
                    if (!id) return { ok: false, text: 'Indica el ID del proyecto numérico. Ej: "Elimina el proyecto 12".' };
                    if (window.deleteProject) {
                        await window.deleteProject(parseInt(id, 10));
                        return { ok: true, text: `He lanzado la eliminación del proyecto ${id}.` };
                    }
                    return { ok: false, text: 'No puedo eliminar proyectos desde aquí.' };
                }
                if (intent.intent === 'eliminar_cita') {
                    const id = intent.id;
                    if (!id) return { ok: false, text: 'Indica el ID numérico de la cita.' };
                    if (window.deleteAppointment) {
                        await window.deleteAppointment(parseInt(id, 10));
                        return { ok: true, text: `He lanzado la eliminación de la cita ${id}.` };
                    }
                    return { ok: false, text: 'No puedo eliminar citas desde aquí.' };
                }
                if (intent.intent === 'eliminar_gasto') {
                    const id = intent.id;
                    if (!id) return { ok: false, text: 'Indica el ID numérico del gasto.' };
                    if (window.deleteExpense) {
                        await window.deleteExpense(parseInt(id, 10));
                        return { ok: true, text: `He lanzado la eliminación del gasto ${id}.` };
                    }
                    return { ok: false, text: 'No puedo eliminar gastos desde aquí.' };
                }
                if (intent.intent === 'eliminar_cliente') {
                    const key = (intent.nameOrId || '').trim();
                    if (!key) return { ok: false, text: 'Indica el nombre o ID del cliente que quieres eliminar.' };
                    const list = await apiFetch('get_customers') || [];
                    let match = null;
                    const asNumber = /^[0-9]+$/.test(key) ? parseInt(key, 10) : null;
                    if (asNumber != null) {
                        match = list.find(c => String(c.id) === String(asNumber));
                    }
                    if (!match) {
                        const lowered = key.toLowerCase();
                        match = list.find(c => (c.name || '').toLowerCase() === lowered)
                            || list.find(c => (c.name || '').toLowerCase().includes(lowered));
                    }
                    if (!match) return { ok: false, text: 'No encuentro un cliente con ese nombre o ID.' };
                    if (window.deleteCustomer) {
                        await window.deleteCustomer(match.id);
                        return { ok: true, text: `He lanzado la eliminación del cliente "${match.name}".` };
                    }
                    return { ok: false, text: 'No puedo eliminar clientes desde aquí.' };
                }
                if (intent.intent === 'proxima_cita') {
                    const data = await getDashboardAlerts();
                    const citas = (data.appointments_today || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                    if (citas.length === 0) return { ok: true, text: 'No tienes citas próximas.' };
                    const c = citas[0];
                    const fecha = (c.date || '').toString().slice(0, 10);
                    const hora = (c.date || '').toString().slice(11, 16);
                    const cliente = c.client_name || '—';
                    return { ok: true, text: `Próxima cita: ${fecha} ${hora} · ${cliente}.` };
                }
                if (intent.intent === 'factura_mas_antigua_pendiente') {
                    const data = await apiFetch('get_invoices?limit=200&offset=0') || {};
                    const list = (data.items || []).filter(i => (i.status || '').toLowerCase() === 'pending');
                    if (list.length === 0) return { ok: true, text: 'No hay facturas pendientes.' };
                    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                    const inv = list[0];
                    const fecha = inv.date ? new Date(inv.date).toLocaleDateString('es-ES') : '—';
                    return { ok: true, text: `La más antigua pendiente: ${inv.id} · ${inv.client_name || '—'} · ${fecha} · ${formatCurrency(inv.total_amount || 0)}.`, openInvoiceId: inv.id };
                }
                if (intent.intent === 'ayuda_seccion' && intent.seccion) {
                    openHelpVideo(intent.seccion);
                    return { ok: true, text: 'He abierto el vídeo de ayuda.' };
                }
                if (intent.intent === 'ayuda') {
                    return { ok: true, text: CHATBOT_WELCOME };
                }
                if (intent.intent === 'cortesia') {
                    const replies = ['De nada. ¿En qué más puedo ayudarte?', '¡Hola! Dime qué necesitas crear o consultar.', 'Perfecto. Si quieres crear algo, dilo con tus palabras.', 'Gracias a ti. ¿Algo más?'];
                    return { ok: true, text: replies[Math.floor(Math.random() * replies.length)] };
                }
                if (intent.intent === 'como_crear') {
                    const tipo = (intent.tipo || '').toLowerCase();
                    const tips = {
                        presupuesto: 'Dime: "Crea presupuesto para [nombre cliente] por [importe]€". Ej: "Crea presupuesto para María López por 500€".',
                        factura: 'Dime: "Crea factura para [nombre cliente] por [importe]€". Ej: "Crea factura para López SL por 1200€".',
                        cliente: 'Dime: "Crea cliente [nombre]" o "Registra cliente Juan Pérez, email juan@mail.com".',
                        proyecto: 'Dime: "Crear proyecto [nombre]" o "Crear proyecto Rediseño web para López SL".',
                        cita: 'Dime: "Cita mañana a las 10 para María García" o "Nueva cita con Juan el 25/03 a las 11:00".'
                    };
                    const msg = tips[tipo] || 'Puedo crear: cliente, presupuesto, factura, proyecto, cita. Di por ejemplo: "Crea presupuesto para X por 500€" o "Ayuda".';
                    if (tipo.includes('presupuesto')) openHelpVideo('presupuesto');
                    else if (tipo.includes('factura')) openHelpVideo('factura');
                    else if (tipo.includes('cliente')) openHelpVideo('clientes');
                    else if (tipo.includes('proyecto')) openHelpVideo('proyectos');
                    else if (tipo.includes('cita')) openHelpVideo('citas');
                    return { ok: true, text: msg };
                }
                if (intent.intent === 'donde_ver') {
                    const tipo = (intent.tipo || '').toLowerCase();
                    const dest = tipo.includes('factura') ? 'facturas' : tipo.includes('presupuesto') ? 'presupuestos' : tipo.includes('cliente') ? 'clientes' : tipo.includes('proyecto') ? 'proyectos' : tipo.includes('cita') ? 'citas' : '';
                    if (dest) {
                        const map = { facturas: ['section-invoices', 'nav-invoices'], presupuestos: ['section-history', 'nav-history'], clientes: ['section-customers', 'nav-customers'], proyectos: ['section-projects', 'nav-projects'], citas: ['section-appointments', 'nav-appointments'] };
                        const pair = map[dest];
                        if (pair) {
                            switchSection(pair[0], document.getElementById(pair[1]));
                            panel.classList.add('hidden');
                            if (dest.includes('factura')) openHelpVideo('factura');
                            else if (dest.includes('presupuesto') || dest.includes('historial')) openHelpVideo('presupuesto');
                            else if (dest.includes('cliente')) openHelpVideo('clientes');
                            else if (dest.includes('proyecto')) openHelpVideo('proyectos');
                            else if (dest.includes('cita') || dest.includes('agenda')) openHelpVideo('citas');
                            return { ok: true, text: `He abierto ${dest}.` };
                        }
                    }
                    return { ok: true, text: 'Puedes ir a: Facturas, Presupuestos (historial), Clientes, Proyectos o Citas. Di "Ir a facturas" o "Abre clientes".' };
                }
                if (intent.intent === 'que_es') {
                    const tipo = (intent.tipo || '').toLowerCase();
                    if (tipo.includes('presupuesto')) {
                        openHelpVideo('presupuesto');
                        return { ok: true, text: 'Un presupuesto es una oferta que envías al cliente con precio y condiciones. Si lo acepta, puedes convertirlo en factura.' };
                    }
                    if (tipo.includes('factura')) {
                        openHelpVideo('factura');
                        return { ok: true, text: 'Una factura es el documento de cobro que emites al cliente. Puedes crearla desde cero o desde un presupuesto aceptado.' };
                    }
                    return { ok: true, text: 'Puedo crear presupuestos (ofertas) y facturas (cobros). Pulsa Ayuda para más ejemplos.' };
                }
                if (intent.intent === 'cuantos' && intent.tipo) {
                    const tipo = (intent.tipo || '').toLowerCase();
                    if (tipo.includes('cliente')) { const list = await apiFetch('get_customers') || []; return { ok: true, text: `Tienes ${list.length} cliente(s).` }; }
                    if (tipo.includes('presupuesto')) { const d = await apiFetch('get_history?limit=1000&offset=0') || {}; const n = (d.items || []).length; return { ok: true, text: `Tienes ${n} presupuesto(s) en el historial.` }; }
                    if (tipo.includes('factura')) { const d = await apiFetch('get_invoices?limit=1000&offset=0') || {}; const n = (d.items || []).length; return { ok: true, text: `Tienes ${n} factura(s).` }; }
                    if (tipo.includes('proyecto')) { const list = await apiFetch('get_projects') || []; return { ok: true, text: `Tienes ${list.length} proyecto(s).` }; }
                }
                if (intent.intent === 'desconocido') {
                    return { ok: true, text: 'Pulsa Ayuda para más información.' };
                }
                return { ok: false, text: 'Pulsa Ayuda para más información.' };
            } catch (e) {
                console.error('Chatbot error:', e);
                return { ok: false, text: 'Error: ' + (e.message || 'vuelve a intentarlo.'), error: true };
            }
        }

        async function handlePendingConversationAnswer(text) {
            const raw = (text || '').trim();
            if (!pendingConversation) return null;
            const pc = pendingConversation;
            pendingConversation = null;

            if (pc.type === 'crear_cliente' && pc.step === 'ask_name') {
                const name = raw;
                const intent = { intent: 'crear_cliente', name, email: '', phone: '' };
                return await executeIntent(intent, {});
            }

            if (pc.type === 'crear_presupuesto') {
                if (pc.step === 'ask_client_and_amount') {
                    let clientName = raw;
                    let amt = parseAmount(raw);
                    const m = raw.match(/para\s+([^,]+?)(?:\s+por\s+|\s+de\s+|\s*$)/i);
                    if (m) clientName = m[1].trim();
                    return await executeIntent({ intent: 'crear_presupuesto', clientName, amount: amt }, {});
                }
                if (pc.step === 'ask_client') {
                    const clientName = raw;
                    return await executeIntent({ intent: 'crear_presupuesto', clientName, amount: pc.data.amount }, {});
                }
                if (pc.step === 'ask_amount') {
                    const amt = parseAmount(raw);
                    return await executeIntent({ intent: 'crear_presupuesto', clientName: pc.data.clientName, amount: amt }, {});
                }
            }

            if (pc.type === 'crear_factura') {
                if (pc.step === 'ask_client_and_amount') {
                    let clientName = raw;
                    let amt = parseAmount(raw);
                    const m = raw.match(/para\s+([^,]+?)(?:\s+por\s+|\s+de\s+|\s*$)/i);
                    if (m) clientName = m[1].trim();
                    return await executeIntent({ intent: 'crear_factura', clientName, amount: amt }, {});
                }
                if (pc.step === 'ask_client') {
                    const clientName = raw;
                    return await executeIntent({ intent: 'crear_factura', clientName, amount: pc.data.amount }, {});
                }
                if (pc.step === 'ask_amount') {
                    const amt = parseAmount(raw);
                    return await executeIntent({ intent: 'crear_factura', clientName: pc.data.clientName, amount: amt }, {});
                }
            }

            return await executeIntent({ intent: 'desconocido' }, {});
        }

        async function sendUserMessage(fromVoice = false) {
            const text = (inputEl.value || '').trim();
            if (!text) return;
            inputEl.value = '';
            lastUserFromVoice = !!fromVoice;
            addMessage('user', text);
            showTyping();
            let result;
            if (pendingConversation) {
                result = await handlePendingConversationAnswer(text);
            } else {
                const intent = parseIntent(text);
                result = await executeIntent(intent, {});
            }
            hideTyping();
            addMessage('bot', result.text, {
                error: !result.ok,
                openQuoteId: result.openQuoteId,
                openInvoiceId: result.openInvoiceId,
                openCustomerId: result.openCustomerId,
                openProjectId: result.openProjectId
            });
        }

        fab?.addEventListener('click', () => {
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden') && messagesEl.children.length === 0) {
                addMessage('bot', CHATBOT_WELCOME);
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
        closeBtn?.addEventListener('click', () => panel.classList.add('hidden'));
        sendBtn?.addEventListener('click', () => sendUserMessage(false));
        inputEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserMessage(false); } });
        // Voz al asistente (Web Speech API)
        (function setupChatbotVoice() {
            if (!voiceBtn || !inputEl) return;
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                voiceBtn.style.display = 'none';
                return;
            }
            let recognition = null;
            let listening = false;
            try {
                recognition = new SpeechRecognition();
                recognition.lang = 'es-ES';
                recognition.continuous = false;
                recognition.interimResults = true;
            } catch (e) {
                voiceBtn.style.display = 'none';
                return;
            }
            function setVoiceUi(on) {
                listening = on;
                voiceBtn.classList.toggle('chatbot-voice-active', on);
                const icon = voiceBtn.querySelector('i');
                if (icon && typeof lucide !== 'undefined' && lucide.createIcons) {
                    icon.setAttribute('data-lucide', on ? 'mic-off' : 'mic');
                    lucide.createIcons();
                }
            }
            recognition.onresult = (event) => {
                let finalText = '';
                for (let i = 0; i < event.results.length; i++) {
                    const res = event.results[i];
                    if (res.isFinal) finalText += res[0].transcript;
                }
                if (finalText.trim()) {
                    inputEl.value = finalText.trim();
                    sendUserMessage(true);
                }
            };
            recognition.onerror = () => { setVoiceUi(false); };
            recognition.onend = () => { setVoiceUi(false); };
            voiceBtn.addEventListener('click', () => {
                if (!recognition) return;
                try {
                    if (!listening) {
                        recognition.start();
                        setVoiceUi(true);
                        if (typeof showToast === 'function') {
                            showToast('Escuchando… habla ahora', 'info');
                        }
                    } else {
                        recognition.stop();
                        setVoiceUi(false);
                    }
                } catch (e) {
                    setVoiceUi(false);
                }
            });
        })();
        chips?.forEach(chip => {
            chip.addEventListener('click', () => {
                const cmd = chip.dataset.cmd || chip.textContent;
                if (cmd === 'Crear cliente') {
                    inputEl.value = '';
                    addMessage('bot', 'Escribe el nombre y, si quieres, email o teléfono. Ej: "María García, email maria@mail.com"');
                } else if (cmd === 'Crear presupuesto' || cmd === 'Crear factura') {
                    inputEl.value = '';
                    addMessage('bot', 'Indica cliente e importe. Ej: "Para Juan Pérez por 500€"');
                } else if (cmd === 'Crear proyecto') {
                    inputEl.value = '';
                    addMessage('bot', 'Indica nombre del proyecto y opcionalmente el cliente. Ej: "Rediseño web para López SL"');
                } else if (cmd === 'Nueva cita') {
                    inputEl.value = '';
                    addMessage('bot', 'Indica para quién, cuándo y hora. Ej: "Cita mañana a las 10 para María García"');
                } else if (cmd === 'Asignar actividad' || cmd === 'Asignar tarea') {
                    inputEl.value = '';
                    addMessage('bot', 'Indica el usuario y la tarea. Ej: "Crea una actividad a María para que cree un presupuesto" o "Asigna a Juan la tarea de revisar el contrato"');
                } else {
                    inputEl.value = cmd;
                    sendUserMessage(false);
                }
            });
        });
    })();

    boot();

    var btnScrollToTop = document.getElementById('btn-scroll-to-top');
    if (btnScrollToTop) {
        function toggleScrollToTop() {
            if (document.body.classList.contains('auth-mode')) return;
            if (window.innerWidth > 768) {
                btnScrollToTop.classList.add('hidden');
                return;
            }
            if (window.scrollY > 300) {
                btnScrollToTop.classList.remove('hidden');
            } else {
                btnScrollToTop.classList.add('hidden');
            }
        }
        window.addEventListener('scroll', toggleScrollToTop, { passive: true });
        window.addEventListener('resize', toggleScrollToTop);
        btnScrollToTop.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        toggleScrollToTop();
    }

    setTimeout(function runLucideIcons() {
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        else if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }, 400);
    setTimeout(function focusLoginIfVisible() {
        var su = document.getElementById('login-user');
        var ls = document.getElementById('login-screen');
        if (document.body.classList.contains('auth-mode') && su && ls && !ls.classList.contains('hidden')) {
            su.focus();
        }
    }, 500);
    if ('serviceWorker' in navigator) {
        const base = window.location.pathname.replace(/\/[^/]*$/, '') || '';
        navigator.serviceWorker.register((base ? base + '/' : '') + 'sw.js').catch(() => {});
    }

    var pwaInstallBanner = document.getElementById('pwa-install-banner');
    var pwaInstallBtn = document.getElementById('pwa-install-btn');
    var pwaInstallDismiss = document.getElementById('pwa-install-dismiss');
    var deferredInstallPrompt = null;
    var pwaDismissKey = 'pwa-install-dismissed';

    function showPwaInstallBanner() {
        if (!pwaInstallBanner) return;
        try {
            if (localStorage.getItem(pwaDismissKey)) {
                var t = parseInt(localStorage.getItem(pwaDismissKey), 10);
                if (t && Date.now() - t < 7 * 24 * 60 * 60 * 1000) return; // No mostrar si se cerró hace menos de 7 días
            }
        } catch (e) {}
        pwaInstallBanner.classList.remove('hidden');
    }

    function hidePwaInstallBanner() {
        if (pwaInstallBanner) pwaInstallBanner.classList.add('hidden');
        try { localStorage.setItem(pwaDismissKey, String(Date.now())); } catch (e) {}
    }

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        showPwaInstallBanner();
    });

    if (pwaInstallBtn) {
        pwaInstallBtn.addEventListener('click', function () {
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.then(function (choice) {
                deferredInstallPrompt = null;
                hidePwaInstallBanner();
                if (choice.outcome === 'accepted' && typeof showToast === 'function') {
                    showToast('La app se instalará en breve.', 'success');
                }
            });
        });
    }
    if (pwaInstallDismiss) {
        pwaInstallDismiss.addEventListener('click', hidePwaInstallBanner);
    }

    function tryShowPwaInstall() {
        if (deferredInstallPrompt) {
            try { localStorage.removeItem(pwaDismissKey); } catch (e) {}
            // Abrir directamente el diálogo nativo de instalación (sin pasar por menú Chrome/Edge)
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.then(function (choice) {
                deferredInstallPrompt = null;
                if (pwaInstallBanner) pwaInstallBanner.classList.add('hidden');
                if (choice.outcome === 'accepted' && typeof showToast === 'function') {
                    showToast('La app se instalará en breve.', 'success');
                }
            });
        } else {
            if (typeof showToast === 'function') showToast('La instalación no está disponible en este momento.', 'info');
        }
    }

    var navPwaInstall = document.getElementById('nav-pwa-install');
    if (navPwaInstall) navPwaInstall.addEventListener('click', function (e) { e.preventDefault(); tryShowPwaInstall(); });

    window.addEventListener('appinstalled', function () {
        deferredInstallPrompt = null;
        hidePwaInstallBanner();
    });
});

// app.js - Versión Blindada (Sustituye a script.js)

// --- Versión del script (actualiza este valor cuando subas cambios) ---
const APP_JS_VERSION = '6';
console.log('PRESUP – app.js versión:', APP_JS_VERSION);

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

    // --- DOM ---
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    const loginUser = document.getElementById('login-user');
    const loginPass = document.getElementById('login-pass');
    const btnLogin = document.getElementById('btn-login');
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
    const downloadBtn = document.getElementById('btn-download');
    const saveBtn = document.getElementById('btn-save');
    const duplicateBtn = document.getElementById('btn-duplicate');
    const exportEinvoiceBtn = document.getElementById('btn-export-einvoice');
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
    const navCalendar = document.getElementById('nav-calendar');
    const navCustomers = document.getElementById('nav-customers');
    const navCatalog = document.getElementById('nav-catalog');
    const navExpenses = document.getElementById('nav-expenses');
    const navLeads = document.getElementById('nav-leads');
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
    const quickNewExpenseBtn = document.getElementById('btn-quick-new-expense');
    const quickNewApptBtn = document.getElementById('btn-quick-new-appt');
    const previewToggleBtn = document.getElementById('btn-toggle-preview');
    const editorLayout = document.querySelector('.editor-layout');
    const historyStatusFilter = document.getElementById('history-status-filter');
    const invoicesStatusFilter = document.getElementById('invoices-status-filter');
    const processRecurringInvoicesBtn = document.getElementById('btn-process-recurring-invoices');
    const copySummaryBtn = document.getElementById('btn-copy-summary');

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

        // Construir URL correctamente: api.php?action=get_quote&id=XXX&t=timestamp
        const url = `api.php?action=${encodeURIComponent(baseAction)}${extraQuery ? `&${extraQuery}` : ''}&t=${Date.now()}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Timeout de 15 segundos
        
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                // No reintentar automáticamente - dejar que el usuario decida
                if (res.status === 508) {
                    showToast('508 Loop: revisa la URL (¿usas /presup/?) y el .htaccess.', 'error');
                    throw new Error('508 Loop Detected: comprueba que entras por la URL correcta de la app (ej. https://tu-dominio.com/presup/) y que no haya redirecciones que afecten a api.php');
                }
                // Log para debug
                console.error(`Error HTTP ${res.status} para:`, baseAction, extraQuery ? `con query: ${extraQuery}` : '');
                throw new Error(`Error HTTP: ${res.status}`);
            }
            
            // Verificamos si es JSON antes de parsear
            const text = await res.text();
            if (!text || text.trim() === '') {
                console.error("Respuesta vacía del servidor para:", baseAction, extraQuery ? `query: ${extraQuery}` : 'sin query', "URL completa:", url);
                throw new Error("El servidor devolvió una respuesta vacía. Verifica que el presupuesto exista.");
            }
            
            try {
                const parsed = JSON.parse(text);
                // Si la respuesta es un objeto con error, lanzar excepción
                if (parsed && parsed.error) {
                    throw new Error(parsed.error);
                }
                return parsed;
            } catch (e) {
                // Si ya es un Error con mensaje, relanzarlo
                if (e instanceof Error && e.message) {
                    throw e;
                }
                if (res.status === 508 || (text && (text.includes('<!DOCTYPE') || text.includes('<html')))) {
                    const hint = 'Si la app está en un subdirectorio (ej. /presup/), abre https://tu-dominio.com/presup/ y revisa el .htaccess en la raíz del sitio.';
                    console.error('508 o respuesta HTML:', hint);
                    throw new Error('Servidor sobrecargado o URL incorrecta (508 Loop). ' + hint);
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

    // --- BOOT ---
    async function boot() {
        const isLight = localStorage.getItem('theme') === 'light';
        if (isLight) document.body.classList.add('light-theme');
        const loginThemeIcon = document.getElementById('login-theme-icon');
        if (loginThemeIcon) {
            loginThemeIcon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
            if (typeof lucide !== 'undefined') requestAnimationFrame(() => lucide.createIcons());
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
        document.getElementById('chatbot-wrap')?.classList.remove('hidden');
        userAvatar.textContent = user.username.substring(0, 2).toUpperCase();
        if (user.role === 'admin') document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        resetEditor();
        requestAnimationFrame(() => {
            loadDashboard();
            switchSection('section-dashboard', navDashboard);
        });
        requestAnimationFrame(() => { fetchAndShowDashboardAlerts(); });
        if (window._appointmentReminderInterval) clearInterval(window._appointmentReminderInterval);
        window._appointmentReminderInterval = setInterval(checkAppointmentReminders, 30 * 1000);
        setTimeout(checkAppointmentReminders, 12 * 1000);
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            requestAnimationFrame(() => { lucide.createIcons(); });
            setTimeout(() => { lucide.createIcons(); }, 150);
        } else if (window.lucide && window.lucide.createIcons) {
            requestAnimationFrame(() => { window.lucide.createIcons(); });
            setTimeout(() => { window.lucide.createIcons(); }, 150);
        }
    }

    const appointmentRemindersShown = new Set();
    const REMINDER_WINDOW_MS = 50 * 1000;

    async function checkAppointmentReminders() {
        if (!currentUser) return;
        const settings = getCachedData('settings');
        if (settings && (settings.alerts_enabled === 0 || settings.alerts_enabled === '0')) return;
        if (settings && (settings.appointment_reminders_enabled === 0 || settings.appointment_reminders_enabled === '0')) return;
        try {
            const data = await apiFetch('get_dashboard_alerts');
            const list = data && data.appointments_today ? data.appointments_today : [];
            const now = Date.now();
            for (const a of list) {
                const dateStr = (a.date || '').toString();
                if (!dateStr) continue;
                const aptTime = new Date(dateStr).getTime();
                const timeLabel = dateStr.slice(11, 16);
                const client = (a.client_name || 'Cita').replace(/</g, '&lt;');
                const key5 = (a.id || dateStr) + '-5';
                const key1 = (a.id || dateStr) + '-1';
                if (now >= aptTime - 5 * 60 * 1000 && now < aptTime - 5 * 60 * 1000 + REMINDER_WINDOW_MS && !appointmentRemindersShown.has(key5)) {
                    appointmentRemindersShown.add(key5);
                    showToast('⏰ Cita en 5 minutos: ' + (a.client_name || 'Cita') + ' a las ' + timeLabel, 'info');
                }
                if (now >= aptTime - 1 * 60 * 1000 && now < aptTime - 1 * 60 * 1000 + REMINDER_WINDOW_MS && !appointmentRemindersShown.has(key1)) {
                    appointmentRemindersShown.add(key1);
                    showToast('⏰ Cita en 1 minuto: ' + (a.client_name || 'Cita') + ' a las ' + timeLabel, 'info');
                }
            }
        } catch (e) { }
    }

    async function fetchAndShowDashboardAlerts() {
        try {
            const settings = getCachedData('settings');
            if (settings && (settings.alerts_enabled === 0 || settings.alerts_enabled === '0')) return;
            const data = await apiFetch('get_dashboard_alerts');
            const hasAppointments = (data.appointments_today && data.appointments_today.length) > 0;
            const hasQuotes = (data.draft_quotes && data.draft_quotes.length) > 0;
            const hasInvoices = (data.pending_invoices && data.pending_invoices.length) > 0;
            const hasSentNoResponse = (data.sent_quotes_no_response && data.sent_quotes_no_response.length) > 0;
            const hasMessages = (data.messages && data.messages.length) > 0;
            if (!hasAppointments && !hasQuotes && !hasInvoices && !hasSentNoResponse && !hasMessages) return;
            const body = document.getElementById('dashboard-alerts-body');
            const modal = document.getElementById('dashboard-alerts-modal');
            if (!body || !modal) return;
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
            body.innerHTML = parts.join('');
            modal.classList.remove('hidden');
            window._dashboardAlertsMessages = (data.messages || []).map(m => m.id);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {}
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
                    await fetch('api.php?action=mark_message_read&t=' + Date.now(), { method: 'POST', body: fd, credentials: 'same-origin' });
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
            const res = await fetch(`api.php?t=${Date.now()}`, { method: 'POST', body: fd, credentials: 'same-origin' });
            const text = await res.text();
            let data = null;
            try {
                data = text ? JSON.parse(text) : {};
            } catch (_) {
                console.error('Respuesta no JSON:', text.slice(0, 200));
                showToast('El servidor devolvió un error. Abre la app desde http://localhost/presup/', 'error');
                return;
            }
            if (data.status === 'success') {
                location.reload();
            } else {
                loginError.classList.remove('hidden');
                loginError.textContent = data.message || 'Usuario o contraseña incorrectos';
                showToast(data.message || 'Credenciales incorrectas', 'error');
            }
        } catch (e) {
            console.error('Error login:', e);
            showToast('Error de conexión. ¿Está Apache y MySQL encendido? Abre desde http://localhost/presup/', 'error');
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
            const res = await fetch('api.php', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.status === 'success') {
                if (data.reset_link && resetRequestMsg) {
                    resetRequestMsg.textContent = 'Enlace generado. Cópialo y ábrelo en este navegador (o envíalo por email al usuario): ' + data.reset_link;
                    resetRequestMsg.classList.remove('hidden');
                } else {
                    resetRequestMsg.textContent = data.message || 'Si el usuario existe, recibirás instrucciones.';
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
            const res = await fetch('api.php', { method: 'POST', body: fd });
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
                const res = await fetch(`api.php?action=get_quote_public&id=${encodeURIComponent(acceptQuoteId)}&token=${encodeURIComponent(acceptQuoteToken)}`);
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
                        const r = await fetch('api.php', { method: 'POST', body: fd });
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
        
        // Ocultar historial de cambios al resetear
        const auditCard = document.getElementById('audit-log-card');
        if (auditCard) auditCard.style.display = 'none';
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
            const logoUrl = (sett && sett.document_logo_url && String(sett.document_logo_url).trim()) ? String(sett.document_logo_url).trim() : 'logo.png';
            previewLogoEl.src = logoUrl;
        }
        document.getElementById('preview-company-name').textContent = companyData.name;
        document.getElementById('preview-company-details').innerHTML = `${(companyData.address || '').replace(/\n/g, '<br>')}<br>CIF: ${companyData.cif}`;
        previewItemsBody.innerHTML = '';
        items.forEach(i => {
            const tr = document.createElement('tr');
            const imgSrc = itemImageSrc(i.image_url);
            const img = i.image_url ? `<img src="${imgSrc.replace(/"/g, '&quot;')}" style="width:30px;height:30px;object-fit:cover;margin-right:5px;vertical-align:middle" loading="lazy" onerror="this.style.display='none'">` : '';
            tr.innerHTML = `<td>${img}${i.description}</td><td>${i.quantity}</td><td>${formatCurrency(i.price)}</td><td>${i.tax}%</td><td>${formatCurrency(i.quantity * i.price)}</td>`;
            previewItemsBody.appendChild(tr);
        });
        const sub = items.reduce((a, b) => a + (b.quantity * b.price), 0);
        const tax = items.reduce((a, b) => a + (b.quantity * b.price * (b.tax / 100)), 0);
        document.getElementById('preview-subtotal').textContent = formatCurrency(sub);
        document.getElementById('preview-tax').textContent = formatCurrency(tax);
        document.getElementById('preview-total').textContent = formatCurrency(sub + tax);

        // Actualizar notas en la vista previa
        const notesContainer = document.getElementById('preview-notes-container');
        const notesText = document.getElementById('preview-notes-text');
        if (notesContainer && notesText) {
            const value = (quoteNotesInput && quoteNotesInput.value) ? quoteNotesInput.value.trim() : '';
            notesText.textContent = value;
            // Ocultar el bloque de notas si está vacío
            notesContainer.style.display = value ? 'block' : 'none';
        }

        const isInvoice = currentQuoteId && currentQuoteId.startsWith('FAC-');
        const lang = (getCachedData('settings') && getCachedData('settings').document_language === 'en') ? 'en' : 'es';
        const docTitle = isInvoice ? (lang === 'en' ? 'INVOICE' : 'FACTURA') : (lang === 'en' ? 'QUOTE' : 'PRESUPUESTO');
        document.querySelector('.quote-meta h2').textContent = docTitle;
        document.getElementById('preview-quote-id').textContent = currentQuoteId || 'NUEVO';
        // Etiquetas idioma
        const labels = lang === 'en' ? { no: 'No.', date: 'Date', para: 'To', desc: 'Description', qty: 'Qty', price: 'Price', vat: 'VAT', total: 'Total', subtotal: 'Subtotal', notes: 'Notes', signature: 'Client signature:', validity: 'Quote valid for 15 days.', thanks: 'Thank you for your trust.', validUntil: 'Valid until:' } : { no: 'Nº', date: 'Fecha', para: 'PARA:', desc: 'Descripción', qty: 'Cant.', price: 'Precio', vat: 'IVA', total: 'TOTAL', subtotal: 'Subtotal', notes: 'Notas:', signature: 'Firma del cliente:', validity: 'Validez del presupuesto: 15 días.', thanks: 'Gracias por su confianza.', validUntil: 'Válido hasta:' };
        const meta = document.querySelector('.quote-meta');
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
        if (ths.length >= 5) { ths[0].textContent = labels.desc; ths[1].textContent = labels.qty; ths[2].textContent = labels.price; ths[3].textContent = labels.vat; ths[4].textContent = labels.total; }
        const sumLines = document.querySelectorAll('.preview-summary .summary-line');
        if (sumLines.length >= 3) {
            if (sumLines[0].querySelector('span')) sumLines[0].querySelector('span').textContent = labels.subtotal;
            if (sumLines[1].querySelector('span')) sumLines[1].querySelector('span').textContent = labels.vat;
            if (sumLines[2].querySelector('span')) sumLines[2].querySelector('span').textContent = labels.total;
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
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
        `;
        // Restaurar valor si es compatible o poner por defecto
        if ([...statusSelect.options].some(o => o.value === currentVal)) {
            statusSelect.value = currentVal;
        }

        // Aplicar posible fondo de documento
        applyDocTheme();
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
                const res = await fetch(`api.php?action=upload_item_image&t=${Date.now()}`, {
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
            const isInvoice = currentQuoteId && String(currentQuoteId).startsWith('FAC-');
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
            'section-calendar': 'calendario',
            'section-catalog': 'catálogo',
            'section-expenses': 'gastos',
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
        let html = dayLabels.map(l => `<div style="padding:0.25rem;text-align:center;font-weight:600;color:var(--text-muted);">${l}</div>`).join('');
        for (let i = 0; i < rows * 7; i++) {
            if (i < startPad) {
                html += '<div style="min-height:52px;padding:4px;background:var(--bg-sub);border-radius:4px;"></div>';
                continue;
            }
            const dayNum = i - startPad + 1;
            if (dayNum > daysInMonth) {
                html += '<div style="min-height:52px;padding:4px;background:var(--bg-sub);border-radius:4px;"></div>';
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
            html += `<div class="calendar-view-day-cell" data-date="${dateStr}" style="min-height:52px;padding:4px;background:${isToday ? 'rgba(59,130,246,0.15)' : 'var(--bg-sub)'};border-radius:4px;cursor:pointer;border:1px solid var(--border);">
                <div style="font-weight:600;font-size:0.85rem;">${dayNum}</div>
                ${count ? `<div style="font-size:0.7rem;color:var(--accent);">${apptsOnDay.length ? '📅 ' + apptsOnDay.length : ''} ${invsOnDay.length ? '📄 ' + invsOnDay.length : ''}</div>` : ''}
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
            switchSection('section-catalog', navCatalog);
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
                    <div style="flex:1"><strong>${(i.description || '').replace(/</g, '&lt;')}</strong><br><small>${formatCurrency(i.price)} + ${i.tax}%</small></div>
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
                items.push({ id: Date.now(), description: item.description, image_url: item.image_url, quantity: 1, price: parseFloat(item.price), tax: parseFloat(item.tax) });
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
        const editIdEl = document.getElementById('catalog-edit-id');
        const btnEl = document.getElementById('btn-add-catalog');
        if (descEl) descEl.value = item.description || '';
        if (longEl) longEl.value = item.long_description || '';
        if (priceEl) priceEl.value = item.price != null ? item.price : '';
        if (taxEl) taxEl.value = item.tax != null ? item.tax : 21;
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
                        status === 'accepted' ? 'Aceptado' :
                        status === 'rejected' ? 'Rechazado' : status;
                    const statusColor =
                        status === 'accepted'
                            ? 'background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.3);'
                            : status === 'sent'
                                ? 'background:rgba(59,130,246,0.1);color:#3b82f6;border-color:rgba(59,130,246,0.3);'
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
                    const nextDateStr = (i.next_date && isRecurring) ? new Date(i.next_date).toLocaleDateString('es-ES') : '';
                    const recurringBadge = isRecurring
                        ? `<span style="display:inline-block;margin-left:0.5rem;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.7rem;background:rgba(59,130,246,0.08);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);">
                                Recurrente${nextDateStr ? ' · Próx. ' + nextDateStr : ''}
                           </span>`
                        : '';
                        return `
                        <div class="history-item">
                            <div style="flex:1">
                                <strong>${(i.client_name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong>${userBadge}${recurringBadge}
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
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } catch (e) {
            console.error('Error cargando proyecto:', e);
            showToast('Error al cargar proyecto', 'error');
        }
    };

    window.toggleProjectTask = async function(projectId, taskId, checked) {
        try {
            const form = new FormData();
            form.append('project_id', projectId);
            form.append('task_id', taskId);
            form.append('title', document.querySelector(`#project-tasks-list [data-task-id="${taskId}"]`)?.querySelector('span')?.textContent || 'Tarea');
            form.append('completed', checked ? 1 : 0);
            await apiFetch('save_project_task', { method: 'POST', body: form });
            const taskEl = document.querySelector(`#project-tasks-list [data-task-id="${taskId}"]`);
            if (taskEl) {
                const span = taskEl.querySelector('span');
                if (span) span.style.textDecoration = checked ? 'line-through' : 'none';
                if (span) span.style.color = checked ? 'var(--text-muted)' : '';
            }
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
                const label = (q.client_name || 'Sin cliente') + ' · ' + (q.id || '') + (q.status ? ' · ' + (q.status === 'accepted' ? 'Aceptado' : q.status) : '');
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
    document.getElementById('btn-contract-download-pdf')?.addEventListener('click', async () => {
        updateContractPreview();
        const el = document.getElementById('contract-preview');
        if (!el || typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
            showToast('Cargando librerías PDF...', 'info');
            return;
        }
        showToast('Generando PDF...', 'info');
        try {
            const canvas = await html2canvas(el, { scale: 2, useCORS: true });
            const img = canvas.toDataURL('image/png');
            const pdf = new window.jspdf.js({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const w = pdf.internal.pageSize.getWidth();
            const h = (canvas.height * w) / canvas.width;
            pdf.addImage(img, 'PNG', 0, 0, w, Math.min(h, 297));
            if (h > 297) {
                pdf.addPage();
                pdf.addImage(img, 'PNG', 0, -(297 * canvas.width / canvas.height), w, h);
            }
            const id = document.getElementById('contract-id')?.value || 'contrato';
            pdf.save('Contrato_' + id + '.pdf');
            showToast('PDF descargado', 'success');
        } catch (e) {
            showToast('Error al generar PDF', 'error');
        }
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

    document.getElementById('btn-projects-go-activities')?.addEventListener('click', () => { navActivities.click(); });

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
        try {
            const list = document.getElementById('customers-birthdays-list');
            const card = document.getElementById('customers-birthdays-card');
            if (!list || !card) return;
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
        } catch (e) { card.style.display = 'none'; }
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
                    const label = status === 'accepted' ? 'Aceptado' : status === 'sent' ? 'Enviado' : status === 'rejected' ? 'Rechazado' : 'Borrador';
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

    // Leads: guardar en Clientes desde el formulario de la sección Leads
    document.getElementById('btn-lead-add-customer').addEventListener('click', async () => {
        const nameEl = document.getElementById('lead-cust-name');
        const emailEl = document.getElementById('lead-cust-email');
        const phoneEl = document.getElementById('lead-cust-phone');
        const addressEl = document.getElementById('lead-cust-address');
        const taxIdEl = document.getElementById('lead-cust-tax-id');
        const name = (nameEl && nameEl.value) ? nameEl.value.trim() : '';
        const email = (emailEl && emailEl.value) ? emailEl.value.trim() : '';
        if (!name) {
            showToast('Indica al menos el nombre', 'error');
            return;
        }
        const fd = new FormData();
        fd.append('name', name);
        fd.append('email', email);
        fd.append('phone', (phoneEl && phoneEl.value) ? phoneEl.value.trim() : '');
        fd.append('address', (addressEl && addressEl.value) ? addressEl.value.trim() : '');
        fd.append('tax_id', (taxIdEl && taxIdEl.value) ? taxIdEl.value.trim() : '');
        fd.append('lead_source', 'Vendomia');
        try {
            await apiFetch('save_customer', { method: 'POST', body: fd });
            showToast('Contacto añadido a Clientes', 'success');
            invalidateCache('customers');
            if (nameEl) nameEl.value = '';
            if (emailEl) emailEl.value = '';
            if (phoneEl) phoneEl.value = '';
            if (addressEl) addressEl.value = '';
            if (taxIdEl) taxIdEl.value = '';
        } catch (e) {
            showToast(e.message || 'Error al guardar', 'error');
        }
    });

    // Si el iframe de Vendomia envía postMessage al enviar el formulario, guardar también en Clientes
    window.addEventListener('message', (event) => {
        if (event.origin !== 'https://vendomia.app') return;
        const d = event.data;
        if (!d || typeof d !== 'object') return;
        const type = (d.type || d.event || '').toLowerCase();
        if (type.indexOf('submit') === -1 && type.indexOf('lead') === -1 && type.indexOf('form') === -1) return;
        const data = d.data || d.payload || d.form || d;
        const name = (data.name || data.nombre || data.fullName || '').trim();
        const email = (data.email || data.correo || data.mail || '').trim();
        if (!name) return;
        const fd = new FormData();
        fd.append('name', name);
        fd.append('email', email);
        fd.append('phone', (data.phone || data.telefono || data.tel || '').trim());
        fd.append('address', (data.address || data.direccion || '').trim());
        fd.append('tax_id', (data.tax_id || data.nif || data.cif || data.taxId || '').trim());
        fd.append('lead_source', 'Vendomia');
        apiFetch('save_customer', { method: 'POST', body: fd })
            .then(() => {
                showToast('Lead añadido a Clientes automáticamente', 'success');
                invalidateCache('customers');
            })
            .catch(() => {});
    });

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
            'PRODID:-//PRESUNAVEGATEL//Cita//ES',
            'BEGIN:VEVENT',
            'UID:presup-cita-' + id + '@presunavegatel',
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

    let calendarState = { year: new Date().getFullYear(), month: new Date().getMonth(), selectedDate: null };
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
        cells.forEach(c => {
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
    }

    window.loadInvoice = async (id) => {
        try {
            const i = await apiFetch(`get_invoice?id=${id}`);
            if (i) {
                currentQuoteId = i.id;
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
                setRecurringInvoiceUI(true, {
                    enabled: isRecurring,
                    frequency: freq,
                    next_date: nextDate
                });
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
                
                switchSection('section-editor', navEditor);
            }
            updatePayButtonVisibility();
        } catch (e) { }
    };

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
                    tax: parseFloat(i.tax_percent) || companyData.defaultTax
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
            const res = await fetch(`api.php?action=save_invoice&t=${Date.now()}`, {
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
        fd.append('action', action);
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
                    tax: parseFloat(i.tax_percent) || companyData.defaultTax
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
            const isInvoice = (currentQuoteId && currentQuoteId.startsWith('FAC-'));
            const recurring = isInvoice && recurringInvoiceEnabledInput ? {
                enabled: !!recurringInvoiceEnabledInput.checked,
                frequency: recurringInvoiceFrequencyInput ? recurringInvoiceFrequencyInput.value : null,
                next_date: (recurringInvoiceNextDateInput && recurringInvoiceNextDateInput.value) ? recurringInvoiceNextDateInput.value : null
            } : null;
            const action = isInvoice ? 'save_invoice' : 'save_quote';
            const res = await fetch(`api.php?action=${action}&t=${Date.now()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isInvoice ? { ...quote, quote_id: null, recurring } : quote)
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

    // Cambiar estado y detectar "Aceptado" para generar factura
    const statusSelector = document.getElementById('quote-status');
    if (statusSelector) {
        statusSelector.addEventListener('change', async (e) => {
            console.log('Estado cambiado a:', e.target.value, 'Quote ID:', currentQuoteId);
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
            const res = await fetch(`api.php?action=save_invoice&t=${Date.now()}`, {
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
        const isInvoice = currentQuoteId && currentQuoteId.startsWith('FAC-');
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
                // No incluir el botón "Copiar resumen" en el PDF
                ignoreElements: (el) => el && el.id === 'btn-copy-summary'
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
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            removeContainer: true,
            imageTimeout: 5000,
            // No incluir el botón "Copiar resumen" en PDFs generados para email
            ignoreElements: (el) => el && el.id === 'btn-copy-summary'
        });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        return pdf.output('blob');
    }

    downloadBtn.addEventListener('click', downloadPDF);

    // --- ENVIAR POR EMAIL ---
    const modalEmailOverlay = document.getElementById('modal-email-overlay');
    const modalEmailTo = document.getElementById('modal-email-to');
    const modalEmailSubject = document.getElementById('modal-email-subject');
    const modalEmailBody = document.getElementById('modal-email-body');
    document.getElementById('btn-send-email').addEventListener('click', () => {
        modalEmailTo.value = clientEmailInput.value.trim() || '';
        const tipo = (currentQuoteId && currentQuoteId.startsWith('FAC-')) ? 'Factura' : 'Presupuesto';
        const id = currentQuoteId || '';
        const settings = getCachedData('settings') || {};
        const subjectTemplate = (settings.document_email_subject || '').trim() || (tipo + ' ' + id);
        const bodyTemplate = (settings.document_email_body || '').trim() || 'Adjunto encontrará el documento. Si tiene alguna duda, no dude en contactarnos.';
        modalEmailSubject.value = subjectTemplate.replace(/\{\{tipo\}\}/g, tipo).replace(/\{\{id\}\}/g, id);
        modalEmailBody.value = bodyTemplate.replace(/\{\{tipo\}\}/g, tipo).replace(/\{\{id\}\}/g, id);
        modalEmailOverlay.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
        setTimeout(function () { if (modalEmailTo) modalEmailTo.focus(); }, 100);
    });
    document.getElementById('modal-email-cancel').addEventListener('click', () => modalEmailOverlay.classList.add('hidden'));
    modalEmailOverlay.addEventListener('click', function (e) {
        if (e.target === modalEmailOverlay) modalEmailOverlay.classList.add('hidden');
    });
    document.addEventListener('keydown', function emailModalEscape(e) {
        if (e.key === 'Escape' && modalEmailOverlay && !modalEmailOverlay.classList.contains('hidden')) {
            modalEmailOverlay.classList.add('hidden');
        }
    });
    document.getElementById('modal-email-send').addEventListener('click', async () => {
        const to = modalEmailTo.value.trim();
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            showToast('Indica un email de destino válido', 'error');
            return;
        }
        try {
            showToast('Generando PDF y enviando...', 'info');
            const blob = await getPDFBlob();
            const reader = new FileReader();
            const base64 = await new Promise((res, rej) => {
                reader.onloadend = () => res(String(reader.result).split(',')[1] || '');
                reader.onerror = rej;
                reader.readAsDataURL(blob);
            });
            const isInvoice = currentQuoteId && currentQuoteId.startsWith('FAC-');
            const filename = (isInvoice ? 'Factura' : 'Presupuesto') + '_' + (currentQuoteId || 'nuevo') + '.pdf';
            const fd = new FormData();
            fd.append('to', to);
            fd.append('subject', modalEmailSubject.value);
            fd.append('body', modalEmailBody.value);
            fd.append('pdf_base64', base64);
            fd.append('pdf_filename', filename);
            const result = await apiFetch('send_email', { method: 'POST', body: fd });
            if (result && result.status === 'success') {
                modalEmailOverlay.classList.add('hidden');
                showToast('Email enviado correctamente', 'success');
            } else {
                showToast(result?.message || 'No se pudo enviar el email', 'error');
            }
        } catch (e) {
            console.error('Error enviando email:', e);
            showToast(e.message || 'Error al enviar el email', 'error');
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
            const obj = await apiFetch('get_accept_quote_link?id=' + encodeURIComponent(currentQuoteId));
            if (obj && obj.status === 'success' && obj.url) {
                await navigator.clipboard.writeText(obj.url);
                showToast('Enlace copiado. Envíalo al cliente para que firme y acepte el presupuesto.', 'success');
            } else {
                showToast((obj && obj.message) || 'No se pudo generar el enlace', 'error');
            }
        } catch (e) {
            showToast('Error al obtener el enlace', 'error');
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

    navLeads.addEventListener('click', () => switchSection('section-leads', navLeads));

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
            loadExpenses();
            showToast('Gasto eliminado', 'success');
        } catch (e) { }
    };

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
                const overdue = await apiFetch('get_overdue_invoices?days=30');
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

    function updateDocumentLogoPreview(url) {
        const wrap = document.getElementById('settings-document-logo-preview');
        const img = document.getElementById('settings-document-logo-img');
        if (!wrap || !img) return;
        const u = (url || '').trim();
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
        updateDocumentLogoPreview(this.value);
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
                document.getElementById('settings-company-email').value = settings.email || '';
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
                const docEmailSubjEl = document.getElementById('settings-document-email-subject');
                if (docEmailSubjEl) docEmailSubjEl.value = settings.document_email_subject || '';
                const docEmailBodyEl = document.getElementById('settings-document-email-body');
                if (docEmailBodyEl) docEmailBodyEl.value = settings.document_email_body || '';
                const documentLogoUrlEl = document.getElementById('settings-document-logo-url');
                if (documentLogoUrlEl) {
                    documentLogoUrlEl.value = settings.document_logo_url || '';
                    updateDocumentLogoPreview(settings.document_logo_url || '');
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
        try {
            await apiFetch('save_settings', { method: 'POST', body: fd });
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
            setCachedData('settings', saved);
            companyData = { ...saved, defaultTax: saved.default_tax };
            updateCompanyDisplay();
            updatePreview();
        } catch (e) { showToast(e.message || 'Error al guardar configuración', 'error'); }
    });

    // Exportar CSV y backup
    function downloadExport(type) {
        const url = `api.php?action=export_csv&type=${encodeURIComponent(type)}&t=${Date.now()}`;
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
    document.getElementById('btn-export-invoices-accounting')?.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = `api.php?action=export_invoices_accounting&t=${Date.now()}`;
        a.download = `facturas_contabilidad_${new Date().toISOString().slice(0, 10)}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Exportación para contabilidad descargada', 'success');
    });
    document.getElementById('btn-export-customers-csv')?.addEventListener('click', () => downloadExport('customers'));
    document.getElementById('btn-export-expenses-csv')?.addEventListener('click', () => downloadExport('expenses'));

    document.getElementById('btn-backup-data')?.addEventListener('click', async () => {
        try {
            showToast('Generando copia de seguridad...', 'info');
            const res = await fetch(`api.php?action=backup_data&t=${Date.now()}`, { credentials: 'same-origin' });
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
            const res = await fetch(`api.php?action=${action}&t=${Date.now()}`, { method: 'POST', body: fd, credentials: 'same-origin' });
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
                const sel = document.getElementById('admin-message-to-user');
                if (sel) {
                    try {
                        const users = await apiFetch('get_users');
                        sel.innerHTML = '<option value="">— Selecciona usuario —</option>';
                        (users || []).forEach(u => {
                            const o = document.createElement('option');
                            o.value = u.id;
                            o.textContent = (u.username || 'Usuario ' + u.id) + (u.role === 'admin' ? ' (admin)' : '');
                            sel.appendChild(o);
                        });
                    } catch (e) {}
                }
                switchSection('section-admin', navAdmin);
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        }
    }
    navAdmin.addEventListener('click', openAdminSection);

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
        const chips = document.querySelectorAll('.chatbot-chip');

        const CHATBOT_WELCOME = 'Hola. Puedo hacer mucho por ti:\n\n• Crear: cliente, presupuesto, factura, proyecto, cita, artículo del catálogo.\n• Asignar actividades o tareas: "Crea una actividad a María para que cree un presupuesto" o "Asigna a Juan la tarea de revisar el contrato". Lo verán en Actividades / Tareas.\n• Listar: clientes, presupuestos, facturas, proyectos, contratos, citas.\n• Cambiar estado: "Marca presupuesto PRE-xxx aceptado" o "Marca factura FAC-xxx pagada".\n• Navegar: "Ir a facturas", "Abre actividades", "Mis tareas".\n• Resúmenes: "Resumen del mes", "Qué tengo hoy", "Facturas pendientes".\n\nEjemplos: "Crea cliente Ana López" · "Crea una tarea a María para que cree un presupuesto" · "Ayuda".';

        function escapeChatHtml(s) {
            if (typeof s !== 'string') return '';
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

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
            div.innerHTML = `<div class="${bubbleClass}">${escapeChatHtml(text).replace(/\n/g, '<br>')}<div class="chatbot-msg-time">${time}</div>${actionsWrap}</div>`;
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

        function parseIntent(text) {
            const t = (text || '').toLowerCase().trim();
            const amount = parseAmount(text) || parseAmount(t);

            if (/^(crear?|nuevo|añadir|agregar)\s*(un?\s*)?cliente/i.test(t) || /cliente\s+(llamado?|nombre|con nombre)/i.test(t)) {
                let name = '';
                const m = t.match(/(?:cliente|nombre)\s+([^,]+?)(?:\s*,\s*|\s+email\s+|\s+teléfono|$)/i) || t.match(/(?:crear|nuevo)\s+(?:un\s*)?cliente\s+([^,]+?)(?:\s*,\s*|$)/i);
                if (m) name = m[1].replace(/\b(email|teléfono|telefono|tlf)\b.*$/i, '').trim();
                const emailM = text.match(/(?:email|e-?mail|correo)\s*[:\s]*([^\s,]+@[^\s,]+)/i);
                const phoneM = text.match(/(?:tel[ée]fono|tlf|m[óo]vil)\s*[:\s]*([0-9\s+]+)/i);
                return { intent: 'crear_cliente', name: name || null, email: emailM ? emailM[1].trim() : '', phone: phoneM ? phoneM[1].trim() : '' };
            }
            if (/^(crear?|nuevo)\s*(un?\s*)?presupuesto/i.test(t) || /presupuesto\s+para\s+/i.test(t)) {
                let clientName = '';
                const paraM = text.match(/(?:para|cliente)\s+([^p]+?)(?:\s+por\s+|\s*€|$)/i) || text.match(/(?:presupuesto)\s+([^p]+?)(?:\s+por\s+|\s*€|$)/i);
                if (paraM) clientName = paraM[1].replace(/\s+por\s+.*$/i, '').replace(/\d+(?:[.,]\d+)?\s*€?/g, '').trim();
                return { intent: 'crear_presupuesto', clientName: clientName || null, amount };
            }
            if (/^(crear?|nuevo)\s*(una?\s*)?factura/i.test(t) || /factura\s+para\s+/i.test(t)) {
                let clientName = '';
                const paraM = text.match(/(?:para|cliente)\s+([^p]+?)(?:\s+por\s+|\s*€|$)/i);
                if (paraM) clientName = paraM[1].replace(/\s+por\s+.*$/i, '').replace(/\d+(?:[.,]\d+)?\s*€?/g, '').trim();
                return { intent: 'crear_factura', clientName: clientName || null, amount };
            }
            if (/^(lista?r?|ver|mostrar|cuántos?)\s*(los?\s*)?(clientes?)/i.test(t)) return { intent: 'listar_clientes' };
            if (/^(lista?r?|ver|mostrar)\s*(los?\s*)?(presupuestos?)/i.test(t)) return { intent: 'listar_presupuestos' };
            if (/^(lista?r?|ver|mostrar)\s*(las?\s*)?(facturas?)/i.test(t)) return { intent: 'listar_facturas' };
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
            if (/^(lista?r?|ver|mostrar)\s*(los?\s*)?(proyectos?)/i.test(t)) return { intent: 'listar_proyectos' };
            if (/^(lista?r?|ver|mostrar)\s*(los?\s*)?(contratos?)/i.test(t)) return { intent: 'listar_contratos' };
            if (/^(lista?r?|ver|mostrar)\s*(las?\s*)?(citas?)/i.test(t)) return { intent: 'listar_citas' };
            if (/^(lista?r?|ver)\s*(el\s+)?catálogo/i.test(t)) return { intent: 'listar_catalogo' };
            if (/^(ir\s+a|abre?|abrir|ve\s+a|navegar\s+a)\s*(la\s+)?(facturas?|presupuestos?|historial|clientes?|proyectos?|contratos?|citas?|agenda|dashboard|inicio)/i.test(t)) {
                const m = text.match(/(?:ir\s+a|abre?|abrir|ve\s+a|navegar\s+a)\s*(?:la\s+)?(facturas?|presupuestos?|historial|clientes?|proyectos?|contratos?|citas?|agenda|dashboard|inicio)/i);
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
            if (/^(resumen|este mes|cuántos? presupuestos|cuántas? facturas)/i.test(t)) return { intent: 'resumen_mes' };
            if (/^(comparativa|mes pasado|vs mes anterior)/i.test(t)) return { intent: 'resumen_comparativo' };
            if (/(?:duplicar?|copiar)\s+(?:el\s+)?presupuesto\s+([A-Za-z0-9\-]+)/i.test(text)) {
                const m = text.match(/presupuesto\s+([A-Za-z0-9\-]+)/i);
                return { intent: 'duplicar_presupuesto', id: m ? m[1].trim() : null };
            }
            if (/(?:duplicar?|copiar)\s+(?:la\s+)?factura\s+([A-Za-z0-9\-]+)/i.test(text)) {
                const m = text.match(/factura\s+([A-Za-z0-9\-]+)/i);
                return { intent: 'duplicar_factura', id: m ? m[1].trim() : null };
            }
            if (/^(qué\s+tengo\s+hoy|avisos?|citas?\s+de\s+hoy|hoy)/i.test(t)) return { intent: 'avisos_hoy' };
            if (/^(facturas?\s+pendientes?|pendientes? de cobro)/i.test(t)) return { intent: 'facturas_pendientes' };
            if (/^(presupuestos?\s+enviados?|enviados?\s+sin\s+respuesta)/i.test(t)) return { intent: 'presupuestos_enviados' };
            if (/^(edita?r?|abrir|ver)\s*(el\s*)?(presupuesto|factura)\s+([A-Za-z0-9\-]+)/i.test(t)) {
                const m = text.match(/(?:edita?r?|abrir|ver)\s*(?:el\s*)?(?:presupuesto|factura)\s+([A-Za-z0-9\-]+)/i);
                const tipo = /presupuesto/i.test(text) ? 'presupuesto' : 'factura';
                return { intent: tipo === 'presupuesto' ? 'abrir_presupuesto' : 'abrir_factura', id: m ? m[1].trim() : null };
            }
            if (/^(edita?r?|abrir|ver)\s*(el\s*)?proyecto\s+(\d+)/i.test(t)) {
                const m = text.match(/proyecto\s+(\d+)/i);
                return { intent: 'abrir_proyecto', id: m ? m[1].trim() : null };
            }
            if (/(?:crea?r?|asignar?|manda?r?)\s+(?:una?\s+)?(?:actividad|tarea)\s+a\s+([^\s,]+?)\s+(?:para\s+que\s+|\s+para\s+)(.+)/i.test(text)) {
                const m = text.match(/(?:crea?r?|asignar?|manda?r?)\s+(?:una?\s+)?(?:actividad|tarea)\s+a\s+([^\s,]+?)\s+(?:para\s+que\s+|\s+para\s+)(.+)/i);
                const assignee = m ? m[1].trim() : '';
                let instruction = m ? m[2].trim() : '';
                if (instruction) instruction = instruction.replace(/^que\s+/i, '').replace(/\s*\.\s*$/, '');
                return { intent: 'crear_actividad', assignee, instruction };
            }
            if (/(?:asignar?|manda?r?)\s+a\s+([^\s,]+?)\s+(?:que\s+)?(.+)/i.test(text) && !/^(ir|abre|ve|lista|ver|mostrar)/i.test(text)) {
                const m = text.match(/(?:asignar?|manda?r?)\s+a\s+([^\s,]+?)\s+(?:que\s+)?(.+)/i);
                if (m && m[2].length > 5) {
                    return { intent: 'crear_actividad', assignee: m[1].trim(), instruction: m[2].trim().replace(/\s*\.\s*$/, '') };
                }
            }
            if (/^(ayuda|qué puedes|qué sabes|comandos)/i.test(t)) return { intent: 'ayuda' };
            return { intent: 'desconocido' };
        }

        async function executeIntent(intent, entities) {
            try {
                if (intent.intent === 'crear_cliente') {
                    let name = intent.name;
                    if (!name) return { ok: false, text: 'Dime el nombre del cliente. Ej: "Crea un cliente llamado Juan Pérez, email juan@mail.com".' };
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
                        return { ok: true, text: `Cliente "${name}" creado correctamente.`, openCustomerId: id };
                    }
                    return { ok: false, text: res?.message || 'Error al crear el cliente.' };
                }

                if (intent.intent === 'crear_presupuesto') {
                    let clientName = intent.clientName;
                    if (!clientName) return { ok: false, text: 'Indica para qué cliente es el presupuesto. Ej: "Crea un presupuesto para Juan Pérez por 500€".' };
                    const amount = intent.amount;
                    if (amount == null || amount <= 0) return { ok: false, text: 'Indica el importe. Ej: "Presupuesto para María por 1200€".' };
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
                        return { ok: true, text: `Presupuesto ${quoteId} creado para ${clientName} por ${formatCurrency(amount)}.`, openQuoteId: quoteId };
                    }
                    return { ok: false, text: res?.message || 'Error al crear el presupuesto.' };
                }

                if (intent.intent === 'crear_factura') {
                    let clientName = intent.clientName;
                    if (!clientName) return { ok: false, text: 'Indica para qué cliente es la factura. Ej: "Crea una factura para López SL por 800€".' };
                    const amount = intent.amount;
                    if (amount == null || amount <= 0) return { ok: false, text: 'Indica el importe.' };
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
                if (intent.intent === 'duplicar_presupuesto' && intent.id) {
                    if (typeof window.duplicateQuote === 'function') {
                        window.duplicateQuote(intent.id);
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        panel.classList.add('hidden');
                        return { ok: true, text: 'Presupuesto duplicado. Abriendo en el editor para que lo guardes como nuevo.' };
                    }
                    return { ok: false, text: 'No se pudo duplicar.' };
                }
                if (intent.intent === 'duplicar_factura' && intent.id) {
                    if (typeof window.duplicateInvoice === 'function') {
                        window.duplicateInvoice(intent.id);
                        panel.classList.add('hidden');
                        return { ok: true, text: 'Factura duplicada. Abriendo en el editor para que la guardes como nueva.' };
                    }
                    return { ok: false, text: 'No se pudo duplicar.' };
                }
                if (intent.intent === 'abrir_presupuesto' && intent.id) {
                    if (typeof window.loadQuote === 'function') {
                        switchSection('section-editor', document.getElementById('nav-editor'));
                        await window.loadQuote(intent.id);
                        panel.classList.add('hidden');
                        return { ok: true, text: 'Abriendo el presupuesto en el editor.' };
                    }
                    return { ok: false, text: 'No se pudo abrir el presupuesto.' };
                }
                if (intent.intent === 'abrir_factura' && intent.id) {
                    if (typeof window.loadInvoice === 'function') {
                        switchSection('section-invoices', document.getElementById('nav-invoices'));
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
                        dashboard: ['section-dashboard', 'nav-dashboard'],
                        inicio: ['section-dashboard', 'nav-dashboard']
                    };
                    const key = dest.replace(/\s/g, '');
                    const pair = map[key] || map[dest];
                    if (pair) {
                        const [sectionId, navId] = pair;
                        switchSection(sectionId, document.getElementById(navId));
                        panel.classList.add('hidden');
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
                        return { ok: true, text: `Factura ${intent.id} marcada como pagada.` };
                    } catch (e) {
                        return { ok: false, text: e?.message || 'No se pudo actualizar. Comprueba el ID.' };
                    }
                }
                if (intent.intent === 'avisos_hoy') {
                    const data = await apiFetch('get_dashboard_alerts') || {};
                    const citas = data.appointments_today || [];
                    const borradores = data.draft_quotes || [];
                    const pendientes = data.pending_invoices || [];
                    const sinRespuesta = data.sent_quotes_no_response || [];
                    const mensajes = data.messages || [];
                    const parts = [];
                    if (citas.length > 0) parts.push('Citas hoy: ' + citas.length);
                    if (borradores.length > 0) parts.push('Presupuestos sin cerrar: ' + borradores.length);
                    if (pendientes.length > 0) parts.push('Facturas pendientes: ' + pendientes.length);
                    if (sinRespuesta.length > 0) parts.push('Enviados sin respuesta (7+ días): ' + sinRespuesta.length);
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
                    const data = await apiFetch('get_dashboard_alerts') || {};
                    const list = data.sent_quotes_no_response || [];
                    if (list.length === 0) return { ok: true, text: 'No hay presupuestos enviados sin respuesta (7+ días).' };
                    const lines = list.slice(0, 8).map(q => `${q.id} · ${q.client_name || '—'} · ${formatCurrency(q.total_amount || 0)}`);
                    return { ok: true, text: 'Enviados sin respuesta:\n' + lines.join('\n') };
                }
                if (intent.intent === 'abrir_proyecto' && intent.id) {
                    switchSection('section-projects', document.getElementById('nav-projects'));
                    if (window.openProjectDetail) window.openProjectDetail(parseInt(intent.id, 10));
                    panel.classList.add('hidden');
                    return { ok: true, text: 'Abriendo el proyecto.' };
                }
                if (intent.intent === 'ayuda') {
                    return { ok: true, text: CHATBOT_WELCOME };
                }
                return { ok: false, text: 'No he entendido. Escribe "Ayuda" para ver qué puedo hacer.' };
            } catch (e) {
                console.error('Chatbot error:', e);
                return { ok: false, text: 'Error: ' + (e.message || 'vuelve a intentarlo.'), error: true };
            }
        }

        async function sendUserMessage() {
            const text = (inputEl.value || '').trim();
            if (!text) return;
            inputEl.value = '';
            addMessage('user', text);
            showTyping();
            const intent = parseIntent(text);
            const result = await executeIntent(intent, {});
            hideTyping();
            addMessage('bot', result.text, {
                error: !result.ok,
                openQuoteId: result.openQuoteId,
                openInvoiceId: result.openInvoiceId,
                openCustomerId: result.openCustomerId
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
        sendBtn?.addEventListener('click', sendUserMessage);
        inputEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserMessage(); } });
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
                    sendUserMessage();
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
});

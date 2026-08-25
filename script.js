const firebaseConfig = {
    apiKey: "AIzaSyBsNwt33Z3XOyVmBAY6kqlDmLXTwjM-vYY",
    authDomain: "kurier-app-6ac5a.firebaseapp.com",
    projectId: "kurier-app-6ac5a",
    storageBucket: "kurier-app-6ac5a.firebasestorage.app",
    messagingSenderId: "439457783683",
    appId: "1:439457783683:web:57a9353f58e2c42dd9a0b6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
db.enablePersistence().catch(err => console.error("Firestore persistence error:", err));

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const appContent = document.getElementById('app-content');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    let isPrivacyMode = false;
    let activityLogs = [];

    // --- SYSTEM LOGÓW ---
    function logActivity(text) {
        const time = new Date().toLocaleTimeString();
        activityLogs.unshift(`[${time}] ${text}`);
        if (activityLogs.length > 20) activityLogs.pop();
        renderActivityLogs();
    }

    function renderActivityLogs() {
        const list = document.getElementById('activity-log-list');
        if (list) {
            list.innerHTML = activityLogs.map(log => `<li>${log}</li>`).join('');
        }
    }

    // --- MONITOROWANIE SIECI & FIREBASE ---
    function updateOnlineStatus() {
        const statusEl = document.getElementById('cloud-status');
        if (!statusEl) return;
        if (navigator.onLine) {
            statusEl.textContent = 'Online';
            statusEl.className = 'status-badge online';
        } else {
            statusEl.textContent = 'Offline (Tryb lokalny)';
            statusEl.className = 'status-badge offline';
        }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // --- PRZEŁĄCZANIE ZAKŁADEK Z ANIMACJĄ ---
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => {
                t.classList.remove('active', 'fade-in');
            });
            btn.classList.add('active');
            const targetTab = document.getElementById(btn.dataset.tab);
            if (targetTab) {
                targetTab.classList.add('active', 'fade-in');
            }
        });
    });

    // --- OCHRONA WRAŻLIWYCH DANYCH ---
    document.getElementById('toggle-privacy-btn')?.addEventListener('click', () => {
        isPrivacyMode = !isPrivacyMode;
        document.body.classList.toggle('privacy-active', isPrivacyMode);
        logActivity(`Przełączono tryb prywatności: ${isPrivacyMode ? 'Włączony' : 'Wyłączony'}`);
    });

    if (sessionStorage.getItem('auth_ok') === 'true') {
        showApp();
    } else {
        showLogin();
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputPin = String(document.getElementById('pin-input').value).trim();
            try {
                const doc = await db.collection('kurier_app').doc('main_data').get();
                let validPin = "1234";
                if (doc.exists && doc.data().settings && doc.data().settings.pin !== undefined) {
                    validPin = String(doc.data().settings.pin).trim();
                }
                if (inputPin === validPin) {
                    sessionStorage.setItem('auth_ok', 'true');
                    logActivity("Użytkownik zalogował się pomyślnie.");
                    showApp();
                } else {
                    alert('Błędny PIN!');
                    document.getElementById('pin-input').value = '';
                }
            } catch (error) {
                alert('Błąd PIN: ' + error.message);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('auth_ok');
            location.reload();
        });
    }

    function showApp() {
        if (authModal) authModal.style.display = 'none';
        if (appContent) appContent.style.display = 'block';
        initApp();
    }

    function showLogin() {
        if (authModal) authModal.style.display = 'flex';
        if (appContent) appContent.style.display = 'none';
    }

    function initApp() {
        let currentDate = new Date();
        let selectedDateStr = formatDate(currentDate);
        let appData = { days: {}, payouts: {}, settings: {}, ratesHistory: [] };

        function getSettings() {
            const cfg = appData.settings || {};
            return {
                rateTier1: parseFloat(cfg.rateTier1) || 240,
                tier2Limit: parseInt(cfg.tier2Limit, 10) || 200,
                rateTier2: parseFloat(cfg.rateTier2) || 270,
                tier3Limit: parseInt(cfg.tier3Limit, 10) || 301,
                rateTier3: parseFloat(cfg.rateTier3) || 300,
                defaultSecRate: parseFloat(cfg.defaultSecRate) || 180,
                pin: cfg.pin || "1234",
                theme: cfg.theme || "dark",
                accentColor: cfg.accentColor || "#3b82f6",
                compactCalendar: !!cfg.compactCalendar
            };
        }

        // HEURYSTYKA HISTORII STAWEK: Szuka stawek obowiązujących w danej dacie
        function getEffectiveSettingsForDate(dateStr) {
            const defaultSet = getSettings();
            if (!appData.ratesHistory || appData.ratesHistory.length === 0) {
                return defaultSet;
            }
            const sortedHistory = [...appData.ratesHistory].sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
            const matched = sortedHistory.find(h => h.effectiveFrom <= dateStr);
            return matched ? { ...defaultSet, ...matched } : defaultSet;
        }

        function calculateDayRate(firstShiftTotal, hasSecondShift = false, secondShiftRate = 0, dateStr = null) {
            const count = parseInt(firstShiftTotal, 10) || 0;
            const set = dateStr ? getEffectiveSettingsForDate(dateStr) : getSettings();
            let rate = 0;

            if (count > 0) {
                if (count < set.tier2Limit) rate = set.rateTier1;
                else if (count < set.tier3Limit) rate = set.rateTier2;
                else rate = set.rateTier3;
            }

            if (hasSecondShift) {
                rate += (parseFloat(secondShiftRate) || set.defaultSecRate);
            }
            return rate;
        }

        function calculateWorkMinutes(startStr, endStr) {
            if (!startStr || !endStr) return 0;
            const [sH, sM] = startStr.split(':').map(Number);
            const [eH, eM] = endStr.split(':').map(Number);
            let start = sH * 60 + sM;
            let end = eH * 60 + eM;
            if (end < start) end += 24 * 60;
            return end - start;
        }

        db.collection('kurier_app').doc('main_data')
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    appData.days = data.days || {};
                    appData.payouts = data.payouts || {};
                    appData.settings = data.settings || {};
                    appData.ratesHistory = data.ratesHistory || [];
                }
                applyTheme();
                loadSettingsToForm();
                renderCalendar();
                loadDayToForm(selectedDateStr);
                populateMonthSelector();
                renderStats();
                renderRecordsAndBadges();
            }, (err) => console.error("Błąd Firebase:", err));

        function formatDate(d) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // SYSTEM MOTYWÓW
        function applyTheme() {
            const set = getSettings();
            document.body.setAttribute('data-theme', set.theme);
            document.documentElement.style.setProperty('--primary-color', set.accentColor);
            
            const calGrid = document.getElementById('calendar-grid');
            if (calGrid) {
                calGrid.classList.toggle('compact-view', set.compactCalendar);
            }
        }

        document.querySelectorAll('.btn-now').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                document.getElementById(targetId).value = `${hh}:${mm}`;
                calculateDailyTotals();
            });
        });

        document.getElementById('btn-today')?.addEventListener('click', () => {
            currentDate = new Date();
            selectedDateStr = formatDate(currentDate);
            updateMonthView();
        });

        function renderCalendar() {
            const grid = document.getElementById('calendar-grid');
            const monthTitle = document.getElementById('calendar-month-year');
            if (!grid || !monthTitle) return;

            grid.innerHTML = '';
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
            monthTitle.textContent = `${monthNames[month]} ${year}`;

            const firstDay = new Date(year, month, 1).getDay();
            const startingDay = firstDay === 0 ? 6 : firstDay - 1;
            const totalDays = new Date(year, month + 1, 0).getDate();

            const daysOfWeek = ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
            daysOfWeek.forEach(d => {
                const head = document.createElement('div');
                head.className = 'calendar-day-header';
                head.textContent = d;
                grid.appendChild(head);
            });

            for (let i = 0; i < startingDay; i++) {
                const empty = document.createElement('div');
                empty.className = 'calendar-day empty';
                grid.appendChild(empty);
            }

            for (let day = 1; day <= totalDays; day++) {
                const mStr = String(month + 1).padStart(2, '0');
                const dStr = String(day).padStart(2, '0');
                const dateStr = `${year}-${mStr}-${dStr}`;
                const set = getEffectiveSettingsForDate(dateStr);
                
                const cell = document.createElement('div');
                cell.className = 'calendar-day';
                if (dateStr === selectedDateStr) cell.classList.add('selected');

                const dayData = appData.days && appData.days[dateStr];
                
                if (dayData) {
                    const firstShiftTotal = (parseInt(dayData.address, 10)||0) + (parseInt(dayData.apmPudo||dayData.apm, 10)||0) + (parseInt(dayData.awizo, 10)||0) + (parseInt(dayData.pickups, 10)||0);

                    if (firstShiftTotal >= set.tier3Limit) cell.classList.add('tier-high');
                    else if (firstShiftTotal >= set.tier2Limit) cell.classList.add('tier-mid');
                    else if (firstShiftTotal > 0 || dayData.secondShift) cell.classList.add('tier-low');

                    const hasNote = dayData.note && dayData.note.trim() !== "";
                    const noteHtml = hasNote ? `<span class="note-badge">📝</span>` : '';
                    const secondShiftHtml = dayData.secondShift ? `<span class="second-shift-tag">2Z</span>` : '';

                    cell.innerHTML = `${noteHtml}<span>${day}</span>${secondShiftHtml}`;
                } else {
                    cell.innerHTML = `<span>${day}</span>`;
                }

                cell.addEventListener('click', () => {
                    document.querySelectorAll('.calendar-day').forEach(c => c.classList.remove('selected'));
                    cell.classList.add('selected');
                    selectedDateStr = dateStr;
                    loadDayToForm(dateStr);
                });

                grid.appendChild(cell);
            }
        }

        function loadDayToForm(dateStr) {
            const title = document.getElementById('selected-date-title');
            if (title) title.textContent = `Wybrany dzień: ${dateStr}`;

            const set = getEffectiveSettingsForDate(dateStr);
            const dayData = (appData.days && appData.days[dateStr]) 
                ? appData.days[dateStr] 
                : { 
                    address: 0, apmPudo: 0, awizo: 0, pickups: 0, tips: 0, workStart: '', workEnd: '',
                    secondShift: false, secondWorkStart: '', secondWorkEnd: '', secondAddress: 0, secondApmPudo: 0, secondPickups: 0, 
                    secondShiftRate: set.defaultSecRate, note: '' 
                  };

            document.getElementById('work-start').value = dayData.workStart || '';
            document.getElementById('work-end').value = dayData.workEnd || '';
            document.getElementById('tips').value = dayData.tips !== undefined ? dayData.tips : 0;
            document.getElementById('address').value = dayData.address !== undefined ? dayData.address : 0;
            document.getElementById('apm-pudo').value = dayData.apmPudo !== undefined ? dayData.apmPudo : (dayData.apm || 0);
            document.getElementById('awizo').value = dayData.awizo !== undefined ? dayData.awizo : 0;
            document.getElementById('pickups').value = dayData.pickups !== undefined ? dayData.pickups : 0;
            document.getElementById('daily-note').value = dayData.note || '';

            const has2nd = Boolean(dayData.secondShift);
            const secondShiftCb = document.getElementById('second-shift');
            const secDetailsDiv = document.getElementById('second-shift-details');

            if (secondShiftCb) secondShiftCb.checked = has2nd;
            if (secDetailsDiv) secDetailsDiv.style.display = has2nd ? 'block' : 'none';

            document.getElementById('second-work-start').value = dayData.secondWorkStart || '';
            document.getElementById('second-work-end').value = dayData.secondWorkEnd || '';
            document.getElementById('second-address').value = dayData.secondAddress !== undefined ? dayData.secondAddress : 0;
            document.getElementById('second-apm-pudo').value = dayData.secondApmPudo !== undefined ? dayData.secondApmPudo : 0;
            document.getElementById('second-pickups').value = dayData.secondPickups !== undefined ? dayData.secondPickups : 0;
            document.getElementById('second-shift-rate').value = dayData.secondShiftRate !== undefined ? dayData.secondShiftRate : set.defaultSecRate;

            calculateDailyTotals();
        }

        function calculateDailyTotals() {
            const startStr1 = document.getElementById('work-start')?.value;
            const endStr1 = document.getElementById('work-end')?.value;
            let totalMinutes = calculateWorkMinutes(startStr1, endStr1);

            const hasSecondShift = document.getElementById('second-shift')?.checked || false;
            if (hasSecondShift) {
                const startStr2 = document.getElementById('second-work-start')?.value;
                const endStr2 = document.getElementById('second-work-end')?.value;
                totalMinutes += calculateWorkMinutes(startStr2, endStr2);
            }

            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            const totalHoursDecimal = totalMinutes / 60;

            document.getElementById('daily-hours').textContent = `${hours}h ${mins}m`;

            const addr = parseInt(document.getElementById('address')?.value, 10) || 0;
            const apmPudo = parseInt(document.getElementById('apm-pudo')?.value, 10) || 0;
            const awizo = parseInt(document.getElementById('awizo')?.value, 10) || 0;
            const pick = parseInt(document.getElementById('pickups')?.value, 10) || 0;
            const tips = parseFloat(document.getElementById('tips')?.value) || 0;

            const firstShiftTotal = addr + apmPudo + awizo + pick;

            const secAddr = hasSecondShift ? (parseInt(document.getElementById('second-address')?.value, 10) || 0) : 0;
            const secApmPudo = hasSecondShift ? (parseInt(document.getElementById('second-apm-pudo')?.value, 10) || 0) : 0;
            const secPick = hasSecondShift ? (parseInt(document.getElementById('second-pickups')?.value, 10) || 0) : 0;
            const secRate = hasSecondShift ? (parseFloat(document.getElementById('second-shift-rate')?.value) || 0) : 0;

            const secondShiftTotal = secAddr + secApmPudo + secPick;
            const totalParcels = firstShiftTotal + secondShiftTotal;

            const baseRate = calculateDayRate(firstShiftTotal, hasSecondShift, secRate, selectedDateStr);
            const totalEarn = baseRate + tips;

            document.getElementById('daily-total-parcels').textContent = totalParcels;
            
            // PRZELICZNIK STAWKI ZA PACZKĘ
            const effectiveParcelRate = totalParcels > 0 ? (totalEarn / totalParcels).toFixed(2) : "0.00";
            const rateDisplay = document.getElementById('daily-rate');
            if (rateDisplay) {
                rateDisplay.textContent = `${totalEarn.toFixed(2)} zł (${effectiveParcelRate} zł/paczka)`;
            }

            // CZAS NA STOP / PACZKĘ
            const timePerParcelEl = document.getElementById('daily-time-per-parcel');
            if (timePerParcelEl) {
                const minsPerParcel = totalParcels > 0 ? (totalMinutes / totalParcels).toFixed(1) : "0";
                timePerParcelEl.textContent = `${minsPerParcel} min/paczka`;
            }

            if (totalHoursDecimal > 0) {
                const pace = Math.round(totalParcels / totalHoursDecimal);
                const hourlyRate = (totalEarn / totalHoursDecimal).toFixed(2);
                document.getElementById('daily-pace').textContent = `${pace} paczek/h`;
                document.getElementById('daily-hourly-rate').textContent = `${hourlyRate} zł/h`;
            } else {
                document.getElementById('daily-pace').textContent = `0 paczek/h`;
                document.getElementById('daily-hourly-rate').textContent = `0.00 zł/h`;
            }
        }

        ['address', 'apm-pudo', 'awizo', 'pickups', 'tips', 'work-start', 'work-end', 
         'second-work-start', 'second-work-end', 'second-address', 'second-apm-pudo', 'second-pickups', 'second-shift-rate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', calculateDailyTotals);
                el.addEventListener('change', calculateDailyTotals);
            }
        });

        document.getElementById('second-shift')?.addEventListener('change', (e) => {
            const secDetailsDiv = document.getElementById('second-shift-details');
            if (secDetailsDiv) secDetailsDiv.style.display = e.target.checked ? 'block' : 'none';
            calculateDailyTotals();
        });

        document.getElementById('daily-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!appData.days) appData.days = {};

            const hasSecondShift = document.getElementById('second-shift')?.checked || false;

            appData.days[selectedDateStr] = {
                workStart: document.getElementById('work-start')?.value || '',
                workEnd: document.getElementById('work-end')?.value || '',
                tips: parseFloat(document.getElementById('tips')?.value) || 0,
                address: parseInt(document.getElementById('address')?.value, 10) || 0,
                apmPudo: parseInt(document.getElementById('apm-pudo')?.value, 10) || 0,
                awizo: parseInt(document.getElementById('awizo')?.value, 10) || 0,
                pickups: parseInt(document.getElementById('pickups')?.value, 10) || 0,
                secondShift: hasSecondShift,
                secondWorkStart: document.getElementById('second-work-start')?.value || '',
                secondWorkEnd: document.getElementById('second-work-end')?.value || '',
                secondAddress: parseInt(document.getElementById('second-address')?.value, 10) || 0,
                secondApmPudo: parseInt(document.getElementById('second-apm-pudo')?.value, 10) || 0,
                secondPickups: parseInt(document.getElementById('second-pickups')?.value, 10) || 0,
                secondShiftRate: parseFloat(document.getElementById('second-shift-rate')?.value) || 0,
                note: document.getElementById('daily-note')?.value || ''
            };

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                logActivity(`Zapisano raport dla dnia: ${selectedDateStr}`);
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                alert('Zapisano dzień!');
            } catch(err) {
                alert('Błąd zapisu: ' + err.message);
            }
        });

        function updateMonthView() {
            renderCalendar();
            loadDayToForm(selectedDateStr);
            populateMonthSelector();
            renderStats();
        }

        document.getElementById('prev-month')?.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            updateMonthView();
        });

        document.getElementById('next-month')?.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            updateMonthView();
        });

        function populateMonthSelector() {
            const select = document.getElementById('stats-month-select');
            const comp1 = document.getElementById('compare-month-1');
            const comp2 = document.getElementById('compare-month-2');
            
            if (!select) return;

            const visibleMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            const months = new Set();
            if (appData.days) {
                Object.keys(appData.days).forEach(d => months.add(d.substring(0, 7)));
            }
            months.add(visibleMonthStr);

            const sortedMonths = Array.from(months).sort().reverse();

            const renderOptions = (targetSelect) => {
                if (!targetSelect) return;
                targetSelect.innerHTML = '';
                sortedMonths.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    targetSelect.appendChild(opt);
                });
            };

            renderOptions(select);
            renderOptions(comp1);
            renderOptions(comp2);

            select.value = visibleMonthStr;
            select.onchange = renderStats;
        }

        // AGREGACJA DANYCH MIESIĘCZNYCH
        function getMonthMetrics(monthStr) {
            let mAddr = 0, mApmPudo = 0, mAwizo = 0, mPick = 0;
            let mEarnings = 0, mTips = 0, mMinutes = 0, mWorkingDays = 0, mSecondShiftDays = 0;

            if (appData.days) {
                Object.entries(appData.days).forEach(([date, d]) => {
                    if (date.startsWith(monthStr)) {
                        mWorkingDays++;
                        const addr = parseInt(d.address, 10) || 0;
                        const apmPudo = parseInt(d.apmPudo, 10) || (parseInt(d.apm, 10) || 0);
                        const awizo = parseInt(d.awizo, 10) || 0;
                        const pick = parseInt(d.pickups, 10) || 0;
                        const tips = parseFloat(d.tips) || 0;

                        const hasSecondShift = !!d.secondShift;
                        if (hasSecondShift) mSecondShiftDays++;

                        const secAddr = hasSecondShift ? (parseInt(d.secondAddress, 10) || 0) : 0;
                        const secApmPudo = hasSecondShift ? (parseInt(d.secondApmPudo, 10) || 0) : 0;
                        const secPick = hasSecondShift ? (parseInt(d.secondPickups, 10) || 0) : 0;
                        const secRate = hasSecondShift ? (parseFloat(d.secondShiftRate) || 0) : 0;

                        mAddr += (addr + secAddr);
                        mApmPudo += (apmPudo + secApmPudo);
                        mAwizo += awizo;
                        mPick += (pick + secPick);
                        mTips += tips;

                        let dayMinutes = calculateWorkMinutes(d.workStart, d.workEnd);
                        if (hasSecondShift) dayMinutes += calculateWorkMinutes(d.secondWorkStart, d.secondWorkEnd);
                        mMinutes += dayMinutes;

                        const firstShiftTotal = addr + apmPudo + awizo + pick;
                        mEarnings += calculateDayRate(firstShiftTotal, hasSecondShift, secRate, date);
                    }
                });
            }

            const mTotalParcels = mAddr + mApmPudo + mAwizo + mPick;
            const totalEarnWithTips = mEarnings + mTips;
            const avgDailyEarn = mWorkingDays > 0 ? (totalEarnWithTips / mWorkingDays) : 0;
            const avgTimePerParcel = mTotalParcels > 0 ? (mMinutes / mTotalParcels) : 0;

            return {
                mAddr, mApmPudo, mAwizo, mPick, mTotalParcels,
                mEarnings, mTips, totalEarnWithTips, mMinutes,
                mWorkingDays, mSecondShiftDays, avgDailyEarn, avgTimePerParcel
            };
        }

        function renderStats() {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);
            const metrics = getMonthMetrics(selectedMonth);

            const mHours = Math.round((metrics.mMinutes / 60) * 10) / 10;
            const mTotalHoursDecimal = metrics.mMinutes / 60;
            const mPace = mTotalHoursDecimal > 0 ? Math.round(metrics.mTotalParcels / mTotalHoursDecimal) : 0;
            const mHourlyRate = mTotalHoursDecimal > 0 ? (metrics.totalEarnWithTips / mTotalHoursDecimal).toFixed(2) : "0.00";

            // WYLICZANIE TYGODNI I ŚREDNIEJ GODZIN NA TYDZIEŃ
            const weeksInMonth = 4.33; 
            const avgWeeklyHours = (mTotalHoursDecimal / weeksInMonth).toFixed(1);

            const [selYear, selMonth] = selectedMonth.split('-').map(Number);
            const daysInMonth = new Date(selYear, selMonth, 0).getDate();
            const forecast = metrics.mWorkingDays > 0 ? (metrics.totalEarnWithTips / metrics.mWorkingDays) * Math.min(daysInMonth, 22) : 0;
            
            document.getElementById('stat-forecast').textContent = `~${forecast.toFixed(2)} zł`;
            document.getElementById('stat-monthly-earnings').textContent = `${metrics.mEarnings.toFixed(2)} zł`;
            document.getElementById('stat-monthly-tips').textContent = `${metrics.mTips.toFixed(2)} zł`;
            document.getElementById('stat-monthly-days').textContent = `${metrics.mWorkingDays} dni`;
            document.getElementById('stat-second-shift-days').textContent = `${metrics.mSecondShiftDays} dni`;
            document.getElementById('stat-monthly-hours').textContent = `${mHours}h`;
            document.getElementById('stat-monthly-pace').textContent = `${mPace} paczek/h`;
            document.getElementById('stat-monthly-hourly-rate').textContent = `${mHourlyRate} zł/h`;
            document.getElementById('stat-monthly-parcels').textContent = metrics.mTotalParcels;
            document.getElementById('stat-address').textContent = metrics.mAddr;
            document.getElementById('stat-apm-pudo').textContent = metrics.mApmPudo;
            document.getElementById('stat-awizo').textContent = metrics.mAwizo;
            document.getElementById('stat-pickups').textContent = metrics.mPick;

            // NOWE STATYSTYKI
            const avgDailyEl = document.getElementById('stat-avg-daily');
            if (avgDailyEl) avgDailyEl.textContent = `${metrics.avgDailyEarn.toFixed(2)} zł`;

            const avgWeeklyEl = document.getElementById('stat-avg-weekly-hours');
            if (avgWeeklyEl) avgWeeklyEl.textContent = `${avgWeeklyHours}h`;

            const avgTimePerParcelEl = document.getElementById('stat-avg-time-per-parcel');
            if (avgTimePerParcelEl) avgTimePerParcelEl.textContent = `${metrics.avgTimePerParcel.toFixed(1)} min`;

            // PRZELEWY
            document.getElementById('calculated-payout').value = `${metrics.mEarnings.toFixed(2)} zł`;
            const receivedInput = document.getElementById('received-payout');
            const diffInput = document.getElementById('payout-difference');
            
            const recVal = (appData.payouts && appData.payouts[selectedMonth] !== undefined) ? appData.payouts[selectedMonth] : '';
            if (receivedInput) receivedInput.value = recVal;

            if (recVal !== '') {
                const diff = parseFloat(recVal) - metrics.mEarnings;
                diffInput.value = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} zł`;
                diffInput.style.color = diff < 0 ? '#ef4444' : '#10b981';
            } else {
                diffInput.value = '0.00 zł';
                diffInput.style.color = 'inherit';
            }

            const goalInput = document.getElementById('monthly-goal-input');
            const goal = parseFloat(goalInput?.value) || 6000;
            const progress = Math.min(Math.round((metrics.totalEarnWithTips / goal) * 100), 100);

            const barFill = document.getElementById('progress-bar-fill');
            const barText = document.getElementById('progress-bar-text');
            if (barFill) barFill.style.width = `${progress}%`;
            if (barText) barText.textContent = `${progress}% (${metrics.totalEarnWithTips.toFixed(0)} / ${goal} zł)`;
        }

        // PORÓWNYWARKA MIESIĘCY
        document.getElementById('btn-compare-months')?.addEventListener('click', () => {
            const m1 = document.getElementById('compare-month-1')?.value;
            const m2 = document.getElementById('compare-month-2')?.value;
            const resContainer = document.getElementById('comparison-results');
            if (!m1 || !m2 || !resContainer) return;

            const d1 = getMonthMetrics(m1);
            const d2 = getMonthMetrics(m2);

            const diffEarn = d2.totalEarnWithTips - d1.totalEarnWithTips;
            const diffParcels = d2.mTotalParcels - d1.mTotalParcels;

            resContainer.innerHTML = `
                <table class="comparison-table">
                    <tr><th>Parametr</th><th>${m1}</th><th>${m2}</th><th>Różnica</th></tr>
                    <tr><td>Suma paczek</td><td>${d1.mTotalParcels}</td><td>${d2.mTotalParcels}</td><td>${diffParcels > 0 ? '+' : ''}${diffParcels}</td></tr>
                    <tr><td>Zarobek + Tipy</td><td>${d1.totalEarnWithTips.toFixed(2)} zł</td><td>${d2.totalEarnWithTips.toFixed(2)} zł</td><td>${diffEarn > 0 ? '+' : ''}${diffEarn.toFixed(2)} zł</td></tr>
                    <tr><td>Dni pracy</td><td>${d1.mWorkingDays}</td><td>${d2.mWorkingDays}</td><td>${d2.mWorkingDays - d1.mWorkingDays}</td></tr>
                    <tr><td>Średnia dniówka</td><td>${d1.avgDailyEarn.toFixed(2)} zł</td><td>${d2.avgDailyEarn.toFixed(2)} zł</td><td>${(d2.avgDailyEarn - d1.avgDailyEarn).toFixed(2)} zł</td></tr>
                </table>
            `;
            logActivity(`Porównano miesiące: ${m1} vs ${m2}`);
        });

        document.getElementById('monthly-goal-input')?.addEventListener('input', renderStats);

        document.getElementById('save-payout-btn')?.addEventListener('click', async () => {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);
            const val = parseFloat(document.getElementById('received-payout').value) || 0;

            if (!appData.payouts) appData.payouts = {};
            appData.payouts[selectedMonth] = val;

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                logActivity(`Zapisano kwotę przelewu dla ${selectedMonth}: ${val} zł`);
                renderStats();
                alert('Zapisano przelew!');
            } catch(err) {
                alert('Błąd zapisu: ' + err.message);
            }
        });

        function renderRecordsAndBadges() {
            let maxParcels = 0, maxTip = 0, maxEarning = 0, maxPace = 0;
            let totalAddress = 0, totalSecondShifts = 0;

            if (appData.days) {
                Object.entries(appData.days).forEach(([dateStr, d]) => {
                    const addr = parseInt(d.address, 10) || 0;
                    const apmPudo = parseInt(d.apmPudo, 10) || (parseInt(d.apm, 10) || 0);
                    const awizo = parseInt(d.awizo, 10) || 0;
                    const pick = parseInt(d.pickups, 10) || 0;
                    const tips = parseFloat(d.tips) || 0;

                    const has2nd = !!d.secondShift;
                    if (has2nd) totalSecondShifts++;

                    const secAddr = has2nd ? (parseInt(d.secondAddress, 10) || 0) : 0;
                    const secApmPudo = has2nd ? (parseInt(d.secondApmPudo, 10) || 0) : 0;
                    const secPick = has2nd ? (parseInt(d.secondPickups, 10) || 0) : 0;
                    const secRate = has2nd ? (parseFloat(d.secondShiftRate) || 0) : 0;

                    totalAddress += (addr + secAddr);
                    const dayParcels = addr + apmPudo + awizo + pick + secAddr + secApmPudo + secPick;

                    let dayMinutes = calculateWorkMinutes(d.workStart, d.workEnd);
                    if (has2nd) dayMinutes += calculateWorkMinutes(d.secondWorkStart, d.secondWorkEnd);
                    const dayHours = dayMinutes / 60;

                    const baseRate = calculateDayRate(addr + apmPudo + awizo + pick, has2nd, secRate, dateStr);
                    const totalEarn = baseRate + tips;

                    if (dayParcels > maxParcels) maxParcels = dayParcels;
                    if (tips > maxTip) maxTip = tips;
                    if (totalEarn > maxEarning) maxEarning = totalEarn;
                    if (dayHours > 0) {
                        const pace = Math.round(dayParcels / dayHours);
                        if (pace > maxPace) maxPace = pace;
                    }
                });
            }

            document.getElementById('rec-max-parcels').textContent = maxParcels;
            document.getElementById('rec-max-tip').textContent = `${maxTip.toFixed(2)} zł`;
            document.getElementById('rec-max-earning').textContent = `${maxEarning.toFixed(2)} zł`;
            document.getElementById('rec-max-pace').textContent = `${maxPace} paczek/h`;

            const badges = [
                { title: "Setka na Adres", desc: "Ponad 100 paczek adresowych łącznie", unlocked: totalAddress >= 100, icon: "🏠" },
                { title: "Król Tippingu", desc: "Zgarnij ponad 50 zł napiwku w 1 dzień", unlocked: maxTip >= 50, icon: "💰" },
                { title: "Dwuzmianowiec", desc: "Przepracuj co najmniej 5 drugich zmian", unlocked: totalSecondShifts >= 5, icon: "🌙" },
                { title: "Błyskawica", desc: "Osiągnij tempo powyżej 40 paczek/h", unlocked: maxPace >= 40, icon: "⚡" },
                { title: "Tytan Pracy", desc: "Zarób ponad 400 zł jednego dnia", unlocked: maxEarning >= 400, icon: "🏆" }
            ];

            const bContainer = document.getElementById('badges-container');
            if (bContainer) {
                bContainer.innerHTML = badges.map(b => `
                    <div class="badge-card ${b.unlocked ? 'unlocked' : ''}">
                        <div class="icon">${b.icon}</div>
                        <h4>${b.title}</h4>
                        <p>${b.desc}</p>
                    </div>
                `).join('');
            }
        }

        function loadSettingsToForm() {
            const set = getSettings();
            document.getElementById('cfg-rate-tier1').value = set.rateTier1;
            document.getElementById('cfg-tier2-limit').value = set.tier2Limit;
            document.getElementById('cfg-rate-tier2').value = set.rateTier2;
            document.getElementById('cfg-tier3-limit').value = set.tier3Limit;
            document.getElementById('cfg-rate-tier3').value = set.rateTier3;
            document.getElementById('cfg-default-sec-rate').value = set.defaultSecRate;
            
            const themeSelect = document.getElementById('theme-mode-select');
            if (themeSelect) themeSelect.value = set.theme;

            const colorPicker = document.getElementById('theme-color-picker');
            if (colorPicker) colorPicker.value = set.accentColor;

            const compactCb = document.getElementById('toggle-compact-calendar');
            if (compactCb) compactCb.checked = set.compactCalendar;
        }

        document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPin = document.getElementById('cfg-pin').value.trim();

            const newSettings = {
                rateTier1: parseFloat(document.getElementById('cfg-rate-tier1').value) || 240,
                tier2Limit: parseInt(document.getElementById('cfg-tier2-limit').value, 10) || 200,
                rateTier2: parseFloat(document.getElementById('cfg-rate-tier2').value) || 270,
                tier3Limit: parseInt(document.getElementById('cfg-tier3-limit').value, 10) || 301,
                rateTier3: parseFloat(document.getElementById('cfg-rate-tier3').value) || 300,
                defaultSecRate: parseFloat(document.getElementById('cfg-default-sec-rate').value) || 180,
                pin: newPin !== "" ? newPin : (appData.settings?.pin || "1234"),
                theme: document.getElementById('theme-mode-select')?.value || "dark",
                accentColor: document.getElementById('theme-color-picker')?.value || "#3b82f6",
                compactCalendar: document.getElementById('toggle-compact-calendar')?.checked || false
            };

            // HISTORIA STAWEK: Jeśli progi uległy zmianie, zapisujemy wpis w historii z dzisiejszą datą
            const todayStr = formatDate(new Date());
            if (!appData.ratesHistory) appData.ratesHistory = [];
            
            const currentEff = getEffectiveSettingsForDate(todayStr);
            if (currentEff.rateTier1 !== newSettings.rateTier1 || currentEff.rateTier2 !== newSettings.rateTier2 || currentEff.rateTier3 !== newSettings.rateTier3) {
                appData.ratesHistory.push({
                    effectiveFrom: todayStr,
                    rateTier1: newSettings.rateTier1,
                    tier2Limit: newSettings.tier2Limit,
                    rateTier2: newSettings.rateTier2,
                    tier3Limit: newSettings.tier3Limit,
                    rateTier3: newSettings.rateTier3,
                    defaultSecRate: newSettings.defaultSecRate
                });
                logActivity(`Zarejestrowano zmianę stawek od dnia ${todayStr}`);
            }

            appData.settings = newSettings;

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                document.getElementById('cfg-pin').value = '';
                logActivity("Zapisano nowe ustawienia i motyw.");
                applyTheme();
                renderCalendar();
                calculateDailyTotals();
                renderStats();
                alert('Ustawienia i progi zostały pomyślnie zapisane!');
            } catch(err) {
                alert('Błąd zapisu ustawień: ' + err.message);
            }
        });
    }
});

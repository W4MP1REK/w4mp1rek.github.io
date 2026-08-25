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

// 22. Wskaźnik stanu Cloud/Offline (Firestore Persistence)
db.enablePersistence().catch(err => console.error("Firestore persistence error:", err));

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const appContent = document.getElementById('app-content');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    // 16. Animowane przechodzenie między zakładkami (obsługa clas)
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => {
                t.classList.remove('active', 'tab-anim-enter');
            });
            btn.classList.add('active');
            const targetTab = document.getElementById(btn.dataset.tab);
            if(targetTab) {
                targetTab.classList.add('active', 'tab-anim-enter');
            }
        });
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
                const doc = await db.collection('kurier_app').doc('settings').get();
                let validPin = "1234";
                if (doc.exists && doc.data().pin !== undefined) {
                    validPin = String(doc.data().pin).trim();
                }
                if (inputPin === validPin) {
                    sessionStorage.setItem('auth_ok', 'true');
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
        let appData = { days: {}, payouts: {}, settings: {}, rateHistory: [], logs: [] };

        // 22. Wskaźnik stanu Cloud / Offline
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        function updateOnlineStatus() {
            const statusEl = document.getElementById('cloud-status-indicator');
            if (statusEl) {
                statusEl.textContent = navigator.onLine ? "⚡ Cloud Sync Active" : "📡 Offline Mode";
                statusEl.className = navigator.onLine ? "status-online" : "status-offline";
            }
        }
        updateOnlineStatus();

        // 21. Logi aktywności
        function addActivityLog(actionMessage) {
            if (!appData.logs) appData.logs = [];
            const logEntry = {
                timestamp: new Date().toISOString(),
                formatted: new Date().toLocaleString('pl-PL'),
                action: actionMessage
            };
            appData.logs.unshift(logEntry);
            if (appData.logs.length > 50) appData.logs.pop(); // Limit ostatnich 50 wpisów
            renderActivityLogs();
        }

        function renderActivityLogs() {
            const container = document.getElementById('activity-logs-container');
            if (!container || !appData.logs) return;
            container.innerHTML = appData.logs.map(log => `
                <div class="log-item">
                    <small>${log.formatted}</small> - <span>${log.action}</span>
                </div>
            `).join('');
        }

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
                userName: cfg.userName || "Kurier",
                theme: cfg.theme || "dark"
            };
        }

        function calculateDayRate(firstShiftTotal, hasSecondShift = false, secondShiftRate = 0) {
            const count = parseInt(firstShiftTotal, 10) || 0;
            const set = getSettings();
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
                    appData.rateHistory = data.rateHistory || [];
                    appData.logs = data.logs || [];
                }
                loadSettingsToForm();
                renderCalendar();
                loadDayToForm(selectedDateStr);
                populateMonthSelector();
                populateCompareSelectors();
                renderStats();
                renderRecordsAndBadges();
                renderGamification();
                renderRateHistory();
                renderActivityLogs();
                applyUserSettings();
            }, (err) => console.error("Błąd Firebase:", err));

        function formatDate(d) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
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

        // 18. Podgląd kalendarza w trybie kompaktowym
        document.getElementById('toggle-compact-calendar')?.addEventListener('click', () => {
            const grid = document.getElementById('calendar-grid');
            if (grid) grid.classList.toggle('compact-view');
        });

        // WIZUALIZACJA KALENDARZA (Super Widoczna)
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

            const set = getSettings();

            for (let day = 1; day <= totalDays; day++) {
                const mStr = String(month + 1).padStart(2, '0');
                const dStr = String(day).padStart(2, '0');
                const dateStr = `${year}-${mStr}-${dStr}`;
                
                const cell = document.createElement('div');
                cell.className = 'calendar-day';
                if (dateStr === selectedDateStr) cell.classList.add('selected');

                const dayData = appData.days && appData.days[dateStr];
                
                if (dayData) {
                    const firstShiftTotal = (parseInt(dayData.address, 10)||0) + (parseInt(dayData.apmPudo||dayData.apm, 10)||0) + (parseInt(dayData.awizo, 10)||0) + (parseInt(dayData.pickups, 10)||0);

                    // 1 & 2. Oznaczenie kolorem całego dnia (Pracowany + Progi)
                    if (firstShiftTotal >= set.tier3Limit) {
                        cell.classList.add('tier-high'); // 300+ paczek (Jaskrawy Zielony)
                    } else if (firstShiftTotal >= set.tier2Limit) {
                        cell.classList.add('tier-mid');  // 200-300 paczek (Wyrazisty Niebieski)
                    } else if (firstShiftTotal > 0 || dayData.secondShift) {
                        cell.classList.add('tier-low');  // Poniżej 200 paczek / tylko 2 zmiana (Szary/Ciemno-niebieski)
                    }

                    // 4. Czytelna Ikona Notatki
                    const hasNote = dayData.note && dayData.note.trim() !== "";
                    const noteHtml = hasNote ? `<span class="note-badge">📝</span>` : '';

                    // 3. Wyrazisty Znaczek 2. Zmiany
                    const secondShiftHtml = dayData.secondShift ? `<span class="second-shift-tag">2Z</span>` : '';

                    cell.innerHTML = `
                        ${noteHtml}
                        <span>${day}</span>
                        ${secondShiftHtml}
                    `;
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

            const set = getSettings();
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

            const baseRate = calculateDayRate(firstShiftTotal, hasSecondShift, secRate);
            const totalEarn = baseRate + tips;

            document.getElementById('daily-total-parcels').textContent = totalParcels;
            document.getElementById('daily-rate').textContent = `${totalEarn.toFixed(2)} zł ${tips > 0 ? `(w tym ${tips}zł tip)` : ''}`;

            // 1. Przelicznik stawki za paczkę
            const effectivePerParcel = totalParcels > 0 ? (totalEarn / totalParcels).toFixed(2) : "0.00";
            const effEl = document.getElementById('daily-effective-rate-per-parcel');
            if(effEl) effEl.textContent = `${effectivePerParcel} zł/paczka`;

            // 6. Statystyka czasu na stop/paczkę
            const timePerParcelMin = totalParcels > 0 ? (totalMinutes / totalParcels).toFixed(1) : "0.0";
            const timeEl = document.getElementById('daily-time-per-parcel');
            if(timeEl) timeEl.textContent = `${timePerParcelMin} min/paczka`;

            // 7. Przewidywana godzina powrotu
            if (startStr1 && totalParcels > 0 && !endStr1) {
                const avgMinutesPerParcel = 2.5; // Domyślne tempo szacunkowe
                const estTotalMinutes = totalParcels * avgMinutesPerParcel;
                const [sH, sM] = startStr1.split(':').map(Number);
                const estEndMins = (sH * 60 + sM + estTotalMinutes) % (24 * 60);
                const estH = String(Math.floor(estEndMins / 60)).padStart(2, '0');
                const estM = String(Math.round(estEndMins % 60)).padStart(2, '0');
                const estReturnEl = document.getElementById('daily-est-return');
                if(estReturnEl) estReturnEl.textContent = `~${estH}:${estM}`;
            } else {
                const estReturnEl = document.getElementById('daily-est-return');
                if(estReturnEl) estReturnEl.textContent = `--:--`;
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

            addActivityLog(`Zapisano dane dla dnia ${selectedDateStr}`);

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
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
            populateCompareSelectors();
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
            if (!select) return;

            const visibleMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            select.innerHTML = '';

            const months = new Set();
            if (appData.days) {
                Object.keys(appData.days).forEach(d => months.add(d.substring(0, 7)));
            }
            months.add(visibleMonthStr);

            Array.from(months).sort().reverse().forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });

            select.value = visibleMonthStr;
            select.onchange = renderStats;
        }

        // 4. Porównywarka miesięcy (Selekcja)
        function populateCompareSelectors() {
            const selA = document.getElementById('compare-month-a');
            const selB = document.getElementById('compare-month-b');
            if (!selA || !selB) return;

            const months = new Set();
            if (appData.days) {
                Object.keys(appData.days).forEach(d => months.add(d.substring(0, 7)));
            }
            const arr = Array.from(months).sort().reverse();
            selA.innerHTML = ''; selB.innerHTML = '';

            arr.forEach(m => {
                selA.appendChild(new Option(m, m));
                selB.appendChild(new Option(m, m));
            });

            if(arr.length > 1) selB.value = arr[1];
            selA.onchange = renderMonthComparison;
            selB.onchange = renderMonthComparison;
            renderMonthComparison();
        }

        function renderMonthComparison() {
            const mA = document.getElementById('compare-month-a')?.value;
            const mB = document.getElementById('compare-month-b')?.value;
            const resEl = document.getElementById('comparison-results');
            if (!mA || !mB || !resEl) return;

            const getStatsFor = (mStr) => {
                let parcels = 0, earn = 0;
                Object.entries(appData.days || {}).forEach(([d, data]) => {
                    if (d.startsWith(mStr)) {
                        const firstTotal = (parseInt(data.address)||0) + (parseInt(data.apmPudo||data.apm)||0) + (parseInt(data.awizo)||0) + (parseInt(data.pickups)||0);
                        const secTotal = data.secondShift ? ((parseInt(data.secondAddress)||0) + (parseInt(data.secondApmPudo)||0) + (parseInt(data.secondPickups)||0)) : 0;
                        parcels += (firstTotal + secTotal);
                        earn += calculateDayRate(firstTotal, data.secondShift, data.secondShiftRate) + (parseFloat(data.tips)||0);
                    }
                });
                return { parcels, earn };
            };

            const statsA = getStatsFor(mA);
            const statsB = getStatsFor(mB);

            resEl.innerHTML = `
                <div class="compare-card">
                    <h4>${mA} vs ${mB}</h4>
                    <p>Paczki: <b>${statsA.parcels}</b> vs <b>${statsB.parcels}</b> (${statsA.parcels - statsB.parcels >= 0 ? '+' : ''}${statsA.parcels - statsB.parcels})</p>
                    <p>Zarobek: <b>${statsA.earn.toFixed(2)} zł</b> vs <b>${statsB.earn.toFixed(2)} zł</b> (${(statsA.earn - statsB.earn).toFixed(2)} zł)</p>
                </div>
            `;
        }

        function renderStats() {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);

            let mAddr = 0, mApmPudo = 0, mAwizo = 0, mPick = 0;
            let mEarnings = 0, mTips = 0, mMinutes = 0, mWorkingDays = 0, mSecondShiftDays = 0;

            if (appData.days) {
                Object.entries(appData.days).forEach(([date, d]) => {
                    if (date.startsWith(selectedMonth)) {
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
                        mEarnings += calculateDayRate(firstShiftTotal, hasSecondShift, secRate);
                    }
                });
            }

            const mTotalParcels = mAddr + mApmPudo + mAwizo + mPick;
            const mHours = Math.round((mMinutes / 60) * 10) / 10;
            const mTotalHoursDecimal = mMinutes / 60;
            const mPace = mTotalHoursDecimal > 0 ? Math.round(mTotalParcels / mTotalHoursDecimal) : 0;
            const mHourlyRate = mTotalHoursDecimal > 0 ? ((mEarnings + mTips) / mTotalHoursDecimal).toFixed(2) : "0.00";

            // 3. Średnia dniówka
            const avgDailyEarn = mWorkingDays > 0 ? ((mEarnings + mTips) / mWorkingDays).toFixed(2) : "0.00";
            const avgDailyEl = document.getElementById('stat-avg-daily');
            if(avgDailyEl) avgDailyEl.textContent = `${avgDailyEarn} zł`;

            // 8. Średnia liczba godzin na tydzień
            const weeksInMonth = 4.33;
            const avgWeeklyHours = (mHours / weeksInMonth).toFixed(1);
            const weeklyHoursEl = document.getElementById('stat-avg-weekly-hours');
            if(weeklyHoursEl) weeklyHoursEl.textContent = `${avgWeeklyHours} h/tydzien`;

            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const forecast = mWorkingDays > 0 ? ((mEarnings + mTips) / mWorkingDays) * Math.min(daysInMonth, 22) : 0;
            document.getElementById('stat-forecast').textContent = `~${forecast.toFixed(2)} zł`;

            document.getElementById('stat-monthly-earnings').textContent = `${mEarnings.toFixed(2)} zł`;
            document.getElementById('stat-monthly-tips').textContent = `${mTips.toFixed(2)} zł`;
            document.getElementById('stat-monthly-days').textContent = `${mWorkingDays} dni`;
            document.getElementById('stat-second-shift-days').textContent = `${mSecondShiftDays} dni`;
            document.getElementById('stat-monthly-hours').textContent = `${mHours}h`;
            document.getElementById('stat-monthly-pace').textContent = `${mPace} paczek/h`;
            document.getElementById('stat-monthly-hourly-rate').textContent = `${mHourlyRate} zł/h`;
            document.getElementById('stat-monthly-parcels').textContent = mTotalParcels;
            document.getElementById('stat-address').textContent = mAddr;
            document.getElementById('stat-apm-pudo').textContent = mApmPudo;
            document.getElementById('stat-awizo').textContent = mAwizo;
            document.getElementById('stat-pickups').textContent = mPick;

            document.getElementById('calculated-payout').value = `${mEarnings.toFixed(2)} zł`;

            const receivedInput = document.getElementById('received-payout');
            const diffInput = document.getElementById('payout-difference');
            
            const recVal = (appData.payouts && appData.payouts[selectedMonth] !== undefined) ? appData.payouts[selectedMonth] : '';
            if (receivedInput) receivedInput.value = recVal;

            if (recVal !== '') {
                const diff = parseFloat(recVal) - mEarnings;
                diffInput.value = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} zł`;
                diffInput.style.color = diff < 0 ? '#ef4444' : '#10b981';
            } else {
                diffInput.value = '0.00 zł';
                diffInput.style.color = 'inherit';
            }

            // 11. Porównywanie się z wyzwanym celem
            const goalInput = document.getElementById('monthly-goal-input');
            const goal = parseFloat(goalInput.value) || 6000;
            const totalWithTips = mEarnings + mTips;
            const progress = Math.min(Math.round((totalWithTips / goal) * 100), 100);

            const barFill = document.getElementById('progress-bar-fill');
            const barText = document.getElementById('progress-bar-text');
            if (barFill) barFill.style.width = `${progress}%`;
            if (barText) barText.textContent = `${progress}% (${totalWithTips.toFixed(0)} / ${goal} zł)`;
        }

        document.getElementById('monthly-goal-input')?.addEventListener('input', renderStats);

        document.getElementById('save-payout-btn')?.addEventListener('click', async () => {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);
            const val = parseFloat(document.getElementById('received-payout').value) || 0;

            if (!appData.payouts) appData.payouts = {};
            appData.payouts[selectedMonth] = val;

            addActivityLog(`Zapisano przelew za miesiąc ${selectedMonth}: ${val} zł`);

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                renderStats();
                alert('Zapisano przelew!');
            } catch(err) {
                alert('Błąd zapisu: ' + err.message);
            }
        });

        // 2. Eksport do PDF (wykorzystanie jsPDF w oknie roboczym)
        document.getElementById('export-pdf-btn')?.addEventListener('click', () => {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);
            let reportText = `RAPORT KURIERSKI - MIESIĄC: ${selectedMonth}\n`;
            reportText += `----------------------------------------\n`;
            reportText += `Adresy: ${document.getElementById('stat-address')?.textContent}\n`;
            reportText += `APM/PUDO: ${document.getElementById('stat-apm-pudo')?.textContent}\n`;
            reportText += `Awiza: ${document.getElementById('stat-awizo')?.textContent}\n`;
            reportText += `Odbiory: ${document.getElementById('stat-pickups')?.textContent}\n`;
            reportText += `Suma Paczek: ${document.getElementById('stat-monthly-parcels')?.textContent}\n`;
            reportText += `Wypracowana Stawka: ${document.getElementById('stat-monthly-earnings')?.textContent}\n`;
            reportText += `Napiwki: ${document.getElementById('stat-monthly-tips')?.textContent}\n`;
            
            const element = document.createElement('a');
            const file = new Blob([reportText], {type: 'text/plain'});
            element.href = URL.createObjectURL(file);
            element.download = `Raport_Kurier_${selectedMonth}.txt`;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);

            addActivityLog(`Wygenerowano raport miesięczny dla ${selectedMonth}`);
        });

        // 9. Rangi i Poziomy & 10. KurierCoiny & 12. Hall of Fame
        function renderGamification() {
            let totalParcelsAllTime = 0;
            let totalEarningsAllTime = 0;

            if (appData.days) {
                Object.values(appData.days).forEach(d => {
                    const firstShiftTotal = (parseInt(d.address, 10)||0) + (parseInt(d.apmPudo||d.apm, 10)||0) + (parseInt(d.awizo, 10)||0) + (parseInt(d.pickups, 10)||0);
                    const secTotal = d.secondShift ? ((parseInt(d.secondAddress, 10)||0) + (parseInt(d.secondApmPudo, 10)||0) + (parseInt(d.secondPickups, 10)||0)) : 0;
                    totalParcelsAllTime += (firstShiftTotal + secTotal);
                    totalEarningsAllTime += calculateDayRate(firstShiftTotal, d.secondShift, d.secondShiftRate) + (parseFloat(d.tips)||0);
                });
            }

            // Rangi
            let rank = "Nowicjusz";
            let level = Math.floor(totalParcelsAllTime / 200) + 1;
            if (totalParcelsAllTime > 5000) rank = "Mistrz Trasy";
            else if (totalParcelsAllTime > 2000) rank = "Weteran Rejonu";
            else if (totalParcelsAllTime > 500) rank = "Szybki Kurier";

            const rankEl = document.getElementById('user-rank-display');
            if(rankEl) rankEl.textContent = `${rank} (Lvl ${level})`;

            // KurierCoiny (1 Coin za każde 5 paczek)
            const coins = Math.floor(totalParcelsAllTime / 5);
            const coinsEl = document.getElementById('user-coins-display');
            if(coinsEl) coinsEl.textContent = `${coins} 🪙`;

            // Hall of Fame
            const hofEl = document.getElementById('hall-of-fame-list');
            if (hofEl) {
                hofEl.innerHTML = `
                    <ol>
                        <li>🏆 ${getSettings().userName} - Zarobek łącznie: ${totalEarningsAllTime.toFixed(0)} zł</li>
                        <li>🥈 Legendarny Kurier - 50,000 Paczek</li>
                    </ol>
                `;
            }
        }

        function renderRecordsAndBadges() {
            let maxParcels = 0, maxTip = 0, maxEarning = 0, maxPace = 0;
            let totalAddress = 0, totalSecondShifts = 0;

            if (appData.days) {
                Object.values(appData.days).forEach(d => {
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

                    const baseRate = calculateDayRate(addr + apmPudo + awizo + pick, has2nd, secRate);
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

        // 5. Pamietanie historii stawek
        function renderRateHistory() {
            const container = document.getElementById('rate-history-container');
            if (!container || !appData.rateHistory) return;
            container.innerHTML = appData.rateHistory.map(h => `
                <div class="rate-history-item">
                    <small>${h.date}</small>: T1: ${h.rateTier1}zł | T2: ${h.rateTier2}zł | T3: ${h.rateTier3}zł
                </div>
            `).join('');
        }

        function loadSettingsToForm() {
            const set = getSettings();
            document.getElementById('cfg-rate-tier1').value = set.rateTier1;
            document.getElementById('cfg-tier2-limit').value = set.tier2Limit;
            document.getElementById('cfg-rate-tier2').value = set.rateTier2;
            document.getElementById('cfg-tier3-limit').value = set.tier3Limit;
            document.getElementById('cfg-rate-tier3').value = set.rateTier3;
            document.getElementById('cfg-default-sec-rate').value = set.defaultSecRate;
            
            // 17. Personalizowany nagłówek
            const nameInput = document.getElementById('cfg-user-name');
            if (nameInput) nameInput.value = set.userName;
        }

        // 13. Tryb ciemny / jasny / OLED & 14. Wybór kolorów motywu & 15. Chowanie wrażliwych danych
        function applyUserSettings() {
            const set = getSettings();
            document.body.setAttribute('data-theme', set.theme || 'dark');

            const headerTitle = document.getElementById('personalized-header-title');
            if (headerTitle) headerTitle.textContent = `Panel Kuriera: ${set.userName || 'Kurier'}`;
        }

        // 15. Chowanie wrażliwych danych (Toggle Masking)
        document.getElementById('toggle-sensitive-data')?.addEventListener('click', () => {
            document.body.classList.toggle('mask-sensitive');
        });

        document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPin = document.getElementById('cfg-pin').value.trim();
            const userName = document.getElementById('cfg-user-name')?.value.trim() || "Kurier";
            const theme = document.getElementById('cfg-theme-select')?.value || "dark";

            const newSettings = {
                rateTier1: parseFloat(document.getElementById('cfg-rate-tier1').value) || 240,
                tier2Limit: parseInt(document.getElementById('cfg-tier2-limit').value, 10) || 200,
                rateTier2: parseFloat(document.getElementById('cfg-rate-tier2').value) || 270,
                tier3Limit: parseInt(document.getElementById('cfg-tier3-limit').value, 10) || 301,
                rateTier3: parseFloat(document.getElementById('cfg-rate-tier3').value) || 300,
                defaultSecRate: parseFloat(document.getElementById('cfg-default-sec-rate').value) || 180,
                pin: newPin !== "" ? newPin : (appData.settings?.pin || "1234"),
                userName: userName,
                theme: theme
            };

            // 5. Zapis historii stawek przy zmianie
            if (!appData.rateHistory) appData.rateHistory = [];
            appData.rateHistory.unshift({
                date: new Date().toLocaleDateString('pl-PL'),
                ...newSettings
            });

            appData.settings = newSettings;
            addActivityLog("Zaktualizowano ustawienia profilu i stawek");

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                alert('Ustawienia i progi zostały pomyślnie zapisane!');
                applyUserSettings();
                renderCalendar();
                calculateDailyTotals();
                renderStats();
                renderRateHistory();
            } catch(err) {
                alert('Błąd zapisu ustawień: ' + err.message);
            }
        });

        // 19. Kopia zapasowa do pliku JSON
        document.getElementById('export-json-btn')?.addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", `kurier_app_backup_${formatDate(new Date())}.json`);
            dlAnchorElem.click();
            addActivityLog("Pobrano lokalną kopię zapasową JSON");
        });

        // Import JSON Backup
        document.getElementById('import-json-input')?.addEventListener('change', (e) => {
            const fileReader = new FileReader();
            fileReader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (importedData && (importedData.days || importedData.settings)) {
                        appData = importedData;
                        await db.collection('kurier_app').doc('main_data').set(appData);
                        alert('Pomyślnie zaimportowano kopię zapasową!');
                        location.reload();
                    }
                } catch(err) {
                    alert('Błąd odczytu pliku kopii: ' + err.message);
                }
            };
            if(e.target.files[0]) fileReader.readAsText(e.target.files[0]);
        });

        // 20. Automatyczny backup w chmurze
        async function autoCloudBackup() {
            try {
                await db.collection('kurier_app_backups').doc(`backup_${formatDate(new Date())}`).set({
                    ...appData,
                    autoBackupTimestamp: new Date().toISOString()
                });
                console.log("Auto-backup cloud success");
            } catch(e) {
                console.error("Auto cloud backup failed", e);
            }
        }
        // Wywołaj auto backup raz przy starcie sesji
        setTimeout(autoCloudBackup, 10000);

        // 23. Instrukcja / FAQ Toggle
        document.getElementById('faq-toggle-btn')?.addEventListener('click', () => {
            const faqBox = document.getElementById('faq-container');
            if (faqBox) faqBox.style.display = (faqBox.style.display === 'none') ? 'block' : 'none';
        });
    }
});

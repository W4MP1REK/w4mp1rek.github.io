// Konfiguracja Firebase pobrana z Twojego panelu
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

// Hasło PIN do logowania: 0609
const CORRECT_PIN = "0609";

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const appContent = document.getElementById('app-content');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    // Sprawdzenie sesji logowania
    if (sessionStorage.getItem('auth_ok') === 'true') {
        showApp();
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = document.getElementById('pin-input').value;
        if (pin === CORRECT_PIN) {
            sessionStorage.setItem('auth_ok', 'true');
            showApp();
        } else {
            alert('Błędny PIN!');
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('auth_ok');
        location.reload();
    });

    function showApp() {
        authModal.style.display = 'none';
        appContent.style.display = 'block';
        initApp();
    }

    function initApp() {
        let currentDate = new Date();
        let selectedDateStr = formatDate(currentDate);
        let appData = { days: {}, payouts: {} };
        const rates = { address: 4.5, apm: 2.0, pudo: 2.5, pickups: 1.5 };

        // Synchronizacja na żywo z chmurą Google
        db.collection('kurier_app').doc('main_data')
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    appData.days = data.days || {};
                    appData.payouts = data.payouts || {};
                }
                renderCalendar();
                loadDayToForm(selectedDateStr);
                renderStats();
                populateMonthSelector();
            }, (err) => {
                console.error("Błąd synchronizacji Firebase:", err);
            });

        function formatDate(d) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

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
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const cell = document.createElement('div');
                cell.className = 'calendar-day';
                if (dateStr === selectedDateStr) cell.classList.add('selected');

                const hasData = appData.days && appData.days[dateStr];
                cell.innerHTML = `<span>${day}</span>${hasData ? '<div class="dot" style="width:6px;height:6px;background:#10b981;border-radius:50%;margin:2px auto 0;"></div>' : ''}`;

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

            const dayData = (appData.days && appData.days[dateStr]) ? appData.days[dateStr] : { address: 0, apm: 0, pudo: 0, pickups: 0 };

            document.getElementById('address').value = dayData.address || 0;
            document.getElementById('apm').value = dayData.apm || 0;
            document.getElementById('pudo').value = dayData.pudo || 0;
            document.getElementById('pickups').value = dayData.pickups || 0;

            calculateDailyTotals();
        }

        function calculateDailyTotals() {
            const addr = parseInt(document.getElementById('address').value) || 0;
            const apm = parseInt(document.getElementById('apm').value) || 0;
            const pudo = parseInt(document.getElementById('pudo').value) || 0;
            const pick = parseInt(document.getElementById('pickups').value) || 0;

            const total = addr + apm + pudo + pick;
            const rate = (addr * rates.address) + (apm * rates.apm) + (pudo * rates.pudo) + (pick * rates.pickups);

            document.getElementById('daily-total-parcels').textContent = total;
            document.getElementById('daily-rate').textContent = `${rate.toFixed(2)} zł`;
        }

        ['address', 'apm', 'pudo', 'pickups'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', calculateDailyTotals);
        });

        const form = document.getElementById('daily-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                if (!appData.days) appData.days = {};

                appData.days[selectedDateStr] = {
                    address: parseInt(document.getElementById('address').value) || 0,
                    apm: parseInt(document.getElementById('apm').value) || 0,
                    pudo: parseInt(document.getElementById('pudo').value) || 0,
                    pickups: parseInt(document.getElementById('pickups').value) || 0
                };

                try {
                    await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                    alert('Zapisano w chmurze!');
                } catch(err) {
                    alert('Błąd zapisu: ' + err.message);
                }
            });
        }

        document.getElementById('prev-month').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });

        document.getElementById('next-month').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });

        function populateMonthSelector() {
            const select = document.getElementById('stats-month-select');
            if (!select) return;
            select.innerHTML = '';

            const months = new Set();
            if (appData.days) {
                Object.keys(appData.days).forEach(d => months.add(d.substring(0, 7)));
            }
            
            const currentM = formatDate(new Date()).substring(0, 7);
            months.add(currentM);

            Array.from(months).sort().reverse().forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });

            select.addEventListener('change', renderStats);
        }

        function renderStats() {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(new Date()).substring(0, 7);

            let mAddr = 0, mApm = 0, mPudo = 0, mPick = 0;

            if (appData.days) {
                Object.entries(appData.days).forEach(([date, d]) => {
                    if (date.startsWith(selectedMonth)) {
                        mAddr += d.address || 0;
                        mApm += d.apm || 0;
                        mPudo += d.pudo || 0;
                        mPick += d.pickups || 0;
                    }
                });
            }

            const mTotalParcels = mAddr + mApm + mPudo + mPick;
            const mEarnings = (mAddr * rates.address) + (mApm * rates.apm) + (mPudo * rates.pudo) + (mPick * rates.pickups);

            document.getElementById('stat-monthly-earnings').textContent = `${mEarnings.toFixed(2)} zł`;
            document.getElementById('stat-monthly-parcels').textContent = mTotalParcels;
            document.getElementById('stat-address').textContent = mAddr;
            document.getElementById('stat-apm').textContent = mApm;
            document.getElementById('stat-pudo').textContent = mPudo;
            document.getElementById('stat-pickups').textContent = mPick;

            const calcInput = document.getElementById('calculated-payout');
            if (calcInput) calcInput.value = `${mEarnings.toFixed(2)} zł`;

            const receivedInput = document.getElementById('received-payout');
            if (receivedInput && appData.payouts && appData.payouts[selectedMonth]) {
                receivedInput.value = appData.payouts[selectedMonth];
            }
        }

        const savePayoutBtn = document.getElementById('save-payout-btn');
        if (savePayoutBtn) {
            savePayoutBtn.addEventListener('click', async () => {
                const select = document.getElementById('stats-month-select');
                const selectedMonth = select ? select.value : formatDate(new Date()).substring(0, 7);
                const val = parseFloat(document.getElementById('received-payout').value) || 0;

                if (!appData.payouts) appData.payouts = {};
                appData.payouts[selectedMonth] = val;

                try {
                    await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                    alert('Zapisano kwotę przelewu!');
                } catch(err) {
                    alert('Błąd zapisu przelewu: ' + err.message);
                }
            });
        }
    }
});
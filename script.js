/* Konfiguracja Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBsNwt33Z3XOyVmBAY6kqlDmLXTwjM-vYY",
    authDomain: "kurier-app-6ac5a.firebaseapp.com",
    projectId: "kurier-app-6ac5a",
    storageBucket: "kurier-app-6ac5a.firebasestorage.app",
    messagingSenderId: "439457783683",
    appId: "1:439457783683:web:57a9353f58e2c42dd9a0b6"
};

// Inicjalizacja Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const appContent = document.getElementById('app-content');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

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
                if (doc.exists && doc.data().pin !== undefined) {
                    const dbPin = String(doc.data().pin).trim();
                    if (inputPin === dbPin) {
                        sessionStorage.setItem('auth_ok', 'true');
                        showApp();
                    } else {
                        alert('Błędny PIN!');
                        document.getElementById('pin-input').value = '';
                    }
                } else {
                    alert('Brak dokumentu settings lub pola pin w bazie Firestore!');
                }
            } catch (error) {
                alert('Błąd podczas weryfikacji PIN-u: ' + error.message);
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
        let appData = { days: {}, payouts: {} };

        // Progi naliczane wyłącznie od 1. zmiany. 2. zmiana dodaje ręcznie ustaloną kwotę.
        function calculateDayRate(firstShiftTotal, hasSecondShift = false, secondShiftRate = 0) {
            const count = parseInt(firstShiftTotal, 10) || 0;
            let rate = 0;

            if (count > 0) {
                if (count < 200) rate = 240;
                else if (count <= 300) rate = 270;
                else if (count > 300) rate = 300;
            }

            if (hasSecondShift) {
                rate += (parseFloat(secondShiftRate) || 0);
            }

            return rate;
        }

        db.collection('kurier_app').doc('main_data')
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    appData.days = data.days || {};
                    appData.payouts = data.payouts || {};
                }
                renderCalendar();
                loadDayToForm(selectedDateStr);
                populateMonthSelector();
                renderStats();
            }, (err) => {
                console.error("Błąd pobierania danych z Firebase:", err);
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
                const mStr = String(month + 1).padStart(2, '0');
                const dStr = String(day).padStart(2, '0');
                const dateStr = `${year}-${mStr}-${dStr}`;
                
                const cell = document.createElement('div');
                cell.className = 'calendar-day';
                if (dateStr === selectedDateStr) cell.classList.add('selected');

                const hasData = appData.days && appData.days[dateStr];
                cell.innerHTML = `<span>${day}</span>${hasData ? '<div style="width:6px;height:6px;background:#10b981;border-radius:50%;margin-top:3px;"></div>' : ''}`;

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

            const dayData = (appData.days && appData.days[dateStr]) 
                ? appData.days[dateStr] 
                : { 
                    address: 0, apm: 0, pudo: 0, pickups: 0, 
                    secondShift: false, secondAddress: 0, secondApm: 0, secondPickups: 0, secondShiftRate: 150 
                  };

            const addrEl = document.getElementById('address');
            const apmEl = document.getElementById('apm');
            const pudoEl = document.getElementById('pudo');
            const pickEl = document.getElementById('pickups');

            const secondShiftCb = document.getElementById('second-shift');
            const secAddrEl = document.getElementById('second-address');
            const secApmEl = document.getElementById('second-apm');
            const secPickEl = document.getElementById('second-pickups');
            const secRateEl = document.getElementById('second-shift-rate');
            const secDetailsDiv = document.getElementById('second-shift-details');

            if (addrEl) addrEl.value = dayData.address !== undefined ? dayData.address : 0;
            if (apmEl) apmEl.value = dayData.apm !== undefined ? dayData.apm : 0;
            if (pudoEl) pudoEl.value = dayData.pudo !== undefined ? dayData.pudo : 0;
            if (pickEl) pickEl.value = dayData.pickups !== undefined ? dayData.pickups : 0;

            const has2nd = Boolean(dayData.secondShift);
            if (secondShiftCb) secondShiftCb.checked = has2nd;
            if (secDetailsDiv) secDetailsDiv.style.display = has2nd ? 'block' : 'none';

            if (secAddrEl) secAddrEl.value = dayData.secondAddress !== undefined ? dayData.secondAddress : 0;
            if (secApmEl) secApmEl.value = dayData.secondApm !== undefined ? dayData.secondApm : 0;
            if (secPickEl) secPickEl.value = dayData.secondPickups !== undefined ? dayData.secondPickups : 0;
            if (secRateEl) secRateEl.value = dayData.secondShiftRate !== undefined ? dayData.secondShiftRate : 150;

            calculateDailyTotals();
        }

        function calculateDailyTotals() {
            const addr = parseInt(document.getElementById('address')?.value, 10) || 0;
            const apm = parseInt(document.getElementById('apm')?.value, 10) || 0;
            const pudo = parseInt(document.getElementById('pudo')?.value, 10) || 0;
            const pick = parseInt(document.getElementById('pickups')?.value, 10) || 0;
            const firstShiftTotal = addr + apm + pudo + pick;

            const secondShiftCb = document.getElementById('second-shift');
            const hasSecondShift = secondShiftCb ? secondShiftCb.checked : false;
            
            const secAddr = hasSecondShift ? (parseInt(document.getElementById('second-address')?.value, 10) || 0) : 0;
            const secApm = hasSecondShift ? (parseInt(document.getElementById('second-apm')?.value, 10) || 0) : 0;
            const secPick = hasSecondShift ? (parseInt(document.getElementById('second-pickups')?.value, 10) || 0) : 0;
            const secRate = hasSecondShift ? (parseFloat(document.getElementById('second-shift-rate')?.value) || 0) : 0;

            const secondShiftTotal = secAddr + secApm + secPick;
            const totalParcels = firstShiftTotal + secondShiftTotal;

            const rate = calculateDayRate(firstShiftTotal, hasSecondShift, secRate);

            const totalEl = document.getElementById('daily-total-parcels');
            const rateEl = document.getElementById('daily-rate');

            if (totalEl) totalEl.textContent = totalParcels;
            if (rateEl) rateEl.textContent = `${rate.toFixed(2)} zł`;
        }

        ['address', 'apm', 'pudo', 'pickups', 'second-address', 'second-apm', 'second-pickups', 'second-shift-rate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', calculateDailyTotals);
                el.addEventListener('keyup', calculateDailyTotals);
                el.addEventListener('change', calculateDailyTotals);
            }
        });

        const secondShiftCb = document.getElementById('second-shift');
        if (secondShiftCb) {
            secondShiftCb.addEventListener('change', (e) => {
                const secDetailsDiv = document.getElementById('second-shift-details');
                if (secDetailsDiv) secDetailsDiv.style.display = e.target.checked ? 'block' : 'none';
                calculateDailyTotals();
            });
        }

        const form = document.getElementById('daily-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                if (!appData.days) appData.days = {};

                const hasSecondShift = document.getElementById('second-shift')?.checked || false;

                appData.days[selectedDateStr] = {
                    address: parseInt(document.getElementById('address')?.value, 10) || 0,
                    apm: parseInt(document.getElementById('apm')?.value, 10) || 0,
                    pudo: parseInt(document.getElementById('pudo')?.value, 10) || 0,
                    pickups: parseInt(document.getElementById('pickups')?.value, 10) || 0,
                    secondShift: hasSecondShift,
                    secondAddress: parseInt(document.getElementById('second-address')?.value, 10) || 0,
                    secondApm: parseInt(document.getElementById('second-apm')?.value, 10) || 0,
                    secondPickups: parseInt(document.getElementById('second-pickups')?.value, 10) || 0,
                    secondShiftRate: parseFloat(document.getElementById('second-shift-rate')?.value) || 0
                };

                try {
                    await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                    alert('Zapisano pomyślnie!');
                } catch(err) {
                    alert('Błąd zapisu: ' + err.message);
                }
            });
        }

        function updateMonthView() {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            selectedDateStr = `${year}-${month}-01`;

            renderCalendar();
            loadDayToForm(selectedDateStr);
            populateMonthSelector();
            renderStats();
        }

        const prevBtn = document.getElementById('prev-month');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() - 1);
                updateMonthView();
            });
        }

        const nextBtn = document.getElementById('next-month');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() + 1);
                updateMonthView();
            });
        }

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

        function renderStats() {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);

            let mAddr = 0, mApm = 0, mPudo = 0, mPick = 0;
            let mEarnings = 0;

            if (appData.days) {
                Object.entries(appData.days).forEach(([date, d]) => {
                    if (date.startsWith(selectedMonth)) {
                        const addr = parseInt(d.address, 10) || 0;
                        const apm = parseInt(d.apm, 10) || 0;
                        const pudo = parseInt(d.pudo, 10) || 0;
                        const pick = parseInt(d.pickups, 10) || 0;

                        const hasSecondShift = !!d.secondShift;
                        const secAddr = hasSecondShift ? (parseInt(d.secondAddress, 10) || 0) : 0;
                        const secApm = hasSecondShift ? (parseInt(d.secondApm, 10) || 0) : 0;
                        const secPick = hasSecondShift ? (parseInt(d.secondPickups, 10) || 0) : 0;
                        const secRate = hasSecondShift ? (parseFloat(d.secondShiftRate) || 0) : 0;

                        mAddr += (addr + secAddr);
                        mApm += (apm + secApm);
                        mPudo += pudo;
                        mPick += (pick + secPick);

                        const firstShiftTotal = addr + apm + pudo + pick;
                        mEarnings += calculateDayRate(firstShiftTotal, hasSecondShift, secRate);
                    }
                });
            }

            const mTotalParcels = mAddr + mApm + mPudo + mPick;

            const statEarnings = document.getElementById('stat-monthly-earnings');
            const statParcels = document.getElementById('stat-monthly-parcels');
            const statAddr = document.getElementById('stat-address');
            const statApm = document.getElementById('stat-apm');
            const statPudo = document.getElementById('stat-pudo');
            const statPick = document.getElementById('stat-pickups');

            if (statEarnings) statEarnings.textContent = `${mEarnings.toFixed(2)} zł`;
            if (statParcels) statParcels.textContent = mTotalParcels;
            if (statAddr) statAddr.textContent = mAddr;
            if (statApm) statApm.textContent = mApm;
            if (statPudo) statPudo.textContent = mPudo;
            if (statPick) statPick.textContent = mPick;

            const calcInput = document.getElementById('calculated-payout');
            if (calcInput) calcInput.value = `${mEarnings.toFixed(2)} zł`;

            const receivedInput = document.getElementById('received-payout');
            if (receivedInput) {
                if (appData.payouts && appData.payouts[selectedMonth] !== undefined) {
                    receivedInput.value = appData.payouts[selectedMonth];
                } else {
                    receivedInput.value = '';
                }
            }
        }

        const savePayoutBtn = document.getElementById('save-payout-btn');
        if (savePayoutBtn) {
            savePayoutBtn.addEventListener('click', async () => {
                const select = document.getElementById('stats-month-select');
                const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);
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
*/
// Konfiguracja Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBsNwt33Z3XOyVmBAY6kqlDmLXTwjM-vYY",
    authDomain: "kurier-app-6ac5a.firebaseapp.com",
    projectId: "kurier-app-6ac5a",
    storageBucket: "kurier-app-6ac5a.firebasestorage.app",
    messagingSenderId: "439457783683",
    appId: "1:439457783683:web:57a9353f58e2c42dd9a0b6"
};

// Inicjalizacja Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const appContent = document.getElementById('app-content');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

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
                if (doc.exists && doc.data().pin !== undefined) {
                    const dbPin = String(doc.data().pin).trim();
                    if (inputPin === dbPin) {
                        sessionStorage.setItem('auth_ok', 'true');
                        showApp();
                    } else {
                        alert('Błędny PIN!');
                        document.getElementById('pin-input').value = '';
                    }
                } else {
                    alert('Brak dokumentu settings lub pola pin w bazie Firestore!');
                }
            } catch (error) {
                alert('Błąd podczas weryfikacji PIN-u: ' + error.message);
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
        let appData = { days: {}, payouts: {} };

        // Wyliczenie stawki: 1. zmiana ma progi (max 300 zł), 2. zmiana dodaje ręczną kwotę
        function calculateDayRate(firstShiftTotal, hasSecondShift = false, secondShiftRate = 0) {
            const count = parseInt(firstShiftTotal, 10) || 0;
            let rate = 0;

            if (count > 0) {
                if (count < 200) rate = 240;
                else if (count <= 300) rate = 270;
                else if (count > 300) rate = 300;
            }

            if (hasSecondShift) {
                rate += (parseFloat(secondShiftRate) || 0);
            }

            return rate;
        }

        db.collection('kurier_app').doc('main_data')
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    appData.days = data.days || {};
                    appData.payouts = data.payouts || {};
                }
                renderCalendar();
                loadDayToForm(selectedDateStr);
                populateMonthSelector();
                renderStats();
            }, (err) => {
                console.error("Błąd pobierania danych z Firebase:", err);
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
                const mStr = String(month + 1).padStart(2, '0');
                const dStr = String(day).padStart(2, '0');
                const dateStr = `${year}-${mStr}-${dStr}`;
                
                const cell = document.createElement('div');
                cell.className = 'calendar-day';
                if (dateStr === selectedDateStr) cell.classList.add('selected');

                const hasData = appData.days && appData.days[dateStr];
                cell.innerHTML = `<span>${day}</span>${hasData ? '<div style="width:6px;height:6px;background:#10b981;border-radius:50%;margin-top:3px;"></div>' : ''}`;

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

            const dayData = (appData.days && appData.days[dateStr]) 
                ? appData.days[dateStr] 
                : { 
                    address: 0, apm: 0, pudo: 0, pickups: 0, 
                    secondShift: false, secondAddress: 0, secondApm: 0, secondPickups: 0, secondShiftRate: 150 
                  };

            const addrEl = document.getElementById('address');
            const apmEl = document.getElementById('apm');
            const pudoEl = document.getElementById('pudo');
            const pickEl = document.getElementById('pickups');

            const secondShiftCb = document.getElementById('second-shift');
            const secAddrEl = document.getElementById('second-address');
            const secApmEl = document.getElementById('second-apm');
            const secPickEl = document.getElementById('second-pickups');
            const secRateEl = document.getElementById('second-shift-rate');
            const secDetailsDiv = document.getElementById('second-shift-details');

            if (addrEl) addrEl.value = dayData.address !== undefined ? dayData.address : 0;
            if (apmEl) apmEl.value = dayData.apm !== undefined ? dayData.apm : 0;
            if (pudoEl) pudoEl.value = dayData.pudo !== undefined ? dayData.pudo : 0;
            if (pickEl) pickEl.value = dayData.pickups !== undefined ? dayData.pickups : 0;

            const has2nd = Boolean(dayData.secondShift);
            if (secondShiftCb) secondShiftCb.checked = has2nd;
            if (secDetailsDiv) secDetailsDiv.style.display = has2nd ? 'block' : 'none';

            if (secAddrEl) secAddrEl.value = dayData.secondAddress !== undefined ? dayData.secondAddress : 0;
            if (secApmEl) secApmEl.value = dayData.secondApm !== undefined ? dayData.secondApm : 0;
            if (secPickEl) secPickEl.value = dayData.secondPickups !== undefined ? dayData.secondPickups : 0;
            if (secRateEl) secRateEl.value = dayData.secondShiftRate !== undefined ? dayData.secondShiftRate : 150;

            calculateDailyTotals();
        }

        function calculateDailyTotals() {
            const addr = parseInt(document.getElementById('address')?.value, 10) || 0;
            const apm = parseInt(document.getElementById('apm')?.value, 10) || 0;
            const pudo = parseInt(document.getElementById('pudo')?.value, 10) || 0;
            const pick = parseInt(document.getElementById('pickups')?.value, 10) || 0;
            const firstShiftTotal = addr + apm + pudo + pick;

            const secondShiftCb = document.getElementById('second-shift');
            const hasSecondShift = secondShiftCb ? secondShiftCb.checked : false;
            
            const secAddr = hasSecondShift ? (parseInt(document.getElementById('second-address')?.value, 10) || 0) : 0;
            const secApm = hasSecondShift ? (parseInt(document.getElementById('second-apm')?.value, 10) || 0) : 0;
            const secPick = hasSecondShift ? (parseInt(document.getElementById('second-pickups')?.value, 10) || 0) : 0;
            const secRate = hasSecondShift ? (parseFloat(document.getElementById('second-shift-rate')?.value) || 0) : 0;

            const secondShiftTotal = secAddr + secApm + secPick;
            const totalParcels = firstShiftTotal + secondShiftTotal;

            const rate = calculateDayRate(firstShiftTotal, hasSecondShift, secRate);

            const totalEl = document.getElementById('daily-total-parcels');
            const rateEl = document.getElementById('daily-rate');

            if (totalEl) totalEl.textContent = totalParcels;
            if (rateEl) rateEl.textContent = `${rate.toFixed(2)} zł`;
        }

        ['address', 'apm', 'pudo', 'pickups', 'second-address', 'second-apm', 'second-pickups', 'second-shift-rate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', calculateDailyTotals);
                el.addEventListener('keyup', calculateDailyTotals);
                el.addEventListener('change', calculateDailyTotals);
            }
        });

        const secondShiftCb = document.getElementById('second-shift');
        if (secondShiftCb) {
            secondShiftCb.addEventListener('change', (e) => {
                const secDetailsDiv = document.getElementById('second-shift-details');
                if (secDetailsDiv) secDetailsDiv.style.display = e.target.checked ? 'block' : 'none';
                calculateDailyTotals();
            });
        }

        const form = document.getElementById('daily-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                if (!appData.days) appData.days = {};

                const hasSecondShift = document.getElementById('second-shift')?.checked || false;

                appData.days[selectedDateStr] = {
                    address: parseInt(document.getElementById('address')?.value, 10) || 0,
                    apm: parseInt(document.getElementById('apm')?.value, 10) || 0,
                    pudo: parseInt(document.getElementById('pudo')?.value, 10) || 0,
                    pickups: parseInt(document.getElementById('pickups')?.value, 10) || 0,
                    secondShift: hasSecondShift,
                    secondAddress: parseInt(document.getElementById('second-address')?.value, 10) || 0,
                    secondApm: parseInt(document.getElementById('second-apm')?.value, 10) || 0,
                    secondPickups: parseInt(document.getElementById('second-pickups')?.value, 10) || 0,
                    secondShiftRate: parseFloat(document.getElementById('second-shift-rate')?.value) || 0
                };

                try {
                    await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                    alert('Zapisano pomyślnie!');
                } catch(err) {
                    alert('Błąd zapisu: ' + err.message);
                }
            });
        }

        function updateMonthView() {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            selectedDateStr = `${year}-${month}-01`;

            renderCalendar();
            loadDayToForm(selectedDateStr);
            populateMonthSelector();
            renderStats();
        }

        const prevBtn = document.getElementById('prev-month');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() - 1);
                updateMonthView();
            });
        }

        const nextBtn = document.getElementById('next-month');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() + 1);
                updateMonthView();
            });
        }

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

        function renderStats() {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);

            let mAddr = 0, mApm = 0, mPudo = 0, mPick = 0;
            let mEarnings = 0;

            if (appData.days) {
                Object.entries(appData.days).forEach(([date, d]) => {
                    if (date.startsWith(selectedMonth)) {
                        const addr = parseInt(d.address, 10) || 0;
                        const apm = parseInt(d.apm, 10) || 0;
                        const pudo = parseInt(d.pudo, 10) || 0;
                        const pick = parseInt(d.pickups, 10) || 0;

                        const hasSecondShift = !!d.secondShift;
                        const secAddr = hasSecondShift ? (parseInt(d.secondAddress, 10) || 0) : 0;
                        const secApm = hasSecondShift ? (parseInt(d.secondApm, 10) || 0) : 0;
                        const secPick = hasSecondShift ? (parseInt(d.secondPickups, 10) || 0) : 0;
                        const secRate = hasSecondShift ? (parseFloat(d.secondShiftRate) || 0) : 0;

                        mAddr += (addr + secAddr);
                        mApm += (apm + secApm);
                        mPudo += pudo;
                        mPick += (pick + secPick);

                        const firstShiftTotal = addr + apm + pudo + pick;
                        mEarnings += calculateDayRate(firstShiftTotal, hasSecondShift, secRate);
                    }
                });
            }

            const mTotalParcels = mAddr + mApm + mPudo + mPick;

            const statEarnings = document.getElementById('stat-monthly-earnings');
            const statParcels = document.getElementById('stat-monthly-parcels');
            const statAddr = document.getElementById('stat-address');
            const statApm = document.getElementById('stat-apm');
            const statPudo = document.getElementById('stat-pudo');
            const statPick = document.getElementById('stat-pickups');

            if (statEarnings) statEarnings.textContent = `${mEarnings.toFixed(2)} zł`;
            if (statParcels) statParcels.textContent = mTotalParcels;
            if (statAddr) statAddr.textContent = mAddr;
            if (statApm) statApm.textContent = mApm;
            if (statPudo) statPudo.textContent = mPudo;
            if (statPick) statPick.textContent = mPick;

            const calcInput = document.getElementById('calculated-payout');
            if (calcInput) calcInput.value = `${mEarnings.toFixed(2)} zł`;

            const receivedInput = document.getElementById('received-payout');
            if (receivedInput) {
                if (appData.payouts && appData.payouts[selectedMonth] !== undefined) {
                    receivedInput.value = appData.payouts[selectedMonth];
                } else {
                    receivedInput.value = '';
                }
            }
        }

        const savePayoutBtn = document.getElementById('save-payout-btn');
        if (savePayoutBtn) {
            savePayoutBtn.addEventListener('click', async () => {
                const select = document.getElementById('stats-month-select');
                const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);
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

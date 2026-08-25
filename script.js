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
                    alert('Brak dokumentu settings lub pola pin w bazie!');
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
        let appData = { days: {}, payouts: {}, settings: {} };

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
                }
                renderCalendar();
                loadDayToForm(selectedDateStr);
                populateMonthSelector();
                renderStats();
            }, (err) => console.error("Błąd Firebase:", err));

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

                const dayData = appData.days && appData.days[dateStr];
                
                let dotsHtml = '';
                if (dayData) {
                    dotsHtml += '<div style="display:flex; gap:3px; margin-top:3px;">';
                    dotsHtml += '<div style="width:6px;height:6px;background:#10b981;border-radius:50%;"></div>';
                    if (dayData.secondShift) {
                        dotsHtml += '<div style="width:6px;height:6px;background:#8b5cf6;border-radius:50%;"></div>';
                    }
                    dotsHtml += '</div>';
                }

                cell.innerHTML = `<span>${day}</span>${dotsHtml}`;

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
                    address: 0, apmPudo: 0, awizo: 0, pickups: 0, tips: 0, workStart: '', workEnd: '',
                    secondShift: false, secondWorkStart: '', secondWorkEnd: '', secondAddress: 0, secondApmPudo: 0, secondPickups: 0, secondShiftRate: 180 
                  };

            document.getElementById('work-start').value = dayData.workStart || '';
            document.getElementById('work-end').value = dayData.workEnd || '';
            document.getElementById('tips').value = dayData.tips !== undefined ? dayData.tips : 0;

            document.getElementById('address').value = dayData.address !== undefined ? dayData.address : 0;
            document.getElementById('apm-pudo').value = dayData.apmPudo !== undefined ? dayData.apmPudo : (dayData.apm || 0);
            document.getElementById('awizo').value = dayData.awizo !== undefined ? dayData.awizo : 0;
            document.getElementById('pickups').value = dayData.pickups !== undefined ? dayData.pickups : 0;

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
            document.getElementById('second-shift-rate').value = dayData.secondShiftRate !== undefined ? dayData.secondShiftRate : 180;

            calculateDailyTotals();
        }

        function calculateDailyTotals() {
            // Czas 1. zmiany
            const startStr1 = document.getElementById('work-start')?.value;
            const endStr1 = document.getElementById('work-end')?.value;
            let totalMinutes = calculateWorkMinutes(startStr1, endStr1);

            // Czas 2. zmiany
            const hasSecondShift = document.getElementById('second-shift')?.checked || false;
            if (hasSecondShift) {
                const startStr2 = document.getElementById('second-work-start')?.value;
                const endStr2 = document.getElementById('second-work-end')?.value;
                totalMinutes += calculateWorkMinutes(startStr2, endStr2);
            }

            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;

            const hoursEl = document.getElementById('daily-hours');
            if (hoursEl) hoursEl.textContent = `${hours}h ${mins}m`;

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

            const totalEl = document.getElementById('daily-total-parcels');
            const rateEl = document.getElementById('daily-rate');

            if (totalEl) totalEl.textContent = totalParcels;
            if (rateEl) rateEl.textContent = `${totalEarn.toFixed(2)} zł ${tips > 0 ? `(w tym ${tips}zł tip)` : ''}`;
        }

        ['address', 'apm-pudo', 'awizo', 'pickups', 'tips', 'work-start', 'work-end', 
         'second-work-start', 'second-work-end', 'second-address', 'second-apm-pudo', 'second-pickups', 'second-shift-rate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', calculateDailyTotals);
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
                    secondShiftRate: parseFloat(document.getElementById('second-shift-rate')?.value) || 0
                };

                try {
                    await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                    alert('Zapisano dzień!');
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

        function renderStats() {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);

            let mAddr = 0, mApmPudo = 0, mAwizo = 0, mPick = 0;
            let mEarnings = 0, mTips = 0, mMinutes = 0;

            if (appData.days) {
                Object.entries(appData.days).forEach(([date, d]) => {
                    if (date.startsWith(selectedMonth)) {
                        const addr = parseInt(d.address, 10) || 0;
                        const apmPudo = parseInt(d.apmPudo, 10) || (parseInt(d.apm, 10) || 0);
                        const awizo = parseInt(d.awizo, 10) || 0;
                        const pick = parseInt(d.pickups, 10) || 0;
                        const tips = parseFloat(d.tips) || 0;

                        const hasSecondShift = !!d.secondShift;
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
                        if (hasSecondShift) {
                            dayMinutes += calculateWorkMinutes(d.secondWorkStart, d.secondWorkEnd);
                        }
                        mMinutes += dayMinutes;

                        const firstShiftTotal = addr + apmPudo + awizo + pick;
                        mEarnings += calculateDayRate(firstShiftTotal, hasSecondShift, secRate);
                    }
                });
            }

            const mTotalParcels = mAddr + mApmPudo + mAwizo + mPick;
            const mHours = Math.round((mMinutes / 60) * 10) / 10;

            document.getElementById('stat-monthly-earnings').textContent = `${mEarnings.toFixed(2)} zł`;
            document.getElementById('stat-monthly-tips').textContent = `${mTips.toFixed(2)} zł`;
            document.getElementById('stat-monthly-hours').textContent = `${mHours}h`;
            document.getElementById('stat-monthly-parcels').textContent = mTotalParcels;
            document.getElementById('stat-address').textContent = mAddr;
            document.getElementById('stat-apm-pudo').textContent = mApmPudo;
            document.getElementById('stat-awizo').textContent = mAwizo;
            document.getElementById('stat-pickups').textContent = mPick;

            document.getElementById('calculated-payout').value = `${mEarnings.toFixed(2)} zł`;

            const receivedInput = document.getElementById('received-payout');
            if (receivedInput) {
                receivedInput.value = (appData.payouts && appData.payouts[selectedMonth] !== undefined)
                    ? appData.payouts[selectedMonth] : '';
            }

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

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                alert('Zapisano kwotę przelewu!');
            } catch(err) {
                alert('Błąd zapisu: ' + err.message);
            }
        });
    }
});

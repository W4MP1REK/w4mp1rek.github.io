// ==========================================
// KURIER APP - GŁÓWNY SKRYPT APLIKACJI
// ==========================================

// --- STAN APLIKACJI I ZMIENNE GLOBALNE ---
let db = null;
let currentUserPin = null;
let userStore = {};       // Slownik danych dziennych: { "YYYY-MM-DD": { ... } }
let payoutStore = {};     // Slownik przelewow: { "YYYY-MM": number }
let userSettings = {
    tier1Rate: 2.50,
    tier2Limit: 100,
    tier2Rate: 3.00,
    tier3Limit: 150,
    tier3Rate: 3.50,
    defaultSecondShiftRate: 50.00,
    monthlyGoal: 6000,
    themeMode: 'dark',
    accentColor: '#3b82f6',
    compactCalendar: false
};

let currentDate = new Date();
let currentYear = currentDate.getFullYear();
let currentMonth = currentDate.getMonth(); // 0 - 11
let currentSelectedDate = null;             // Data YYYY-MM-DD otwartego dnia

// --- INICJALIZACJA APLIKACJI ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    setupTabNavigation();
    setupEventListeners();
    applyThemeSettings();
});

// --- FIREBASE INICJALIZACJA I POLĄCZENIE ---
function initFirebase() {
    const firebaseConfig = {
        apiKey: "AIzaSyYourConfigHere",
        authDomain: "kurier-app.firebaseapp.com",
        projectId: "kurier-app",
        storageBucket: "kurier-app.appspot.com",
        messagingSenderId: "123456789",
        appId: "1:123456789:web:abcdef"
    };

    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();

        // Obsługa trybu offline w Firestore
        db.enablePersistence().catch(err => {
            console.warn("Tryb offline Firestore niedostępny:", err.code);
        });

        // Wskaźnik stanu połączenia
        window.addEventListener('online', updateCloudStatus);
        window.addEventListener('offline', updateCloudStatus);
        updateCloudStatus();
    }
}

function updateCloudStatus() {
    const statusBadge = document.getElementById('cloud-status');
    if (!statusBadge) return;

    if (navigator.onLine) {
        statusBadge.innerText = "Online";
        statusBadge.className = "status-badge online";
    } else {
        statusBadge.innerText = "Offline";
        statusBadge.className = "status-badge offline";
    }
}

// --- LOGOWANIE I AUTORYZACJA (PIN) ---
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pinInput = document.getElementById('pin-input').value.trim();

    if (pinInput) {
        currentUserPin = pinInput;
        document.getElementById('auth-modal').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        
        loadUserData();
    }
});

// --- POBIERANIE I ZAPIS DANYCH W BAZIE ---
function loadUserData() {
    if (!db || !currentUserPin) {
        renderCalendar();
        renderStats();
        renderRecords();
        return;
    }

    logActivity("Pobieranie danych z bazy...");
    db.collection("users").doc(currentUserPin).get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            userStore = data.records || {};
            payoutStore = data.payouts || {};
            if (data.settings) userSettings = { ...userSettings, ...data.settings };
            logActivity("Pomyślnie załadowano dane użytkownika.");
        } else {
            logActivity("Utworzono nowy profil użytkownika.");
        }
        applyThemeSettings();
        populateSettingsForm();
        populateMonthDropdowns();
        renderCalendar();
        renderStats();
        renderRecords();
    }).catch((error) => {
        console.error("Błąd pobierania danych:", error);
        logActivity("Praca w trybie lokalnym/offline.");
        renderCalendar();
        renderStats();
        renderRecords();
    });
}

function saveUserData() {
    if (!db || !currentUserPin) return;

    db.collection("users").doc(currentUserPin).set({
        records: userStore,
        payouts: payoutStore,
        settings: userSettings
    }, { merge: true }).then(() => {
        logActivity("Zapisano dane w chmurze Firebase.");
    }).catch(err => {
        console.error("Błąd zapisu do Firebase:", err);
        logActivity("Błąd zapisu w chmurze - dane zapisane lokalnie.");
    });
}

// --- OBSŁUGA NAWIGACJI PO ZAKŁADKACH ---
function setupTabNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            if (targetTab === 'tab-stats') {
                populateMonthDropdowns();
                renderStats();
            } else if (targetTab === 'tab-records') {
                renderRecords();
            }
        });
    });
}

// --- RENDERING KALENDARZA ---
function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearTitle = document.getElementById('calendar-month-year');
    if (!calendarGrid || !monthYearTitle) return;

    calendarGrid.innerHTML = '';

    const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
    monthYearTitle.innerText = `${monthNames[currentMonth]} ${currentYear}`;

    // Nagłówki dni tygodnia
    const daysOfWeek = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sob', 'Nd'];
    daysOfWeek.forEach(day => {
        const header = document.createElement('div');
        header.classList.add('calendar-day-header');
        header.innerText = day;
        calendarGrid.appendChild(header);
    });

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    let paddingDays = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Puste komórki do wyrównania pierwszego dnia
    for (let i = 0; i < paddingDays; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('calendar-day', 'empty');
        emptyCell.style.opacity = '0.2';
        calendarGrid.appendChild(emptyCell);
    }

    // Komórki z dniami miesiąca
    for (let day = 1; day <= daysInMonth; day++) {
        const daySquare = document.createElement('div');
        daySquare.classList.add('calendar-day');

        const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        daySquare.dataset.date = dateString;

        const dayData = userStore[dateString];
        let dayContent = `<span class="day-number">${day}</span>`;

        if (dayData) {
            const shift1Parcels = (dayData.address || 0) + (dayData.apmPudo || 0) + (dayData.awizo || 0) + (dayData.pickups || 0);
            const shift2Parcels = (dayData.secondAddress || 0) + (dayData.secondApmPudo || 0) + (dayData.secondPickups || 0);
            const totalParcels = shift1Parcels + (dayData.hasSecondShift ? shift2Parcels : 0);

            // Kolorowanie progu (dla 1. zmiany)
            if (shift1Parcels >= userSettings.tier3Limit) {
                daySquare.classList.add('tier-high');
            } else if (shift1Parcels >= userSettings.tier2Limit) {
                daySquare.classList.add('tier-mid');
            } else if (shift1Parcels > 0) {
                daySquare.classList.add('tier-low');
            }

            if (dayData.hasSecondShift) {
                dayContent += `<span class="second-shift-tag">2Z</span>`;
            }

            if (totalParcels > 0) {
                dayContent += `<div style="font-size: 0.72rem; font-weight: bold; margin-top: 2px;">📦 ${totalParcels}</div>`;
            }
        }

        if (currentSelectedDate === dateString) {
            daySquare.classList.add('selected');
        }

        daySquare.innerHTML = dayContent;

        // Kliknięcie w dzień kalendarza
        daySquare.addEventListener('click', () => {
            document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
            daySquare.classList.add('selected');

            openDayEditor(dateString);
        });

        calendarGrid.appendChild(daySquare);
    }
}

// --- EDYTOR DNIA (POD KALENDARZEM) ---
function openDayEditor(dateString) {
    currentSelectedDate = dateString;
    const dayEditorPanel = document.getElementById('day-editor-panel');
    const selectedTitle = document.getElementById('selected-date-title');

    if (!dayEditorPanel) return;

    selectedTitle.innerText = `Wybrany dzień: ${dateString}`;
    dayEditorPanel.style.display = 'block';

    loadDayDataIntoForm(dateString);
    dayEditorPanel.scrollIntoView({ behavior: 'smooth' });
}

function closeDayEditor() {
    const dayEditorPanel = document.getElementById('day-editor-panel');
    if (dayEditorPanel) {
        dayEditorPanel.style.display = 'none';
    }
    currentSelectedDate = null;
    document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
}

function loadDayDataIntoForm(dateString) {
    const dayData = userStore[dateString] || {};

    document.getElementById('work-start').value = dayData.workStart || '';
    document.getElementById('work-end').value = dayData.workEnd || '';
    document.getElementById('address').value = dayData.address || '';
    document.getElementById('apm-pudo').value = dayData.apmPudo || '';
    document.getElementById('awizo').value = dayData.awizo || '';
    document.getElementById('pickups').value = dayData.pickups || '';
    document.getElementById('tips').value = dayData.tips || '';
    document.getElementById('daily-note').value = dayData.note || '';

    const secShiftCheckbox = document.getElementById('second-shift');
    const secShiftDetails = document.getElementById('second-shift-details');

    if (dayData.hasSecondShift) {
        secShiftCheckbox.checked = true;
        secShiftDetails.style.display = 'block';
        document.getElementById('second-work-start').value = dayData.secondWorkStart || '';
        document.getElementById('second-work-end').value = dayData.secondWorkEnd || '';
        document.getElementById('second-address').value = dayData.secondAddress || '';
        document.getElementById('second-apm-pudo').value = dayData.secondApmPudo || '';
        document.getElementById('second-pickups').value = dayData.secondPickups || '';
        document.getElementById('second-shift-rate').value = dayData.secondShiftRate !== undefined ? dayData.secondShiftRate : userSettings.defaultSecondShiftRate;
    } else {
        secShiftCheckbox.checked = false;
        secShiftDetails.style.display = 'none';
        document.getElementById('second-work-start').value = '';
        document.getElementById('second-work-end').value = '';
        document.getElementById('second-address').value = '';
        document.getElementById('second-apm-pudo').value = '';
        document.getElementById('second-pickups').value = '';
        document.getElementById('second-shift-rate').value = userSettings.defaultSecondShiftRate;
    }

    calculateDailySummary();
}

// --- PRZELICZANIE PODSUMOWANIA DNIA NA ŻYWO ---
function calculateDailySummary() {
    const workStart = document.getElementById('work-start').value;
    const workEnd = document.getElementById('work-end').value;

    const address = parseInt(document.getElementById('address').value) || 0;
    const apmPudo = parseInt(document.getElementById('apm-pudo').value) || 0;
    const awizo = parseInt(document.getElementById('awizo').value) || 0;
    const pickups = parseInt(document.getElementById('pickups').value) || 0;
    const tips = parseFloat(document.getElementById('tips').value) || 0;

    const hasSecondShift = document.getElementById('second-shift').checked;
    const secAddress = parseInt(document.getElementById('second-address').value) || 0;
    const secApmPudo = parseInt(document.getElementById('second-apm-pudo').value) || 0;
    const secPickups = parseInt(document.getElementById('second-pickups').value) || 0;
    const secRate = parseFloat(document.getElementById('second-shift-rate').value) || 0;

    const shift1Parcels = address + apmPudo + awizo + pickups;
    const shift2Parcels = secAddress + secApmPudo + secPickups;
    const totalParcels = shift1Parcels + (hasSecondShift ? shift2Parcels : 0);

    let totalMinutes = calculateMinutesBetween(workStart, workEnd);

    if (hasSecondShift) {
        const secStart = document.getElementById('second-work-start').value;
        const secEnd = document.getElementById('second-work-end').value;
        totalMinutes += calculateMinutesBetween(secStart, secEnd);
    }

    // Stawka progowa 1. zmiany
    let tierRate = userSettings.tier1Rate;
    if (shift1Parcels >= userSettings.tier3Limit) {
        tierRate = userSettings.tier3Rate;
    } else if (shift1Parcels >= userSettings.tier2Limit) {
        tierRate = userSettings.tier2Rate;
    }

    let totalEarnings = (shift1Parcels * tierRate) + tips;
    if (hasSecondShift) totalEarnings += secRate;

    const hoursDecimal = totalMinutes / 60;
    const pace = hoursDecimal > 0 ? (totalParcels / hoursDecimal).toFixed(1) : "0.0";
    const hourlyRate = hoursDecimal > 0 ? (totalEarnings / hoursDecimal).toFixed(2) : "0.00";
    const timePerParcel = totalParcels > 0 ? (totalMinutes / totalParcels).toFixed(1) : "0.0";

    document.getElementById('daily-hours').innerText = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    document.getElementById('daily-total-parcels').innerText = totalParcels;
    document.getElementById('daily-rate').innerText = `${totalEarnings.toFixed(2)} zł`;
    document.getElementById('daily-pace').innerText = `${pace} paczek/h`;
    document.getElementById('daily-hourly-rate').innerText = `${hourlyRate} zł/h`;
    document.getElementById('daily-time-per-parcel').innerText = `${timePerParcel} min/paczka`;
}

function calculateMinutesBetween(start, end) {
    if (!start || !end) return 0;
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);

    let startMins = sH * 60 + sM;
    let endMins = eH * 60 + eM;
    if (endMins < startMins) endMins += 24 * 60; // Doba przekroczona

    return endMins - startMins;
}

// ZAPISYWANIE DNIA
document.getElementById('daily-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentSelectedDate) return;

    const hasSecondShift = document.getElementById('second-shift').checked;

    userStore[currentSelectedDate] = {
        workStart: document.getElementById('work-start').value,
        workEnd: document.getElementById('work-end').value,
        address: parseInt(document.getElementById('address').value) || 0,
        apmPudo: parseInt(document.getElementById('apm-pudo').value) || 0,
        awizo: parseInt(document.getElementById('awizo').value) || 0,
        pickups: parseInt(document.getElementById('pickups').value) || 0,
        tips: parseFloat(document.getElementById('tips').value) || 0,
        note: document.getElementById('daily-note').value,
        hasSecondShift: hasSecondShift,
        secondWorkStart: hasSecondShift ? document.getElementById('second-work-start').value : '',
        secondWorkEnd: hasSecondShift ? document.getElementById('second-work-end').value : '',
        secondAddress: hasSecondShift ? parseInt(document.getElementById('second-address').value) || 0 : 0,
        secondApmPudo: hasSecondShift ? parseInt(document.getElementById('second-apm-pudo').value) || 0 : 0,
        secondPickups: hasSecondShift ? parseInt(document.getElementById('second-pickups').value) || 0 : 0,
        secondShiftRate: hasSecondShift ? parseFloat(document.getElementById('second-shift-rate').value) || 0 : 0
    };

    saveUserData();
    renderCalendar();
    logActivity(`Zapisano dane dla dnia ${currentSelectedDate}`);
    alert('Dzień został pomyślnie zapisany!');
});

// --- STATYSTYKI MIESIĘCZNE & FUNKCJE POMOCNICZE ---
function populateMonthDropdowns() {
    const statsSelect = document.getElementById('stats-month-select');
    const compSelect1 = document.getElementById('compare-month-1');
    const compSelect2 = document.getElementById('compare-month-2');

    if (!statsSelect || !compSelect1 || !compSelect2) return;

    // Pobierz unikalne miesiące ze store
    const monthsSet = new Set();
    const currStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    monthsSet.add(currStr);

    Object.keys(userStore).forEach(dateStr => {
        monthsSet.add(dateStr.substring(0, 7));
    });

    const sortedMonths = Array.from(monthsSet).sort().reverse();

    const generateOptions = (selectedVal) => {
        return sortedMonths.map(m => `<option value="${m}" ${m === selectedVal ? 'selected' : ''}>${m}</option>`).join('');
    };

    statsSelect.innerHTML = generateOptions(currStr);
    compSelect1.innerHTML = generateOptions(sortedMonths[0] || currStr);
    compSelect2.innerHTML = generateOptions(sortedMonths[1] || sortedMonths[0] || currStr);
}

function renderStats() {
    const statsSelect = document.getElementById('stats-month-select');
    const targetMonthStr = statsSelect ? statsSelect.value : `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    let totalEarningsNoTips = 0;
    let totalTips = 0;
    let totalDays = 0;
    let totalSecondShiftDays = 0;
    let totalMinutes = 0;
    let totalParcels = 0;

    let addressSum = 0, apmPudoSum = 0, awizoSum = 0, pickupsSum = 0;

    Object.keys(userStore).forEach(date => {
        if (date.startsWith(targetMonthStr)) {
            const day = userStore[date];
            const shift1Parcels = (day.address || 0) + (day.apmPudo || 0) + (day.awizo || 0) + (day.pickups || 0);
            const shift2Parcels = (day.secondAddress || 0) + (day.secondApmPudo || 0) + (day.secondPickups || 0);
            const dayTotalParcels = shift1Parcels + (day.hasSecondShift ? shift2Parcels : 0);

            if (dayTotalParcels > 0 || day.workStart) {
                totalDays++;
            }

            addressSum += (day.address || 0) + (day.hasSecondShift ? (day.secondAddress || 0) : 0);
            apmPudoSum += (day.apmPudo || 0) + (day.hasSecondShift ? (day.secondApmPudo || 0) : 0);
            awizoSum += (day.awizo || 0);
            pickupsSum += (day.pickups || 0) + (day.hasSecondShift ? (day.secondPickups || 0) : 0);

            let tierRate = userSettings.tier1Rate;
            if (shift1Parcels >= userSettings.tier3Limit) tierRate = userSettings.tier3Rate;
            else if (shift1Parcels >= userSettings.tier2Limit) tierRate = userSettings.tier2Rate;

            let dayEarnings = (shift1Parcels * tierRate);
            if (day.hasSecondShift) {
                dayEarnings += (day.secondShiftRate || 0);
                totalSecondShiftDays++;
            }

            totalEarningsNoTips += dayEarnings;
            totalTips += (day.tips || 0);

            const dayMins = calculateMinutesBetween(day.workStart, day.workEnd) + 
                            (day.hasSecondShift ? calculateMinutesBetween(day.secondWorkStart, day.secondWorkEnd) : 0);
            totalMinutes += dayMins;
            totalParcels += dayTotalParcels;
        }
    });

    const hoursDecimal = totalMinutes / 60;
    const avgDaily = totalDays > 0 ? (totalEarningsNoTips / totalDays).toFixed(2) : '0.00';
    const pace = hoursDecimal > 0 ? (totalParcels / hoursDecimal).toFixed(1) : '0.0';
    const hourlyRate = hoursDecimal > 0 ? ((totalEarningsNoTips + totalTips) / hoursDecimal).toFixed(2) : '0.00';
    const avgTimePerParcel = totalParcels > 0 ? (totalMinutes / totalParcels).toFixed(1) : '0.0';

    // Średnia godz./tydzień (zakładamy 4.33 tygodnia w miesiącu)
    const avgWeeklyHours = (hoursDecimal / 4.33).toFixed(1);

    // Prognoza zarobków (na bazie przepracowanych dni i założenia ~21 dni roboczych)
    const forecast = totalDays > 0 ? ((totalEarningsNoTips / totalDays) * 21).toFixed(2) : '0.00';

    document.getElementById('stat-forecast').innerText = `~${forecast} zł`;
    document.getElementById('stat-monthly-earnings').innerText = `${totalEarningsNoTips.toFixed(2)} zł`;
    document.getElementById('stat-monthly-tips').innerText = `${totalTips.toFixed(2)} zł`;
    document.getElementById('stat-avg-daily').innerText = `${avgDaily} zł`;
    document.getElementById('stat-monthly-days').innerText = `${totalDays} dni`;
    document.getElementById('stat-second-shift-days').innerText = `${totalSecondShiftDays} dni`;
    document.getElementById('stat-monthly-hours').innerText = `${Math.round(hoursDecimal)}h`;
    document.getElementById('stat-avg-weekly-hours').innerText = `${avgWeeklyHours}h`;
    document.getElementById('stat-monthly-pace').innerText = `${pace} paczek/h`;
    document.getElementById('stat-monthly-hourly-rate').innerText = `${hourlyRate} zł/h`;
    document.getElementById('stat-avg-time-per-parcel').innerText = `${avgTimePerParcel} min`;
    document.getElementById('stat-monthly-parcels').innerText = totalParcels;

    document.getElementById('stat-address').innerText = addressSum;
    document.getElementById('stat-apm-pudo').innerText = apmPudoSum;
    document.getElementById('stat-awizo').innerText = awizoSum;
    document.getElementById('stat-pickups').innerText = pickupsSum;

    // Cel finansowy i pasek postępu
    const goalVal = parseFloat(document.getElementById('monthly-goal-input').value) || userSettings.monthlyGoal;
    const totalWithTips = totalEarningsNoTips + totalTips;
    const progressPercent = Math.min(100, Math.round((totalWithTips / goalVal) * 100));
    
    document.getElementById('progress-bar-fill').style.width = `${progressPercent}%`;
    document.getElementById('progress-bar-text').innerText = `${progressPercent}% (${totalWithTips.toFixed(0)} / ${goalVal} zł)`;

    // Sekcja weryfikacji przelewu
    const calcPayoutInput = document.getElementById('calculated-payout');
    const recPayoutInput = document.getElementById('received-payout');
    const diffPayoutInput = document.getElementById('payout-difference');

    calcPayoutInput.value = `${totalEarningsNoTips.toFixed(2)} zł`;
    recPayoutInput.value = payoutStore[targetMonthStr] || '';
    
    calculatePayoutDiff();
}

function calculatePayoutDiff() {
    const calcVal = parseFloat(document.getElementById('calculated-payout').value) || 0;
    const recVal = parseFloat(document.getElementById('received-payout').value) || 0;
    const diffInput = document.getElementById('payout-difference');

    if (recVal > 0) {
        const diff = recVal - calcVal;
        diffInput.value = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} zł`;
        diffInput.style.color = diff < 0 ? '#ef4444' : '#10b981';
    } else {
        diffInput.value = '0.00 zł';
        diffInput.style.color = 'inherit';
    }
}

// ZAPIS PRZELEWU
document.getElementById('save-payout-btn').addEventListener('click', () => {
    const statsSelect = document.getElementById('stats-month-select');
    const targetMonthStr = statsSelect ? statsSelect.value : `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const recVal = parseFloat(document.getElementById('received-payout').value) || 0;

    payoutStore[targetMonthStr] = recVal;
    saveUserData();
    logActivity(`Zapisano przelew dla ${targetMonthStr}: ${recVal} zł`);
    alert('Kwota przelewu została zapisana!');
});

// PORÓWNYWARKA MIESIĘCY
document.getElementById('btn-compare-months').addEventListener('click', () => {
    const m1 = document.getElementById('compare-month-1').value;
    const m2 = document.getElementById('compare-month-2').value;
    const resultsContainer = document.getElementById('comparison-results');

    const getMonthData = (mStr) => {
        let earnings = 0, parcels = 0, days = 0, tips = 0;
        Object.keys(userStore).forEach(d => {
            if (d.startsWith(mStr)) {
                const day = userStore[d];
                const shift1 = (day.address || 0) + (day.apmPudo || 0) + (day.awizo || 0) + (day.pickups || 0);
                const shift2 = (day.secondAddress || 0) + (day.secondApmPudo || 0) + (day.secondPickups || 0);
                const total = shift1 + (day.hasSecondShift ? shift2 : 0);

                if (total > 0) days++;
                parcels += total;
                tips += (day.tips || 0);

                let rate = userSettings.tier1Rate;
                if (shift1 >= userSettings.tier3Limit) rate = userSettings.tier3Rate;
                else if (shift1 >= userSettings.tier2Limit) rate = userSettings.tier2Rate;

                earnings += (shift1 * rate) + (day.hasSecondShift ? (day.secondShiftRate || 0) : 0);
            }
        });
        return { earnings, parcels, days, tips };
    };

    const d1 = getMonthData(m1);
    const d2 = getMonthData(m2);

    resultsContainer.innerHTML = `
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>Metryka</th>
                    <th>${m1}</th>
                    <th>${m2}</th>
                    <th>Różnica</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Zarobek (bez tipów)</td>
                    <td>${d1.earnings.toFixed(2)} zł</td>
                    <td>${d2.earnings.toFixed(2)} zł</td>
                    <td style="color: ${d2.earnings >= d1.earnings ? '#10b981' : '#ef4444'}">
                        ${(d2.earnings - d1.earnings).toFixed(2)} zł
                    </td>
                </tr>
                <tr>
                    <td>Suma paczek</td>
                    <td>${d1.parcels}</td>
                    <td>${d2.parcels}</td>
                    <td>${d2.parcels - d1.parcels}</td>
                </tr>
                <tr>
                    <td>Napiwki</td>
                    <td>${d1.tips.toFixed(2)} zł</td>
                    <td>${d2.tips.toFixed(2)} zł</td>
                    <td>${(d2.tips - d1.tips).toFixed(2)} zł</td>
                </tr>
                <tr>
                    <td>Dni przepracowane</td>
                    <td>${d1.days}</td>
                    <td>${d2.days}</td>
                    <td>${d2.days - d1.days}</td>
                </tr>
            </tbody>
        </table>
    `;
});

// --- REKORDY I ODZNAKI ---
function renderRecords() {
    let maxParcels = 0, maxTip = 0, maxEarning = 0, maxPace = 0;

    Object.values(userStore).forEach(day => {
        const shift1 = (day.address || 0) + (day.apmPudo || 0) + (day.awizo || 0) + (day.pickups || 0);
        const shift2 = (day.secondAddress || 0) + (day.secondApmPudo || 0) + (day.secondPickups || 0);
        const totalParcels = shift1 + (day.hasSecondShift ? shift2 : 0);

        let rate = userSettings.tier1Rate;
        if (shift1 >= userSettings.tier3Limit) rate = userSettings.tier3Rate;
        else if (shift1 >= userSettings.tier2Limit) rate = userSettings.tier2Rate;

        let earning = (shift1 * rate) + (day.tips || 0) + (day.hasSecondShift ? (day.secondShiftRate || 0) : 0);
        const mins = calculateMinutesBetween(day.workStart, day.workEnd) + 
                     (day.hasSecondShift ? calculateMinutesBetween(day.secondWorkStart, day.secondWorkEnd) : 0);
        const pace = mins > 0 ? (totalParcels / (mins / 60)) : 0;

        if (totalParcels > maxParcels) maxParcels = totalParcels;
        if ((day.tips || 0) > maxTip) maxTip = day.tips;
        if (earning > maxEarning) maxEarning = earning;
        if (pace > maxPace) maxPace = pace;
    });

    document.getElementById('rec-max-parcels').innerText = maxParcels;
    document.getElementById('rec-max-tip').innerText = `${maxTip.toFixed(2)} zł`;
    document.getElementById('rec-max-earning').innerText = `${maxEarning.toFixed(2)} zł`;
    document.getElementById('rec-max-pace').innerText = maxPace.toFixed(1);

    renderBadges({ maxParcels, maxTip, maxEarning, maxPace });
}

function renderBadges(records) {
    const badgesContainer = document.getElementById('badges-container');
    if (!badgesContainer) return;

    const list = [
        { id: 'b1', name: 'Pierwsza Paczka', desc: 'Dostarcz pierwszą paczkę', unlocked: records.maxParcels > 0 },
        { id: 'b2', name: 'Setka Dnia', desc: 'Dostarcz 100 paczek w 1 dzień', unlocked: records.maxParcels >= 100 },
        { id: 'b3', name: 'Prędkość Światła', desc: 'Osiągnij tempo 25 paczek/h', unlocked: records.maxPace >= 25 },
        { id: 'b4', name: 'Sowity Napiwek', desc: 'Zgarnij min. 20 zł tipa w 1 dzień', unlocked: records.maxTip >= 20 },
        { id: 'b5', name: 'Złoty Dzień', desc: 'Zarób ponad 400 zł jednego dnia', unlocked: records.maxEarning >= 400 }
    ];

    badgesContainer.innerHTML = list.map(b => `
        <div class="badge-card ${b.unlocked ? 'unlocked' : ''}">
            <div style="font-size: 1.5rem;">${b.unlocked ? '🏆' : '🔒'}</div>
            <strong>${b.name}</strong>
            <p style="font-size: 0.75rem; margin-top: 4px;">${b.desc}</p>
        </div>
    `).join('');
}

// --- USTAWIENIA I SYSTEM MOTYWÓW ---
function populateSettingsForm() {
    document.getElementById('cfg-rate-tier1').value = userSettings.tier1Rate;
    document.getElementById('cfg-tier2-limit').value = userSettings.tier2Limit;
    document.getElementById('cfg-rate-tier2').value = userSettings.tier2Rate;
    document.getElementById('cfg-tier3-limit').value = userSettings.tier3Limit;
    document.getElementById('cfg-rate-tier3').value = userSettings.tier3Rate;
    document.getElementById('cfg-default-sec-rate').value = userSettings.defaultSecondShiftRate;
    document.getElementById('theme-mode-select').value = userSettings.themeMode;
    document.getElementById('theme-color-picker').value = userSettings.accentColor;
    document.getElementById('toggle-compact-calendar').checked = userSettings.compactCalendar;
}

function applyThemeSettings() {
    document.body.setAttribute('data-theme', userSettings.themeMode || 'dark');
    document.documentElement.style.setProperty('--primary-color', userSettings.accentColor || '#3b82f6');

    const calGrid = document.getElementById('calendar-grid');
    if (calGrid) {
        if (userSettings.compactCalendar) calGrid.classList.add('compact-view');
        else calGrid.classList.remove('compact-view');
    }
}

function logActivity(text) {
    const list = document.getElementById('activity-log-list');
    if (!list) return;
    const item = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    item.innerText = `[${time}] ${text}`;
    list.prepend(item);
}

// --- ZDARZENIA (EVENT LISTENERS) ---
function setupEventListeners() {
    // Zamknięcie edytora dnia (✖)
    const closeBtn = document.getElementById('close-day-editor');
    if (closeBtn) closeBtn.addEventListener('click', closeDayEditor);

    // Nawigacja kalendarza
    document.getElementById('prev-month').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        renderCalendar();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        renderCalendar();
    });

    document.getElementById('btn-today').addEventListener('click', () => {
        currentDate = new Date();
        currentYear = currentDate.getFullYear();
        currentMonth = currentDate.getMonth();
        renderCalendar();
    });

    // Druga zmiana włączenie / wyłączenie
    document.getElementById('second-shift').addEventListener('change', (e) => {
        document.getElementById('second-shift-details').style.display = e.target.checked ? 'block' : 'none';
        calculateDailySummary();
    });

    // Przyciski "Teraz" dla godzin
    document.querySelectorAll('.btn-now').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            document.getElementById(targetId).value = timeStr;
            calculateDailySummary();
        });
    });

    // Przeliczanie formularza dnia na żywo
    document.getElementById('daily-form').addEventListener('input', calculateDailySummary);

    // Zmiana miesiąca w statystykach
    document.getElementById('stats-month-select').addEventListener('change', renderStats);

    // Zmiana celu finansowego
    document.getElementById('monthly-goal-input').addEventListener('input', (e) => {
        userSettings.monthlyGoal = parseFloat(e.target.value) || 6000;
        renderStats();
    });

    // Wyliczanie różnicy w przelewie na żywo
    document.getElementById('received-payout').addEventListener('input', calculatePayoutDiff);

    // Przełącznik trybu prywatności (👁️)
    document.getElementById('toggle-privacy-btn').addEventListener('click', () => {
        document.body.classList.toggle('privacy-active');
    });

    // Przycisk wylogowania
    document.getElementById('logout-btn').addEventListener('click', () => {
        currentUserPin = null;
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('auth-modal').style.display = 'flex';
        document.getElementById('pin-input').value = '';
    });

    // Zapis ustawień
    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        userSettings.tier1Rate = parseFloat(document.getElementById('cfg-rate-tier1').value) || 2.5;
        userSettings.tier2Limit = parseInt(document.getElementById('cfg-tier2-limit').value) || 100;
        userSettings.tier2Rate = parseFloat(document.getElementById('cfg-rate-tier2').value) || 3.0;
        userSettings.tier3Limit = parseInt(document.getElementById('cfg-tier3-limit').value) || 150;
        userSettings.tier3Rate = parseFloat(document.getElementById('cfg-rate-tier3').value) || 3.5;
        userSettings.defaultSecondShiftRate = parseFloat(document.getElementById('cfg-default-sec-rate').value) || 50;
        userSettings.themeMode = document.getElementById('theme-mode-select').value;
        userSettings.accentColor = document.getElementById('theme-color-picker').value;
        userSettings.compactCalendar = document.getElementById('toggle-compact-calendar').checked;

        const newPin = document.getElementById('cfg-pin').value.trim();
        if (newPin.length > 0) {
            currentUserPin = newPin;
            document.getElementById('cfg-pin').value = '';
        }

        applyThemeSettings();
        saveUserData();
        renderCalendar();
        alert("Ustawienia zostały zapisane!");
    });
}

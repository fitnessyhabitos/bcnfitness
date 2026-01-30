import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES } from './data.js';

const firebaseConfig = {
    apiKey: "AIzaSyC5TuyHq_MIkhiIdgjBU6s7NM2nq6REY8U",
    authDomain: "bcn-fitness.firebaseapp.com",
    projectId: "bcn-fitness",
    storageBucket: "bcn-fitness.firebasestorage.app",
    messagingSenderId: "193657523158",
    appId: "1:193657523158:web:2c50129da8a4e7a07cf277"
};

const appInstance = initializeApp(firebaseConfig);
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);

const state = { user: null, profile: null, activeWorkout: null, lastWorkoutData: null, restTimer: null, newRoutine: [], sounds: { beep: document.getElementById('timer-beep') }, currentClientId: null, wakeLock: null, editingRoutineId: null, editingUserId: null };
const normalizeText = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const app = {
    init: () => {
        setTimeout(() => { const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none'; }, 4000);
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.user = user;
                try {
                    const docSnap = await getDoc(doc(db, "users", user.uid));
                    if(docSnap.exists()) {
                        state.profile = docSnap.data();
                        if(!state.profile.settings) state.profile.settings = { weeklyGoal: 3, restTime: 60 };
                        if(!state.profile.records) state.profile.records = {};
                        app.handleLoginSuccess();
                    } else { signOut(auth); }
                } catch(e) { console.error(e); }
            } else {
                app.navTo('login');
                const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none';
            }
        });
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); app.login(); };
        document.getElementById('register-form').onsubmit = (e) => { e.preventDefault(); app.register(); };
        
        const searchInput = document.getElementById('exercise-search');
        if(searchInput) {
            searchInput.addEventListener('input', (e) => admin.searchExercises(e.target.value));
            searchInput.addEventListener('focus', () => admin.searchExercises(searchInput.value));
        }
        document.addEventListener('click', (e) => {
            if(!e.target.closest('.exercise-selector')) document.getElementById('search-results-container')?.classList.add('hidden');
            if(!e.target.closest('.assign-dropdown')) document.querySelectorAll('.assign-dropdown').forEach(d => d.classList.remove('active'));
        });

        // REGISTRO SERVICE WORKER PARA PUSH
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(console.error);
        }
    },
    login: async () => { try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(e) { alert(e.message); } },
    register: async () => {
        if(document.getElementById('reg-code').value !== 'bcnfitness') return alert("Código incorrecto");
        try {
            const cred = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-pass').value);
            await setDoc(doc(db, "users", cred.user.uid), {
                name: document.getElementById('reg-name').value, role: 'athlete', clientType: document.getElementById('reg-role-select').value, age: document.getElementById('reg-age').value,
                approved: false, settings: { weeklyGoal: 3, restTime: 60, showJP7: false, showMeasures: false }, statsHistory: [], records: {}, createdAt: new Date()
            });
        } catch(e) { alert(e.message); }
    },
    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if(state.profile.role === 'admin' || state.profile.role === 'coach') { adminBtn.classList.remove('hidden'); admin.loadUsers(); } else { adminBtn.classList.add('hidden'); }
        const saved = localStorage.getItem(`bcn_workout_${state.user.uid}`);
        if(saved) workoutManager.resumeWorkout(JSON.parse(saved)); else { app.navTo('dashboard'); dashboard.render(); }
        const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none';
    },
    navTo: (viewId) => {
        document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
        document.getElementById('view-'+viewId).classList.remove('hidden'); document.getElementById('view-'+viewId).classList.add('active');
        const isAuth = ['login', 'register'].includes(viewId);
        document.getElementById('app-header').classList.toggle('hidden', isAuth);
        document.getElementById('bottom-nav').classList.toggle('hidden', isAuth || viewId === 'workout');
        if(viewId === 'dashboard') dashboard.render();
        if(viewId === 'profile') profile.render();
        if(viewId === 'admin') admin.refreshAll();
    },
    showToast: (msg, type='normal') => {
        const div = document.createElement('div'); div.className = `toast ${type}`;
        div.innerHTML = `<span style="font-size:20px; margin-right:10px">${type==='gold'?'🏆':'✅'}</span> ${msg}`;
        document.getElementById('toast-container').appendChild(div); setTimeout(()=>div.remove(), 3000);
    }
};

const admin = {
    refreshAll: () => { admin.loadUsers(); admin.renderExistingRoutines(); },
    updateTrackingConfig: async (field, value) => {
        if(!state.currentClientId) return;
        await updateDoc(doc(db, "users", state.currentClientId), { [`settings.${field}`]: value });
        app.showToast("Configuración guardada");
    },
    searchExercises: (term) => {
        const container = document.getElementById('search-results-container');
        if(!container) return; container.innerHTML = ''; container.classList.remove('hidden');
        const normTerm = normalizeText(term);
        const results = EXERCISES.filter(e => normalizeText(e.n).includes(normTerm)).slice(0, 20);
        results.forEach((ex) => {
            const realIdx = EXERCISES.indexOf(ex);
            const div = document.createElement('div'); div.className = 'search-result-item';
            div.innerHTML = `<img src="assets/muscles/${ex.img}" alt="${ex.m}"><span>${ex.n}</span>`;
            div.onclick = () => { admin.addExerciseToRoutine(realIdx); container.classList.add('hidden'); document.getElementById('exercise-search').value = ''; };
            container.appendChild(div);
        });
    },
    addExerciseToRoutine: (idx) => { state.newRoutine.push({...EXERCISES[idx], defaultSets:[{reps:20},{reps:16},{reps:16},{reps:16},{reps:16}]}); admin.renderPreview(); },
    renderPreview: () => { 
        const div = document.getElementById('admin-routine-preview');
        div.innerHTML = state.newRoutine.map((e, exIdx) => `<div class="routine-edit-row"><div class="routine-edit-header"><div style="display:flex; align-items:center; gap:10px"><img src="assets/muscles/${e.img}" class="routine-mini-img"><strong>${e.n}</strong></div><span style="color:#ff3b30; cursor:pointer" onclick="window.admin.removeEx(${exIdx})">x</span></div></div>`).join(''); 
    },
    removeEx: (i) => { state.newRoutine.splice(i, 1); admin.renderPreview(); },
    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value; const client = document.getElementById('assign-client-select').value;
        if(!name || !client) return alert("Faltan datos");
        await addDoc(collection(db, "routines"), { name, assignedTo: client, exercises: state.newRoutine, createdAt: new Date() });
        admin.cancelEdit(); admin.renderExistingRoutines();
    },
    cancelEdit: () => { state.newRoutine = []; document.getElementById('new-routine-name').value = ''; admin.renderPreview(); },
    loadUsers: async () => {
        const div = document.getElementById('admin-users-list'); div.innerHTML = 'Cargando...';
        const snap = await getDocs(collection(db, "users"));
        div.innerHTML = '';
        snap.forEach(d => {
            const u = d.data();
            div.innerHTML += `<div class="user-row" onclick="window.admin.viewClient('${d.id}')"><img src="${u.photoURL||'https://placehold.co/100/39ff14'}" class="user-avatar-small"><div class="user-info"><h5>${u.name}</h5><span>${u.clientType||'Cliente'}</span></div></div>`;
            document.getElementById('assign-client-select').innerHTML += `<option value="${d.id}">${u.name}</option>`;
        });
    },
    viewClient: async (uid) => {
        state.currentClientId = uid;
        const userDoc = await getDoc(doc(db, "users", uid));
        const user = userDoc.data();
        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('toggle-jp7').checked = user.settings?.showJP7 || false;
        document.getElementById('toggle-measures').checked = user.settings?.showMeasures || false;
        document.getElementById('client-jp7-card').classList.toggle('hidden', !user.settings?.showJP7);
        // ... (resto de funciones de renderizado de gráficas originales)
        app.navTo('client-detail');
    },
    renderExistingRoutines: async () => {
        const div = document.getElementById('admin-routines-management'); div.innerHTML = 'Cargando...';
        const snap = await getDocs(collection(db, "routines")); div.innerHTML = '';
        snap.forEach(d => {
            const r = d.data();
            div.innerHTML += `<div class="exercise-card"><h4>${r.name}</h4><button onclick="window.admin.deleteRoutine('${d.id}')">BORRAR</button></div>`;
        });
    },
    deleteRoutine: async (id) => { if(confirm("¿Borrar?")) { await deleteDoc(doc(db, "routines", id)); admin.renderExistingRoutines(); } },
    cloneRoutineFromClientView: async () => { /* tu lógica */ },
    openEditUser: (id) => { /* tu lógica */ },
    saveUserChanges: async () => { /* tu lógica */ },
    deleteUser: async (uid) => { /* tu lógica */ }
};

const profile = {
    render: () => {
        document.getElementById('profile-name').innerText = state.profile.name;
        document.getElementById('section-jp7').classList.toggle('hidden', !state.profile.settings?.showJP7);
        document.getElementById('section-measures').classList.toggle('hidden', !state.profile.settings?.showMeasures);
        profile.calculateGlobalStats();
    },
    saveJP7: async () => {
        const data = { 
            date: new Date(), 
            pecho: document.getElementById('jp7-pecho').value, 
            axila: document.getElementById('jp7-axila').value, 
            triceps: document.getElementById('jp7-triceps').value,
            subes: document.getElementById('jp7-subes').value,
            abdo: document.getElementById('jp7-abdo').value,
            supra: document.getElementById('jp7-supra').value,
            muslo: document.getElementById('jp7-muslo').value
        };
        await updateDoc(doc(db, "users", state.user.uid), { jp7History: arrayUnion(data) });
        app.showToast("Pliegues guardados", "gold");
    },
    saveMeasures: async () => {
        const data = { 
            date: new Date(), 
            cuello: document.getElementById('m-cuello').value, 
            hombro: document.getElementById('m-hombro').value,
            pecho: document.getElementById('m-pecho').value,
            brazo: document.getElementById('m-brazo').value,
            cintura: document.getElementById('m-cintura').value,
            cadera: document.getElementById('m-cadera').value,
            muslo: document.getElementById('m-muslo').value
        };
        await updateDoc(doc(db, "users", state.user.uid), { measuresHistory: arrayUnion(data) });
        app.showToast("Medidas guardadas", "gold");
    },
    showHelp: (type) => {
        document.getElementById('help-title').innerText = type === 'jp7' ? "Guía JP7" : "Guía Perímetros";
        document.getElementById('help-modal').classList.remove('hidden');
    },
    calculateGlobalStats: async () => {
        const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
        const snap = await getDocs(q);
        let tonnage = 0, sets = 0, reps = 0;
        snap.forEach(d => {
            const w = d.data();
            w.data.exercises.forEach(ex => ex.sets.forEach(s => {
                if(s.done && s.kg && s.reps) { sets++; reps += parseInt(s.reps); tonnage += (parseInt(s.kg) * parseInt(s.reps)); }
            }));
        });
        document.getElementById('stat-tonnage').innerText = (tonnage/1000).toFixed(1) + 't';
        document.getElementById('stat-sets').innerText = sets;
        document.getElementById('stat-reps').innerText = reps;
        document.getElementById('stat-workouts').innerText = snap.size;
    },
    switchTab: (tab) => {
        ['stats', 'history', 'config'].forEach(t => {
            document.getElementById(`tab-${t}`).classList.add('hidden');
            document.getElementById(`tab-btn-${t}`).classList.remove('active');
        });
        document.getElementById(`tab-${tab}`).classList.remove('hidden');
        document.getElementById(`tab-btn-${tab}`).classList.add('active');
    },
    requestNotify: async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') app.showToast("Notificaciones OK");
    },
    testSound: () => {
        state.sounds.beep.play();
        if (Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification('BCN FITNESS', { body: 'Test de notificación forzada', vibrate: [300, 100, 300] });
            });
        }
    },
    saveStats: async () => { /* original logic */ },
    uploadPhoto: (input) => { /* original logic */ },
    renderCharts: () => { /* original logic */ }
};

const dashboard = {
    render: async () => {
        const div = document.getElementById('routines-list'); div.innerHTML = 'Cargando...';
        const q = query(collection(db, "routines"), where("assignedTo", "==", state.user.uid));
        const snap = await getDocs(q); div.innerHTML = '';
        snap.forEach(d => {
            const r = d.data();
            div.innerHTML += `<div class="exercise-card" onclick="window.workoutManager.start('${d.id}', '${r.name}')"><h3 style="margin:0">${r.name}</h3><p style="color:#888">${r.exercises.length} Ejercicios</p></div>`;
        });
    }
};

const workoutManager = {
    start: async (rid, rname) => {
        const docRef = await getDoc(doc(db, "routines", rid)); const routineData = docRef.data();
        state.activeWorkout = { name: rname, start: Date.now(), exercises: routineData.exercises.map(ex => ({...ex, sets: ex.defaultSets.map(s => ({...s, kg:'', done:false})) })) };
        localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout));
        workoutManager.uiInit();
    },
    resumeWorkout: (data) => { state.activeWorkout = data; workoutManager.uiInit(); },
    uiInit: () => {
        app.navTo('workout');
        const div = document.getElementById('active-exercises-container'); div.innerHTML = '';
        state.activeWorkout.exercises.forEach((ex, idx) => {
            div.innerHTML += `<div class="exercise-card"><h3>${ex.n}</h3><div id="sets-${idx}"></div></div>`;
            // render sets logic...
        });
    },
    toggleSet: (ei, si) => {
        const s = state.activeWorkout.exercises[ei].sets[si]; s.done = !s.done;
        if(s.done) { 
            state.sounds.beep.play(); 
            workoutManager.startRest(state.profile.settings?.restTime || 60); 
        }
        localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout));
    },
    startRest: (sec) => {
        document.getElementById('rest-modal').classList.remove('hidden');
        let r = sec;
        state.restTimer = setInterval(() => {
            document.getElementById('rest-countdown').innerText = r;
            if(r <= 0) { state.sounds.beep.play(); workoutManager.stopRest(); }
            r--;
        }, 1000);
    },
    stopRest: () => { clearInterval(state.restTimer); document.getElementById('rest-modal').classList.add('hidden'); },
    confirmFinish: async (rpe) => {
        await addDoc(collection(db, "workouts"), { userId: state.user.uid, date: new Date(), data: state.activeWorkout, rpe: rpe });
        localStorage.removeItem(`bcn_workout_${state.user.uid}`); app.navTo('dashboard');
    }
};

const chartHelpers = {
    renderLine: (id, data, field, color) => { /* logic */ },
    renderRadar: (id, counts) => { /* logic */ }
};

window.app = app; window.workoutManager = workoutManager; window.admin = admin; window.profile = profile; window.chartHelpers = chartHelpers;
app.init();

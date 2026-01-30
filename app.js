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
        setTimeout(() => { const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none'; }, 3000);
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.user = user;
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if(docSnap.exists()) {
                    state.profile = docSnap.data();
                    if(!state.profile.settings) state.profile.settings = { weeklyGoal: 3, restTime: 60 };
                    app.handleLoginSuccess();
                } else { signOut(auth); }
            } else {
                app.navTo('login');
                const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none';
            }
        });
        document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); app.login(); };
        const searchInput = document.getElementById('exercise-search');
        if(searchInput) {
            searchInput.addEventListener('input', (e) => admin.searchExercises(e.target.value));
        }
    },
    login: async () => { try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(e) { alert(e.message); } },
    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if(state.profile.role === 'admin' || state.profile.role === 'coach') { adminBtn.classList.remove('hidden'); admin.loadUsers(); }
        app.navTo('dashboard');
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
        div.innerHTML = `<span>${type==='gold'?'🏆':'✅'}</span> ${msg}`;
        document.getElementById('toast-container').appendChild(div); setTimeout(()=>div.remove(), 3000);
    }
};

const admin = {
    refreshAll: () => { admin.loadUsers(); admin.renderExistingRoutines(); },
    updateTrackingConfig: async (field, value) => {
        if(!state.currentClientId) return;
        await updateDoc(doc(db, "users", state.currentClientId), { [`settings.${field}`]: value });
        app.showToast("Seguimiento actualizado");
    },
    loadUsers: async () => {
        const div = document.getElementById('admin-users-list'); div.innerHTML = 'Cargando...';
        const snap = await getDocs(collection(db, "users"));
        div.innerHTML = '';
        snap.forEach(d => {
            const u = d.data();
            div.innerHTML += `<div class="user-row" onclick="window.admin.viewClient('${d.id}')">
                <img src="${u.photoURL||'https://placehold.co/100/39ff14'}" class="user-avatar-small">
                <div class="user-info"><h5>${u.name}</h5><span>${u.clientType||'Cliente'}</span></div>
            </div>`;
        });
    },
    viewClient: async (uid) => {
        state.currentClientId = uid;
        const userSnap = await getDoc(doc(db, "users", uid));
        const user = userSnap.data();
        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('toggle-jp7').checked = user.settings?.showJP7 || false;
        document.getElementById('toggle-measures').checked = user.settings?.showMeasures || false;
        document.getElementById('client-jp7-charts').classList.toggle('hidden', !user.settings?.showJP7);
        // Cargar gráficas y rutinas (lógica original)
        admin.renderClientRoutines(uid);
        app.navTo('client-detail');
    },
    // ... AQUÍ MANTENDRÍAS TODAS TUS FUNCIONES DE admin (saveRoutine, deleteUser, cloneRoutine, etc.) TAL CUAL ...
    searchExercises: (term) => {
        const container = document.getElementById('search-results-container');
        if(!container) return; container.innerHTML = ''; container.classList.remove('hidden');
        const results = EXERCISES.filter(e => normalizeText(e.n).includes(normalizeText(term))).slice(0, 15);
        results.forEach(ex => {
            const div = document.createElement('div'); div.className = 'search-result-item';
            div.innerHTML = `<span>${ex.n}</span>`;
            div.onclick = () => { admin.addExerciseToRoutine(EXERCISES.indexOf(ex)); container.classList.add('hidden'); };
            container.appendChild(div);
        });
    },
    addExerciseToRoutine: (idx) => { state.newRoutine.push({...EXERCISES[idx], defaultSets:[{reps:15},{reps:15}]}); admin.renderPreview(); },
    renderPreview: () => { /* tu lógica original */ },
    saveRoutine: async () => { /* tu lógica original */ },
    renderExistingRoutines: async () => { /* tu lógica original */ },
    renderClientRoutines: async (uid) => { /* tu lógica original */ },
    cloneRoutineFromClientView: () => { /* tu lógica original */ }
};

const profile = {
    render: () => {
        document.getElementById('profile-name').innerText = state.profile.name;
        document.getElementById('section-jp7').classList.toggle('hidden', !state.profile.settings?.showJP7);
        document.getElementById('section-measures').classList.toggle('hidden', !state.profile.settings?.showMeasures);
        profile.calculateGlobalStats();
        profile.renderCharts();
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
        document.getElementById('help-title').innerText = type === 'jp7' ? "Guía Pliegues JP7" : "Guía Medidas Corporales";
        document.getElementById('help-modal').classList.remove('hidden');
    },
    calculateGlobalStats: async () => {
        const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
        const snap = await getDocs(q);
        let tonnage = 0, sets = 0, reps = 0;
        snap.forEach(doc => {
            const w = doc.data();
            w.data.exercises.forEach(ex => ex.sets.forEach(s => {
                if(s.done && s.kg && s.reps) {
                    sets++; reps += parseInt(s.reps); tonnage += (parseInt(s.kg) * parseInt(s.reps));
                }
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
    saveStats: async () => { /* tu lógica original */ },
    renderCharts: () => { /* tu lógica original */ },
    requestNotify: async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') app.showToast("Notificaciones habilitadas");
    },
    testSound: () => {
        state.sounds.beep.play();
        if (Notification.permission === 'granted') {
            new Notification('BCN FITNESS', { body: 'Aviso forzado habilitado', icon: 'logo.png' });
        }
    }
};

const dashboard = {
    render: async () => {
        const div = document.getElementById('routines-list'); div.innerHTML = 'Cargando...';
        const q = query(collection(db, "routines"), where("assignedTo", "==", state.user.uid));
        const snap = await getDocs(q); div.innerHTML = '';
        snap.forEach(d => {
            const r = d.data();
            div.innerHTML += `<div class="exercise-card" onclick="window.workoutManager.start('${d.id}', '${r.name}')">
                <h3 style="margin:0">${r.name}</h3><p style="color:#888">${r.exercises.length} Ejercicios</p>
            </div>`;
        });
    }
};

const workoutManager = {
    // ... TODA TU LÓGICA DE workoutManager ORIGINAL SIN CAMBIOS (start, toggleSet, updateSet, stopRest, confirmFinish, etc.) ...
    start: async (rid, rname) => { /* lógica original */ },
    toggleSet: (ei, si) => { /* lógica original de sonar beep y registrar récords */ },
    startRest: (sec) => { /* lógica original */ },
    stopRest: () => { clearInterval(state.restTimer); document.getElementById('rest-modal').classList.add('hidden'); },
    confirmFinish: async (rpe) => { /* lógica original de guardado en Firestore */ }
};

const chartHelpers = {
    renderLine: (id, data, field, color) => { /* tu lógica original */ },
    renderRadar: (id, counts) => { /* tu lógica original */ }
};

window.app = app; window.workoutManager = workoutManager; window.admin = admin; window.profile = profile; window.chartHelpers = chartHelpers;
app.init();

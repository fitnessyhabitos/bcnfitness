import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES } from './data.js';

const firebaseConfig = { apiKey: "AIzaSyC5TuyHq_MIkhiIdgjBU6s7NM2nq6REY8U", authDomain: "bcn-fitness.firebaseapp.com", projectId: "bcn-fitness", storageBucket: "bcn-fitness.firebasestorage.app", messagingSenderId: "193657523158", appId: "1:193657523158:web:2c50129da8a4e7a07cf277" };
const appInstance = initializeApp(firebaseConfig);
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);

const state = { user: null, profile: null, activeWorkout: null, lastWorkoutData: null, restTimer: null, newRoutine: [], sounds: { beep: document.getElementById('timer-beep') }, currentClientId: null };
const normalizeText = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const app = {
    init: () => {
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.user = user;
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if(docSnap.exists()) {
                    state.profile = docSnap.data();
                    app.handleLoginSuccess();
                } else { signOut(auth); }
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
        }
    },
    login: async () => { try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(e) { alert(e.message); } },
    register: async () => {
        if(document.getElementById('reg-code').value !== 'bcnfitness') return alert("Código incorrecto");
        try {
            const cred = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-pass').value);
            await setDoc(doc(db, "users", cred.user.uid), {
                name: document.getElementById('reg-name').value, role: 'athlete', clientType: document.getElementById('reg-role-select').value, age: document.getElementById('reg-age').value,
                approved: false, settings: { weeklyGoal: 3, restTime: 60 }, statsHistory: [], records: {}, createdAt: new Date()
            });
        } catch(e) { alert(e.message); }
    },
    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if(state.profile.role === 'coach' || state.profile.role === 'admin') adminBtn.classList.remove('hidden');
        const saved = localStorage.getItem(`bcn_workout_${state.user.uid}`);
        if(saved) workoutManager.resumeWorkout(JSON.parse(saved)); else app.navTo('dashboard');
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
        div.innerHTML = `<span>${type==='gold'?'🏆':'✅'}</span> ${msg}`;
        document.getElementById('toast-container').appendChild(div); setTimeout(()=>div.remove(), 3000);
    }
};

const admin = {
    refreshAll: () => { admin.loadUsers(); admin.renderExistingRoutines(); },
    updateTrackingConfig: async (field, value) => {
        if(!state.currentClientId) return;
        await updateDoc(doc(db, "users", state.currentClientId), { [`settings.${field}`]: value });
        app.showToast("Configuración cliente guardada");
    },
    loadUsers: async () => {
        const div = document.getElementById('admin-users-list'); div.innerHTML = 'Cargando...';
        const snap = await getDocs(collection(db, "users"));
        div.innerHTML = ''; state.allClients = [];
        const selectAssign = document.getElementById('assign-client-select');
        selectAssign.innerHTML = '<option disabled selected>Selecciona...</option>';
        snap.forEach(d => {
            const u = d.data(); state.allClients.push({id:d.id, ...u});
            div.innerHTML += `<div class="user-row" onclick="window.admin.viewClient('${d.id}')">
                <img src="${u.photoURL||'https://placehold.co/100/39ff14'}" class="user-avatar-small">
                <div class="user-info"><h5>${u.name}</h5><span>${u.clientType||'Cliente'}</span></div>
            </div>`;
            selectAssign.innerHTML += `<option value="${d.id}">${u.name}</option>`;
        });
    },
    viewClient: async (uid) => {
        state.currentClientId = uid;
        const uDoc = await getDoc(doc(db, "users", uid));
        const user = uDoc.data();
        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('client-detail-age').innerText = "Edad: " + (user.age || '--');
        document.getElementById('toggle-jp7').checked = user.settings?.showJP7 || false;
        document.getElementById('toggle-measures').checked = user.settings?.showMeasures || false;
        document.getElementById('client-jp7-card').classList.toggle('hidden', !user.settings?.showJP7);
        // Lógica de historial y gráficas original...
        app.navTo('client-detail');
    },
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
    renderPreview: () => { /* lógica original */ },
    saveRoutine: async () => { /* lógica original */ },
    renderExistingRoutines: async () => { /* lógica original */ },
    renderClientRoutines: async (uid) => { /* lógica original */ },
    cloneRoutineFromClientView: () => { /* lógica original */ }
};

const profile = {
    render: () => {
        document.getElementById('profile-name').innerText = state.profile.name;
        document.getElementById('section-jp7').classList.toggle('hidden', !state.profile.settings?.showJP7);
        document.getElementById('section-measures').classList.toggle('hidden', !state.profile.settings?.showMeasures);
        profile.calculateGlobalStats();
    },
    saveJP7: async () => {
        const data = { date: new Date(), abdo: document.getElementById('jp7-abdo').value, muslo: document.getElementById('jp7-muslo').value }; // abreviado por espacio
        await updateDoc(doc(db, "users", state.user.uid), { jp7History: arrayUnion(data) });
        app.showToast("Pliegues guardados", "gold");
    },
    saveMeasures: async () => {
        const data = { date: new Date(), brazo: document.getElementById('m-brazo').value }; // abreviado
        await updateDoc(doc(db, "users", state.user.uid), { measuresHistory: arrayUnion(data) });
        app.showToast("Medidas guardadas", "gold");
    },
    showHelp: (t) => {
        const modal = document.getElementById('help-modal');
        document.getElementById('help-title').innerText = t === 'jp7' ? "Medición Pliegues" : "Medición Medidas";
        document.getElementById('help-img').src = t === 'jp7' ? "assets/jp7_guide.png" : "assets/measures_guide.png";
        modal.classList.remove('hidden');
    },
    calculateGlobalStats: async () => {
        const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
        const snap = await getDocs(q);
        let tonnage = 0, sets = 0;
        snap.forEach(d => {
            const w = d.data();
            if(w.data.exercises) w.data.exercises.forEach(ex => ex.sets.forEach(s => {
                if(s.done && s.kg) { sets++; tonnage += (parseInt(s.kg) * parseInt(s.reps)); }
            }));
        });
        document.getElementById('stat-tonnage').innerText = (tonnage/1000).toFixed(1) + 't';
        document.getElementById('stat-sets').innerText = sets;
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
    requestNotify: () => { Notification.requestPermission().then(p => { if(p==='granted') app.showToast("Avisos ON"); }); },
    testSound: () => { if(state.sounds.beep) state.sounds.beep.play(); },
    uploadPhoto: (input) => { /* lógica original */ },
    saveStats: async () => { /* lógica original */ },
    renderCharts: () => { /* lógica original */ }
};

const dashboard = {
    render: async () => {
        const div = document.getElementById('routines-list'); div.innerHTML = 'Cargando...';
        const q = query(collection(db, "routines"), where("assignedTo", "==", state.user.uid));
        const snap = await getDocs(q); div.innerHTML = '';
        snap.forEach(d => {
            const r = d.data();
            div.innerHTML += `<div class="exercise-card" onclick="window.workoutManager.start('${d.id}', '${r.name}')">
                <div style="display:flex; justify-content:space-between; align-items:center"><h3 style="margin:0">${r.name}</h3><i class="material-icons-round" style="color:var(--neon-green)">play_circle_filled</i></div>
            </div>`;
        });
    },
    calculateWeeklyProgress: () => { /* lógica original */ }
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
            let htmlSets = '';
            ex.sets.forEach((s, i) => {
                const bg = s.done ? 'set-completed' : '';
                htmlSets += `<div class="set-row ${bg}">
                    <span>#${i+1}</span>
                    <input type="number" value="${s.reps}" onchange="window.workoutManager.updateSet(${idx},${i},'reps',this.value)">
                    <input type="number" placeholder="kg" value="${s.kg}" onchange="window.workoutManager.updateSet(${idx},${i},'kg',this.value)">
                    <div class="check-box ${s.done?'checked':''}" onclick="window.workoutManager.toggleSet(${idx},${i})">✔</div>
                </div>`;
            });
            div.innerHTML += `<div class="exercise-card"><h3>${ex.n}</h3>${htmlSets}</div>`;
        });
    },
    updateSet: (ei, si, f, v) => { state.activeWorkout.exercises[ei].sets[si][f] = v; localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout)); },
    toggleSet: (ei, si) => {
        const s = state.activeWorkout.exercises[ei].sets[si]; s.done = !s.done;
        if(s.done) { 
            state.sounds.beep.play(); 
            workoutManager.startRest(state.profile.settings?.restTime || 60); 
        }
        workoutManager.uiInit();
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
    },
    cancelWorkout: () => { if(confirm("¿Cancelar?")) { localStorage.removeItem(`bcn_workout_${state.user.uid}`); app.navTo('dashboard'); } }
};

window.app = app; window.workoutManager = workoutManager; window.admin = admin; window.profile = profile;
app.init();

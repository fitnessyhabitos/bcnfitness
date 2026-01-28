import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES } from './data.js';

// CONFIGURACIÓN (Tus claves)
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

const state = { user: null, profile: null, activeWorkout: null, lastWorkoutData: null, restTimer: null, newRoutine: [], sounds: { beep: document.getElementById('timer-beep') }, currentClientId: null, wakeLock: null, editingRoutineId: null };

// HELPER NORMALIZAR
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
        
        // EVENTOS BUSCADOR
        const searchInput = document.getElementById('exercise-search');
        if(searchInput) {
            searchInput.addEventListener('input', (e) => admin.searchExercises(e.target.value));
            searchInput.addEventListener('focus', () => admin.searchExercises(searchInput.value));
        }
        document.addEventListener('click', (e) => {
            if(!e.target.closest('.exercise-selector')) document.getElementById('search-results-container')?.classList.add('hidden');
        });
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
        if(viewId === 'profile' && !document.getElementById('tab-history').classList.contains('hidden')) profile.loadHistory();
    },
    showToast: (msg, type='normal') => {
        const div = document.createElement('div'); div.className = `toast ${type}`;
        div.innerHTML = `<span style="font-size:20px; margin-right:10px">${type==='gold'?'🏆':'✅'}</span> ${msg}`;
        document.getElementById('toast-container').appendChild(div); setTimeout(()=>div.remove(), 3000);
    }
};

const admin = {
    refreshAll: () => { admin.loadUsers(); admin.renderExistingRoutines(); },
    
    // --- BUSCADOR VISUAL ---
    searchExercises: (term) => {
        const container = document.getElementById('search-results-container');
        if(!container) return; // Seguridad si no existe en HTML
        container.innerHTML = '';
        container.classList.remove('hidden');
        
        const normTerm = normalizeText(term);
        // Filtrar y mostrar máximo 20 resultados para no colapsar
        const results = EXERCISES.filter(e => normalizeText(e.n).includes(normTerm)).slice(0, 20);
        
        if(results.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#888">No hay resultados</div>';
            return;
        }

        results.forEach((ex) => {
            const realIdx = EXERCISES.indexOf(ex); // Indice real en array principal
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `<img src="assets/muscles/${ex.img}" alt="${ex.m}"><span>${ex.n}</span>`;
            div.onclick = () => {
                admin.addExerciseToRoutine(realIdx);
                container.classList.add('hidden');
                document.getElementById('exercise-search').value = '';
            };
            container.appendChild(div);
        });
    },

    addExerciseToRoutine: (idx) => {
        // 5 SERIES DEFAULT (20-16-16-16-16)
        state.newRoutine.push({...EXERCISES[idx], defaultSets:[{reps:20},{reps:16},{reps:16},{reps:16},{reps:16}]}); 
        admin.renderPreview(); 
    },

    renderPreview: () => { 
        const div = document.getElementById('admin-routine-preview');
        div.innerHTML = state.newRoutine.map((e, exIdx) => `
            <div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <div style="display:flex; align-items:center; gap:10px">
                        <img src="assets/muscles/${e.img}" width="30" height="30" style="border-radius:4px; background:#000">
                        <strong>${e.n}</strong>
                    </div>
                    <span style="color:#ff3b30; cursor:pointer" onclick="window.admin.removeEx(${exIdx})">x</span>
                </div>
                <div style="font-size:12px; margin-top:5px; display:flex; align-items:center; gap:10px">
                    <span>${e.defaultSets.length} Series</span>
                    <button style="padding:2px 8px; background:#444; border:none; color:white; border-radius:4px" onclick="window.admin.modSets(${exIdx}, 1)">+</button>
                    <button style="padding:2px 8px; background:#444; border:none; color:white; border-radius:4px" onclick="window.admin.modSets(${exIdx}, -1)">-</button>
                </div>
            </div>`).join(''); 
    },
    removeEx: (i) => { state.newRoutine.splice(i, 1); admin.renderPreview(); },
    modSets: (i, delta) => {
        if(delta > 0) state.newRoutine[i].defaultSets.push({reps:16});
        else if(state.newRoutine[i].defaultSets.length > 1) state.newRoutine[i].defaultSets.pop();
        admin.renderPreview();
    },

    // --- EDICIÓN Y GUARDADO ---
    editRoutine: async (id) => {
        const docSnap = await getDoc(doc(db, "routines", id));
        const r = docSnap.data();
        state.editingRoutineId = id;
        state.newRoutine = r.exercises;
        
        document.getElementById('new-routine-name').value = r.name;
        document.getElementById('assign-client-select').value = r.assignedTo;
        document.getElementById('routine-editor-title').innerText = "Editando: " + r.name;
        document.getElementById('save-routine-btn').innerText = "ACTUALIZAR";
        document.getElementById('cancel-edit-btn').classList.remove('hidden');
        
        admin.renderPreview();
        document.getElementById('routine-editor-card').scrollIntoView({behavior: 'smooth'});
    },

    cancelEdit: () => {
        state.editingRoutineId = null;
        state.newRoutine = [];
        document.getElementById('new-routine-name').value = '';
        document.getElementById('assign-client-select').value = '';
        document.getElementById('routine-editor-title').innerText = "Crear Rutina Base";
        document.getElementById('save-routine-btn').innerText = "GUARDAR";
        document.getElementById('cancel-edit-btn').classList.add('hidden');
        admin.renderPreview();
    },

    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value; 
        const client = document.getElementById('assign-client-select').value;
        if(!name || !client) return alert("Faltan datos");
        
        if(state.editingRoutineId) {
            await updateDoc(doc(db, "routines", state.editingRoutineId), { name, assignedTo: client, exercises: state.newRoutine });
            alert("Actualizada");
        } else {
            await addDoc(collection(db, "routines"), { name, assignedTo: client, exercises: state.newRoutine, createdAt: new Date() });
            alert("Guardada");
        }
        admin.cancelEdit(); 
        admin.renderExistingRoutines();
    },

    loadUsers: async () => {
        const div = document.getElementById('admin-users-list'); div.innerHTML = 'Cargando...';
        try {
            const rSnap = await getDocs(collection(db, "routines"));
            const rCounts = {}; rSnap.forEach(d => { const uid = d.data().assignedTo; if(uid) rCounts[uid] = (rCounts[uid]||0)+1; });
            const snap = await getDocs(collection(db, "users"));
            div.innerHTML = ''; state.allClients = [];
            const selectAssign = document.getElementById('assign-client-select'); selectAssign.innerHTML = '<option disabled selected>Selecciona...</option>';
            snap.forEach(d => {
                const u = d.data(); state.allClients.push({id:d.id, ...u});
                div.innerHTML += `<div class="user-row" onclick="window.admin.viewClient('${d.id}')"><img src="${u.photoURL||'assets/placeholder-body.png'}" class="user-avatar-small"><div class="user-info"><h5>${u.name} <span class="routine-count-badge">[${rCounts[d.id]||0} Rutinas]</span></h5><span>${u.clientType||'Cliente'}</span></div><div class="user-actions">${!u.approved ? `<button class="action-btn btn-green" onclick="window.admin.toggleApproval('${d.id}', true)">APROBAR</button>` : ''}<button class="action-btn btn-delete" onclick="window.admin.deleteUser('${d.id}', '${u.name}')"><i class="material-icons-round" style="font-size:14px">delete</i></button></div></div>`;
                selectAssign.innerHTML += `<option value="${d.id}">${u.name}</option>`;
            });
        } catch(e) { div.innerHTML = 'Error usuarios'; }
    },
    deleteUser: async (uid, name) => { if(confirm(`¿Eliminar a ${name}?`)) { await deleteDoc(doc(db, "users", uid)); admin.loadUsers(); } },
    toggleApproval: async (uid, st) => { await updateDoc(doc(db, "users", uid), { approved: st }); admin.loadUsers(); },
    viewClient: async (uid) => {
        state.currentClientId = uid;
        const user = state.allClients.find(c => c.id === uid); if(!user) return;
        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('client-detail-age').innerText = "Edad: " + (user.age || '--');
        document.getElementById('client-detail-img').src = user.photoURL || 'assets/placeholder-body.png';
        const last = user.statsHistory && user.statsHistory.length > 0 ? user.statsHistory[user.statsHistory.length-1] : {};
        document.getElementById('cd-weight').innerText = last.weight || '--'; document.getElementById('cd-fat').innerText = last.fat || '--'; document.getElementById('cd-muscle').innerText = last.muscle || '--';
        dashboard.calculateWeeklyProgress(uid, 'client-weekly-count', 'client-weekly-bar', user.settings?.weeklyGoal);
        admin.renderClientRoutines(uid);
        const hList = document.getElementById('client-detail-history'); hList.innerHTML = 'Cargando...';
        const q = query(collection(db, "workouts"), where("userId", "==", uid));
        const snap = await getDocs(q);
        const workouts = []; snap.forEach(d => workouts.push(d.data()));
        workouts.sort((a,b) => b.date.seconds - a.date.seconds);
        hList.innerHTML = ''; const mCounts = {};
        if(workouts.length===0) hList.innerHTML = '<p style="text-align:center">Sin historial</p>';
        workouts.slice(0,10).forEach(w => {
            const d = new Date(w.date.seconds*1000).toLocaleDateString();
            if(w.data.exercises) w.data.exercises.forEach(e => mCounts[e.m] = (mCounts[e.m]||0)+1);
            const div = document.createElement('div'); div.className = 'history-item';
            div.innerHTML = `<b>${d}</b> - ${w.data.name}<br>RPE: ${w.rpe}`;
            div.onclick = () => profile.showWorkoutDetails(w);
            hList.appendChild(div);
        });
        if(window.chartHelpers) {
            window.chartHelpers.renderRadar('clientRadarChart', mCounts);
            const lineData = [...(user.statsHistory || [])].sort((a,b) => (a.date.seconds||new Date(a.date)) - (b.date.seconds||new Date(b.date)));
            window.chartHelpers.renderLine('clientWeightChart', lineData, 'weight', '#39ff14');
            window.chartHelpers.renderLine('clientFatChart', lineData, 'fat', '#ff3b30');
            window.chartHelpers.renderLine('clientMuscleChart', lineData, 'muscle', '#00d4ff');
        }
        app.navTo('client-detail');
    },
    renderClientRoutines: async (uid) => {
        const div = document.getElementById('client-routines-list'); div.innerHTML = 'Cargando...';
        const q = query(collection(db, "routines"), where("assignedTo", "==", uid));
        const snap = await getDocs(q); div.innerHTML = '';
        if(snap.empty) div.innerHTML = '<p>Sin rutinas</p>';
        snap.forEach(d => div.innerHTML += `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between"><span>${d.data().name}</span><i class="material-icons-round" style="color:red; cursor:pointer" onclick="window.admin.deleteRoutine('${d.id}')">delete</i></div>`);
        const sel = document.getElementById('client-clone-select'); sel.innerHTML = '<option disabled selected>Elegir Base...</option>';
        const all = await getDocs(collection(db, "routines")); const seen = new Set();
        all.forEach(d => { if(d.data().assignedTo !== uid && !seen.has(d.data().name)) { seen.add(d.data().name); sel.innerHTML += `<option value="${d.id}">${d.data().name}</option>`; } });
    },
    cloneRoutineFromClientView: async () => { const rid = document.getElementById('client-clone-select').value; if(!rid) return; admin.cloneRoutine(rid, state.currentClientId); },
    renderExistingRoutines: async () => {
        const div = document.getElementById('admin-routines-management'); div.innerHTML = 'Cargando...';
        const snap = await getDocs(collection(db, "routines")); div.innerHTML = '';
        const seen = new Set();
        snap.forEach(d => {
            const r = d.data();
            if(!seen.has(r.name)) {
                seen.add(r.name);
                div.innerHTML += `
                    <div class="exercise-card" style="border-left: 4px solid var(--neon-green)">
                        <div style="display:flex; justify-content:space-between; align-items:center">
                            <h4>${r.name}</h4>
                            <div style="display:flex; gap:10px">
                                <button style="background:none; border:none; color:white; cursor:pointer; font-weight:bold" onclick="window.admin.showRoutineDetails('${d.id}')">VER</button>
                                <button style="background:none; border:none; color:var(--neon-green); cursor:pointer; font-weight:bold" onclick="window.admin.editRoutine('${d.id}')">EDITAR</button>
                            </div>
                        </div>
                        <div style="font-size:12px; color:#aaa; margin-top:5px">${r.exercises.length} Ejercicios</div>
                    </div>`;
            }
        });
    },
    showRoutineDetails: async (rid) => {
        const snap = await getDoc(doc(db, "routines", rid)); const r = snap.data();
        const modal = document.getElementById('workout-detail-modal');
        document.getElementById('wd-title').innerText = r.name;
        document.getElementById('wd-content').innerHTML = r.exercises.map(e => `
            <div style="margin-bottom:10px">
                <div style="display:flex; gap:10px; align-items:center"><img src="assets/muscles/${e.img}" width="30" height="30" style="background:#000; border-radius:4px"><strong>${e.n}</strong></div>
                <small>${e.defaultSets.length} series</small>
            </div>`).join('');
        modal.classList.remove('hidden');
    },
    cloneRoutine: async (rid, targetId) => {
        try {
            const snap = await getDoc(doc(db, "routines", rid)); const data = snap.data();
            await addDoc(collection(db, "routines"), { name: data.name, exercises: data.exercises, assignedTo: targetId, createdAt: new Date() });
            alert("Clonada"); if(document.getElementById('view-client-detail').classList.contains('active')) admin.renderClientRoutines(targetId);
        } catch(e) { alert("Error"); }
    },
    deleteRoutine: async (id) => { if(confirm("¿Borrar?")) { await deleteDoc(doc(db, "routines", id)); if(state.currentClientId) admin.renderClientRoutines(state.currentClientId); else admin.renderExistingRoutines(); } }
};

const dashboard = {
    render: async () => {
        const div = document.getElementById('routines-list'); div.innerHTML = 'Cargando...';
        dashboard.calculateWeeklyProgress(state.user.uid, 'weekly-count', 'weekly-bar', state.profile.settings?.weeklyGoal);
        const q = query(collection(db, "routines"), where("assignedTo", "==", state.user.uid));
        const snap = await getDocs(q); div.innerHTML = '';
        if(snap.empty) div.innerHTML = '<p style="text-align:center">No tienes rutinas asignadas.</p>';
        snap.forEach(d => {
            const r = d.data();
            div.innerHTML += `<div class="exercise-card" onclick="window.workoutManager.start('${d.id}', '${r.name}')" style="cursor:pointer"><div style="display:flex; justify-content:space-between; align-items:center"><h3 style="margin:0">${r.name}</h3><i class="material-icons-round" style="color:var(--neon-green)">play_circle_filled</i></div><p style="color:#888; font-size:14px; margin:5px 0">${r.exercises.length} Ejercicios</p></div>`;
        });
    },
    calculateWeeklyProgress: async (uid, cid, bid, goal=3) => {
        try {
            const now = new Date(); const day = now.getDay() || 7;
            const start = new Date(now); start.setHours(0,0,0,0); start.setDate(now.getDate() - day + 1);
            const q = query(collection(db, "workouts"), where("userId", "==", uid));
            const snap = await getDocs(q);
            let count = 0;
            snap.forEach(d => { if(d.data().date.seconds * 1000 >= start.getTime()) count++; });
            document.getElementById(cid).innerText = `${count}/${goal}`;
            document.getElementById(bid).style.width = Math.min((count/goal)*100, 100) + '%';
        } catch(e) {}
    }
};

const workoutManager = {
    start: async (rid, rname) => {
        try {
            const docRef = await getDoc(doc(db, "routines", rid)); const routineData = docRef.data();
            state.lastWorkoutData = null;
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
            const snap = await getDocs(q); const workouts = [];
            snap.forEach(d => workouts.push(d.data()));
            workouts.sort((a,b) => b.date.seconds - a.date.seconds);
            const last = workouts.find(w => w.data.name === rname);
            if(last) state.lastWorkoutData = last.data;

            state.activeWorkout = { name: rname, start: Date.now(), exercises: routineData.exercises.map(ex => ({...ex, sets: ex.defaultSets.map(s => ({...s, kg:'', done:false})) })) };
            localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout));
            try { if(navigator.wakeLock) state.wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
            workoutManager.uiInit();
        } catch(e) { alert("Error: " + e.message); }
    },
    resumeWorkout: (data) => { state.activeWorkout = data; workoutManager.uiInit(); },
    uiInit: () => {
        app.navTo('workout');
        const div = document.getElementById('active-exercises-container'); div.innerHTML = '';
        state.activeWorkout.exercises.forEach((ex, idx) => {
            let html = '';
            ex.sets.forEach((s, i) => {
                let prev = '--';
                if(state.lastWorkoutData && state.lastWorkoutData.exercises[idx] && state.lastWorkoutData.exercises[idx].sets[i]) {
                    const p = state.lastWorkoutData.exercises[idx].sets[i]; prev = `${p.reps}x${p.kg}`;
                }
                const bg = s.done ? 'set-completed' : ''; // Clase para el contenedor
                const dis = s.done ? 'disabled' : ''; // Atributo para inputs
                
                html += `
                <div class="set-row ${bg}">
                    <span style="color:#555">#${i+1}</span>
                    <span style="font-size:10px; color:#888">${prev}</span>
                    <input type="number" placeholder="reps" value="${s.reps}" ${dis} onchange="window.workoutManager.updateSet(${idx},${i},'reps',this.value)">
                    <input type="number" placeholder="kg" value="${s.kg}" ${dis} onchange="window.workoutManager.updateSet(${idx},${i},'kg',this.value)">
                    <div class="check-box ${s.done?'checked':''}" onclick="window.workoutManager.toggleSet(${idx},${i})">✔</div>
                </div>`;
            });
            div.innerHTML += `<div class="exercise-card"><div style="display:flex; gap:10px; align-items:center; margin-bottom:10px"><img src="assets/muscles/${ex.img}" width="40" height="40" style="background:#000; border-radius:4px"><h3>${ex.n}</h3></div>${html}</div>`;
        });
        if(window.gInterval) clearInterval(window.gInterval);
        window.gInterval = setInterval(() => {
            if(!state.activeWorkout) return;
            const d = Math.floor((Date.now() - state.activeWorkout.start)/1000);
            document.getElementById('global-timer').innerText = `${Math.floor(d/60).toString().padStart(2,'0')}:${(d%60).toString().padStart(2,'0')}`;
        }, 1000);
    },
    updateSet: (ei, si, f, v) => { state.activeWorkout.exercises[ei].sets[si][f] = v; localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout)); },
    toggleSet: (ei, si) => {
        const s = state.activeWorkout.exercises[ei].sets[si]; s.done = !s.done;
        if(s.done) {
            if(state.sounds.beep) state.sounds.beep.play().catch(e=>{});
            workoutManager.startRest(state.profile.settings?.restTime || 60);
            if(s.kg && s.reps) {
                const oneRM = Math.round(parseFloat(s.kg) * (1 + parseInt(s.reps)/30));
                const name = state.activeWorkout.exercises[ei].n;
                if(!state.profile.records) state.profile.records = {};
                if(oneRM > (state.profile.records[name] || 0)) {
                    state.profile.records[name] = oneRM;
                    updateDoc(doc(db, "users", state.user.uid), { [`records.${name}`]: oneRM });
                    app.showToast(`¡RÉCORD! ${name} (${oneRM}kg)`, 'gold');
                    if(window.confetti) window.confetti();
                }
            }
        }
        workoutManager.saveLocal(); workoutManager.uiInit();
    },
    startRest: (sec) => {
        document.getElementById('rest-modal').classList.remove('hidden');
        let r = sec;
        if(state.restTimer) clearInterval(state.restTimer);
        const tick = () => {
            document.getElementById('rest-countdown').innerText = r;
            if(r <= 0) {
                if(state.sounds.beep) state.sounds.beep.play().catch(e=>{});
                if(navigator.vibrate) navigator.vibrate([200,200]);
                workoutManager.stopRest();
            }
            r--;
        };
        tick(); state.restTimer = setInterval(tick, 1000);
    },
    stopRest: () => { clearInterval(state.restTimer); document.getElementById('rest-modal').classList.add('hidden'); },
    cancelWorkout: () => { if(confirm("¿Cancelar?")) { localStorage.removeItem(`bcn_workout_${state.user.uid}`); state.activeWorkout = null; if(state.wakeLock) state.wakeLock.release().catch(()=>{}); app.navTo('dashboard'); } },
    openFinishModal: () => document.getElementById('finish-modal').classList.remove('hidden'),
    confirmFinish: async (rpe) => {
        document.getElementById('finish-modal').classList.add('hidden');
        if(!state.user || !state.activeWorkout) return alert("Error: No hay sesión");
        try {
            await addDoc(collection(db, "workouts"), { userId: state.user.uid, userName: state.profile.name, date: new Date(), data: state.activeWorkout, rpe: rpe, notes: document.getElementById('final-notes').value });
            localStorage.removeItem(`bcn_workout_${state.user.uid}`); state.activeWorkout = null; if(state.wakeLock) state.wakeLock.release().catch(()=>{});
            app.showToast("¡Entreno Guardado!", "gold"); if(window.confetti) window.confetti(); app.navTo('dashboard');
        } catch(e) { alert("Error: " + e.message); }
    }
};

const profile = {
    render: () => {
        document.getElementById('profile-name').innerText = state.profile.name;
        // PHOTO DOM UPDATE IMMEDIATE
        const img = document.getElementById('profile-img');
        if(state.profile.photoURL) img.src = state.profile.photoURL;
        
        document.getElementById('profile-role-badge').innerText = state.profile.clientType || state.profile.role;
        document.getElementById('conf-weekly-goal').value = state.profile.settings?.weeklyGoal || 3;
        document.getElementById('conf-rest-time').value = state.profile.settings?.restTime || 60;
        profile.renderCharts(); profile.loadRadar();
        profile.switchTab('stats');
    },
    switchTab: (tab) => {
        ['stats', 'history', 'config'].forEach(t => {
            document.getElementById(`tab-${t}`).classList.add('hidden');
            document.getElementById(`tab-btn-${t}`).classList.remove('active');
        });
        document.getElementById(`tab-${tab}`).classList.remove('hidden');
        document.getElementById(`tab-btn-${tab}`).classList.add('active');
        if(tab === 'history') profile.loadHistory();
    },
    loadRadar: async () => {
        const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
        const snap = await getDocs(q);
        const counts = {};
        snap.forEach(d => { if(d.data().data.exercises) d.data().data.exercises.forEach(e => counts[e.m] = (counts[e.m]||0)+1); });
        if(window.chartHelpers) window.chartHelpers.renderRadar('radarChart', counts);
    },
    saveStats: async () => {
        const w = document.getElementById('stats-weight').value; const f = document.getElementById('stats-fat').value; const m = document.getElementById('stats-muscle').value;
        if(w) { 
            const newEntry = {date:new Date(), weight:w, fat:f, muscle:m};
            await updateDoc(doc(db, "users", state.user.uid), { statsHistory: arrayUnion(newEntry) });
            if(!state.profile.statsHistory) state.profile.statsHistory = [];
            state.profile.statsHistory.push(newEntry);
            alert("Guardado"); profile.renderCharts(); 
        }
    },
    saveSettings: async () => {
        const g = parseInt(document.getElementById('conf-weekly-goal').value); const r = parseInt(document.getElementById('conf-rest-time').value);
        await updateDoc(doc(db, "users", state.user.uid), { "settings.weeklyGoal": g, "settings.restTime": r });
        state.profile.settings = { weeklyGoal: g, restTime: r }; alert("Guardado"); dashboard.render();
    },
    loadHistory: async () => {
        const list = document.getElementById('history-list'); list.innerHTML = 'Cargando...';
        const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
        const snap = await getDocs(q);
        const workouts = []; snap.forEach(d => workouts.push(d.data()));
        workouts.sort((a,b) => b.date.seconds - a.date.seconds);
        list.innerHTML = '';
        if(workouts.length===0) list.innerHTML = '<p style="text-align:center">Sin historial</p>';
        workouts.slice(0, 20).forEach(w => {
            const d = new Date(w.date.seconds*1000).toLocaleDateString();
            const div = document.createElement('div'); div.className = 'history-item';
            div.innerHTML = `<b>${d}</b> - ${w.data.name}<br>RPE: ${w.rpe}`;
            div.onclick = () => profile.showWorkoutDetails(w);
            list.appendChild(div);
        });
    },
    showWorkoutDetails: (w) => {
        const modal = document.getElementById('workout-detail-modal');
        document.getElementById('wd-title').innerText = w.data.name;
        let html = `<p>RPE: ${w.rpe} | Notas: ${w.notes}</p>`;
        w.data.exercises.forEach(e => { html += `<h4>${e.n}</h4><ul>`; e.sets.forEach(s => html += `<li>${s.reps} reps x ${s.kg} kg</li>`); html += `</ul>`; });
        document.getElementById('wd-content').innerHTML = html;
        modal.classList.remove('hidden');
    },
    requestNotify: () => { Notification.requestPermission(); },
    testSound: () => { if(state.sounds.beep) { state.sounds.beep.currentTime = 0; state.sounds.beep.play(); } },
    
    uploadPhoto: (input) => {
        const file = input.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result;
            document.getElementById('profile-img').src = base64;
            state.profile.photoURL = base64;
            await updateDoc(doc(db, "users", state.user.uid), { photoURL: base64 });
        };
        reader.readAsDataURL(file);
    },

    renderCharts: () => {
        const history = state.profile.statsHistory || [];
        history.sort((a,b) => (a.date.seconds || new Date(a.date)) - (b.date.seconds || new Date(b.date)));
        if(window.chartHelpers) {
            window.chartHelpers.renderLine('weightChart', history, 'weight', '#39ff14');
            window.chartHelpers.renderLine('fatChart', history, 'fat', '#ff3b30');
            window.chartHelpers.renderLine('muscleChart', history, 'muscle', '#00d4ff');
        }
    }
};

const chartHelpers = {
    renderLine: (id, data, field, color) => {
        const ctx = document.getElementById(id); if(!ctx) return;
        const chart = Chart.getChart(ctx); if(chart) chart.destroy();
        new Chart(ctx, { 
            type: 'line', 
            data: { 
                labels: data.map(d => {
                    const date = d.date.seconds ? new Date(d.date.seconds*1000) : new Date(d.date);
                    return date.toLocaleDateString();
                }), 
                datasets: [{ label: field, data: data.map(d=>d[field]), borderColor: color, tension: 0.3 }] 
            }, 
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#333' } }, x: { grid: { color: '#333' } } } } 
        });
    },
    renderRadar: (id, counts) => {
        const ctx = document.getElementById(id); if(!ctx) return;
        const chart = Chart.getChart(ctx); if(chart) chart.destroy();
        new Chart(ctx, { type: 'radar', data: { labels: Object.keys(counts), datasets: [{ label: 'Series', data: Object.values(counts), backgroundColor: 'rgba(57,255,20,0.2)', borderColor: '#39ff14' }] }, options: { scales: { r: { grid: { color: '#444' }, pointLabels: { color: 'white' }, ticks: { display: false } } } } });
    }
};

window.app = app; window.workoutManager = workoutManager; window.admin = admin; window.profile = profile; window.chartHelpers = chartHelpers;
app.init();

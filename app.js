import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES } from './data.js';

// TUS CLAVES
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

const state = {
    user: null, profile: null, activeWorkout: null, lastWorkoutData: null, restTimer: null,
    newRoutine: [], allClients: [], sounds: { beep: document.getElementById('timer-beep') }, wakeLock: null, currentClientId: null
};

const app = {
    init: () => {
        onAuthStateChanged(auth, async (user) => {
            if (user) { state.user = user; await app.loadProfile(user.uid); }
            else { state.user = null; app.navTo('login'); app.hideSplash(); }
        });
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); app.login(); };
        document.getElementById('register-form').onsubmit = (e) => { e.preventDefault(); app.register(); };
        document.getElementById('exercise-search').addEventListener('input', (e) => admin.filterExercises(e.target.value));
    },
    loadProfile: async (uid) => {
        try {
            const docSnap = await getDoc(doc(db, "users", uid));
            if (docSnap.exists()) {
                state.profile = docSnap.data();
                if (!state.profile.settings) state.profile.settings = { restTime: 60, weeklyGoal: 3 };
                if (!state.profile.records) state.profile.records = {};
                app.handleLoginSuccess();
            } else { await signOut(auth); app.navTo('login'); app.hideSplash(); }
        } catch (e) { console.error(e); }
    },
    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            if(state.profile.role === 'admin' || state.profile.role === 'coach') { adminBtn.classList.remove('hidden'); admin.refreshAll(); }
            else { adminBtn.classList.add('hidden'); }
        }
        document.getElementById('profile-role-badge').innerText = state.profile.clientType || state.profile.role;
        const saved = localStorage.getItem(`bcn_workout_${state.user.uid}`);
        if(saved) workoutManager.resumeWorkout(JSON.parse(saved)); else { app.navTo('dashboard'); dashboard.render(); }
        app.hideSplash();
    },
    navTo: (viewId) => {
        document.querySelectorAll('.view').forEach(el => { el.classList.remove('active'); el.classList.add('hidden'); });
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        document.getElementById(`view-${viewId}`).classList.add('active');
        const isAuth = ['login', 'register'].includes(viewId);
        document.getElementById('app-header').classList.toggle('hidden', isAuth);
        document.getElementById('bottom-nav').classList.toggle('hidden', isAuth || viewId === 'workout');
        
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        if(viewId === 'dashboard') document.querySelector('[onclick*="dashboard"]')?.classList.add('active');
        if(viewId === 'profile') document.querySelector('[onclick*="profile"]')?.classList.add('active');

        if(viewId === 'dashboard') dashboard.render();
        if(viewId === 'profile') profile.render();
        if(viewId === 'profile' && !document.getElementById('tab-history').classList.contains('hidden')) profile.loadHistory();
    },
    hideSplash: () => { const splash = document.getElementById('splash-screen'); if(splash) { splash.style.opacity = '0'; setTimeout(() => splash.classList.add('hidden'), 500); } },
    handleLogin: async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch (err) { alert(err.message); } },
    handleRegister: async (e) => { e.preventDefault(); if(document.getElementById('reg-code').value !== 'bcnfitness') return alert("Código incorrecto"); try { const cred = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-pass').value); const clientType = document.getElementById('reg-role-select').value; await setDoc(doc(db, "users", cred.user.uid), { name: document.getElementById('reg-name').value, email: document.getElementById('reg-email').value, role: 'athlete', clientType: clientType, approved: false, photoURL: null, settings: { restTime: 60, weeklyGoal: 3 }, lastLifts: {}, records: {}, statsHistory: [], createdAt: new Date() }); } catch (err) { alert(err.message); } },
    showToast: (msg, type = 'normal') => { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; const icon = type === 'gold' ? 'emoji_events' : 'info'; toast.innerHTML = `<i class="material-icons-round">${icon}</i><span>${msg}</span>`; container.appendChild(toast); setTimeout(() => toast.remove(), 4000); }
};

const admin = {
    refreshAll: () => { admin.renderExerciseSelect(); admin.renderUsers(); admin.renderExistingRoutines(); },
    
    renderUsers: async () => {
        const list = document.getElementById('admin-users-list');
        const select = document.getElementById('assign-client-select');
        if(!list) return;
        list.innerHTML = 'Cargando...';
        try {
            // Cargar rutinas primero
            const routinesSnap = await getDocs(collection(db, "routines"));
            const routineCounts = {};
            routinesSnap.forEach(doc => { const r = doc.data(); if(r.assignedTo) routineCounts[r.assignedTo] = (routineCounts[r.assignedTo] || 0) + 1; });

            // Cargar usuarios
            const snapshot = await getDocs(collection(db, "users"));
            list.innerHTML = ''; state.allClients = [];
            select.innerHTML = '<option value="" disabled selected>Selecciona Cliente</option>';
            
            snapshot.forEach(docSnap => {
                const u = docSnap.data(); state.allClients.push({ id: docSnap.id, ...u });
                const avatar = u.photoURL || 'assets/placeholder-body.png';
                const rCount = routineCounts[docSnap.id] || 0;
                
                list.innerHTML += `
                    <div class="user-row">
                        <img src="${avatar}" class="user-avatar-small" onclick="admin.viewClient('${docSnap.id}')">
                        <div class="user-info" onclick="admin.viewClient('${docSnap.id}')">
                            <h5>${u.name} <span class="routine-count-badge">[${rCount} Rutinas]</span></h5>
                            <span>${u.clientType||'Cliente'}</span>
                        </div>
                        <div class="user-actions">
                            ${!u.approved ? `<button class="action-btn btn-green" onclick="admin.toggleApproval('${docSnap.id}', true)">APROBAR</button>` : ''}
                            <button class="action-btn btn-delete" onclick="admin.deleteUser('${docSnap.id}', '${u.name}')"><i class="material-icons-round" style="font-size:14px">delete</i></button>
                        </div>
                    </div>`;
                select.innerHTML += `<option value="${docSnap.id}">${u.name}</option>`;
            });
        } catch (e) { console.error(e); list.innerHTML = 'Error cargando usuarios.'; }
    },
    
    deleteUser: async (uid, name) => { if(!confirm(`¿Eliminar a ${name}?`)) return; if(!confirm("⚠️ Acción irreversible. ¿Continuar?")) return; try { await deleteDoc(doc(db, "users", uid)); alert("Eliminado"); admin.renderUsers(); } catch(e) { alert("Error"); } },
    toggleApproval: async (uid, status) => { await updateDoc(doc(db, "users", uid), { approved: status }); admin.renderUsers(); },
    
    viewClient: async (userId) => {
        state.currentClientId = userId;
        let user = state.allClients.find(c => c.id === userId);
        if(!user) { const docSnap = await getDoc(doc(db, "users", userId)); user = { id: docSnap.id, ...docSnap.data() }; }
        
        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('client-detail-age').innerText = "Edad: " + (user.age || '--');
        document.getElementById('client-detail-img').src = user.photoURL || 'assets/placeholder-body.png';
        
        const stats = user.statsHistory && user.statsHistory.length > 0 ? user.statsHistory[user.statsHistory.length - 1] : null;
        document.getElementById('cd-weight').innerText = stats ? stats.weight + 'kg' : '--';
        document.getElementById('cd-fat').innerText = stats ? stats.fat + '%' : '--';
        document.getElementById('cd-muscle').innerText = stats ? stats.muscle + '%' : '--';
        
        // HISTORIAL CLIENTE SIN ORDERBY (Client-side Sort)
        const historyContainer = document.getElementById('client-detail-history'); historyContainer.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", userId));
            const snapshot = await getDocs(q); 
            const workouts = [];
            snapshot.forEach(doc => workouts.push(doc.data()));
            workouts.sort((a,b) => b.date.seconds - a.date.seconds);

            historyContainer.innerHTML = ''; const muscleCounts = {};
            if(workouts.length === 0) historyContainer.innerHTML = '<p style="text-align:center">Sin entrenos.</p>';
            
            workouts.slice(0, 10).forEach(w => {
                const d = new Date(w.date.seconds*1000).toLocaleDateString();
                if(w.data.exercises) w.data.exercises.forEach(e => { if(!muscleCounts[e.m]) muscleCounts[e.m]=0; muscleCounts[e.m]+= (e.sets ? e.sets.length : 0); });
                const item = document.createElement('div'); item.className = 'history-item';
                item.innerHTML = `<div class="history-date">${d}</div><div class="history-title">${w.data.name}</div><div class="history-meta"><span class="tag">${w.rpe}</span></div>`;
                item.onclick = () => profile.showWorkoutDetails(w); historyContainer.appendChild(item);
            });
            chartHelpers.renderRadar('clientRadarChart', muscleCounts);
        } catch(e) { console.log(e); historyContainer.innerHTML = 'Error al cargar.'; }
        
        chartHelpers.renderLine('clientWeightChart', user.statsHistory||[], 'weight', '#39ff14');
        chartHelpers.renderLine('clientFatChart', user.statsHistory||[], 'fat', '#ff3b30');
        chartHelpers.renderLine('clientMuscleChart', user.statsHistory||[], 'muscle', '#00d4ff');
        
        admin.renderClientRoutines(userId);
        app.navTo('client-detail');
    },

    renderClientRoutines: async (userId) => {
        const container = document.getElementById('client-routines-list'); container.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "routines"), where("assignedTo", "==", userId));
            const snapshot = await getDocs(q); container.innerHTML = '';
            if(snapshot.empty) container.innerHTML = '<p style="font-size:12px; color:#666">Sin rutinas asignadas.</p>';
            snapshot.forEach(doc => { const r = doc.data(); container.innerHTML += `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center"><span style="font-size:13px">${r.name}</span><button class="icon-btn" onclick="admin.deleteRoutine('${doc.id}')" style="color:#ff3b30; font-size:16px"><i class="material-icons-round">delete</i></button></div>`; });
            
            const select = document.getElementById('client-clone-select'); select.innerHTML = '<option value="" disabled selected>Seleccionar base...</option>';
            const allRoutines = await getDocs(collection(db, "routines"));
            const uniqueNames = new Set();
            allRoutines.forEach(doc => { 
                const d = doc.data();
                if(d.assignedTo !== userId && !uniqueNames.has(d.name)) {
                    uniqueNames.add(d.name);
                    select.innerHTML += `<option value="${doc.id}">${d.name}</option>`; 
                }
            });
        } catch(e) { console.log(e); }
    },

    cloneRoutineFromClientView: async () => {
        const routineId = document.getElementById('client-clone-select').value;
        if(!routineId) return;
        admin.cloneRoutine(routineId, state.currentClientId);
    },

    renderExistingRoutines: async () => {
        const container = document.getElementById('admin-routines-management'); if(!container) return; container.innerHTML = 'Cargando...';
        try {
            const snapshot = await getDocs(collection(db, "routines"));
            container.innerHTML = '';
            
            const groupedRoutines = {};
            snapshot.forEach(doc => {
                const r = doc.data();
                if(!groupedRoutines[r.name]) { groupedRoutines[r.name] = { id: doc.id, ...r }; }
            });

            if(Object.keys(groupedRoutines).length === 0) { container.innerHTML = '<p>No hay rutinas.</p>'; return; }

            Object.values(groupedRoutines).forEach(r => {
                let cloneOptions = `<option value="" disabled selected>Clonar a...</option>`;
                state.allClients.forEach(c => { cloneOptions += `<option value="${c.id}">Clonar a ${c.name}</option>`; });
                
                container.innerHTML += `
                    <div class="exercise-card" style="border-left: 4px solid var(--neon-green)">
                        <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer" onclick="admin.showRoutineDetails('${r.id}')">
                            <h4 style="margin:0">${r.name}</h4>
                            <i class="material-icons-round" style="color:#666">info</i>
                        </div>
                        <div style="margin-top:5px; font-size:12px; color:#aaa">${r.exercises.length} Ejercicios</div>
                        <div style="margin-top:10px; background:#222; padding:5px; border-radius:5px">
                            <select onchange="admin.cloneRoutine('${r.id}', this.value)" style="margin:0; padding:5px; font-size:12px; height:auto; background:transparent; border:none; width:100%; color:var(--neon-green)">
                                ${cloneOptions}
                            </select>
                        </div>
                    </div>`;
            });
        } catch(e) { console.log(e); container.innerHTML = 'Error'; }
    },
    
    showRoutineDetails: async (routineId) => {
        const docSnap = await getDoc(doc(db, "routines", routineId));
        const r = docSnap.data();
        const modal = document.getElementById('workout-detail-modal');
        const content = document.getElementById('wd-content');
        document.getElementById('wd-title').innerText = r.name;
        let html = '';
        r.exercises.forEach(ex => { html += `<h4 style="margin:10px 0 5px; color:var(--neon-green)">${ex.n}</h4><div style="font-size:12px; color:#888">${ex.defaultSets.length} Series predefinidas</div>`; });
        content.innerHTML = html; modal.classList.remove('hidden');
    },
    
    cloneRoutine: async (routineId, targetUserId) => {
        try {
            const docSnap = await getDoc(doc(db, "routines", routineId)); const data = docSnap.data();
            await addDoc(collection(db, "routines"), { ...data, assignedTo: targetUserId, createdAt: new Date(), name: data.name });
            alert("Rutina clonada exitosamente"); 
            if(document.getElementById('view-client-detail').classList.contains('active')) admin.renderClientRoutines(targetUserId);
            else admin.renderExistingRoutines();
        } catch(e) { alert("Error al clonar"); }
    },

    deleteRoutine: async (routineId) => { if(!confirm("¿Borrar rutina permanentemente?")) return; try { await deleteDoc(doc(db, "routines", routineId)); if(document.getElementById('view-client-detail').classList.contains('active')) admin.renderClientRoutines(state.currentClientId); else admin.renderExistingRoutines(); } catch(e) { alert("Error"); } },
    renderExerciseSelect: () => { const select = document.getElementById('admin-exercise-select'); if(!select) return; select.innerHTML = '<option value="">Selecciona ejercicio...</option>'; EXERCISES.forEach((ex, idx) => { select.innerHTML += `<option value="${idx}">${ex.n}</option>`; }); state.newRoutine = []; admin.renderPreview(); },
    filterExercises: (term) => { const select = document.getElementById('admin-exercise-select'); const lowerTerm = term.toLowerCase(); select.innerHTML = ''; EXERCISES.forEach((ex, idx) => { if(ex.n.toLowerCase().includes(lowerTerm)) select.innerHTML += `<option value="${idx}">${ex.n}</option>`; }); },
    addExerciseToRoutine: () => { const idx = document.getElementById('admin-exercise-select').value; if(!idx) return; const exData = EXERCISES[idx]; state.newRoutine.push({ ...exData, defaultSets: [ {reps: 20}, {reps: 16}, {reps: 16}, {reps: 16}, {reps: 16} ] }); admin.renderPreview(); },
    renderPreview: () => { const container = document.getElementById('admin-routine-preview'); if(!container) return; container.innerHTML = state.newRoutine.map((ex, exIdx) => { const imgSrc = ex.img ? `assets/muscles/${ex.img}` : 'assets/placeholder-body.png'; let setsHtml = ex.defaultSets.map((s, sIdx) => `<input type="number" class="mini-input" value="${s.reps}" onchange="admin.updateRoutineSet(${exIdx}, ${sIdx}, this.value)">`).join(''); return `<div class="routine-edit-row"><div class="routine-edit-header"><img src="${imgSrc}" class="routine-mini-img"><span style="font-size:14px">${ex.n}</span><button class="btn-text" style="width:auto; margin:0 0 0 auto; color:#ff3b30" onclick="admin.removeExercise(${exIdx})">x</button></div><div class="routine-sets-inputs">${setsHtml}</div></div>`; }).join(''); },
    updateRoutineSet: (exIdx, sIdx, val) => { state.newRoutine[exIdx].defaultSets[sIdx].reps = parseInt(val); },
    removeExercise: (idx) => { state.newRoutine.splice(idx, 1); admin.renderPreview(); },
    saveRoutine: async () => { const name = document.getElementById('new-routine-name').value; const assignedTo = document.getElementById('assign-client-select').value; if(!name || state.newRoutine.length === 0 || !assignedTo) return alert("Faltan datos"); try { await addDoc(collection(db, "routines"), { name: name, exercises: state.newRoutine, assignedTo: assignedTo, createdBy: state.user.uid, createdAt: new Date() }); alert("Guardada"); state.newRoutine = []; document.getElementById('new-routine-name').value = ''; admin.renderPreview(); admin.renderExistingRoutines(); admin.renderUsers(); } catch(e) { alert("Error"); } }
};

const dashboard = {
    render: async () => {
        const container = document.getElementById('routines-list'); if(!container) return; container.innerHTML = 'Cargando...';
        // Calcular mi progreso
        dashboard.calculateWeeklyProgress(state.user.uid, 'weekly-count', 'weekly-bar', state.profile.settings?.weeklyGoal);
        
        try {
            const snapshot = await getDocs(collection(db, "routines")); container.innerHTML = ''; let count = 0;
            snapshot.forEach(doc => {
                const r = doc.data();
                if(r.assignedTo === state.user.uid) {
                    count++;
                    container.innerHTML += `
                        <div class="exercise-card" onclick="window.workoutManager.start('${doc.id}', '${r.name}')" style="cursor:pointer">
                            <div style="display:flex; justify-content:space-between; align-items:center">
                                <h3 style="margin:0">${r.name}</h3>
                                <i class="material-icons-round" style="color:var(--neon-green)">play_circle_filled</i>
                            </div>
                            <p style="color:#888; font-size:14px; margin:5px 0">${r.exercises.length} Ejercicios</p>
                        </div>`;
                }
            });
            if(count === 0) container.innerHTML = '<p style="text-align:center">Sin rutinas.</p>';
        } catch(e) { container.innerHTML = 'Error cargando rutinas'; }
    },
    
    // CALCULADORA SEMANAL (Lunes a Domingo)
    calculateWeeklyProgress: async (userId, countId, barId, goalVal) => {
        try {
            const now = new Date();
            const day = now.getDay() || 7; 
            if(day !== 1) now.setHours(-24 * (day - 1)); 
            now.setHours(0,0,0,0); // Lunes 00:00
            
            // Client-side filtering to avoid index error
            const q = query(collection(db, "workouts"), where("userId", "==", userId));
            const snap = await getDocs(q); 
            let weekCount = 0;
            snap.forEach(d => {
                if(d.data().date.seconds * 1000 >= now.getTime()) weekCount++;
            });
            
            const goal = goalVal || 3;
            const elCount = document.getElementById(countId);
            const elBar = document.getElementById(barId);
            
            if(elCount) elCount.innerText = `${weekCount}/${goal}`;
            if(elBar) elBar.style.width = Math.min((weekCount/goal)*100, 100) + '%';
        } catch(e) { console.log("Error weekly", e); }
    }
};

const workoutManager = {
    start: async (rid, rname) => {
        try {
            const docRef = await getDoc(doc(db, "routines", rid)); const routineData = docRef.data();
            state.lastWorkoutData = null;
            try {
                const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
                const snapshot = await getDocs(q);
                const workouts = [];
                snapshot.forEach(doc => workouts.push(doc.data()));
                workouts.sort((a,b) => b.date.seconds - a.date.seconds);
                const last = workouts.find(w => w.data.name === rname);
                if(last) state.lastWorkoutData = last.data;
            } catch(e) {}

            state.activeWorkout = {
                name: rname, start: Date.now(),
                exercises: routineData.exercises.map(ex => ({...ex, sets: ex.defaultSets.map(s => ({...s, kg:'', done:false})) }))
            };
            localStorage.setItem('bcn_workout', JSON.stringify(state.activeWorkout));
            try { state.wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
            workoutManager.uiInit();
        } catch(e) { alert("Error al iniciar: " + e.message); }
    },

    uiInit: () => {
        app.navTo('workout');
        const container = document.getElementById('active-exercises-container');
        container.innerHTML = '';
        state.activeWorkout.exercises.forEach((ex, idx) => {
            let setsHtml = '';
            ex.sets.forEach((s, sIdx) => {
                let prevInfo = '--';
                if(state.lastWorkoutData && state.lastWorkoutData.exercises[idx] && state.lastWorkoutData.exercises[idx].sets[sIdx]) {
                    const p = state.lastWorkoutData.exercises[idx].sets[sIdx];
                    prevInfo = `${p.reps}x${p.kg}`;
                }
                setsHtml += `
                <div class="set-row ${s.done?'set-completed':''}">
                    <span>#${sIdx+1}</span>
                    <span style="font-size:10px; color:#888">${prevInfo}</span>
                    <input type="number" placeholder="reps" value="${s.reps}" onchange="window.workoutManager.updateSet(${idx},${sIdx},'reps',this.value)">
                    <input type="number" placeholder="kg" value="${s.kg}" onchange="window.workoutManager.updateSet(${idx},${sIdx},'kg',this.value)">
                    <div class="check-box ${s.done?'checked':''}" onclick="window.workoutManager.toggleSet(${idx},${sIdx})">✔</div>
                </div>`;
            });
            container.innerHTML += `<div class="exercise-card"><h3>${ex.n}</h3>${setsHtml}</div>`;
        });
        
        setInterval(() => {
            const diff = Math.floor((Date.now() - state.activeWorkout.start) / 1000);
            const m = Math.floor(diff/60).toString().padStart(2,'0');
            const s = (diff%60).toString().padStart(2,'0');
            document.getElementById('global-timer').innerText = `${m}:${s}`;
        }, 1000);
    },

    updateSet: (exIdx, sIdx, field, val) => {
        state.activeWorkout.exercises[exIdx].sets[sIdx][field] = val;
        localStorage.setItem('bcn_workout', JSON.stringify(state.activeWorkout));
    },

    toggleSet: (exIdx, sIdx) => {
        const s = state.activeWorkout.exercises[exIdx].sets[sIdx];
        s.done = !s.done;
        if(s.done) {
            if(state.sounds.beep) state.sounds.beep.play().catch(e=>{});
            workoutManager.startRest(state.profile.settings?.restTime || 60);
            // 1RM Logic
            if(s.kg && s.reps) {
                const kg = parseFloat(s.kg); const reps = parseInt(s.reps);
                const oneRM = Math.round(kg * (1 + reps/30)); const exName = state.activeWorkout.exercises[exIdx].n;
                if(!state.profile.records) state.profile.records = {};
                if(oneRM > (state.profile.records[exName] || 0)) {
                    state.profile.records[exName] = oneRM;
                    updateDoc(doc(db, "users", state.user.uid), { [`records.${exName}`]: oneRM });
                    app.showToast(`¡RÉCORD! ${exName} (${oneRM}kg)`, 'gold');
                    confetti();
                }
            }
        }
        workoutManager.uiInit();
    },

    startRest: (sec) => {
        const modal = document.getElementById('rest-modal');
        modal.classList.remove('hidden');
        let remaining = sec;
        if(state.restTimer) clearInterval(state.restTimer);
        const update = () => {
            document.getElementById('rest-countdown').innerText = remaining;
            if(remaining <= 0) {
                if(state.sounds.beep) state.sounds.beep.play().catch(e=>{});
                if(navigator.vibrate) navigator.vibrate([200,200]);
                workoutManager.stopRest();
            }
            remaining--;
        };
        update();
        state.restTimer = setInterval(update, 1000);
    },

    stopRest: () => {
        clearInterval(state.restTimer);
        document.getElementById('rest-modal').classList.add('hidden');
    },

    cancelWorkout: () => {
        if(confirm("¿Cancelar?")) {
            localStorage.removeItem('bcn_workout');
            state.activeWorkout = null;
            if(state.wakeLock) state.wakeLock.release();
            app.navTo('dashboard');
        }
    },

    openFinishModal: () => { document.getElementById('finish-modal').classList.remove('hidden'); },

    confirmFinish: async (rpe) => {
        document.getElementById('finish-modal').classList.add('hidden');
        if(!state.user || !state.activeWorkout) return alert("Error crítico: No hay sesión activa.");
        
        try {
            await addDoc(collection(db, "workouts"), {
                userId: state.user.uid,
                userName: state.profile.name,
                date: new Date(),
                data: state.activeWorkout,
                rpe: rpe,
                notes: document.getElementById('final-notes').value || ''
            });
            localStorage.removeItem('bcn_workout');
            state.activeWorkout = null;
            if(state.wakeLock) state.wakeLock.release();
            app.showToast("¡Entreno Guardado!", "gold");
            confetti();
            app.navTo('dashboard');
        } catch(e) { alert("Error al guardar: " + e.message); }
    }
};

const profile = {
    render: () => {
        if(!state.profile) return;
        document.getElementById('profile-name').innerText = state.profile.name;
        const imgEl = document.getElementById('profile-img'); if(state.profile.photoURL) imgEl.src = state.profile.photoURL;
        document.getElementById('profile-role-badge').innerText = state.profile.clientType || state.profile.role;
        const goalInput = document.getElementById('conf-weekly-goal'); if(goalInput) goalInput.value = state.profile.settings?.weeklyGoal || 3;
        const restInput = document.getElementById('conf-rest-time'); if(restInput) restInput.value = state.profile.settings?.restTime || 60;
        profile.renderCharts(); profile.calculateGlobalStats();
        // Cargar mapa muscular propio
        profile.loadRadar();
    },
    
    loadRadar: async () => {
        const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
        const snap = await getDocs(q);
        const counts = {};
        snap.forEach(d => {
            const w = d.data();
            if(w.data.exercises) w.data.exercises.forEach(e => counts[e.m] = (counts[e.m]||0) + 1);
        });
        const ctx = document.getElementById('radarChart').getContext('2d');
        if(window.myRadar) window.myRadar.destroy();
        window.myRadar = new Chart(ctx, {
            type: 'radar',
            data: { labels: Object.keys(counts), datasets: [{label:'Series', data:Object.values(counts), backgroundColor:'rgba(57,255,20,0.2)', borderColor:'#39ff14'}] },
            options: { scales: { r: { grid: { color: '#444' }, pointLabels: { color: 'white' }, ticks: { display: false } } } }
        });
    },

    saveStats: async () => {
        const w = document.getElementById('stats-weight').value;
        const f = document.getElementById('stats-fat').value;
        const m = document.getElementById('stats-muscle').value;
        if(w) {
            await updateDoc(doc(db, "users", state.user.uid), {
                statsHistory: arrayUnion({date:new Date(), weight:w, fat:f, muscle:m})
            });
            alert("Guardado");
        }
    },
    saveSettings: async () => {
        const g = parseInt(document.getElementById('conf-weekly-goal').value);
        const r = parseInt(document.getElementById('conf-rest-time').value);
        await updateDoc(doc(db, "users", state.user.uid), { "settings.weeklyGoal": g, "settings.restTime": r });
        state.profile.settings = { weeklyGoal: g, restTime: r };
        alert("Guardado");
    },
    
    requestNotify: () => {
        if (!("Notification" in window)) return alert("No soportado");
        Notification.requestPermission().then(perm => { if(perm === "granted") new Notification("¡Activado!"); });
    },
    sendNotification: (title, body) => { if(Notification.permission === "granted") new Notification(title, { body: body, icon: 'logo.png' }); },
    testSound: () => { if(state.sounds.beep) { state.sounds.beep.currentTime = 0; state.sounds.beep.play().then(() => alert("Sonido OK")); } }
};

const chartHelpers = {
    renderLine: (id, history, field, color) => {
        const ctx = document.getElementById(id); if(!ctx) return; if(ctx.chartInstance) ctx.chartInstance.destroy();
        const labels = history.map(h => new Date(h.date.seconds ? h.date.seconds*1000 : h.date).toLocaleDateString());
        const data = history.map(h => h[field]);
        ctx.chartInstance = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: field, data: data, borderColor: color, backgroundColor: color+'20', tension: 0.3, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#222' } }, x: { grid: { color: '#222' } } } } });
    },
    renderRadar: (id, counts) => {
        const ctx = document.getElementById(id); if(!ctx) return; if(ctx.chartInstance) ctx.chartInstance.destroy();
        ctx.chartInstance = new Chart(ctx, { type: 'radar', data: { labels: Object.keys(counts), datasets: [{ label: 'Series', data: Object.values(counts), backgroundColor: 'rgba(57, 255, 20, 0.2)', borderColor: '#39ff14', pointBackgroundColor: '#fff' }] }, options: { scales: { r: { grid: { color: '#444' }, pointLabels: { color: 'white', font: {size: 10} }, ticks: { display: false, backdropColor: 'transparent' } } }, plugins: { legend: { display: false } } } });
    }
};

window.app = app; window.workoutManager = workoutManager; window.admin = admin; window.profile = profile; window.chartHelpers = chartHelpers;
app.init();

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
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
        document.getElementById('login-form').onsubmit = app.handleLogin;
        document.getElementById('register-form').onsubmit = app.handleRegister;
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
            // Cargar rutinas primero para contar
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
                        <div class="user-info" onclick="admin.viewClient('${docSnap.id}')"><h5>${u.name} <span class="routine-count-badge">🏋️ ${rCount}</span></h5><span>${u.clientType||'Cliente'}</span></div>
                        <div class="user-actions">
                            ${!u.approved ? `<button class="action-btn btn-green" onclick="admin.toggleApproval('${docSnap.id}', true)">APROBAR</button>` : ''}
                            <button class="action-btn btn-delete" onclick="admin.deleteUser('${docSnap.id}', '${u.name}')"><i class="material-icons-round" style="font-size:14px">delete</i></button>
                        </div>
                    </div>`;
                select.innerHTML += `<option value="${docSnap.id}">${u.name}</option>`;
            });
        } catch (e) { console.error(e); list.innerHTML = 'Error cargando lista'; }
    },
    
    deleteUser: async (uid, name) => { if(!confirm(`¿Eliminar a ${name}?`)) return; if(!confirm("⚠️ Acción irreversible. ¿Continuar?")) return; try { await deleteDoc(doc(db, "users", uid)); alert("Eliminado"); admin.renderUsers(); } catch(e) { alert("Error"); } },
    toggleApproval: async (uid, status) => { await updateDoc(doc(db, "users", uid), { approved: status }); admin.renderUsers(); },
    
    viewClient: async (userId) => {
        state.currentClientId = userId;
        let user = state.allClients.find(c => c.id === userId);
        if(!user) { const docSnap = await getDoc(doc(db, "users", userId)); user = { id: docSnap.id, ...docSnap.data() }; }
        
        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('client-detail-img').src = user.photoURL || 'assets/placeholder-body.png';
        const stats = user.statsHistory && user.statsHistory.length > 0 ? user.statsHistory[user.statsHistory.length - 1] : null;
        document.getElementById('cd-weight').innerText = stats ? stats.weight + 'kg' : '--'; document.getElementById('cd-fat').innerText = stats ? stats.fat + '%' : '--'; document.getElementById('cd-muscle').innerText = stats ? stats.muscle + '%' : '--';
        
        // Historial
        const historyContainer = document.getElementById('client-detail-history'); historyContainer.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", userId), orderBy("date", "desc"), limit(10));
            const snapshot = await getDocs(q); historyContainer.innerHTML = ''; const muscleCounts = {};
            if(snapshot.empty) historyContainer.innerHTML = '<p style="text-align:center">Sin entrenos.</p>';
            snapshot.forEach(doc => {
                const w = doc.data(); const d = w.date.seconds ? new Date(w.date.seconds*1000) : new Date(w.date);
                if(w.data && w.data.exercises) { w.data.exercises.forEach(ex => { if(!muscleCounts[ex.m]) muscleCounts[ex.m]=0; muscleCounts[ex.m]+= (ex.sets ? ex.sets.length : 0); }); }
                const item = document.createElement('div'); item.className = 'history-item';
                item.innerHTML = `<div class="history-date">${d.toLocaleDateString()}</div><div class="history-title">${w.data.name}</div><div class="history-meta"><span class="tag">${w.rpe}</span></div>`;
                item.onclick = () => profile.showWorkoutDetails(w); historyContainer.appendChild(item);
            });
            chartHelpers.renderRadar('clientRadarChart', muscleCounts);
        } catch(e) { historyContainer.innerHTML = 'Falta índice (ver consola)'; }
        
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
            allRoutines.forEach(doc => { if(doc.data().assignedTo !== userId) select.innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`; });
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
            const q = query(collection(db, "routines"), orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q); container.innerHTML = '';
            if(snapshot.empty) { container.innerHTML = '<p>No hay rutinas.</p>'; return; }
            snapshot.forEach(docSnap => {
                const r = docSnap.data();
                let cloneOptions = `<option value="" disabled selected>Clonar a...</option>`;
                state.allClients.forEach(c => { cloneOptions += `<option value="${c.id}">Clonar a ${c.name}</option>`; });
                const assignedName = state.allClients.find(c => c.id === r.assignedTo)?.name || 'Sin asignar';
                container.innerHTML += `<div class="exercise-card" style="border-left: 4px solid #00d4ff"><div style="display:flex; justify-content:space-between; align-items:center"><h4 style="margin:0">${r.name}</h4><button class="icon-btn" onclick="admin.deleteRoutine('${docSnap.id}')" style="color:#ff3b30"><i class="material-icons-round" style="font-size:20px">delete</i></button></div><div style="margin-top:5px; font-size:12px; color:#aaa">Asignado a: <strong style="color:white">${assignedName}</strong></div><div style="margin-top:10px; background:#222; padding:5px; border-radius:5px"><select onchange="admin.cloneRoutine('${docSnap.id}', this.value)" style="margin:0; padding:5px; font-size:12px; height:auto; background:transparent; border:none; width:100%; color:#00d4ff">${cloneOptions}</select></div></div>`;
            });
        } catch(e) { container.innerHTML = 'Error'; }
    },
    
    cloneRoutine: async (routineId, targetUserId) => {
        try {
            const docSnap = await getDoc(doc(db, "routines", routineId)); const data = docSnap.data();
            await addDoc(collection(db, "routines"), { ...data, assignedTo: targetUserId, createdAt: new Date(), name: data.name });
            alert("Clonada"); 
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
        dashboard.calculateWeeklyProgress();
        try {
            const q = query(collection(db, "routines")); const snapshot = await getDocs(q); container.innerHTML = ''; let count = 0;
            snapshot.forEach(doc => {
                const r = doc.data();
                if(r.assignedTo === state.user.uid) {
                    count++;
                    container.innerHTML += `<div class="exercise-card"><div style="display:flex; justify-content:space-between; align-items:center"><h3 style="margin:0">${r.name}</h3><i class="material-icons-round" style="color:var(--neon-green)">fitness_center</i></div><p style="color:#888; font-size:14px; margin:5px 0">${r.exercises.length} Ejercicios</p><button class="btn-primary" style="margin-top:10px" onclick="workoutManager.start('${doc.id}', '${r.name}')">INICIAR</button></div>`;
                }
            });
            if(count === 0) container.innerHTML = '<p style="text-align:center">Sin rutinas.</p>';
        } catch(e) { container.innerHTML = 'Error cargando rutinas'; }
    },
    calculateWeeklyProgress: async () => {
        try {
            const now = new Date(); const start = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay()===0?-6:1))); start.setHours(0,0,0,0);
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid), where("date", ">=", start));
            const snap = await getDocs(q); const count = snap.size; const goal = state.profile.settings?.weeklyGoal || 3;
            document.getElementById('weekly-count').innerText = `${count}/${goal}`;
            document.getElementById('weekly-bar').style.width = Math.min((count/goal)*100, 100) + '%';
        } catch(e) {}
    }
};

const workoutManager = {
    start: async (routineId, routineName) => {
        try {
            const docRef = await getDoc(doc(db, "routines", routineId)); const routineData = docRef.data();
            state.lastWorkoutData = null;
            try {
                const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid), orderBy("date", "desc"), limit(5));
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => { const w = doc.data(); if(w.data.name === routineName && !state.lastWorkoutData) state.lastWorkoutData = w.data; });
            } catch(e) {}
            state.activeWorkout = { name: routineName, startTime: Date.now(), exercises: routineData.exercises.map(ex => ({ ...ex, sets: ex.defaultSets ? ex.defaultSets.map(s => ({...s, kg:'', done:false})) : [] })) };
            workoutManager.enableWakeLock(); workoutManager.saveLocal(); workoutManager.uiInit();
        } catch(e) { alert("Error"); }
    },
    enableWakeLock: async () => { try { state.wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {} },
    resumeWorkout: (data) => { state.activeWorkout = data; workoutManager.uiInit(); workoutManager.enableWakeLock(); },
    uiInit: () => { app.navTo('workout'); workoutManager.renderExercises(); workoutManager.startGlobalTimer(); },
    cancelWorkout: () => { if(confirm("¿Cancelar?")) { localStorage.removeItem(`bcn_workout_${state.user.uid}`); state.activeWorkout = null; if(state.wakeLock) state.wakeLock.release(); app.navTo('dashboard'); } },
    openFinishModal: () => document.getElementById('finish-modal').classList.remove('hidden'),
    
    confirmFinish: async (rpeLabel) => {
        document.getElementById('finish-modal').classList.add('hidden');
        try {
            const notes = document.getElementById('final-notes').value;
            await addDoc(collection(db, "workouts"), { userId: state.user.uid, userName: state.profile.name, date: new Date(), data: state.activeWorkout, rpe: rpeLabel, notes: notes });
            localStorage.removeItem(`bcn_workout_${state.user.uid}`); state.activeWorkout = null; if(state.wakeLock) state.wakeLock.release(); 
            const now = new Date(); const start = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay()===0?-6:1)));
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid), where("date", ">=", start));
            const snap = await getDocs(q); const count = snap.size; const goal = state.profile.settings?.weeklyGoal || 3;
            if(count >= goal) { confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }); app.showToast("¡OBJETIVO SEMANAL CUMPLIDO!", 'gold'); } 
            else { alert("¡Completado!"); }
            app.navTo('dashboard'); 
        } catch(e) { alert("Error al guardar"); }
    },

    renderExercises: () => {
        const container = document.getElementById('active-exercises-container'); if(!container) return; container.innerHTML = '';
        state.activeWorkout.exercises.forEach((ex, exIdx) => {
            const imgSrc = ex.img ? `assets/muscles/${ex.img}` : 'assets/placeholder-body.png';
            container.innerHTML += `<div class="exercise-card"><div style="display:flex; align-items:center; gap:10px; margin-bottom:10px"><img src="${imgSrc}" width="40" style="border-radius:4px; background:#333" onerror="this.src='assets/placeholder-body.png'"><div><h3 style="font-size:16px; margin:0">${ex.n}</h3><small style="color:var(--neon-green)">${ex.m}</small></div>${ex.v ? `<a href="${ex.v}" target="_blank" style="margin-left:auto; color:white"><i class="material-icons-round">videocam</i></a>` : ''}</div><div id="sets-list-${exIdx}"></div><button class="btn-text" style="width:100%; border:1px dashed #333" onclick="workoutManager.addSet(${exIdx})">+ AÑADIR SERIE</button></div>`;
            workoutManager.renderSets(exIdx);
        });
    },

    renderSets: (exIdx) => {
        const list = document.getElementById(`sets-list-${exIdx}`);
        const ex = state.activeWorkout.exercises[exIdx];
        list.innerHTML = ex.sets.map((set, sIdx) => {
            let prevText = '--';
            if(state.lastWorkoutData && state.lastWorkoutData.exercises[exIdx] && state.lastWorkoutData.exercises[exIdx].sets[sIdx]) {
                const p = state.lastWorkoutData.exercises[exIdx].sets[sIdx]; prevText = `${p.reps}x${p.kg}kg`;
            }
            return `<div class="set-row ${set.done ? 'set-completed' : ''}"><span style="color:#555">#${sIdx+1}</span><span style="font-size:10px; color:#555; text-align:center">${prevText}</span><input type="number" placeholder="reps" value="${set.reps || ''}" onchange="workoutManager.updateSet(${exIdx},${sIdx}, 'reps', this.value)"><input type="number" placeholder="kg" value="${set.kg || ''}" onchange="workoutManager.updateSet(${exIdx},${sIdx}, 'kg', this.value)"><div class="check-box ${set.done ? 'checked' : ''}" onclick="workoutManager.toggleSet(${exIdx}, ${sIdx})">${set.done ? '<i class="material-icons-round" style="font-size:16px; color:black">check</i>' : ''}</div></div>`;
        }).join('');
    },

    addSet: (exIdx) => { state.activeWorkout.exercises[exIdx].sets.push({ kg:'', reps:'', done: false }); workoutManager.saveLocal(); workoutManager.renderSets(exIdx); },
    updateSet: (exIdx, sIdx, field, val) => { state.activeWorkout.exercises[exIdx].sets[sIdx][field] = val; workoutManager.saveLocal(); },
    
    toggleSet: (exIdx, sIdx) => {
        const set = state.activeWorkout.exercises[exIdx].sets[sIdx]; set.done = !set.done;
        if(set.done) {
            if(state.sounds.beep) state.sounds.beep.play().catch(()=>{}); 
            const restTime = state.profile.settings?.restTime || 60; workoutManager.startRest(restTime);
            // Calculo RM y Toasts... (Se mantiene del V7)
        }
        workoutManager.saveLocal(); workoutManager.renderSets(exIdx);
    },

    startRest: (sec) => {
        const modal = document.getElementById('rest-modal'); modal.classList.remove('hidden');
        const endTime = Date.now() + sec * 1000;
        if(state.restTimer) clearInterval(state.restTimer);
        const updateDisplay = () => {
            const now = Date.now(); const remaining = Math.ceil((endTime - now) / 1000);
            if(remaining <= 0) {
                document.getElementById('rest-countdown').innerText = "00:00";
                if(state.sounds.beep) state.sounds.beep.play().catch(()=>{}); 
                if(navigator.vibrate) navigator.vibrate([200,100,200]);
                if (document.hidden) profile.sendNotification("¡Descanso Terminado!", "Vamos a por la siguiente serie.");
                workoutManager.stopRest(); return;
            }
            document.getElementById('rest-countdown').innerText = `${Math.floor(remaining/60).toString().padStart(2,'0')}:${(remaining%60).toString().padStart(2,'0')}`;
        };
        updateDisplay(); state.restTimer = setInterval(updateDisplay, 1000);
    },

    stopRest: () => { clearInterval(state.restTimer); document.getElementById('rest-modal').classList.add('hidden'); },
    
    startGlobalTimer: () => {
        setInterval(() => {
            if(!state.activeWorkout) return;
            const diff = Math.floor((Date.now() - state.activeWorkout.startTime) / 1000);
            document.getElementById('global-timer').innerText = `${Math.floor(diff/60).toString().padStart(2,'0')}:${(diff%60).toString().padStart(2,'0')}`;
        }, 1000);
    },
    saveLocal: () => { if(state.user) localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout)); }
};

const profile = {
    render: () => {
        if(!state.profile) return;
        document.getElementById('profile-name').innerText = state.profile.name;
        const imgEl = document.getElementById('profile-img'); if(state.profile.photoURL) imgEl.src = state.profile.photoURL;
        document.getElementById('profile-role-badge').innerText = state.profile.clientType || state.profile.role;
        const goalInput = document.getElementById('conf-weekly-goal'); if(goalInput) goalInput.value = state.profile.settings.weeklyGoal || 3;
        const restInput = document.getElementById('conf-rest-time'); if(restInput) restInput.value = state.profile.settings.restTime || 60;
        profile.renderCharts(); profile.calculateGlobalStats();
    },

    calculateGlobalStats: async () => {
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
            const snapshot = await getDocs(q);
            let totalTonnage = 0, totalSets = 0, totalReps = 0, totalWorkouts = snapshot.size;
            snapshot.forEach(doc => {
                const w = doc.data();
                if(w.data && w.data.exercises) { w.data.exercises.forEach(ex => { ex.sets.forEach(s => { if(s.done && s.kg && s.reps) { totalSets++; totalReps += parseInt(s.reps); totalTonnage += (parseInt(s.kg) * parseInt(s.reps)); } }); }); }
            });
            document.getElementById('stat-tonnage').innerText = (totalTonnage/1000).toFixed(1) + 't';
            document.getElementById('stat-sets').innerText = totalSets; document.getElementById('stat-reps').innerText = totalReps; document.getElementById('stat-workouts').innerText = totalWorkouts;
        } catch(e) {}
    },

    switchTab: (tabName) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.querySelector(`.tab-btn[onclick*="${tabName}"]`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.remove('hidden');
        if(tabName === 'history') profile.loadHistory();
    },

    loadHistory: async () => {
        const list = document.getElementById('history-list'); list.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid), orderBy("date", "desc"), limit(20));
            const snapshot = await getDocs(q);
            list.innerHTML = ''; const muscleCounts = {};
            if(snapshot.empty) return list.innerHTML = 'Sin historial.';
            snapshot.forEach(doc => {
                const w = doc.data(); const d = w.date.seconds ? new Date(w.date.seconds*1000) : new Date(w.date);
                if(w.data && w.data.exercises) { w.data.exercises.forEach(ex => { if(!muscleCounts[ex.m]) muscleCounts[ex.m]=0; muscleCounts[ex.m]+= (ex.sets ? ex.sets.length : 0); }); }
                const item = document.createElement('div'); item.className = 'history-item';
                item.innerHTML = `<div class="history-date">${d.toLocaleDateString()}</div><div class="history-title">${w.data.name}</div><div class="history-meta"><span class="tag">${w.rpe}</span></div>`;
                item.onclick = () => profile.showWorkoutDetails(w); list.appendChild(item);
            });
            chartHelpers.renderRadar('radarChart', muscleCounts);
        } catch(e) { list.innerHTML = `<div style="padding:15px; border:1px solid orange; color:orange">⚠️ Falta Índice (Click en link consola)</div>`; }
    },

    showWorkoutDetails: (w) => {
        const modal = document.getElementById('workout-detail-modal'); const content = document.getElementById('wd-content');
        const d = w.date.seconds ? new Date(w.date.seconds * 1000) : new Date(w.date);
        document.getElementById('wd-title').innerText = w.data.name;
        let html = `<p><strong>Fecha:</strong> ${d.toLocaleString()}</p><p><strong>Notas:</strong> ${w.notes || 'Ninguna'}</p><p><strong>RPE:</strong> ${w.rpe}</p><hr style="border:0; border-top:1px solid #444; margin:10px 0">`;
        w.data.exercises.forEach(ex => {
            html += `<h4 style="margin:10px 0 5px; color:var(--neon-green)">${ex.n}</h4><table class="detail-table"><thead><tr><th>Serie</th><th>Reps</th><th>Kg</th></tr></thead><tbody>`;
            ex.sets.forEach((s, i) => { html += `<tr><td>#${i+1}</td><td>${s.reps}</td><td>${s.kg}</td></tr>`; });
            html += `</tbody></table>`;
        });
        content.innerHTML = html; modal.classList.remove('hidden');
    },

    uploadPhoto: (input) => {
        const file = input.files[0]; if(!file) return;
        if(file.size > 2 * 1024 * 1024) return alert("Imagen muy grande");
        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = async () => {
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                const MAX = 300; let w = img.width, h = img.height;
                if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
                const base64 = canvas.toDataURL('image/jpeg', 0.7);
                try { await updateDoc(doc(db, "users", state.user.uid), { photoURL: base64 }); state.profile.photoURL = base64; document.getElementById('profile-img').src = base64; } catch(err) { alert("Error"); }
            };
        };
        reader.readAsDataURL(file);
    },

    saveStats: async () => {
        const w = document.getElementById('stats-weight').value; const f = document.getElementById('stats-fat').value; const m = document.getElementById('stats-muscle').value;
        if(!w) return alert("Falta peso");
        try {
            const newEntry = { date: new Date(), weight: parseFloat(w), fat: f?parseFloat(f):0, muscle: m?parseFloat(m):0 };
            await updateDoc(doc(db, "users", state.user.uid), { statsHistory: arrayUnion(newEntry) });
            if(!state.profile.statsHistory) state.profile.statsHistory = []; state.profile.statsHistory.push(newEntry);
            alert("Guardado"); profile.renderCharts();
        } catch(e) { alert("Error"); }
    },

    renderCharts: () => {
        const history = state.profile.statsHistory || []; history.sort((a,b) => (a.date.seconds || a.date) - (b.date.seconds || b.date));
        chartHelpers.renderLine('weightChart', history, 'weight', '#39ff14');
        chartHelpers.renderLine('fatChart', history, 'fat', '#ff3b30');
        chartHelpers.renderLine('muscleChart', history, 'muscle', '#00d4ff');
    },

    saveSettings: async () => {
        const time = parseInt(document.getElementById('conf-rest-time').value);
        const goal = parseInt(document.getElementById('conf-weekly-goal').value);
        if(!time) return;
        try { 
            await updateDoc(doc(db, "users", state.user.uid), { "settings.restTime": time, "settings.weeklyGoal": goal });
            state.profile.settings.restTime = time; state.profile.settings.weeklyGoal = goal;
            alert("Guardado"); 
        } catch(e) { alert("Error"); }
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

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES } from './data.js';

// --- CONFIGURACIÓN FIREBASE ---
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

// --- ESTADO GLOBAL ---
const state = {
    user: null,
    profile: null,
    activeWorkout: null,
    lastWorkoutData: null,
    restTimer: null,
    newRoutine: [],
    allClients: [],
    sounds: { beep: document.getElementById('timer-beep') },
    wakeLock: null,
    currentClientId: null
};

// --- IMAGEN DE RESERVA (Para evitar error 404) ---
const PLACEHOLDER_IMG = "https://placehold.co/100x100/333/39ff14?text=IMG";

// --- GESTOR DE ENTRENAMIENTO (Definido PRIMERO para evitar errores) ---
const workoutManager = {
    start: async (rid, rname) => {
        try {
            const docRef = await getDoc(doc(db, "routines", rid));
            const routineData = docRef.data();
            
            state.lastWorkoutData = null;
            try {
                // Buscamos historial previo en local para ser más rápidos
                const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
                const snap = await getDocs(q);
                const workouts = [];
                snap.forEach(d => workouts.push(d.data()));
                workouts.sort((a,b) => b.date.seconds - a.date.seconds);
                const last = workouts.find(w => w.data.name === rname);
                if(last) state.lastWorkoutData = last.data;
            } catch(e) { console.log("No historial previo"); }

            state.activeWorkout = {
                name: rname,
                start: Date.now(),
                exercises: routineData.exercises.map(ex => ({...ex, sets: ex.defaultSets.map(s => ({...s, kg:'', done:false})) }))
            };
            localStorage.setItem('bcn_workout', JSON.stringify(state.activeWorkout));
            
            // Wake Lock (Pantalla encendida)
            try { if(navigator.wakeLock) state.wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
            
            workoutManager.uiInit();
        } catch(e) { alert("Error al iniciar rutina: " + e.message); }
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
                    <input type="number" placeholder="reps" value="${s.reps}" onchange="workoutManager.updateSet(${idx},${sIdx},'reps',this.value)">
                    <input type="number" placeholder="kg" value="${s.kg}" onchange="workoutManager.updateSet(${idx},${sIdx},'kg',this.value)">
                    <div class="check-box ${s.done?'checked':''}" onclick="workoutManager.toggleSet(${idx},${sIdx})">✔</div>
                </div>`;
            });
            container.innerHTML += `<div class="exercise-card"><h3>${ex.n}</h3>${setsHtml}</div>`;
        });
        
        // REINICIAR Y ARRANCAR TIMER GLOBAL
        // Usamos window.globalInterval para poder limpiarlo si existía
        if(window.globalInterval) clearInterval(window.globalInterval);
        window.globalInterval = setInterval(() => {
            if(!state.activeWorkout) return;
            const diff = Math.floor((Date.now() - state.activeWorkout.start) / 1000);
            const m = Math.floor(diff/60).toString().padStart(2,'0');
            const s = (diff%60).toString().padStart(2,'0');
            const timerEl = document.getElementById('global-timer');
            if(timerEl) timerEl.innerText = `${m}:${s}`;
        }, 1000);
    },

    updateSet: (exIdx, sIdx, field, val) => {
        state.activeWorkout.exercises[exIdx].sets[sIdx][field] = val;
        localStorage.setItem('bcn_workout', JSON.stringify(state.activeWorkout));
    },

    toggleSet: (exIdx, sIdx) => {
        const s = state.activeWorkout.exercises[exIdx].sets[sIdx];
        s.done = !s.done;
        
        // Lógica de Record 1RM
        if(s.done && s.kg && s.reps) {
            const kg = parseFloat(s.kg); const reps = parseInt(s.reps);
            const oneRM = Math.round(kg * (1 + reps/30));
            const exName = state.activeWorkout.exercises[exIdx].n;
            
            if(!state.profile.records) state.profile.records = {};
            if(oneRM > (state.profile.records[exName] || 0)) {
                state.profile.records[exName] = oneRM;
                updateDoc(doc(db, "users", state.user.uid), { [`records.${exName}`]: oneRM }).catch(console.error);
                app.showToast(`¡RÉCORD! ${exName} (${oneRM}kg)`, 'gold');
                if(window.confetti) window.confetti();
            }
        }

        if(s.done) {
            if(state.sounds.beep) state.sounds.beep.play().catch(e=>{});
            workoutManager.startRest(state.profile.settings?.restTime || 60);
        }
        workoutManager.uiInit();
    },

    startRest: (sec) => {
        const modal = document.getElementById('rest-modal');
        modal.classList.remove('hidden');
        let remaining = sec;
        if(state.restTimer) clearInterval(state.restTimer);
        
        const update = () => {
            const el = document.getElementById('rest-countdown');
            if(el) el.innerText = remaining;
            
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
        if(confirm("¿Cancelar entreno?")) {
            localStorage.removeItem('bcn_workout');
            state.activeWorkout = null;
            if(state.wakeLock) state.wakeLock.release().catch(e=>{});
            if(window.globalInterval) clearInterval(window.globalInterval);
            app.navTo('dashboard');
        }
    },

    openFinishModal: () => {
        document.getElementById('finish-modal').classList.remove('hidden');
    },

    confirmFinish: async (rpe) => {
        document.getElementById('finish-modal').classList.add('hidden');
        if(!state.user || !state.activeWorkout) return alert("Error: No hay sesión activa");
        
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
            if(state.wakeLock) state.wakeLock.release().catch(e=>{});
            if(window.globalInterval) clearInterval(window.globalInterval);
            
            app.showToast("¡Entreno Guardado!", "gold");
            if(window.confetti) window.confetti();
            app.navTo('dashboard');
        } catch(e) { alert("Error al guardar: " + e.message); }
    }
};

// --- PERFIL ---
const profile = {
    render: () => {
        document.getElementById('profile-name').innerText = state.profile.name;
        const imgEl = document.getElementById('profile-img');
        // Usar placeholder si no hay foto para evitar 404
        imgEl.src = state.profile.photoURL || PLACEHOLDER_IMG;
        
        document.getElementById('profile-role-badge').innerText = state.profile.clientType || state.profile.role;
        document.getElementById('conf-weekly-goal').value = state.profile.settings?.weeklyGoal || 3;
        document.getElementById('conf-rest-time').value = state.profile.settings?.restTime || 60;
        
        profile.renderCharts();
        profile.calculateGlobalStats();
    },

    calculateGlobalStats: async () => {
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
            const snapshot = await getDocs(q);
            let totalTonnage = 0, totalSets = 0, totalReps = 0, totalWorkouts = snapshot.size;
            snapshot.forEach(doc => {
                const w = doc.data();
                if(w.data && w.data.exercises) { 
                    w.data.exercises.forEach(ex => { 
                        ex.sets.forEach(s => { 
                            if(s.done && s.kg && s.reps) { 
                                totalSets++; 
                                totalReps += parseInt(s.reps); 
                                totalTonnage += (parseInt(s.kg) * parseInt(s.reps)); 
                            } 
                        }); 
                    }); 
                }
            });
            document.getElementById('stat-tonnage').innerText = (totalTonnage/1000).toFixed(1) + 't';
            document.getElementById('stat-sets').innerText = totalSets;
            document.getElementById('stat-reps').innerText = totalReps;
            document.getElementById('stat-workouts').innerText = totalWorkouts;
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
        const list = document.getElementById('history-list');
        list.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
            const snapshot = await getDocs(q);
            const workouts = [];
            snapshot.forEach(doc => workouts.push(doc.data()));
            workouts.sort((a,b) => b.date.seconds - a.date.seconds);

            list.innerHTML = '';
            if(workouts.length === 0) { list.innerHTML = '<p style="text-align:center">Sin historial</p>'; return; }
            
            workouts.slice(0, 20).forEach(w => {
                const d = new Date(w.date.seconds*1000).toLocaleDateString();
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `<div class="history-date">${d}</div><div class="history-title">${w.data.name}</div><div class="history-meta"><span class="tag">${w.rpe}</span></div>`;
                item.onclick = () => profile.showWorkoutDetails(w);
                list.appendChild(item);
            });
        } catch(e) { console.error(e); list.innerHTML = 'Error cargando historial.'; }
    },

    showWorkoutDetails: (w) => {
        const modal = document.getElementById('workout-detail-modal');
        const content = document.getElementById('wd-content');
        document.getElementById('wd-title').innerText = w.data.name;
        let html = `<p><strong>Notas:</strong> ${w.notes || '-'}</p><p><strong>RPE:</strong> ${w.rpe}</p><hr style="border:0; border-top:1px solid #444; margin:10px 0">`;
        w.data.exercises.forEach(ex => {
            html += `<h4 style="margin:10px 0 5px; color:var(--neon-green)">${ex.n}</h4><ul>`;
            ex.sets.forEach(s => html += `<li>${s.reps} reps x ${s.kg} kg</li>`);
            html += `</ul>`;
        });
        content.innerHTML = html;
        modal.classList.remove('hidden');
    },

    saveStats: async () => {
        const w = document.getElementById('stats-weight').value;
        const f = document.getElementById('stats-fat').value;
        const m = document.getElementById('stats-muscle').value;
        if(w) {
            await updateDoc(doc(db, "users", state.user.uid), {
                statsHistory: arrayUnion({date:new Date(), weight:w, fat:f, muscle:m})
            });
            alert("Medidas guardadas");
            profile.renderCharts(); // Recargar gráficas
        }
    },

    renderCharts: () => {
        const history = state.profile.statsHistory || [];
        history.sort((a,b) => a.date.seconds - b.date.seconds);
        
        if(window.chartHelpers) {
            window.chartHelpers.renderLine('weightChart', history, 'weight', '#39ff14');
            window.chartHelpers.renderLine('fatChart', history, 'fat', '#ff3b30');
            window.chartHelpers.renderLine('muscleChart', history, 'muscle', '#00d4ff');
            
            // Cargar radar
            profile.loadRadar(); 
        }
    },
    
    loadRadar: async () => {
        // Carga dinámica de radar para no bloquear
        const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
        const snap = await getDocs(q);
        const counts = {};
        snap.forEach(d => {
            const w = d.data();
            if(w.data.exercises) w.data.exercises.forEach(e => counts[e.m] = (counts[e.m]||0) + 1);
        });
        if(window.chartHelpers) window.chartHelpers.renderRadar('radarChart', counts);
    },

    saveSettings: async () => {
        const g = parseInt(document.getElementById('conf-weekly-goal').value);
        const r = parseInt(document.getElementById('conf-rest-time').value);
        await updateDoc(doc(db, "users", state.user.uid), { "settings.weeklyGoal": g, "settings.restTime": r });
        state.profile.settings = { weeklyGoal: g, restTime: r };
        alert("Ajustes guardados");
        dashboard.render(); // Actualizar barra progreso
    },
    
    requestNotify: () => { Notification.requestPermission().then(p => { if(p==='granted') new Notification("Activado"); }); },
    testSound: () => { if(state.sounds.beep) { state.sounds.beep.currentTime = 0; state.sounds.beep.play(); } }
};

// --- ADMIN ---
const admin = {
    refreshAll: () => { admin.renderExerciseSelect(); admin.loadUsers(); admin.renderExistingRoutines(); },
    
    loadUsers: async () => {
        const div = document.getElementById('admin-users-list');
        div.innerHTML = 'Cargando...';
        try {
            // Rutinas Count
            const rSnap = await getDocs(collection(db, "routines"));
            const rCounts = {};
            rSnap.forEach(d => { 
                const uid = d.data().assignedTo; 
                if(uid) rCounts[uid] = (rCounts[uid]||0)+1; 
            });

            const snap = await getDocs(collection(db, "users"));
            div.innerHTML = '';
            const selectAssign = document.getElementById('assign-client-select');
            selectAssign.innerHTML = '<option disabled selected>Elegir Cliente...</option>';
            
            state.allClients = [];
            snap.forEach(d => {
                const u = d.data();
                state.allClients.push({id:d.id, ...u});
                const count = rCounts[d.id] || 0;
                
                div.innerHTML += `
                <div class="user-row" onclick="window.admin.viewClient('${d.id}')">
                    <img src="${u.photoURL || PLACEHOLDER_IMG}" class="user-avatar-small">
                    <div class="user-info">
                        <h5>${u.name} <span class="routine-count-badge">[${count} Rutinas]</span></h5>
                        <span>${u.clientType||'Cliente'}</span>
                    </div>
                    <div class="user-actions">
                        ${!u.approved ? `<button class="action-btn btn-green" onclick="window.admin.toggleApproval('${d.id}', true)">APROBAR</button>` : ''}
                        <button class="action-btn btn-delete" onclick="window.admin.deleteUser('${d.id}', '${u.name}')"><i class="material-icons-round">delete</i></button>
                    </div>
                </div>`;
                selectAssign.innerHTML += `<option value="${d.id}">${u.name}</option>`;
            });
        } catch(e) { console.error(e); div.innerHTML = 'Error usuarios'; }
    },

    deleteUser: async (uid, name) => {
        if(confirm(`¿Eliminar a ${name}?`) && confirm("Esta acción es irreversible.")) {
            await deleteDoc(doc(db, "users", uid));
            admin.loadUsers();
        }
    },
    toggleApproval: async (uid, status) => { await updateDoc(doc(db, "users", uid), { approved: status }); admin.loadUsers(); },

    viewClient: async (uid) => {
        state.currentClientId = uid;
        const user = state.allClients.find(c => c.id === uid);
        if(!user) return;

        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('client-detail-age').innerText = "Edad: " + (user.age || '--');
        document.getElementById('client-detail-img').src = user.photoURL || PLACEHOLDER_IMG;

        // Ultimas medidas
        const last = user.statsHistory && user.statsHistory.length > 0 ? user.statsHistory[user.statsHistory.length-1] : {};
        document.getElementById('cd-weight').innerText = last.weight || '--';
        document.getElementById('cd-fat').innerText = last.fat || '--';
        document.getElementById('cd-muscle').innerText = last.muscle || '--';

        // Gráficas Cliente
        if(window.chartHelpers) {
            const h = user.statsHistory || [];
            h.sort((a,b) => a.date.seconds - b.date.seconds);
            window.chartHelpers.renderLine('clientWeightChart', h, 'weight', '#39ff14');
            window.chartHelpers.renderLine('clientFatChart', h, 'fat', '#ff3b30');
            window.chartHelpers.renderLine('clientMuscleChart', h, 'muscle', '#00d4ff');
        }

        // Progreso Semanal Cliente
        dashboard.calculateWeeklyProgress(uid, 'client-weekly-count', 'client-weekly-bar', user.settings?.weeklyGoal);

        // Rutinas Cliente
        const rList = document.getElementById('client-routines-list');
        rList.innerHTML = 'Cargando...';
        const rSnap = await getDocs(query(collection(db, "routines"), where("assignedTo", "==", uid)));
        rList.innerHTML = '';
        if(rSnap.empty) rList.innerHTML = '<p>Sin rutinas</p>';
        rSnap.forEach(d => {
            rList.innerHTML += `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between"><span>${d.data().name}</span><i class="material-icons-round" style="color:red; cursor:pointer" onclick="window.admin.deleteRoutine('${d.id}')">delete</i></div>`;
        });

        // Selector Clonar
        const cloneSel = document.getElementById('client-clone-select');
        cloneSel.innerHTML = '<option disabled selected>Elegir Base...</option>';
        const allRut = await getDocs(collection(db, "routines"));
        const seen = new Set();
        allRut.forEach(d => {
            const n = d.data().name;
            if(d.data().assignedTo !== uid && !seen.has(n)) {
                seen.add(n);
                cloneSel.innerHTML += `<option value="${d.id}">${n}</option>`;
            }
        });

        // Historial Cliente
        const hList = document.getElementById('client-detail-history');
        hList.innerHTML = 'Cargando...';
        const wSnap = await getDocs(query(collection(db, "workouts"), where("userId", "==", uid)));
        const workouts = [];
        wSnap.forEach(d => workouts.push(d.data()));
        workouts.sort((a,b) => b.date.seconds - a.date.seconds);
        
        hList.innerHTML = '';
        const mCounts = {};
        workouts.slice(0, 10).forEach(w => {
            const d = new Date(w.date.seconds*1000).toLocaleDateString();
            if(w.data.exercises) w.data.exercises.forEach(e => mCounts[e.m] = (mCounts[e.m]||0)+1);
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `<b>${d}</b> - ${w.data.name}<br>RPE: ${w.rpe}`;
            div.onclick = () => profile.showWorkoutDetails(w);
            hList.appendChild(div);
        });
        if(window.chartHelpers) window.chartHelpers.renderRadar('clientRadarChart', mCounts);

        app.navTo('client-detail');
    },

    cloneRoutineFromClientView: async () => {
        const rid = document.getElementById('client-clone-select').value;
        if(!rid) return;
        admin.cloneRoutine(rid, state.currentClientId);
    },

    cloneRoutine: async (rid, targetId) => {
        try {
            const docSnap = await getDoc(doc(db, "routines", rid));
            const data = docSnap.data();
            await addDoc(collection(db, "routines"), {
                name: data.name, exercises: data.exercises, assignedTo: targetId, createdAt: new Date()
            });
            alert("Clonada");
            if(document.getElementById('view-client-detail').classList.contains('active')) admin.viewClient(targetId);
            else admin.renderExistingRoutines();
        } catch(e) { alert("Error al clonar"); }
    },

    deleteRoutine: async (id) => {
        if(confirm("¿Borrar?")) {
            await deleteDoc(doc(db, "routines", id));
            if(document.getElementById('view-client-detail').classList.contains('active')) admin.viewClient(state.currentClientId);
            else admin.renderExistingRoutines();
        }
    },

    renderExistingRoutines: async () => {
        const div = document.getElementById('admin-routines-management');
        div.innerHTML = 'Cargando...';
        const snap = await getDocs(collection(db, "routines"));
        div.innerHTML = '';
        const seen = new Set();
        snap.forEach(d => {
            const r = d.data();
            if(!seen.has(r.name)) {
                seen.add(r.name);
                // Clonar selector para cada rutina
                let opts = '<option disabled selected>Clonar a...</option>';
                state.allClients.forEach(c => opts += `<option value="${c.id}">${c.name}</option>`);
                
                div.innerHTML += `
                <div class="exercise-card" style="border-left: 4px solid var(--neon-green)">
                    <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer" onclick="window.admin.showRoutineDetails('${d.id}')">
                        <h4>${r.name}</h4><i class="material-icons-round" style="color:#666">info</i>
                    </div>
                    <div style="margin-top:5px; font-size:12px; color:#aaa">${r.exercises.length} Ejercicios</div>
                    <select style="margin-top:10px; width:100%; color:var(--neon-green)" onchange="window.admin.cloneRoutine('${d.id}', this.value)">${opts}</select>
                </div>`;
            }
        });
    },

    showRoutineDetails: async (rid) => {
        const docSnap = await getDoc(doc(db, "routines", rid));
        const r = docSnap.data();
        const modal = document.getElementById('workout-detail-modal');
        const content = document.getElementById('wd-content');
        document.getElementById('wd-title').innerText = r.name;
        let html = '';
        r.exercises.forEach(e => html += `<h4>${e.n}</h4><small>${e.defaultSets.length} series</small>`);
        content.innerHTML = html;
        modal.classList.remove('hidden');
    },

    renderExerciseSelect: () => {
        const s = document.getElementById('admin-exercise-select');
        s.innerHTML = '';
        EXERCISES.forEach((e,i) => s.innerHTML += `<option value="${i}">${e.n}</option>`);
        state.newRoutine = [];
    },
    
    filterExercises: (t) => {
        const s = document.getElementById('admin-exercise-select');
        s.innerHTML = '';
        EXERCISES.forEach((e,i) => {
            if(e.n.toLowerCase().includes(t.toLowerCase())) s.innerHTML += `<option value="${i}">${e.n}</option>`;
        });
    },

    addExerciseToRoutine: () => {
        const idx = document.getElementById('admin-exercise-select').value;
        const ex = EXERCISES[idx];
        state.newRoutine.push({...ex, defaultSets:[{reps:12},{reps:12},{reps:12}]});
        admin.renderPreview();
    },

    renderPreview: () => {
        document.getElementById('admin-routine-preview').innerHTML = state.newRoutine.map(e => `<div>${e.n} (3 series)</div>`).join('');
    },

    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value;
        const client = document.getElementById('assign-client-select').value;
        if(!name || !client) return alert("Faltan datos");
        await addDoc(collection(db, "routines"), { name, assignedTo: client, exercises: state.newRoutine, createdAt: new Date() });
        alert("Guardada");
        state.newRoutine = [];
        document.getElementById('new-routine-name').value = '';
        admin.renderPreview();
    }
};

const dashboard = {
    render: async () => {
        const div = document.getElementById('routines-list');
        div.innerHTML = 'Cargando...';
        dashboard.calculateWeeklyProgress(state.user.uid, 'weekly-count', 'weekly-bar', state.profile.settings?.weeklyGoal);
        
        const q = query(collection(db, "routines"), where("assignedTo", "==", state.user.uid));
        const snap = await getDocs(q);
        div.innerHTML = '';
        if(snap.empty) div.innerHTML = '<p style="text-align:center">No tienes rutinas asignadas.</p>';
        snap.forEach(d => {
            const r = d.data();
            div.innerHTML += `
            <div class="exercise-card" onclick="window.workoutManager.start('${d.id}', '${r.name}')" style="cursor:pointer">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <h3 style="margin:0">${r.name}</h3>
                    <i class="material-icons-round" style="color:var(--neon-green)">play_circle_filled</i>
                </div>
                <p style="color:#888; font-size:14px; margin:5px 0">${r.exercises.length} Ejercicios</p>
            </div>`;
        });
    },

    calculateWeeklyProgress: async (uid, cid, bid, goal=3) => {
        try {
            const now = new Date();
            const day = now.getDay() || 7;
            const start = new Date(now);
            start.setHours(-24 * (day - 1));
            start.setHours(0,0,0,0);

            const q = query(collection(db, "workouts"), where("userId", "==", uid));
            const snap = await getDocs(q);
            let count = 0;
            snap.forEach(d => { if(d.data().date.seconds*1000 >= start.getTime()) count++; });
            
            document.getElementById(cid).innerText = `${count}/${goal}`;
            document.getElementById(bid).style.width = Math.min((count/goal)*100, 100) + '%';
        } catch(e) {}
    }
};

// --- CHART HELPERS ---
const chartHelpers = {
    renderLine: (id, data, field, color) => {
        const ctx = document.getElementById(id); if(!ctx) return;
        // ChartJS 3+ destroy
        const existingChart = Chart.getChart(ctx);
        if (existingChart) existingChart.destroy();

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => new Date(d.date.seconds*1000).toLocaleDateString()),
                datasets: [{ label: field, data: data.map(d => d[field]), borderColor: color, tension: 0.3 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#333' } }, x: { grid: { color: '#333' } } } }
        });
    },
    renderRadar: (id, counts) => {
        const ctx = document.getElementById(id); if(!ctx) return;
        const existingChart = Chart.getChart(ctx);
        if (existingChart) existingChart.destroy();

        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: Object.keys(counts),
                datasets: [{ label: 'Series', data: Object.values(counts), backgroundColor: 'rgba(57,255,20,0.2)', borderColor: '#39ff14' }]
            },
            options: { scales: { r: { grid: { color: '#444' }, pointLabels: { color: 'white' }, ticks: { display: false } } }, plugins: { legend: { display: false } } }
        });
    }
};

// --- APP PRINCIPAL ---
const appMain = {
    // Funciones principales
    navTo: app.navTo,
    handleLogin: app.handleLogin
};

// VINCULACIÓN A WINDOW PARA HTML
window.app = app;
window.workoutManager = workoutManager;
window.admin = admin;
window.profile = profile;
window.chartHelpers = chartHelpers;

// INICIAR
app.init();

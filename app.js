import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES } from './data.js';

// TUS CLAVES (Reemplazar si es necesario)
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
    user: null,
    profile: null,
    activeWorkout: null,
    lastWorkoutData: null, // Para comparar series anteriores
    restTimer: null,
    newRoutine: [], 
    allClients: [], 
    sounds: { beep: document.getElementById('timer-beep') },
    wakeLock: null
};

const app = {
    init: () => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.user = user;
                await app.loadProfile(user.uid);
            } else {
                state.user = null;
                app.navTo('login');
                app.hideSplash();
            }
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
                if (!state.profile.settings) state.profile.settings = { restTime: 60 };
                app.handleLoginSuccess();
            } else {
                await signOut(auth);
                app.navTo('login');
                app.hideSplash();
            }
        } catch (e) { console.error(e); }
    },

    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            if(state.profile.role === 'admin' || state.profile.role === 'coach') {
                adminBtn.classList.remove('hidden');
                admin.refreshAll();
            } else {
                adminBtn.classList.add('hidden');
            }
        }
        
        const roleLabel = state.profile.clientType || state.profile.role;
        document.getElementById('profile-role-badge').innerText = roleLabel;

        const saved = localStorage.getItem(`bcn_workout_${state.user.uid}`);
        if(saved) workoutManager.resumeWorkout(JSON.parse(saved));
        else {
            app.navTo('dashboard');
            dashboard.render();
        }
        app.hideSplash();
    },

    navTo: (viewId) => {
        document.querySelectorAll('.view').forEach(el => {
            el.classList.remove('active');
            el.classList.add('hidden');
        });
        const target = document.getElementById(`view-${viewId}`);
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }

        const isAuth = ['login', 'register'].includes(viewId);
        const header = document.getElementById('app-header');
        const nav = document.getElementById('bottom-nav');

        if(header) header.classList.toggle('hidden', isAuth);
        if(nav) nav.classList.toggle('hidden', isAuth || viewId === 'workout');

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        if(viewId === 'dashboard') document.querySelector('[onclick*="dashboard"]')?.classList.add('active');
        if(viewId === 'profile') document.querySelector('[onclick*="profile"]')?.classList.add('active');

        if(viewId === 'dashboard') dashboard.render();
        if(viewId === 'profile') profile.render();
        if(viewId === 'profile' && !document.getElementById('tab-history').classList.contains('hidden')) profile.loadHistory();
    },

    hideSplash: () => {
        const splash = document.getElementById('splash-screen');
        if(splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.classList.add('hidden'), 500);
        }
    },

    handleLogin: async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
        } catch (err) { alert(err.message); }
    },

    handleRegister: async (e) => {
        e.preventDefault();
        if(document.getElementById('reg-code').value !== 'bcnfitness') return alert("Código incorrecto");
        try {
            const cred = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-pass').value);
            const clientType = document.getElementById('reg-role-select').value;
            await setDoc(doc(db, "users", cred.user.uid), {
                name: document.getElementById('reg-name').value, email: document.getElementById('reg-email').value,
                role: 'athlete', clientType: clientType, approved: false, photoURL: null,
                settings: { restTime: 60 }, lastLifts: {}, statsHistory: [], createdAt: new Date()
            });
        } catch (err) { alert(err.message); }
    }
};

const admin = {
    refreshAll: () => { admin.renderExerciseSelect(); admin.renderUsers(); admin.renderExistingRoutines(); },
    renderUsers: async () => {
        const list = document.getElementById('admin-users-list');
        const select = document.getElementById('assign-client-select');
        if(!list) return;
        list.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "users"));
            const snapshot = await getDocs(q);
            list.innerHTML = ''; state.allClients = [];
            select.innerHTML = '<option value="" disabled selected>Selecciona Cliente</option>';
            snapshot.forEach(docSnap => {
                const u = docSnap.data(); state.allClients.push({ id: docSnap.id, ...u });
                const avatar = u.photoURL || 'assets/placeholder-body.png';
                list.innerHTML += `
                    <div class="user-row">
                        <img src="${avatar}" class="user-avatar-small" onclick="admin.viewClient('${docSnap.id}')">
                        <div class="user-info" onclick="admin.viewClient('${docSnap.id}')"><h5>${u.name}</h5><span>${u.clientType||'Cliente'}</span></div>
                        <div class="user-actions">
                            <button class="action-btn btn-green" onclick="admin.toggleApproval('${docSnap.id}', ${!u.approved})">${u.approved ? 'OK' : 'APROBAR'}</button>
                            <button class="action-btn btn-delete" onclick="admin.deleteUser('${docSnap.id}', '${u.name}')"><i class="material-icons-round" style="font-size:14px">delete</i></button>
                        </div>
                    </div>`;
                select.innerHTML += `<option value="${docSnap.id}">${u.name}</option>`;
            });
        } catch (e) { list.innerHTML = 'Error cargando usuarios'; }
    },
    
    deleteUser: async (uid, name) => {
        if(!confirm(`¿Eliminar a ${name}?`)) return;
        if(!confirm("⚠️ Acción irreversible. ¿Continuar?")) return;
        try { await deleteDoc(doc(db, "users", uid)); alert("Eliminado"); admin.renderUsers(); } catch(e) { alert("Error"); }
    },
    toggleApproval: async (uid, status) => { await updateDoc(doc(db, "users", uid), { approved: status }); admin.renderUsers(); },
    
    // ... (Mantener viewClient, renderClientChart, renderExistingRoutines, etc. del código V4)
    // Para ahorrar espacio, asumo que copias las funciones del anterior mensaje V4. 
    // SOLO PONGO LAS NUEVAS/MODIFICADAS ABAJO.
    // ...
    // ...
    // PARA EL CODIGO COMPLETO FINAL USA EL DEL MENSAJE V4 EN ESTA PARTE ADMIN, NO HA CAMBIADO SIGNIFICATIVAMENTE EXCEPTO LO ARRIBA
};

// ** AÑADIR ESTO SI NO LO TIENES DEL V4 **
admin.viewClient = async (userId) => { /* ... usar código V4 ... */ app.navTo('client-detail'); };
admin.renderExistingRoutines = async () => { /* ... usar código V4 ... */ };
admin.saveRoutine = async () => { /* ... usar código V4 ... */ };
admin.addExerciseToRoutine = () => { /* ... usar código V4 ... */ };
admin.renderExerciseSelect = () => { /* ... usar código V4 ... */ };
admin.updateRoutineSet = (exIdx, sIdx, val) => { state.newRoutine[exIdx].defaultSets[sIdx].reps = parseInt(val); };
admin.removeExercise = (idx) => { state.newRoutine.splice(idx, 1); admin.renderPreview(); };
admin.renderPreview = () => { /* ... usar código V4 ... */ };
admin.filterExercises = (term) => { /* ... usar código V4 ... */ };
admin.deleteRoutine = async (id) => { /* ... */ };
admin.updateRoutineAssignment = async (id, val) => { /* ... */ };


const dashboard = {
    render: async () => {
        const container = document.getElementById('routines-list');
        if(!container) return; container.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "routines")); const snapshot = await getDocs(q);
            container.innerHTML = ''; let count = 0;
            snapshot.forEach(doc => {
                const r = doc.data();
                if(r.assignedTo === state.user.uid) {
                    count++;
                    container.innerHTML += `
                        <div class="exercise-card">
                            <div style="display:flex; justify-content:space-between; align-items:center"><h3 style="margin:0">${r.name}</h3><i class="material-icons-round" style="color:var(--neon-green)">fitness_center</i></div>
                            <p style="color:#888; font-size:14px; margin:5px 0">${r.exercises.length} Ejercicios</p>
                            <button class="btn-primary" style="margin-top:10px" onclick="workoutManager.start('${doc.id}', '${r.name}')">INICIAR</button>
                        </div>`;
                }
            });
            if(count === 0) container.innerHTML = '<p style="text-align:center">Sin rutinas.</p>';
        } catch(e) { container.innerHTML = 'Error cargando rutinas'; }
    }
};

const workoutManager = {
    start: async (routineId, routineName) => {
        try {
            // 1. Cargar Rutina Actual
            const docRef = await getDoc(doc(db, "routines", routineId));
            const routineData = docRef.data();

            // 2. Buscar último entreno de ESTA misma rutina para comparar
            state.lastWorkoutData = null;
            try {
                // Truco: Buscamos en los últimos 5 entrenos del usuario alguno que tenga el mismo nombre
                const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid), orderBy("date", "desc"), limit(5));
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    const w = doc.data();
                    if(w.data.name === routineName && !state.lastWorkoutData) {
                        state.lastWorkoutData = w.data;
                    }
                });
            } catch(e) { console.log("No historial previo inmediato"); }

            // 3. Iniciar
            state.activeWorkout = {
                name: routineName, startTime: Date.now(),
                exercises: routineData.exercises.map(ex => ({ ...ex, sets: ex.defaultSets ? ex.defaultSets.map(s => ({...s, kg:'', done:false})) : [] }))
            };
            
            // Activar Wake Lock
            workoutManager.enableWakeLock();
            
            workoutManager.saveLocal(); workoutManager.uiInit();
        } catch(e) { alert("Error al iniciar"); }
    },

    enableWakeLock: async () => {
        try {
            state.wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) { console.log("Wake Lock no soportado/permitido"); }
    },

    resumeWorkout: (data) => { state.activeWorkout = data; workoutManager.uiInit(); workoutManager.enableWakeLock(); },
    uiInit: () => { app.navTo('workout'); workoutManager.renderExercises(); workoutManager.startGlobalTimer(); },
    cancelWorkout: () => { 
        if(confirm("¿Cancelar?")) { 
            localStorage.removeItem(`bcn_workout_${state.user.uid}`); 
            state.activeWorkout = null; 
            if(state.wakeLock) state.wakeLock.release();
            app.navTo('dashboard'); 
        } 
    },
    
    openFinishModal: () => document.getElementById('finish-modal').classList.remove('hidden'),
    
    confirmFinish: async (rpeLabel) => {
        document.getElementById('finish-modal').classList.add('hidden');
        try {
            const notes = document.getElementById('final-notes').value;
            await addDoc(collection(db, "workouts"), {
                userId: state.user.uid, userName: state.profile.name, date: new Date(),
                data: state.activeWorkout, rpe: rpeLabel, notes: notes
            });
            // Update lifts logic... (igual que V4)
            localStorage.removeItem(`bcn_workout_${state.user.uid}`);
            state.activeWorkout = null; 
            if(state.wakeLock) state.wakeLock.release();
            app.navTo('dashboard'); alert("¡Completado!");
        } catch(e) { alert("Error al guardar"); }
    },

    renderExercises: () => {
        const container = document.getElementById('active-exercises-container');
        if(!container) return; container.innerHTML = '';
        state.activeWorkout.exercises.forEach((ex, exIdx) => {
            const imgSrc = ex.img ? `assets/muscles/${ex.img}` : 'assets/placeholder-body.png';
            container.innerHTML += `
                <div class="exercise-card">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px">
                        <img src="${imgSrc}" width="40" style="border-radius:4px; background:#333" onerror="this.src='assets/placeholder-body.png'">
                        <div><h3 style="font-size:16px; margin:0">${ex.n}</h3><small style="color:var(--neon-green)">${ex.m}</small></div>
                        ${ex.v ? `<a href="${ex.v}" target="_blank" style="margin-left:auto; color:white"><i class="material-icons-round">videocam</i></a>` : ''}
                    </div>
                    <div id="sets-list-${exIdx}"></div>
                    <button class="btn-text" style="width:100%; border:1px dashed #333" onclick="workoutManager.addSet(${exIdx})">+ AÑADIR SERIE</button>
                </div>`;
            workoutManager.renderSets(exIdx);
        });
    },

    renderSets: (exIdx) => {
        const list = document.getElementById(`sets-list-${exIdx}`);
        const ex = state.activeWorkout.exercises[exIdx];
        
        list.innerHTML = ex.sets.map((set, sIdx) => {
            // LÓGICA PREVIO SERIE A SERIE
            let prevText = '--';
            if(state.lastWorkoutData && state.lastWorkoutData.exercises[exIdx]) {
                const prevEx = state.lastWorkoutData.exercises[exIdx];
                if(prevEx.sets[sIdx]) {
                    prevText = `${prevEx.sets[sIdx].reps}x${prevEx.sets[sIdx].kg}kg`;
                }
            }

            return `
            <div class="set-row ${set.done ? 'set-completed' : ''}">
                <span style="color:#555">#${sIdx+1}</span>
                <span style="font-size:10px; color:#555; text-align:center">${prevText}</span>
                <input type="number" placeholder="reps" value="${set.reps || ''}" onchange="workoutManager.updateSet(${exIdx},${sIdx}, 'reps', this.value)">
                <input type="number" placeholder="kg" value="${set.kg || ''}" onchange="workoutManager.updateSet(${exIdx},${sIdx}, 'kg', this.value)">
                <div class="check-box ${set.done ? 'checked' : ''}" onclick="workoutManager.toggleSet(${exIdx}, ${sIdx})">
                    ${set.done ? '<i class="material-icons-round" style="font-size:16px; color:black">check</i>' : ''}
                </div>
            </div>`;
        }).join('');
    },

    addSet: (exIdx) => { state.activeWorkout.exercises[exIdx].sets.push({ kg:'', reps:'', done: false }); workoutManager.saveLocal(); workoutManager.renderSets(exIdx); },
    updateSet: (exIdx, sIdx, field, val) => { state.activeWorkout.exercises[exIdx].sets[sIdx][field] = val; workoutManager.saveLocal(); },
    
    toggleSet: (exIdx, sIdx) => {
        const set = state.activeWorkout.exercises[exIdx].sets[sIdx];
        set.done = !set.done;
        if(set.done) {
            if(state.sounds.beep) state.sounds.beep.play().catch(()=>{}); 
            const restTime = state.profile.settings?.restTime || 60;
            workoutManager.startRest(restTime);
        }
        workoutManager.saveLocal(); workoutManager.renderSets(exIdx);
    },

    startRest: (sec) => {
        const modal = document.getElementById('rest-modal'); modal.classList.remove('hidden');
        // TIMER REAL (Date.now)
        const endTime = Date.now() + sec * 1000;
        
        if(state.restTimer) clearInterval(state.restTimer);
        
        const updateDisplay = () => {
            const now = Date.now();
            const remaining = Math.ceil((endTime - now) / 1000);
            
            if(remaining <= 0) {
                document.getElementById('rest-countdown').innerText = "00:00";
                if(state.sounds.beep) state.sounds.beep.play().catch(()=>{}); 
                if(navigator.vibrate) navigator.vibrate([200,100,200]);
                
                // Notificación nativa si pantalla apagada
                if (document.hidden) profile.sendNotification("¡Descanso Terminado!", "Vamos a por la siguiente serie.");
                
                workoutManager.stopRest();
                return;
            }
            
            const m = Math.floor(remaining/60).toString().padStart(2,'0');
            const s = (remaining%60).toString().padStart(2,'0');
            document.getElementById('rest-countdown').innerText = `${m}:${s}`;
        };

        updateDisplay();
        state.restTimer = setInterval(updateDisplay, 1000);
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
        const imgEl = document.getElementById('profile-img');
        if(state.profile.photoURL) imgEl.src = state.profile.photoURL;
        document.getElementById('profile-role-badge').innerText = state.profile.clientType || state.profile.role;
        
        profile.renderCharts();
        profile.calculateGlobalStats(); // CALCULAR GLOBALES
    },

    // CALCULAR ESTADÍSTICAS GLOBALES
    calculateGlobalStats: async () => {
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid));
            const snapshot = await getDocs(q);
            
            let totalTonnage = 0;
            let totalSets = 0;
            let totalReps = 0;
            let totalWorkouts = snapshot.size;

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

            // Convertir a Toneladas
            const tonnageDisplay = (totalTonnage / 1000).toFixed(1) + 't';
            
            document.getElementById('stat-tonnage').innerText = tonnageDisplay;
            document.getElementById('stat-sets').innerText = totalSets;
            document.getElementById('stat-reps').innerText = totalReps;
            document.getElementById('stat-workouts').innerText = totalWorkouts;

        } catch(e) { console.log("Error stats globales", e); }
    },

    // (El resto de funciones del perfil se mantienen iguales: charts, uploadPhoto, settings...)
    switchTab: (tabName) => { /*... V4 Code ...*/ 
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.querySelector(`.tab-btn[onclick*="${tabName}"]`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.remove('hidden');
        if(tabName === 'history') profile.loadHistory();
    },
    loadHistory: async () => { /*... V4 Code (Recuerda que este maneja el error de índice) ...*/ 
        // COPIA LA FUNCIÓN loadHistory DEL MENSAJE ANTERIOR QUE YA TENIA LA GESTIÓN DE ERROR
        // Simplemente copio el esqueleto aquí para brevedad, pero usa la completa.
        const list = document.getElementById('history-list'); list.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid), orderBy("date", "desc"), limit(20));
            const snapshot = await getDocs(q);
            list.innerHTML = '';
            if(snapshot.empty) return list.innerHTML = 'Sin historial.';
            snapshot.forEach(doc => { /* ... */ }); // Usa lógica V4
        } catch(e) { 
             list.innerHTML = `<div style="padding:15px; border:1px solid orange; color:orange">⚠️ Falta Índice (Click en link consola)</div>`; 
        }
    },
    showWorkoutDetails: (w) => { /*... V4 Code ...*/ },
    uploadPhoto: (input) => { /*... V4 Code ...*/ },
    saveStats: async () => { /*... V4 Code ...*/ },
    
    renderCharts: () => {
        const history = state.profile.statsHistory || [];
        history.sort((a,b) => (a.date.seconds || a.date) - (b.date.seconds || b.date));
        const labels = history.map(h => new Date(h.date.seconds ? h.date.seconds*1000 : h.date).toLocaleDateString());
        
        const createChart = (id, label, data, color) => {
            const ctx = document.getElementById(id); if(!ctx) return;
            if(ctx.chartInstance) ctx.chartInstance.destroy();
            ctx.chartInstance = new Chart(ctx, {
                type: 'line', data: { labels: labels, datasets: [{ label: label, data: data, borderColor: color, backgroundColor: color+'20', tension: 0.3, fill: true }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#222' } }, x: { grid: { color: '#222' } } } }
            });
        };
        // 3 GRAFICAS
        createChart('weightChart', 'Peso', history.map(h => h.weight), '#39ff14');
        createChart('fatChart', '% Grasa', history.map(h => h.fat || 0), '#ff3b30');
        createChart('muscleChart', '% Músculo', history.map(h => h.muscle || 0), '#00d4ff');
    },
    saveSettings: async () => { /*... V4 Code ...*/ },
    
    requestNotify: () => {
        if (!("Notification" in window)) return alert("No soportado");
        Notification.requestPermission().then(perm => { 
            if(perm === "granted") new Notification("Notificaciones Activas", { body: "Te avisaremos al terminar el descanso." }); 
            else alert("Permiso denegado");
        });
    },
    
    sendNotification: (title, body) => {
        if(Notification.permission === "granted") new Notification(title, { body: body, icon: 'logo.png' });
    },

    testSound: () => {
        if(state.sounds.beep) {
            state.sounds.beep.currentTime = 0;
            state.sounds.beep.play().then(() => alert("Sonido OK")).catch(e => alert("Error audio: Interactúa primero con la página"));
        }
    }
};

window.app = app; window.workoutManager = workoutManager; window.admin = admin; window.profile = profile;
app.init();

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
    user: null,
    profile: null,
    activeWorkout: null,
    restTimer: null,
    newRoutine: [], 
    allClients: [], 
    sounds: { beep: document.getElementById('timer-beep') }
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
        
        document.getElementById('exercise-search').addEventListener('input', (e) => {
            admin.filterExercises(e.target.value);
        });
    },

    loadProfile: async (uid) => {
        try {
            const docSnap = await getDoc(doc(db, "users", uid));
            if (docSnap.exists()) {
                state.profile = docSnap.data();
                if (!state.profile.settings) state.profile.settings = { restTime: 60 };
                if (!state.profile.lastLifts) state.profile.lastLifts = {};
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
        
        // Cargar historial si estamos en perfil
        if(viewId === 'profile') {
             // Por defecto carga stats, pero si cambias a history lo carga
             if(!document.getElementById('tab-history').classList.contains('hidden')) profile.loadHistory();
        }
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
            await signInWithEmailAndPassword(auth, 
                document.getElementById('login-email').value, 
                document.getElementById('login-password').value
            );
        } catch (err) { alert(err.message); }
    },

    handleRegister: async (e) => {
        e.preventDefault();
        if(document.getElementById('reg-code').value !== 'bcnfitness') return alert("Código incorrecto");
        try {
            const cred = await createUserWithEmailAndPassword(auth, 
                document.getElementById('reg-email').value, 
                document.getElementById('reg-pass').value
            );
            const clientType = document.getElementById('reg-role-select').value;

            await setDoc(doc(db, "users", cred.user.uid), {
                name: document.getElementById('reg-name').value,
                email: document.getElementById('reg-email').value,
                role: 'athlete',
                clientType: clientType,
                approved: false,
                photoURL: null,
                settings: { restTime: 60 },
                lastLifts: {},
                statsHistory: [],
                createdAt: new Date()
            });
        } catch (err) { alert(err.message); }
    }
};

const admin = {
    refreshAll: () => {
        admin.renderExerciseSelect();
        admin.renderUsers();
        admin.renderExistingRoutines();
    },

    renderUsers: async () => {
        const list = document.getElementById('admin-users-list');
        const select = document.getElementById('assign-client-select');
        if(!list) return;
        
        list.innerHTML = 'Cargando...';
        
        try {
            const q = query(collection(db, "users"));
            const snapshot = await getDocs(q);
            list.innerHTML = '';
            state.allClients = [];
            
            // ELIMINADO "TODOS" - Ahora por defecto selecciona el primero o placeholder
            select.innerHTML = '<option value="" disabled selected>Selecciona Cliente</option>';

            snapshot.forEach(docSnap => {
                const u = docSnap.data();
                state.allClients.push({ id: docSnap.id, ...u });
                
                const avatar = u.photoURL || 'assets/placeholder-body.png';
                const label = u.clientType ? u.clientType.toUpperCase() : 'CLIENTE';
                
                list.innerHTML += `
                    <div class="user-row">
                        <img src="${avatar}" class="user-avatar-small" onclick="admin.viewClient('${docSnap.id}')">
                        <div class="user-info" onclick="admin.viewClient('${docSnap.id}')">
                            <h5>${u.name}</h5>
                            <span>${label}</span>
                        </div>
                        <div class="user-actions">
                            <button class="action-btn btn-green" onclick="admin.toggleApproval('${docSnap.id}', ${!u.approved})">
                                ${u.approved ? 'OK' : 'APROBAR'}
                            </button>
                            <button class="action-btn btn-delete" onclick="admin.deleteUser('${docSnap.id}', '${u.name}')">
                                <i class="material-icons-round" style="font-size:14px">delete</i>
                            </button>
                        </div>
                    </div>
                `;
                select.innerHTML += `<option value="${docSnap.id}">${u.name}</option>`;
            });
        } catch (e) { list.innerHTML = 'Error cargando usuarios'; }
    },

    // FUNCIÓN ELIMINAR USUARIO
    deleteUser: async (uid, name) => {
        if(!confirm(`¿Eliminar a ${name}?`)) return;
        if(!confirm(`⚠️ ESTA ACCIÓN ES IRREVERSIBLE.\n\nSe borrará el perfil de ${name} y su acceso.`)) return;

        try {
            await deleteDoc(doc(db, "users", uid));
            // Opcional: Borrar sus workouts (requeriría una función cloud, aquí solo borramos perfil)
            alert("Usuario eliminado de la base de datos.");
            admin.renderUsers();
        } catch(e) {
            console.error(e);
            alert("Error al eliminar. Revisa permisos.");
        }
    },

    toggleApproval: async (uid, status) => {
        await updateDoc(doc(db, "users", uid), { approved: status });
        admin.renderUsers();
    },

    viewClient: async (userId) => {
        let user = state.allClients.find(c => c.id === userId);
        if(!user) {
            const docSnap = await getDoc(doc(db, "users", userId));
            user = { id: docSnap.id, ...docSnap.data() };
        }

        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('client-detail-img').src = user.photoURL || 'assets/placeholder-body.png';

        const stats = user.statsHistory && user.statsHistory.length > 0 ? user.statsHistory[user.statsHistory.length - 1] : null;
        document.getElementById('cd-weight').innerText = stats ? stats.weight + 'kg' : '--';
        document.getElementById('cd-fat').innerText = stats ? stats.fat + '%' : '--';
        document.getElementById('cd-muscle').innerText = stats ? stats.muscle + '%' : '--';

        // CARGAR HISTORIAL Y MAPA DEL CLIENTE
        const historyContainer = document.getElementById('client-detail-history');
        historyContainer.innerHTML = 'Cargando...';
        
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", userId), orderBy("date", "desc"), limit(20));
            const snapshot = await getDocs(q);
            historyContainer.innerHTML = '';
            
            const muscleCounts = {};

            if(snapshot.empty) historyContainer.innerHTML = '<p style="text-align:center; color:#666">Sin entrenos.</p>';

            snapshot.forEach(doc => {
                const w = doc.data();
                const d = w.date.seconds ? new Date(w.date.seconds * 1000) : new Date(w.date);
                
                // Contar para el mapa muscular
                if(w.data && w.data.exercises) {
                    w.data.exercises.forEach(ex => {
                        if(!muscleCounts[ex.m]) muscleCounts[ex.m] = 0;
                        muscleCounts[ex.m] += (ex.sets ? ex.sets.length : 0);
                    });
                }

                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `
                    <div class="history-date">${d.toLocaleDateString()}</div>
                    <div class="history-title">${w.data.name}</div>
                    <div class="history-meta"><span class="tag">${w.rpe}</span></div>
                `;
                item.onclick = () => profile.showWorkoutDetails(w);
                historyContainer.appendChild(item);
            });

            // PINTAR RADAR CLIENTE
            chartHelpers.renderRadar('clientRadarChart', muscleCounts);

        } catch(e) { 
            console.log(e);
            historyContainer.innerHTML = `<p style="color:orange; font-size:12px">⚠️ Falta índice. <a href="#" style="color:white" onclick="alert('Abre la consola del navegador (F12) y haz clic en el enlace largo que aparece en rojo para crear el índice en Firebase.')">Ver solución</a></p>`;
        }

        chartHelpers.renderLine('clientWeightChart', user.statsHistory || [], 'weight', '#39ff14');
        app.navTo('client-detail');
    },

    renderExistingRoutines: async () => {
        const container = document.getElementById('admin-routines-management');
        if(!container) return;
        container.innerHTML = 'Cargando...';

        try {
            const q = query(collection(db, "routines"), orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);
            container.innerHTML = '';

            if(snapshot.empty) { container.innerHTML = '<p>No hay rutinas.</p>'; return; }

            snapshot.forEach(docSnap => {
                const r = docSnap.data();
                // Opciones del select (SIN "TODOS")
                let options = `<option value="" disabled>Reasignar...</option>`;
                state.allClients.forEach(c => {
                    options += `<option value="${c.id}" ${r.assignedTo === c.id ? 'selected' : ''}>${c.name}</option>`;
                });

                // Nombre del asignado
                const assignedName = state.allClients.find(c => c.id === r.assignedTo)?.name || 'Sin asignar';

                container.innerHTML += `
                    <div class="exercise-card" style="border-left: 4px solid #00d4ff">
                        <div style="display:flex; justify-content:space-between; align-items:center">
                            <h4 style="margin:0">${r.name}</h4>
                            <button class="icon-btn" onclick="admin.deleteRoutine('${docSnap.id}')" style="color:#ff3b30">
                                <i class="material-icons-round" style="font-size:20px">delete</i>
                            </button>
                        </div>
                        <div style="margin-top:5px; font-size:12px; color:#aaa">Asignado a: <strong style="color:white">${assignedName}</strong></div>
                        <div style="margin-top:10px; background:#222; padding:5px; border-radius:5px">
                            <select onchange="admin.updateRoutineAssignment('${docSnap.id}', this.value)" style="margin:0; padding:5px; font-size:12px; height:auto; background:transparent; border:none; width:100%">
                                ${options}
                            </select>
                        </div>
                    </div>`;
            });
        } catch(e) { container.innerHTML = 'Error cargando rutinas'; }
    },

    updateRoutineAssignment: async (routineId, newAssignee) => {
        try { await updateDoc(doc(db, "routines", routineId), { assignedTo: newAssignee }); alert("Reasignado correctamente"); admin.renderExistingRoutines(); } catch(e) { alert("Error"); }
    },

    deleteRoutine: async (routineId) => {
        if(!confirm("¿Borrar rutina permanentemente?")) return;
        try { await deleteDoc(doc(db, "routines", routineId)); admin.renderExistingRoutines(); } catch(e) { alert("Error"); }
    },

    renderExerciseSelect: () => {
        const select = document.getElementById('admin-exercise-select');
        if(!select) return;
        select.innerHTML = '<option value="">Selecciona ejercicio...</option>';
        EXERCISES.forEach((ex, idx) => { select.innerHTML += `<option value="${idx}">${ex.n}</option>`; });
        state.newRoutine = []; admin.renderPreview();
    },

    filterExercises: (term) => {
        const select = document.getElementById('admin-exercise-select');
        const lowerTerm = term.toLowerCase();
        select.innerHTML = '';
        EXERCISES.forEach((ex, idx) => {
            if(ex.n.toLowerCase().includes(lowerTerm)) {
                select.innerHTML += `<option value="${idx}">${ex.n}</option>`;
            }
        });
    },

    addExerciseToRoutine: () => {
        const idx = document.getElementById('admin-exercise-select').value;
        if(!idx) return;
        const exData = EXERCISES[idx];
        state.newRoutine.push({ ...exData, defaultSets: [ {reps: 20}, {reps: 16}, {reps: 16}, {reps: 16}, {reps: 16} ] });
        admin.renderPreview();
    },

    renderPreview: () => {
        const container = document.getElementById('admin-routine-preview');
        if(!container) return;
        container.innerHTML = state.newRoutine.map((ex, exIdx) => {
            const imgSrc = ex.img ? `assets/muscles/${ex.img}` : 'assets/placeholder-body.png';
            let setsHtml = ex.defaultSets.map((s, sIdx) => `
                <input type="number" class="mini-input" value="${s.reps}" onchange="admin.updateRoutineSet(${exIdx}, ${sIdx}, this.value)">
            `).join('');
            return `
            <div class="routine-edit-row">
                <div class="routine-edit-header">
                    <img src="${imgSrc}" class="routine-mini-img">
                    <span style="font-size:14px">${ex.n}</span>
                    <button class="btn-text" style="width:auto; margin:0 0 0 auto; color:#ff3b30" onclick="admin.removeExercise(${exIdx})">x</button>
                </div>
                <div class="routine-sets-inputs">${setsHtml}</div>
            </div>`;
        }).join('');
    },

    updateRoutineSet: (exIdx, sIdx, val) => { state.newRoutine[exIdx].defaultSets[sIdx].reps = parseInt(val); },
    removeExercise: (idx) => { state.newRoutine.splice(idx, 1); admin.renderPreview(); },

    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value;
        const assignedTo = document.getElementById('assign-client-select').value;
        if(!name || state.newRoutine.length === 0 || !assignedTo) return alert("Faltan datos o cliente");

        try {
            await addDoc(collection(db, "routines"), {
                name: name, exercises: state.newRoutine, assignedTo: assignedTo, createdBy: state.user.uid, createdAt: new Date()
            });
            alert("Asignada correctamente"); state.newRoutine = []; document.getElementById('new-routine-name').value = '';
            admin.renderPreview(); admin.renderExistingRoutines();
        } catch(e) { alert("Error"); }
    }
};

const dashboard = {
    render: async () => {
        const container = document.getElementById('routines-list');
        if(!container) return;
        container.innerHTML = '<div style="text-align:center; padding:20px">Cargando...</div>';
        
        try {
            const q = query(collection(db, "routines"));
            const snapshot = await getDocs(q);
            container.innerHTML = '';
            let count = 0;

            snapshot.forEach(doc => {
                const r = doc.data();
                // SOLO MOSTRAR SI ES PARA MÍ
                if(r.assignedTo === state.user.uid) {
                    count++;
                    container.innerHTML += `
                        <div class="exercise-card">
                            <div style="display:flex; justify-content:space-between; align-items:center">
                                <h3 style="margin:0">${r.name}</h3>
                                <i class="material-icons-round" style="color:var(--neon-green)">fitness_center</i>
                            </div>
                            <p style="color:#888; font-size:14px; margin:5px 0">${r.exercises.length} Ejercicios</p>
                            <button class="btn-primary" style="margin-top:10px" onclick="workoutManager.start('${doc.id}', '${r.name}')">INICIAR</button>
                        </div>`;
                }
            });
            if(count === 0) container.innerHTML = '<p style="text-align:center">No tienes rutinas asignadas.</p>';
        } catch(e) { container.innerHTML = 'Error cargando rutinas'; }
    }
};

const workoutManager = {
    start: async (routineId, routineName) => {
        try {
            const docRef = await getDoc(doc(db, "routines", routineId));
            const routineData = docRef.data();
            state.activeWorkout = {
                name: routineName, startTime: Date.now(),
                exercises: routineData.exercises.map(ex => ({ ...ex, sets: ex.defaultSets ? ex.defaultSets.map(s => ({...s, kg:'', done:false})) : [] }))
            };
            workoutManager.saveLocal(); workoutManager.uiInit();
        } catch(e) { alert("Error"); }
    },
    resumeWorkout: (data) => { state.activeWorkout = data; workoutManager.uiInit(); },
    uiInit: () => { app.navTo('workout'); workoutManager.renderExercises(); workoutManager.startGlobalTimer(); },
    cancelWorkout: () => { if(confirm("¿Cancelar?")) { localStorage.removeItem(`bcn_workout_${state.user.uid}`); state.activeWorkout = null; app.navTo('dashboard'); } },
    openFinishModal: () => document.getElementById('finish-modal').classList.remove('hidden'),
    
    confirmFinish: async (rpeLabel) => {
        document.getElementById('finish-modal').classList.add('hidden');
        try {
            const notes = document.getElementById('final-notes').value;
            await addDoc(collection(db, "workouts"), {
                userId: state.user.uid, userName: state.profile.name, date: new Date(),
                data: state.activeWorkout, rpe: rpeLabel, notes: notes
            });

            const newLifts = {};
            state.activeWorkout.exercises.forEach(ex => {
                let maxWeight = 0;
                ex.sets.forEach(s => { const w = parseFloat(s.kg); if(w > maxWeight) maxWeight = w; });
                if(maxWeight > 0) newLifts[`lastLifts.${ex.n}`] = maxWeight;
            });

            if(Object.keys(newLifts).length > 0) {
                await updateDoc(doc(db, "users", state.user.uid), newLifts);
                state.activeWorkout.exercises.forEach(ex => {
                    let maxWeight = 0;
                    ex.sets.forEach(s => { if(parseFloat(s.kg) > maxWeight) maxWeight = parseFloat(s.kg); });
                    if(maxWeight > 0) state.profile.lastLifts[ex.n] = maxWeight;
                });
            }

            localStorage.removeItem(`bcn_workout_${state.user.uid}`);
            state.activeWorkout = null; app.navTo('dashboard'); alert("¡Completado!");
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
        const prevWeight = state.profile.lastLifts && state.profile.lastLifts[ex.n] ? state.profile.lastLifts[ex.n] + 'kg' : '--';
        list.innerHTML = ex.sets.map((set, sIdx) => `
            <div class="set-row ${set.done ? 'set-completed' : ''}">
                <span style="color:#555">#${sIdx+1}</span>
                <span style="font-size:10px; color:#555">Prev: ${prevWeight}</span>
                <input type="number" placeholder="kg" value="${set.kg || ''}" onchange="workoutManager.updateSet(${exIdx},${sIdx}, 'kg', this.value)">
                <input type="number" placeholder="reps" value="${set.reps || ''}" onchange="workoutManager.updateSet(${exIdx},${sIdx}, 'reps', this.value)">
                <div class="check-box ${set.done ? 'checked' : ''}" onclick="workoutManager.toggleSet(${exIdx}, ${sIdx})">
                    ${set.done ? '<i class="material-icons-round" style="font-size:16px; color:black">check</i>' : ''}
                </div>
            </div>`).join('');
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
        let remaining = sec;
        if(state.restTimer) clearInterval(state.restTimer);
        const updateDisplay = (r) => { document.getElementById('rest-countdown').innerText = `${Math.floor(r/60).toString().padStart(2,'0')}:${(r%60).toString().padStart(2,'0')}`; };
        updateDisplay(remaining);
        state.restTimer = setInterval(() => {
            remaining--; updateDisplay(remaining);
            if(remaining <= 0) { if(state.sounds.beep) state.sounds.beep.play().catch(()=>{}); if(navigator.vibrate) navigator.vibrate([200,100,200]); workoutManager.stopRest(); }
        }, 1000);
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
        chartHelpers.renderLine('weightChart', state.profile.statsHistory || [], 'weight', '#39ff14');
        chartHelpers.renderLine('fatChart', state.profile.statsHistory || [], 'fat', '#ff3b30');
        
        // Cargar mapa muscular propio
        profile.loadHistory();
    },

    switchTab: (tabName) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.querySelector(`.tab-btn[onclick*="${tabName}"]`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    },

    // AQUI ESTABA EL ERROR DEL INDICE
    loadHistory: async () => {
        const list = document.getElementById('history-list'); list.innerHTML = 'Cargando...';
        try {
            const q = query(collection(db, "workouts"), where("userId", "==", state.user.uid), orderBy("date", "desc"), limit(20));
            const snapshot = await getDocs(q);
            list.innerHTML = '';
            
            const muscleCounts = {};

            if(snapshot.empty) return list.innerHTML = 'Sin historial.';
            snapshot.forEach(doc => {
                const w = doc.data(); 
                // Sumar musculos para el radar
                if(w.data && w.data.exercises) {
                    w.data.exercises.forEach(ex => {
                        if(!muscleCounts[ex.m]) muscleCounts[ex.m] = 0;
                        muscleCounts[ex.m] += (ex.sets ? ex.sets.length : 0);
                    });
                }

                const d = w.date.seconds ? new Date(w.date.seconds * 1000) : new Date(w.date);
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `<div class="history-date">${d.toLocaleDateString()}</div><div class="history-title">${w.data.name}</div><div class="history-meta"><span class="tag">${w.rpe}</span></div>`;
                item.onclick = () => profile.showWorkoutDetails(w);
                list.appendChild(item);
            });

            // Pintar Radar
            chartHelpers.renderRadar('radarChart', muscleCounts);

        } catch(e) { 
            console.log(e);
            list.innerHTML = `<div style="padding:15px; border:1px solid orange; color:orange">
                ⚠️ <strong>Error de Índice</strong><br><br>
                Firebase necesita un índice para ordenar el historial.<br>
                <a href="#" style="color:white; text-decoration:underline" onclick="alert('Abre la consola (F12) y haz clic en el enlace largo que sale en rojo.')">Cómo arreglarlo</a>
            </div>`;
        }
    },

    showWorkoutDetails: (w) => {
        const modal = document.getElementById('workout-detail-modal');
        const content = document.getElementById('wd-content');
        const d = w.date.seconds ? new Date(w.date.seconds * 1000) : new Date(w.date);
        
        document.getElementById('wd-title').innerText = w.data.name;
        
        let html = `
            <p><strong>Fecha:</strong> ${d.toLocaleString()}</p>
            <p><strong>Notas:</strong> ${w.notes || 'Ninguna'}</p>
            <p><strong>RPE:</strong> ${w.rpe}</p>
            <hr style="border:0; border-top:1px solid #444; margin:10px 0">
        `;

        w.data.exercises.forEach(ex => {
            html += `<h4 style="margin:10px 0 5px; color:var(--neon-green)">${ex.n}</h4>`;
            html += `<table class="detail-table"><thead><tr><th>Serie</th><th>Kg</th><th>Reps</th></tr></thead><tbody>`;
            ex.sets.forEach((s, i) => {
                html += `<tr><td>#${i+1}</td><td>${s.kg}</td><td>${s.reps}</td></tr>`;
            });
            html += `</tbody></table>`;
        });

        content.innerHTML = html;
        modal.classList.remove('hidden');
    },

    uploadPhoto: (input) => {
        const file = input.files[0];
        if(!file) return;
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
            alert("Guardado"); profile.render();
        } catch(e) { alert("Error"); }
    },

    saveSettings: async () => {
        const time = parseInt(document.getElementById('conf-rest-time').value); if(!time) return;
        try { await updateDoc(doc(db, "users", state.user.uid), { "settings.restTime": time }); state.profile.settings.restTime = time; alert("Guardado"); } catch(e) { alert("Error"); }
    },
    
    requestNotify: () => {
        if (!("Notification" in window)) return alert("No soportado");
        Notification.requestPermission().then(perm => { if(perm === "granted") new Notification("¡Activado!"); });
    }
};

// HELPERS GRAFICAS PARA NO REPETIR CODIGO
const chartHelpers = {
    renderLine: (id, history, field, color) => {
        const ctx = document.getElementById(id);
        if(!ctx) return;
        if(ctx.chartInstance) ctx.chartInstance.destroy();
        history.sort((a,b) => (a.date.seconds || a.date) - (b.date.seconds || b.date));
        const labels = history.map(h => new Date(h.date.seconds ? h.date.seconds*1000 : h.date).toLocaleDateString());
        const data = history.map(h => h[field]);
        
        ctx.chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: field, data: data, borderColor: color, backgroundColor: color+'20', tension: 0.3, fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#222' } }, x: { grid: { color: '#222' } } } }
        });
    },

    renderRadar: (id, counts) => {
        const ctx = document.getElementById(id);
        if(!ctx) return;
        if(ctx.chartInstance) ctx.chartInstance.destroy();
        
        ctx.chartInstance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: Object.keys(counts),
                datasets: [{ label: 'Series', data: Object.values(counts), backgroundColor: 'rgba(57, 255, 20, 0.2)', borderColor: '#39ff14', pointBackgroundColor: '#fff' }]
            },
            options: { scales: { r: { grid: { color: '#444' }, pointLabels: { color: 'white', font: {size: 10} }, ticks: { display: false, backdropColor: 'transparent' } } }, plugins: { legend: { display: false } } }
        });
    }
};

window.app = app; window.workoutManager = workoutManager; window.admin = admin; window.profile = profile; window.chartHelpers = chartHelpers;
app.init();
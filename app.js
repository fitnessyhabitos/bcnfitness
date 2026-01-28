import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES } from './data.js';

// --- CONFIGURACIÓN ---
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
    allClients: [], // Para el selector de admin
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
    },

    loadProfile: async (uid) => {
        try {
            const docSnap = await getDoc(doc(db, "users", uid));
            if (docSnap.exists()) {
                state.profile = docSnap.data();
                // Inicializar estructuras
                if (!state.profile.settings) state.profile.settings = { restTime: 60 };
                if (!state.profile.lastLifts) state.profile.lastLifts = {};
                
                app.handleLoginSuccess();
            } else {
                console.error("Usuario no encontrado.");
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

        // Renderizar rol en perfil
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
        // Si vamos al perfil, cargar historial por defecto si estamos en esa tab
        if(viewId === 'profile' && !document.getElementById('tab-history').classList.contains('hidden')) {
             profile.loadHistory();
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
            
            // Recoger Rol seleccionado
            const clientType = document.getElementById('reg-role-select').value; // 'cliente' o 'atleta'

            await setDoc(doc(db, "users", cred.user.uid), {
                name: document.getElementById('reg-name').value,
                email: document.getElementById('reg-email').value,
                role: 'athlete', // Rol interno de permisos
                clientType: clientType, // Etiqueta visual (Cliente/Atleta)
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
    },

    renderExerciseSelect: () => {
        const select = document.getElementById('admin-exercise-select');
        if(!select) return;
        select.innerHTML = '<option value="">Selecciona ejercicio...</option>';
        EXERCISES.forEach((ex, idx) => {
            select.innerHTML += `<option value="${idx}">${ex.n} (${ex.m})</option>`;
        });
        state.newRoutine = [];
        admin.renderPreview();
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
            
            // Limpiar select de asignación (manteniendo la opción "Todos")
            select.innerHTML = '<option value="all">Todos los Clientes</option>';

            snapshot.forEach(docSnap => {
                const u = docSnap.data();
                state.allClients.push({ id: docSnap.id, ...u });
                
                // Añadir a la lista visual
                const avatar = u.photoURL || 'assets/placeholder-body.png';
                const label = u.clientType ? u.clientType.toUpperCase() : 'CLIENTE';
                
                list.innerHTML += `
                    <div class="user-row">
                        <img src="${avatar}" class="user-avatar-small">
                        <div class="user-info">
                            <h5>${u.name}</h5>
                            <span>${label}</span>
                        </div>
                        <span class="user-role-badge">${u.approved ? 'ACTIVO' : 'PENDIENTE'}</span>
                    </div>
                `;

                // Añadir al desplegable de asignación
                select.innerHTML += `<option value="${docSnap.id}">${u.name}</option>`;
            });
        } catch (e) { list.innerHTML = 'Error al cargar usuarios'; }
    },

    addExerciseToRoutine: () => {
        const idx = document.getElementById('admin-exercise-select').value;
        if(!idx) return;
        const exData = EXERCISES[idx];
        
        // Añadimos el ejercicio a la lista temporal
        state.newRoutine.push({
            ...exData,
            defaultSets: [ {reps: 20}, {reps: 16}, {reps: 16}, {reps: 16}, {reps: 16} ]
        });
        admin.renderPreview();
    },

    // AHORA RENDERIZA INPUTS PARA PODER EDITAR
    renderPreview: () => {
        const container = document.getElementById('admin-routine-preview');
        if(!container) return;
        
        container.innerHTML = state.newRoutine.map((ex, exIdx) => {
            const imgSrc = ex.img ? `assets/muscles/${ex.img}` : 'assets/placeholder-body.png';
            
            // Generar inputs para cada serie
            let setsHtml = ex.defaultSets.map((s, sIdx) => `
                <input type="number" class="mini-input" value="${s.reps}" 
                       onchange="admin.updateRoutineSet(${exIdx}, ${sIdx}, this.value)">
            `).join('');

            return `
            <div class="routine-edit-row">
                <div class="routine-edit-header">
                    <img src="${imgSrc}" class="routine-mini-img">
                    <span style="font-size:14px">${ex.n}</span>
                    <button class="btn-text" style="width:auto; margin:0 0 0 auto; color:#ff3b30" onclick="admin.removeExercise(${exIdx})">x</button>
                </div>
                <div class="routine-sets-inputs">
                    ${setsHtml}
                </div>
            </div>`;
        }).join('');
    },

    updateRoutineSet: (exIdx, sIdx, val) => {
        state.newRoutine[exIdx].defaultSets[sIdx].reps = parseInt(val);
    },

    removeExercise: (idx) => {
        state.newRoutine.splice(idx, 1);
        admin.renderPreview();
    },

    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value;
        const assignedTo = document.getElementById('assign-client-select').value; // 'all' o un ID
        
        if(!name || state.newRoutine.length === 0) return alert("Faltan datos en la rutina");

        try {
            await addDoc(collection(db, "routines"), {
                name: name,
                exercises: state.newRoutine,
                assignedTo: assignedTo, // Guardamos a quién va dirigida
                createdBy: state.user.uid,
                createdAt: new Date()
            });
            alert("Rutina guardada y asignada.");
            state.newRoutine = [];
            document.getElementById('new-routine-name').value = '';
            admin.renderPreview();
        } catch(e) { console.error(e); alert("Error al guardar"); }
    }
};

const dashboard = {
    render: async () => {
        const container = document.getElementById('routines-list');
        if(!container) return;
        container.innerHTML = '<div style="text-align:center; padding:20px">Cargando...</div>';
        
        try {
            const routinesRef = collection(db, "routines");
            const snapshot = await getDocs(routinesRef);
            
            container.innerHTML = '';
            let count = 0;

            snapshot.forEach(doc => {
                const r = doc.data();
                // FILTRO: Mostrar si es para 'all' O si está asignada explícitamente a este usuario
                if(r.assignedTo === 'all' || r.assignedTo === state.user.uid) {
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
                name: routineName,
                startTime: Date.now(),
                exercises: routineData.exercises.map(ex => ({
                    ...ex,
                    sets: ex.defaultSets ? ex.defaultSets.map(s => ({...s, kg:'', done:false})) : []
                }))
            };
            workoutManager.saveLocal();
            workoutManager.uiInit();
        } catch(e) { console.error(e); alert("Error al iniciar"); }
    },

    resumeWorkout: (data) => {
        state.activeWorkout = data;
        workoutManager.uiInit();
    },

    uiInit: () => {
        app.navTo('workout');
        workoutManager.renderExercises();
        workoutManager.startGlobalTimer();
    },

    cancelWorkout: () => {
        if(confirm("¿Cancelar entreno?")) {
            localStorage.removeItem(`bcn_workout_${state.user.uid}`);
            state.activeWorkout = null;
            app.navTo('dashboard');
        }
    },

    // ABRE EL MODAL DE SEMÁFORO
    openFinishModal: () => {
        document.getElementById('finish-modal').classList.remove('hidden');
    },

    // GUARDA EL ENTRENO CON EL COLOR ELEGIDO
    confirmFinish: async (rpeLabel) => {
        document.getElementById('finish-modal').classList.add('hidden');
        
        try {
            const notes = document.getElementById('final-notes').value;

            // 1. Guardar Workout
            await addDoc(collection(db, "workouts"), {
                userId: state.user.uid,
                userName: state.profile.name, // Guardamos nombre para facilitar búsquedas al coach
                date: new Date(),
                data: state.activeWorkout,
                rpe: rpeLabel, // "Ligero", "Moderado", "Intenso"
                notes: notes
            });

            // 2. Actualizar PRs
            const newLifts = {};
            state.activeWorkout.exercises.forEach(ex => {
                let maxWeight = 0;
                ex.sets.forEach(s => {
                    const w = parseFloat(s.kg);
                    if(w > maxWeight) maxWeight = w;
                });
                if(maxWeight > 0) newLifts[`lastLifts.${ex.n}`] = maxWeight;
            });

            if(Object.keys(newLifts).length > 0) {
                await updateDoc(doc(db, "users", state.user.uid), newLifts);
                // Actualizar local
                state.activeWorkout.exercises.forEach(ex => {
                    let maxWeight = 0;
                    ex.sets.forEach(s => { if(parseFloat(s.kg) > maxWeight) maxWeight = parseFloat(s.kg); });
                    if(maxWeight > 0) state.profile.lastLifts[ex.n] = maxWeight;
                });
            }

            localStorage.removeItem(`bcn_workout_${state.user.uid}`);
            state.activeWorkout = null;
            app.navTo('dashboard');
            alert("¡Entrenamiento completado!");

        } catch(e) { console.error(e); alert("Error al guardar"); }
    },

    // ... (RenderExercises, RenderSets, etc... son iguales que antes, mantenerlos) ...
    renderExercises: () => {
        const container = document.getElementById('active-exercises-container');
        if(!container) return;
        container.innerHTML = '';
        
        state.activeWorkout.exercises.forEach((ex, exIdx) => {
            const imgSrc = ex.img ? `assets/muscles/${ex.img}` : 'assets/placeholder-body.png';
            container.innerHTML += `
                <div class="exercise-card">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px">
                        <img src="${imgSrc}" width="40" style="border-radius:4px; background:#333" onerror="this.src='assets/placeholder-body.png'">
                        <div>
                            <h3 style="font-size:16px; margin:0">${ex.n}</h3>
                            <small style="color:var(--neon-green)">${ex.m}</small>
                        </div>
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
            </div>
        `).join('');
    },

    addSet: (exIdx) => {
        state.activeWorkout.exercises[exIdx].sets.push({ kg:'', reps:'', done: false });
        workoutManager.saveLocal();
        workoutManager.renderSets(exIdx);
    },

    updateSet: (exIdx, sIdx, field, val) => {
        state.activeWorkout.exercises[exIdx].sets[sIdx][field] = val;
        workoutManager.saveLocal();
    },

    toggleSet: (exIdx, sIdx) => {
        const set = state.activeWorkout.exercises[exIdx].sets[sIdx];
        set.done = !set.done;
        if(set.done) {
            if(state.sounds.beep) state.sounds.beep.play().catch(()=>{}); 
            const restTime = state.profile.settings?.restTime || 60;
            workoutManager.startRest(restTime);
        }
        workoutManager.saveLocal();
        workoutManager.renderSets(exIdx);
    },

    startRest: (sec) => {
        const modal = document.getElementById('rest-modal');
        modal.classList.remove('hidden');
        let remaining = sec;
        if(state.restTimer) clearInterval(state.restTimer);
        const updateDisplay = (r) => {
            const m = Math.floor(r/60).toString().padStart(2,'0');
            const s = (r%60).toString().padStart(2,'0');
            document.getElementById('rest-countdown').innerText = `${m}:${s}`;
        };
        updateDisplay(remaining);
        state.restTimer = setInterval(() => {
            remaining--;
            updateDisplay(remaining);
            if(remaining <= 0) {
                if(state.sounds.beep) state.sounds.beep.play().catch(()=>{});
                if(navigator.vibrate) navigator.vibrate([200,100,200]);
                workoutManager.stopRest();
            }
        }, 1000);
    },

    stopRest: () => {
        clearInterval(state.restTimer);
        document.getElementById('rest-modal').classList.add('hidden');
    },
    
    startGlobalTimer: () => {
        setInterval(() => {
            if(!state.activeWorkout) return;
            const diff = Math.floor((Date.now() - state.activeWorkout.startTime) / 1000);
            const m = Math.floor(diff/60).toString().padStart(2,'0');
            const s = (diff%60).toString().padStart(2,'0');
            const el = document.getElementById('global-timer');
            if(el) el.innerText = `${m}:${s}`;
        }, 1000);
    },
    
    saveLocal: () => {
        if(state.user) localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout));
    }
};

const profile = {
    render: () => {
        if(!state.profile) return;
        document.getElementById('profile-name').innerText = state.profile.name;
        
        // Foto
        const imgEl = document.getElementById('profile-img');
        if(state.profile.photoURL) imgEl.src = state.profile.photoURL;
        
        // Rol
        const roleLabel = state.profile.clientType || state.profile.role;
        document.getElementById('profile-role-badge').innerText = roleLabel;
        
        // Cargar gráficas por defecto
        profile.renderCharts();
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
            const q = query(
                collection(db, "workouts"), 
                where("userId", "==", state.user.uid),
                orderBy("date", "desc"),
                limit(20)
            );
            const snapshot = await getDocs(q);
            
            list.innerHTML = '';
            if(snapshot.empty) return list.innerHTML = 'Sin historial.';

            snapshot.forEach(doc => {
                const w = doc.data();
                const d = w.date.seconds ? new Date(w.date.seconds * 1000) : new Date(w.date);
                
                // Color de etiqueta según RPE
                let tagClass = '';
                if(w.rpe === 'Intenso') tagClass = 'hard';
                if(w.rpe === 'Ligero') tagClass = 'easy';

                list.innerHTML += `
                    <div class="history-item">
                        <div class="history-date">${d.toLocaleDateString()} - ${d.toLocaleTimeString().slice(0,5)}</div>
                        <div class="history-title">${w.data.name}</div>
                        <div class="history-meta">
                            <span class="tag ${tagClass}">${w.rpe}</span>
                            <span class="tag">${w.data.exercises.length} Ejercicios</span>
                        </div>
                    </div>
                `;
            });

        } catch(e) { 
            console.error(e); 
            // A veces falla si falta un índice en Firestore, se crea haciendo click en el link de error de la consola
            list.innerHTML = 'Error o falta índice (Ver consola)'; 
        }
    },

    uploadPhoto: (input) => {
        const file = input.files[0];
        if(!file) return;
        if(file.size > 2 * 1024 * 1024) return alert("Imagen muy grande (>2MB)");

        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_SIZE = 300;
                let width = img.width, height = img.height;

                if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
                else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                const base64String = canvas.toDataURL('image/jpeg', 0.7);

                try {
                    await updateDoc(doc(db, "users", state.user.uid), { photoURL: base64String });
                    state.profile.photoURL = base64String;
                    document.getElementById('profile-img').src = base64String;
                } catch(err) { alert("Error al guardar foto"); }
            };
        };
        reader.readAsDataURL(file);
    },

    saveStats: async () => {
        const w = document.getElementById('stats-weight').value;
        const f = document.getElementById('stats-fat').value;
        const m = document.getElementById('stats-muscle').value;
        if(!w) return alert("Falta peso");

        try {
            const newEntry = { date: new Date(), weight: parseFloat(w), fat: f?parseFloat(f):0, muscle: m?parseFloat(m):0 };
            await updateDoc(doc(db, "users", state.user.uid), { statsHistory: arrayUnion(newEntry) });
            
            if(!state.profile.statsHistory) state.profile.statsHistory = [];
            state.profile.statsHistory.push(newEntry);
            alert("Guardado");
            profile.renderCharts();
        } catch(e) { alert("Error"); }
    },
    
    // (RenderCharts, SaveSettings, RequestNotify son iguales que antes, mantenerlos)
    renderCharts: () => { /* ... Código anterior de gráficas ... */ },
    saveSettings: async () => { /* ... Código anterior ... */ },
    requestNotify: () => { /* ... Código anterior ... */ }
};

// Necesario re-declarar renderCharts si copiaste solo una parte, 
// pero en el "copia y pega" final del usuario, asegúrate de que estén todas las funciones del objeto profile.
// Para ahorrar espacio aquí, asumo que mantienes las funciones gráficas del mensaje anterior dentro de 'profile'.
// Si quieres el bloque COMPLETO, dímelo y lo repito entero.

window.app = app;
window.workoutManager = workoutManager;
window.admin = admin;
window.profile = profile;

app.init();

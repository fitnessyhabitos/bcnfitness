import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
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

const state = {
    user: null,
    profile: null,
    activeWorkout: null,
    restTimer: null,
    newRoutine: [], 
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

        const logoutBtn = document.getElementById('logout-btn');
        if(logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));
        
        const loginForm = document.getElementById('login-form');
        if(loginForm) loginForm.addEventListener('submit', app.handleLogin);
        
        const regForm = document.getElementById('register-form');
        if(regForm) regForm.addEventListener('submit', app.handleRegister);
    },

    // --- CORRECCIÓN AQUÍ: AUTO-REPARAR PERFIL SI FALTA ---
    loadProfile: async (uid) => {
        try {
            const docRef = doc(db, "users", uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                state.profile = docSnap.data();
            } else {
                // SI NO EXISTE EL PERFIL, LO CREAMOS EN VEZ DE DAR ERROR
                console.warn("Perfil no encontrado en DB, creando uno nuevo...");
                const newProfile = {
                    name: state.user.email.split('@')[0], // Usar parte del email como nombre
                    role: 'athlete',
                    approved: false,
                    settings: { restTime: 60 },
                    lastLifts: {},
                    statsHistory: [],
                    createdAt: new Date()
                };
                await setDoc(docRef, newProfile);
                state.profile = newProfile;
            }

            // Asegurar que existan los objetos anidados para evitar errores futuros
            if (!state.profile.settings) state.profile.settings = { restTime: 60 };
            if (!state.profile.lastLifts) state.profile.lastLifts = {};
            
            app.handleLoginSuccess();

        } catch (e) { 
            console.error("Error crítico cargando perfil:", e);
            alert("Error de conexión con la base de datos.");
        }
    },

    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            if(state.profile.role === 'admin' || state.profile.role === 'coach') {
                adminBtn.classList.remove('hidden');
            } else {
                adminBtn.classList.add('hidden');
            }
        }

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
        if(viewId === 'admin') admin.render();
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
            await setDoc(doc(db, "users", cred.user.uid), {
                name: document.getElementById('reg-name').value,
                role: 'athlete',
                approved: false,
                settings: { restTime: 60 },
                lastLifts: {},
                statsHistory: [],
                createdAt: new Date()
            });
        } catch (err) { alert(err.message); }
    }
};

const admin = {
    render: () => {
        const select = document.getElementById('admin-exercise-select');
        if(!select) return;
        select.innerHTML = '<option value="">Selecciona ejercicio...</option>';
        EXERCISES.forEach((ex, idx) => {
            select.innerHTML += `<option value="${idx}">${ex.n} (${ex.m})</option>`;
        });
        state.newRoutine = [];
        admin.renderPreview();
    },

    addExerciseToRoutine: () => {
        const idx = document.getElementById('admin-exercise-select').value;
        if(!idx) return;
        const exData = EXERCISES[idx];
        
        state.newRoutine.push({
            ...exData,
            defaultSets: [
                {reps: 20}, {reps: 16}, {reps: 16}, {reps: 16}, {reps: 16}
            ]
        });
        admin.renderPreview();
    },

    renderPreview: () => {
        const container = document.getElementById('admin-routine-preview');
        if(!container) return;
        container.innerHTML = state.newRoutine.map((ex, i) => `
            <div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between">
                <span>${i+1}. ${ex.n}</span>
                <span style="color:var(--neon-green)">5 Series</span>
            </div>
        `).join('');
    },

    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value;
        if(!name || state.newRoutine.length === 0) return alert("Faltan datos");

        try {
            await addDoc(collection(db, "routines"), {
                name: name,
                exercises: state.newRoutine,
                createdBy: state.user.uid,
                createdAt: new Date()
            });
            alert("¡Rutina creada!");
            state.newRoutine = [];
            document.getElementById('new-routine-name').value = '';
            admin.renderPreview();
        } catch(e) { console.error(e); alert("Error al guardar"); }
    }
};

const dashboard = {
    render: async () => {
        if(state.profile && !state.profile.approved && state.profile.role !== 'admin') {
            const warn = document.getElementById('pending-approval');
            if(warn) warn.classList.remove('hidden');
        }

        const container = document.getElementById('routines-list');
        if(!container) return;
        container.innerHTML = '<div style="text-align:center; padding:20px">Cargando...</div>';
        
        try {
            const q = query(collection(db, "routines"));
            const snapshot = await getDocs(q);
            container.innerHTML = '';
            
            if(snapshot.empty) {
                container.innerHTML = '<p style="text-align:center; color:#666">No hay rutinas asignadas.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const r = doc.data();
                const card = document.createElement('div');
                card.className = 'exercise-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center">
                        <h3 style="margin:0">${r.name}</h3>
                        <i class="material-icons-round" style="color:var(--neon-green)">fitness_center</i>
                    </div>
                    <p style="color:#888; font-size:14px; margin:5px 0">${r.exercises.length} Ejercicios</p>
                    <button class="btn-primary" style="margin-top:10px" onclick="workoutManager.start('${doc.id}', '${r.name}')">INICIAR</button>
                `;
                container.appendChild(card);
            });
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
        if(confirm("¿Cancelar entreno? Se perderán los datos.")) {
            localStorage.removeItem(`bcn_workout_${state.user.uid}`);
            state.activeWorkout = null;
            app.navTo('dashboard');
        }
    },

    renderExercises: () => {
        const container = document.getElementById('active-exercises-container');
        if(!container) return;
        container.innerHTML = '';
        
        state.activeWorkout.exercises.forEach((ex, exIdx) => {
            const div = document.createElement('div');
            div.className = 'exercise-card';
            
            const imgSrc = ex.img ? `assets/muscles/${ex.img}` : 'assets/placeholder-body.png';
            
            div.innerHTML = `
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
            `;
            container.appendChild(div);
            workoutManager.renderSets(exIdx);
        });
    },

    renderSets: (exIdx) => {
        const list = document.getElementById(`sets-list-${exIdx}`);
        const ex = state.activeWorkout.exercises[exIdx];
        
        // RECUPERAR PREVIO
        const prevWeight = state.profile.lastLifts && state.profile.lastLifts[ex.n] 
            ? state.profile.lastLifts[ex.n] + 'kg' 
            : '--';

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

    adjustRest: (amount) => {
        console.log("Ajuste rest: " + amount);
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

    finishWorkout: async () => {
        if(!confirm("¿Guardar y finalizar?")) return;
        try {
            await addDoc(collection(db, "workouts"), {
                userId: state.user.uid,
                date: new Date(),
                data: state.activeWorkout,
                rpe: document.getElementById('workout-rpe').value,
                notes: document.getElementById('workout-notes').value
            });

            // Actualizar récords personales
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
            alert("¡Entrenamiento guardado!");

        } catch(e) { console.error(e); alert("Error al guardar"); }
    },
    
    saveLocal: () => {
        if(state.user) localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout));
    }
};

const profile = {
    render: () => {
        if(!state.profile) return;
        document.getElementById('profile-name').innerText = state.profile.name;
        document.getElementById('profile-initials').innerText = state.profile.name.substring(0,2).toUpperCase();
        
        const restInput = document.getElementById('conf-rest-time');
        if(restInput) restInput.value = state.profile.settings?.restTime || 60;
        
        profile.renderCharts();
    },

    saveSettings: async () => {
        const time = parseInt(document.getElementById('conf-rest-time').value);
        if(!time) return;
        try {
            await updateDoc(doc(db, "users", state.user.uid), { "settings.restTime": time });
            state.profile.settings.restTime = time;
            alert("Guardado");
        } catch(e) { alert("Error"); }
    },

    saveStats: async () => {
        const w = document.getElementById('stats-weight').value;
        const f = document.getElementById('stats-fat').value;
        const m = document.getElementById('stats-muscle').value;

        if(!w) return alert("Pon el peso");

        const newEntry = {
            date: new Date(),
            weight: parseFloat(w),
            fat: f ? parseFloat(f) : null,
            muscle: m ? parseFloat(m) : null
        };

        try {
            await updateDoc(doc(db, "users", state.user.uid), {
                statsHistory: arrayUnion(newEntry)
            });
            if(!state.profile.statsHistory) state.profile.statsHistory = [];
            state.profile.statsHistory.push(newEntry);
            
            document.getElementById('stats-weight').value = '';
            alert("Registrado");
            profile.renderCharts();
        } catch(e) { alert("Error"); }
    },

    renderCharts: () => {
        const ctx = document.getElementById('weightChart').getContext('2d');
        const history = state.profile.statsHistory || [];
        history.sort((a,b) => (a.date.seconds || a.date) - (b.date.seconds || b.date));

        if(window.myChart) window.myChart.destroy();

        window.myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map(h => {
                    const d = h.date.seconds ? new Date(h.date.seconds * 1000) : new Date(h.date);
                    return d.toLocaleDateString();
                }),
                datasets: [{
                    label: 'Peso (kg)',
                    data: history.map(h => h.weight),
                    borderColor: '#39ff14',
                    backgroundColor: 'rgba(57, 255, 20, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { grid: { color: '#222' } }, 
                    x: { grid: { color: '#222' } } 
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    requestNotify: () => {
        if (!("Notification" in window)) return alert("No soportado");
        Notification.requestPermission().then(perm => {
            if(perm === "granted") new Notification("¡Activado!");
        });
    }
};

window.app = app;
window.workoutManager = workoutManager;
window.admin = admin;
window.profile = profile;

app.init();

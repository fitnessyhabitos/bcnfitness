import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES, TEMPLATE_ROUTINES } from './data.js';

// --- CONFIGURACIÓN FIREBASE ---
// ¡¡PEGA AQUÍ TUS CLAVES REALES DE LA CONSOLA DE FIREBASE!!
const firebaseConfig = {
  apiKey: "AIzaSyC5TuyHq_MIkhiIdgjBU6s7NM2nq6REY8U",
  authDomain: "bcn-fitness.firebaseapp.com",
  projectId: "bcn-fitness",
  storageBucket: "bcn-fitness.firebasestorage.app",
  messagingSenderId: "193657523158",
  appId: "1:193657523158:web:2c50129da8a4e7a07cf277"
};

// Inicialización (SOLO PUEDE OCURRIR UNA VEZ)
const appInstance = initializeApp(firebaseConfig);
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);

// --- ESTADO GLOBAL ---
const state = {
    user: null,
    profile: null,
    activeWorkout: null,
    restTimer: null,
    sounds: { beep: document.getElementById('timer-beep') }
};

// --- NAVEGACIÓN ---
const app = {
    init: () => {
        // Auth Listener
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.user = user;
                // Cargar perfil
                try {
                    const docSnap = await getDoc(doc(db, "users", user.uid));
                    if (docSnap.exists()) {
                        state.profile = docSnap.data();
                        app.handleLoginSuccess();
                    } else {
                        console.error("Usuario autenticado pero sin perfil en DB");
                        // Opcional: Crear perfil básico si falta
                        state.profile = { name: user.email.split('@')[0], role: 'athlete', approved: false };
                        app.handleLoginSuccess();
                    }
                } catch (e) {
                    console.error("Error cargando perfil:", e);
                    // Intentar entrar de todas formas
                    app.hideSplash();
                }
            } else {
                state.user = null;
                app.navTo('login');
                app.hideSplash();
            }
        });

        // Event Listeners Globales
        const logoutBtn = document.getElementById('logout-btn');
        if(logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));
        
        // Forms
        const loginForm = document.getElementById('login-form');
        if(loginForm) loginForm.addEventListener('submit', app.handleLogin);
        
        const regForm = document.getElementById('register-form');
        if(regForm) regForm.addEventListener('submit', app.handleRegister);
    },

    handleLoginSuccess: async () => {
        const saved = localStorage.getItem(`bcn_workout_${state.user.uid}`);
        if(saved) {
            workoutManager.resumeWorkout(JSON.parse(saved));
        } else {
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
        if(viewId === 'dashboard') {
            const el = document.querySelector('[onclick*="dashboard"]');
            if(el) el.classList.add('active');
        }
        if(viewId === 'profile') {
            const el = document.querySelector('[onclick*="profile"]');
            if(el) el.classList.add('active');
            profile.render();
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
        } catch (err) { alert("Error Login: " + err.message); }
    },

    handleRegister: async (e) => {
        e.preventDefault();
        const code = document.getElementById('reg-code').value;
        if(code !== 'bcnfitness') return alert("Código incorrecto");

        try {
            const cred = await createUserWithEmailAndPassword(auth, 
                document.getElementById('reg-email').value, 
                document.getElementById('reg-pass').value
            );
            
            await setDoc(doc(db, "users", cred.user.uid), {
                name: document.getElementById('reg-name').value,
                role: 'athlete',
                approved: false,
                stats: { weight: [], muscle: {} }
            });
        } catch (err) { alert("Error registro: " + err.message); }
    }
};

// --- LOGICA DASHBOARD ---
const dashboard = {
    render: async () => {
        if(state.profile && !state.profile.approved && state.profile.role !== 'admin') {
            const warn = document.getElementById('pending-approval');
            if(warn) warn.classList.remove('hidden');
        }

        const container = document.getElementById('routines-list');
        if(!container) return;
        container.innerHTML = '';

        TEMPLATE_ROUTINES.forEach((r, idx) => {
            const card = document.createElement('div');
            card.className = 'exercise-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between">
                    <h3>${r.name}</h3>
                    <i class="material-icons-round" style="color:#39ff14">fitness_center</i>
                </div>
                <p style="color:#888">${r.exercises.length} Ejercicios</p>
                <button class="btn-primary" onclick="workoutManager.start('${r.name}', ${idx})">ENTRENAR</button>
            `;
            container.appendChild(card);
        });
    }
};

// --- LOGICA ENTRENAMIENTO ---
const workoutManager = {
    start: (name, templateIdx) => {
        const template = TEMPLATE_ROUTINES[templateIdx];
        state.activeWorkout = {
            name: name,
            startTime: Date.now(),
            exercises: template.exercises.map(exName => {
                const info = EXERCISES.find(e => e.n === exName) || {n: exName, m:'?', img:''};
                return { ...info, sets: [] };
            })
        };
        workoutManager.saveLocal();
        workoutManager.uiInit();
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

    renderExercises: () => {
        const container = document.getElementById('active-exercises-container');
        if(!container) return;
        container.innerHTML = '';
        
        state.activeWorkout.exercises.forEach((ex, exIdx) => {
            const div = document.createElement('div');
            div.className = 'exercise-card';
            
            let html = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px">
                    <img src="assets/muscles/${ex.img || 'cuadriceps.png'}" width="40" style="border-radius:4px" onerror="this.src='assets/placeholder-body.png'">
                    <div>
                        <h3 style="font-size:16px; margin:0">${ex.n}</h3>
                        <small style="color:#39ff14">${ex.m}</small>
                    </div>
                    ${ex.v ? `<a href="${ex.v}" target="_blank" style="margin-left:auto; color:white"><i class="material-icons-round">videocam</i></a>` : ''}
                </div>
                <div id="sets-list-${exIdx}"></div>
                <button class="btn-text" style="width:100%; margin-top:10px; border:1px dashed #333" onclick="workoutManager.addSet(${exIdx})">+ AÑADIR SERIE</button>
            `;
            div.innerHTML = html;
            container.appendChild(div);
            workoutManager.renderSets(exIdx);
        });
        
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
    },

    renderSets: (exIdx) => {
        const list = document.getElementById(`sets-list-${exIdx}`);
        const ex = state.activeWorkout.exercises[exIdx];
        if(ex.sets.length === 0) workoutManager.addSet(exIdx, false);

        list.innerHTML = ex.sets.map((set, sIdx) => `
            <div class="set-row ${set.done ? 'set-completed' : ''}">
                <span style="color:#555">#${sIdx+1}</span>
                <span style="font-size:10px; color:#555">Prev: --</span>
                <input type="number" placeholder="kg" value="${set.kg || ''}" onchange="workoutManager.updateSet(${exIdx},${sIdx}, 'kg', this.value)">
                <input type="number" placeholder="reps" value="${set.reps || ''}" onchange="workoutManager.updateSet(${exIdx},${sIdx}, 'reps', this.value)">
                <div class="check-box ${set.done ? 'checked' : ''}" onclick="workoutManager.toggleSet(${exIdx}, ${sIdx})">
                    ${set.done ? '<i class="material-icons-round" style="font-size:16px; color:black">check</i>' : ''}
                </div>
            </div>
        `).join('');
    },

    addSet: (exIdx, render=true) => {
        state.activeWorkout.exercises[exIdx].sets.push({ kg:'', reps:'', done: false });
        workoutManager.saveLocal();
        if(render) workoutManager.renderSets(exIdx);
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
            workoutManager.startRest(90);
        }
        workoutManager.saveLocal();
        workoutManager.renderSets(exIdx);
    },

    startRest: (sec) => {
        const modal = document.getElementById('rest-modal');
        const display = document.getElementById('rest-countdown');
        if(modal) modal.classList.remove('hidden');
        
        let remaining = sec;
        if(state.restTimer) clearInterval(state.restTimer);
        
        state.restTimer = setInterval(() => {
            remaining--;
            const m = Math.floor(remaining/60).toString().padStart(2,'0');
            const s = (remaining%60).toString().padStart(2,'0');
            if(display) display.innerText = `${m}:${s}`;
            
            if(remaining <= 0) {
                if(state.sounds.beep) state.sounds.beep.play();
                if(navigator.vibrate) navigator.vibrate([200,100,200]);
                workoutManager.stopRest();
            }
        }, 1000);
    },

    stopRest: () => {
        clearInterval(state.restTimer);
        const modal = document.getElementById('rest-modal');
        if(modal) modal.classList.add('hidden');
    },

    adjustRest: (amount) => {
        // Simple implementación para evitar error
        alert("Ajuste rápido no activo en demo");
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
        if(!confirm("¿Terminar entrenamiento?")) return;
        try {
            const rpeEl = document.getElementById('workout-rpe');
            const notesEl = document.getElementById('workout-notes');

            await addDoc(collection(db, "workouts"), {
                userId: state.user.uid,
                date: new Date(),
                data: state.activeWorkout,
                rpe: rpeEl ? rpeEl.value : 5,
                notes: notesEl ? notesEl.value : ''
            });
            
            localStorage.removeItem(`bcn_workout_${state.user.uid}`);
            state.activeWorkout = null;
            app.navTo('dashboard');
            alert("¡Entreno guardado!");
        } catch(e) { console.error(e); alert("Error al guardar: Ver consola"); }
    },

    saveLocal: () => {
        if(state.user) localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout));
    }
};

const profile = {
    render: () => {
        if(!state.profile) return;
        const nameEl = document.getElementById('profile-name');
        const initEl = document.getElementById('profile-initials');
        
        if(nameEl) nameEl.innerText = state.profile.name;
        if(initEl) initEl.innerText = state.profile.name.substring(0,2).toUpperCase();
        
        // Charts omitidos por brevedad, se pueden añadir luego
    }
};

window.app = app;
window.workoutManager = workoutManager;
app.init();
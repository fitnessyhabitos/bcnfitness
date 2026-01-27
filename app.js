import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES, TEMPLATE_ROUTINES } from './data.js';

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBqI5_0Xj_2J_cwY8RdXi5yl-fxJB9w6qw",
  authDomain: "bcnfitness-c369e.firebaseapp.com",
  projectId: "bcnfitness-c369e",
  storageBucket: "bcnfitness-c369e.firebasestorage.app",
  messagingSenderId: "851696072412",
  appId: "1:851696072412:web:c33207b2cb0ba13b1e2619"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

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
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if (docSnap.exists()) {
                    state.profile = docSnap.data();
                    app.handleLoginSuccess();
                } else {
                    console.error("Usuario sin perfil");
                    auth.signOut();
                }
            } else {
                app.navTo('login');
                app.hideSplash();
            }
        });

        // Event Listeners Globales
        document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
        
        // Forms
        document.getElementById('login-form').addEventListener('submit', app.handleLogin);
        document.getElementById('register-form').addEventListener('submit', app.handleRegister);
    },

    handleLoginSuccess: async () => {
        // Restaurar entreno si existe
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
        // Cambio de vista simple
        document.querySelectorAll('.view').forEach(el => {
            el.classList.remove('active');
            el.classList.add('hidden');
        });
        
        const target = document.getElementById(`view-${viewId}`);
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }

        // Toggle UI elements
        const isAuth = ['login', 'register'].includes(viewId);
        document.getElementById('app-header').classList.toggle('hidden', isAuth);
        document.getElementById('bottom-nav').classList.toggle('hidden', isAuth || viewId === 'workout');

        // Nav Active State
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        if(viewId === 'dashboard') document.querySelector('[onclick*="dashboard"]').classList.add('active');
        if(viewId === 'profile') document.querySelector('[onclick*="profile"]').classList.add('active');
        
        if(viewId === 'profile') profile.render();
    },

    hideSplash: () => {
        const splash = document.getElementById('splash-screen');
        splash.style.opacity = '0';
        setTimeout(() => splash.classList.add('hidden'), 500);
    },

    handleLogin: async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, 
                document.getElementById('login-email').value,
                document.getElementById('login-password').value
            );
        } catch (err) { alert("Error: " + err.message); }
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
            
            // Crear perfil
            await setDoc(doc(db, "users", cred.user.uid), {
                name: document.getElementById('reg-name').value,
                role: 'athlete',
                approved: false, // Requiere aprobación
                stats: { weight: [], muscle: {} }
            });
        } catch (err) { alert("Error registro: " + err.message); }
    }
};

// --- LOGICA DASHBOARD ---
const dashboard = {
    render: async () => {
        if(!state.profile.approved && state.profile.role !== 'admin') {
            document.getElementById('pending-approval').classList.remove('hidden');
        }

        const container = document.getElementById('routines-list');
        container.innerHTML = '';

        // Simular carga de rutinas (en prod leer de Firestore)
        TEMPLATE_ROUTINES.forEach((r, idx) => {
            const card = document.createElement('div');
            card.className = 'exercise-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between">
                    <h3>${r.name}</h3>
                    <i class="material-icons-round" style="color:var(--neon-green)">fitness_center</i>
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
                return { ...info, sets: [] }; // Sets vacíos
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
        container.innerHTML = '';
        
        state.activeWorkout.exercises.forEach((ex, exIdx) => {
            const div = document.createElement('div');
            div.className = 'exercise-card';
            
            // Header Ejercicio
            let html = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px">
                    <img src="assets/muscles/${ex.img || 'cuadriceps.png'}" width="40" style="border-radius:4px">
                    <div>
                        <h3 style="font-size:16px; margin:0">${ex.n}</h3>
                        <small style="color:var(--neon-green)">${ex.m}</small>
                    </div>
                    ${ex.v ? `<a href="${ex.v}" target="_blank" style="margin-left:auto; color:white"><i class="material-icons-round">videocam</i></a>` : ''}
                </div>
                <div id="sets-list-${exIdx}"></div>
                <button class="btn-text" style="width:100%; margin-top:10px; border:1px dashed #333" onclick="workoutManager.addSet(${exIdx})">+ AÑADIR SERIE</button>
            `;
            div.innerHTML = html;
            container.appendChild(div);
            
            // Render Sets
            workoutManager.renderSets(exIdx);
        });
        
        // Auto-scroll al último ejercicio si estamos reanudando
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
    },

    renderSets: (exIdx) => {
        const list = document.getElementById(`sets-list-${exIdx}`);
        const ex = state.activeWorkout.exercises[exIdx];
        
        // Si no hay sets, añadir uno por defecto
        if(ex.sets.length === 0) workoutManager.addSet(exIdx, false);

        list.innerHTML = ex.sets.map((set, sIdx) => `
            <div class="set-row ${set.done ? 'set-completed' : ''}">
                <span style="color:#555">#${sIdx+1}</span>
                <span style="font-size:10px; color:#555">Prev: 100kg</span>
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
        
        // Si completa, lanzar timer
        if(set.done) {
            // Sonido éxito
            state.sounds.beep.play().catch(()=>{}); 
            workoutManager.startRest(90); // 90 seg por defecto
        }
        
        workoutManager.saveLocal();
        workoutManager.renderSets(exIdx);
    },

    // --- TIMERS ---
    startRest: (sec) => {
        const modal = document.getElementById('rest-modal');
        const display = document.getElementById('rest-countdown');
        modal.classList.remove('hidden');
        
        let remaining = sec;
        
        if(state.restTimer) clearInterval(state.restTimer);
        
        state.restTimer = setInterval(() => {
            remaining--;
            const m = Math.floor(remaining/60).toString().padStart(2,'0');
            const s = (remaining%60).toString().padStart(2,'0');
            display.innerText = `${m}:${s}`;
            
            if(remaining <= 0) {
                state.sounds.beep.play();
                navigator.vibrate([200,100,200]);
                workoutManager.stopRest();
            }
        }, 1000);
    },

    stopRest: () => {
        clearInterval(state.restTimer);
        document.getElementById('rest-modal').classList.add('hidden');
    },

    adjustRest: (amount) => {
        // En una implementación real, ajustaríamos la variable 'remaining' dentro del intervalo
        // Para simplificar, reiniciamos visualmente aquí
        alert("Ajuste de tiempo no implementado en demo");
    },

    startGlobalTimer: () => {
        setInterval(() => {
            if(!state.activeWorkout) return;
            const diff = Math.floor((Date.now() - state.activeWorkout.startTime) / 1000);
            const m = Math.floor(diff/60).toString().padStart(2,'0');
            const s = (diff%60).toString().padStart(2,'0');
            document.getElementById('global-timer').innerText = `${m}:${s}`;
        }, 1000);
    },

    finishWorkout: async () => {
        if(!confirm("¿Terminar entrenamiento?")) return;
        
        // Guardar en Firestore
        try {
            await addDoc(collection(db, "workouts"), {
                userId: state.user.uid,
                date: new Date(),
                data: state.activeWorkout,
                rpe: document.getElementById('workout-rpe').value,
                notes: document.getElementById('workout-notes').value
            });
            
            localStorage.removeItem(`bcn_workout_${state.user.uid}`);
            state.activeWorkout = null;
            app.navTo('dashboard');
            alert("¡Entreno guardado, bestia!");
        } catch(e) { console.error(e); alert("Error al guardar"); }
    },

    saveLocal: () => {
        localStorage.setItem(`bcn_workout_${state.user.uid}`, JSON.stringify(state.activeWorkout));
    }
};

// --- PERFIL ---
const profile = {
    render: () => {
        document.getElementById('profile-name').innerText = state.profile.name;
        document.getElementById('profile-initials').innerText = state.profile.name.substring(0,2).toUpperCase();
        
        // Render Chart Peso
        new Chart(document.getElementById('weightChart'), {
            type: 'line',
            data: {
                labels: ['Ene', 'Feb', 'Mar'],
                datasets: [{
                    label: 'Peso',
                    data: [80, 79, 78.5],
                    borderColor: '#39ff14',
                    tension: 0.4
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: { y: { grid: { color: '#333' } }, x: { grid: { color: '#333' } } }
            }
        });
        
        // Render Radar
        new Chart(document.getElementById('radarChart'), {
            type: 'radar',
            data: {
                labels: ['Pecho', 'Espalda', 'Pierna', 'Brazos', 'Hombro'],
                datasets: [{
                    label: 'Volumen Semanal',
                    data: [12, 15, 20, 8, 10],
                    backgroundColor: 'rgba(57, 255, 20, 0.2)',
                    borderColor: '#39ff14',
                    pointBackgroundColor: '#fff'
                }]
            },
            options: {
                scales: { r: { grid: { color: '#333' }, angleLines: { color: '#333' } } }
            }
        });
    }
};

// Exportar al window para HTML events
window.app = app;
window.workoutManager = workoutManager;

// Start
app.init();
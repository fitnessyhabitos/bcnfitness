import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, updateDoc, arrayUnion, query, getDocs, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { EXERCISES } from './data.js';

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
    newRoutine: [], sounds: { beep: document.getElementById('timer-beep') }, 
    currentClientId: null, wakeLock: null, editingRoutineId: null, swRegistration: null 
};

const normalizeText = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const app = {
    init: () => {
        // Registro de Service Worker para notificaciones estables
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(reg => state.swRegistration = reg);
        }

        setTimeout(() => { const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none'; }, 4000);
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.user = user;
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if(docSnap.exists()) {
                    state.profile = docSnap.data();
                    if(!state.profile.settings) state.profile.settings = { weeklyGoal: 3, restTime: 60, modules: { pliegues: false, medidas: false } };
                    app.handleLoginSuccess();
                } else { signOut(auth); }
            } else { app.navTo('login'); }
        });
        
        document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); app.login(); };
        document.getElementById('exercise-search').addEventListener('input', (e) => admin.searchExercises(e.target.value));
    },
    login: async () => { try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(e) { alert(e.message); } },
    handleLoginSuccess: () => {
        if(state.profile.role === 'admin' || state.profile.role === 'coach') document.getElementById('admin-btn').classList.remove('hidden');
        app.navTo('dashboard');
    },
    navTo: (viewId) => {
        document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
        document.getElementById('view-'+viewId).classList.replace('hidden', 'active');
        document.getElementById('app-header').classList.toggle('hidden', ['login', 'register'].includes(viewId));
        document.getElementById('bottom-nav').classList.toggle('hidden', ['login', 'register', 'workout'].includes(viewId));
        if(viewId === 'dashboard') dashboard.render();
        if(viewId === 'profile') profile.render();
    },
    showHelp: (type) => {
        const modal = document.getElementById('help-modal');
        document.getElementById('help-img').src = type === 'pliegues' ? 'pliegues.png' : 'medidas.jpg';
        modal.classList.remove('hidden');
    }
};

const admin = {
    searchExercises: (term) => {
        const container = document.getElementById('search-results-container');
        container.innerHTML = ''; container.classList.remove('hidden');
        const results = EXERCISES.filter(e => normalizeText(e.n).includes(normalizeText(term))).slice(0, 10);
        results.forEach(ex => {
            const div = document.createElement('div'); div.className = 'search-result-item';
            div.innerHTML = `<img src="assets/muscles/${ex.img}"><span>${ex.n}</span>`;
            div.onclick = () => { admin.addEx(EXERCISES.indexOf(ex)); container.classList.add('hidden'); };
            container.appendChild(div);
        });
    },
    addEx: (idx) => {
        state.newRoutine.push({ ...EXERCISES[idx], sets: Array(5).fill({ reps: 12, kg: '' }) });
        admin.renderPreview();
    },
    renderPreview: () => {
        document.getElementById('admin-routine-preview').innerHTML = state.newRoutine.map((ex, i) => `
            <div class="routine-edit-row">
                <div class="routine-edit-header"><strong>${ex.n}</strong><span onclick="admin.remove(${i})">x</span></div>
                <div class="sets-editor-row" style="display:flex; gap:5px; overflow-x:auto">
                    ${ex.sets.map((s, si) => `<input type="number" value="${s.reps}" onchange="admin.updateReps(${i},${si},this.value)" style="width:40px; text-align:center">`).join('')}
                    <button onclick="admin.modSets(${i}, 1)">+</button>
                </div>
            </div>`).join('');
    },
    updateReps: (ei, si, val) => { state.newRoutine[ei].sets[si].reps = parseInt(val); },
    modSets: (ei, delta) => {
        if(delta > 0) state.newRoutine[ei].sets.push({reps:12, kg:''});
        else if(state.newRoutine[ei].sets.length > 1) state.newRoutine[ei].sets.pop();
        admin.renderPreview();
    },
    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value;
        const client = document.getElementById('assign-client-select').value;
        await addDoc(collection(db, "routines"), { name, assignedTo: client, exercises: state.newRoutine, createdAt: new Date() });
        alert("Guardada"); state.newRoutine = []; admin.renderPreview();
    },
    updateModules: async (mod, val) => {
        await updateDoc(doc(db, "users", state.currentClientId), { [`settings.modules.${mod}`]: val });
    }
};

const workoutManager = {
    startRest: (sec) => {
        document.getElementById('rest-modal').classList.remove('hidden');
        let left = sec;
        const timer = document.getElementById('rest-countdown');
        state.restTimer = setInterval(() => {
            left--; timer.innerText = left;
            if(left <= 0) {
                clearInterval(state.restTimer);
                document.getElementById('rest-modal').classList.add('hidden');
                state.sounds.beep.play();
                if(state.swRegistration) state.swRegistration.active.postMessage({type:'REST_FINISHED'});
            }
        }, 1000);
    },
    confirmFinish: async (rpe) => {
        const notes = document.getElementById('final-notes').value;
        await addDoc(collection(db, "workouts"), { userId: state.user.uid, rpe, notes, date: new Date(), data: state.activeWorkout });
        document.getElementById('finish-modal').classList.add('hidden');
        app.navTo('dashboard');
    }
};

const profile = {
    switchTab: (tab) => {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById('tab-' + tab).classList.remove('hidden');
    }
    // ... Resto de funciones originales de tu V27 para charts y stats
};

window.app = app; window.admin = admin; window.workoutManager = workoutManager; window.profile = profile;
app.init();

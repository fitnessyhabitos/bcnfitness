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
    user: null, profile: null, activeWorkout: null, lastWorkoutData: null, 
    restTimer: null, newRoutine: [], sounds: { beep: document.getElementById('timer-beep') }, 
    currentClientId: null, wakeLock: null, editingRoutineId: null, allClients: [],
    swRegistration: null 
};

const normalizeText = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const app = {
    init: () => {
        // Registro Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(reg => { state.swRegistration = reg; });
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
            } else {
                app.navTo('login');
                const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none';
            }
        });
        // Listeners originales
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); app.login(); };
        
        const searchInput = document.getElementById('exercise-search');
        if(searchInput) {
            searchInput.addEventListener('input', (e) => admin.searchExercises(e.target.value));
        }
    },
    login: async () => { try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(e) { alert(e.message); } },
    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if(state.profile.role === 'admin' || state.profile.role === 'coach') { adminBtn.classList.remove('hidden'); admin.loadUsers(); }
        const saved = localStorage.getItem(`bcn_workout_${state.user.uid}`);
        if(saved) workoutManager.resumeWorkout(JSON.parse(saved)); else { app.navTo('dashboard'); dashboard.render(); }
    },
    navTo: (viewId) => {
        document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
        const target = document.getElementById('view-'+viewId);
        if(target) { target.classList.remove('hidden'); target.classList.add('active'); }
        const isAuth = ['login', 'register'].includes(viewId);
        document.getElementById('app-header').classList.toggle('hidden', isAuth);
        document.getElementById('bottom-nav').classList.toggle('hidden', isAuth || viewId === 'workout');
        if(viewId === 'dashboard') dashboard.render();
        if(viewId === 'profile') profile.render();
        if(viewId === 'admin') admin.refreshAll();
    },
    showHelp: (type) => {
        const modal = document.getElementById('help-modal');
        document.getElementById('help-img').src = type === 'pliegues' ? 'pliegues.png' : 'medidas.jpg';
        modal.classList.remove('hidden');
    }
};

const admin = {
    refreshAll: () => { admin.loadUsers(); admin.renderExistingRoutines(); },
    searchExercises: (term) => {
        const container = document.getElementById('search-results-container');
        if(!container) return; container.innerHTML = ''; container.classList.remove('hidden');
        const results = EXERCISES.filter(e => normalizeText(e.n).includes(normalizeText(term))).slice(0, 15);
        results.forEach((ex) => {
            const div = document.createElement('div'); div.className = 'search-result-item';
            div.innerHTML = `<img src="assets/muscles/${ex.img}"><span>${ex.n}</span>`;
            div.onclick = () => { admin.addExerciseToRoutine(EXERCISES.indexOf(ex)); container.classList.add('hidden'); };
            container.appendChild(div);
        });
    },
    addExerciseToRoutine: (idx) => { 
        state.newRoutine.push({...EXERCISES[idx], sets: Array(5).fill({reps: 12, kg: ''})}); 
        admin.renderPreview(); 
    },
    renderPreview: () => { 
        const div = document.getElementById('admin-routine-preview');
        div.innerHTML = state.newRoutine.map((e, exIdx) => `
            <div class="routine-edit-row">
                <div class="routine-edit-header">
                    <strong>${e.n}</strong>
                    <span onclick="window.admin.removeEx(${exIdx})" style="color:red">x</span>
                </div>
                <div class="edit-sets-grid">
                    ${e.sets.map((s, si) => `<input type="number" value="${s.reps}" onchange="admin.updateReps(${exIdx},${si},this.value)">`).join('')}
                    <button onclick="admin.modSetCount(${exIdx}, 1)">+</button>
                </div>
            </div>`).join(''); 
    },
    updateReps: (ei, si, val) => { state.newRoutine[ei].sets[si].reps = parseInt(val); },
    modSetCount: (ei, delta) => {
        if(delta > 0) state.newRoutine[ei].sets.push({reps:12, kg:''});
        else if(state.newRoutine[ei].sets.length > 1) state.newRoutine[ei].sets.pop();
        admin.renderPreview();
    },
    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value;
        const client = document.getElementById('assign-client-select').value;
        if(!name || !client) return alert("Faltan datos");
        await addDoc(collection(db, "routines"), { name, assignedTo: client, exercises: state.newRoutine, createdAt: new Date() });
        alert("Guardado"); admin.refreshAll();
    },
    loadUsers: async () => {
        const snap = await getDocs(collection(db, "users"));
        state.allClients = [];
        const list = document.getElementById('admin-users-list'); list.innerHTML = '';
        const select = document.getElementById('assign-client-select'); select.innerHTML = '<option disabled selected>Elegir...</option>';
        snap.forEach(d => {
            const u = d.data(); state.allClients.push({id: d.id, ...u});
            list.innerHTML += `<div class="user-row" onclick="admin.viewClient('${d.id}')"><span>${u.name}</span></div>`;
            select.innerHTML += `<option value="${d.id}">${u.name}</option>`;
        });
    },
    viewClient: async (uid) => {
        state.currentClientId = uid;
        const u = state.allClients.find(c => c.id === uid);
        document.getElementById('client-detail-name').innerText = u.name;
        document.getElementById('toggle-jp7').checked = u.settings?.modules?.pliegues || false;
        document.getElementById('toggle-medidas').checked = u.settings?.modules?.medidas || false;
        app.navTo('client-detail');
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
                state.sounds.beep.play().catch(()=>{});
                if(state.swRegistration) state.swRegistration.active.postMessage({type:'REST_FINISHED'});
            }
        }, 1000);
    },
    openFinishModal: () => document.getElementById('finish-modal').classList.remove('hidden'),
    confirmFinish: async (rpe) => {
        const notes = document.getElementById('final-notes').value;
        await addDoc(collection(db, "workouts"), { userId: state.user.uid, rpe, notes, date: new Date(), data: state.activeWorkout });
        localStorage.removeItem(`bcn_workout_${state.user.uid}`);
        document.getElementById('finish-modal').classList.add('hidden');
        app.navTo('dashboard');
    }
};

const dashboard = {
    render: async () => {
        const div = document.getElementById('routines-list'); div.innerHTML = 'Cargando...';
        const q = query(collection(db, "routines"), where("assignedTo", "==", state.user.uid));
        const snap = await getDocs(q); div.innerHTML = '';
        snap.forEach(d => {
            const r = d.data();
            div.innerHTML += `<div class="exercise-card" onclick="workoutManager.start('${d.id}')"><h3>${r.name}</h3></div>`;
        });
    }
};

window.app = app; window.admin = admin; window.workoutManager = workoutManager; window.dashboard = dashboard; window.profile = { render: () => {} };
app.init();

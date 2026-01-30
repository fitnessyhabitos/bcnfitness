import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, updateDoc, arrayUnion, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
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
    user: null, profile: null, activeWorkout: null, 
    newRoutine: [], currentClientId: null, swRegistration: null,
    sounds: { beep: document.getElementById('timer-beep') } 
};

const app = {
    init: () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(reg => state.swRegistration = reg);
        }
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.user = user;
                const docSnap = await getDoc(doc(db, "users", user.uid));
                state.profile = docSnap.data();
                app.handleLoginSuccess();
            } else { app.navTo('login'); }
        });
        document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); app.login(); };
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        
        // Buscador de ejercicios mejorado
        const search = document.getElementById('exercise-search');
        if(search) search.oninput = (e) => admin.searchExercises(e.target.value);
    },
    login: async () => {
        try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); }
        catch(e) { alert("Error de acceso"); }
    },
    handleLoginSuccess: () => {
        if(state.profile.role === 'coach' || state.profile.role === 'admin') document.getElementById('admin-btn').classList.remove('hidden');
        app.navTo('dashboard');
        document.getElementById('splash-screen').style.display = 'none';
    },
    navTo: (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById('view-' + viewId).classList.remove('hidden');
        document.getElementById('app-header').classList.toggle('hidden', viewId === 'login');
        document.getElementById('bottom-nav').classList.toggle('hidden', ['login', 'workout'].includes(viewId));
        if(viewId === 'admin') admin.loadUsers();
        if(viewId === 'dashboard') dashboard.render();
        if(viewId === 'profile') profile.render();
    }
};

const admin = {
    searchExercises: (term) => {
        const results = EXERCISES.filter(ex => ex.n.toLowerCase().includes(term.toLowerCase())).slice(0, 8);
        const container = document.getElementById('search-results-container');
        container.innerHTML = results.map(ex => `<div class="search-item" onclick="admin.addEx(${EXERCISES.indexOf(ex)})"><span>${ex.n}</span></div>`).join('');
        container.classList.remove('hidden');
    },
    addEx: (idx) => {
        state.newRoutine.push({ ...EXERCISES[idx], sets: Array(5).fill({ reps: 12, kg: 0 }) });
        admin.renderPreview();
        document.getElementById('search-results-container').classList.add('hidden');
    },
    renderPreview: () => {
        document.getElementById('admin-routine-preview').innerHTML = state.newRoutine.map((ex, i) => `
            <div class="exercise-card">
                <strong>${ex.n}</strong>
                <div class="sets-editor">
                    ${ex.sets.map((s, si) => `<input type="number" value="${s.reps}" onchange="admin.updateReps(${i},${si},this.value)">`).join('')}
                </div>
            </div>`).join('');
    },
    updateReps: (ei, si, val) => { state.newRoutine[ei].sets[si].reps = parseInt(val); },
    saveRoutine: async () => {
        const name = document.getElementById('new-routine-name').value;
        const client = document.getElementById('assign-client-select').value;
        if(!name || !client) return alert("Faltan datos");
        await addDoc(collection(db, "routines"), { name, assignedTo: client, exercises: state.newRoutine, createdAt: new Date() });
        alert("Plan guardado");
        state.newRoutine = []; admin.renderPreview();
    },
    loadUsers: async () => {
        const snap = await getDocs(collection(db, "users"));
        const list = document.getElementById('admin-users-list'); list.innerHTML = '';
        const select = document.getElementById('assign-client-select'); select.innerHTML = '';
        snap.forEach(d => {
            const u = d.data();
            list.innerHTML += `<div class="user-row" onclick="admin.viewClient('${d.id}')"><span>${u.name}</span> <i class="material-icons-round">chevron_right</i></div>`;
            select.innerHTML += `<option value="${d.id}">${u.name}</option>`;
        });
    },
    viewClient: (uid) => { state.currentClientId = uid; app.navTo('client-detail'); },
    updateModules: async (mod, val) => { await updateDoc(doc(db, "users", state.currentClientId), { [`settings.modules.${mod}`]: val }); }
};

const workoutManager = {
    openFinishModal: () => document.getElementById('finish-modal').classList.remove('hidden'),
    confirmFinish: async (rpe) => {
        const notes = document.getElementById('final-notes').value;
        await addDoc(collection(db, "workouts"), { userId: state.user.uid, rpe, notes, date: new Date(), data: state.activeWorkout });
        document.getElementById('finish-modal').classList.add('hidden');
        app.navTo('dashboard');
    },
    startRest: (sec) => {
        const modal = document.getElementById('rest-modal');
        const timer = document.getElementById('rest-countdown');
        modal.classList.remove('hidden');
        let left = sec;
        const tick = setInterval(() => {
            left--; timer.innerText = left;
            if(left <= 0) {
                clearInterval(tick);
                modal.classList.add('hidden');
                state.sounds.beep.play();
                if(state.swRegistration) state.swRegistration.active.postMessage({ type: 'REST_FINISHED' });
            }
        }, 1000);
    }
};

window.app = app; window.admin = admin; window.workoutManager = workoutManager;
app.init();

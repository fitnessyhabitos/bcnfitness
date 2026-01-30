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

const state = { user: null, profile: null, activeWorkout: null, lastWorkoutData: null, restTimer: null, newRoutine: [], sounds: { beep: document.getElementById('timer-beep') }, currentClientId: null, wakeLock: null };

const app = {
    init: () => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.user = user;
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if(docSnap.exists()) {
                    state.profile = docSnap.data();
                    app.handleLoginSuccess();
                } else { signOut(auth); }
            } else {
                app.navTo('login');
                document.getElementById('splash-screen').style.display = 'none';
            }
        });
        // Notificaciones Push Registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(console.error);
        }
    },
    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if(state.profile.role === 'admin' || state.profile.role === 'coach') adminBtn.classList.remove('hidden');
        app.navTo('dashboard');
        document.getElementById('splash-screen').style.display = 'none';
    },
    navTo: (viewId) => {
        document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
        document.getElementById('view-'+viewId).classList.remove('hidden', 'active');
        document.getElementById('view-'+viewId).classList.add('active');
        const isAuth = ['login', 'register'].includes(viewId);
        document.getElementById('app-header').classList.toggle('hidden', isAuth);
        document.getElementById('bottom-nav').classList.toggle('hidden', isAuth || viewId === 'workout');
        if(viewId === 'dashboard') dashboard.render();
        if(viewId === 'profile') profile.render();
        if(viewId === 'admin') admin.refreshAll();
    },
    showToast: (msg, type='normal') => {
        const div = document.createElement('div'); div.className = `toast ${type}`;
        div.innerHTML = `<span>${type==='gold'?'🏆':'✅'}</span> ${msg}`;
        document.getElementById('toast-container').appendChild(div); setTimeout(()=>div.remove(), 3000);
    }
};

const admin = {
    refreshAll: () => { admin.loadUsers(); admin.renderExistingRoutines(); },
    updateTrackingConfig: async (field, value) => {
        if(!state.currentClientId) return;
        await updateDoc(doc(db, "users", state.currentClientId), { [`settings.${field}`]: value });
        app.showToast("Seguimiento actualizado");
    },
    loadUsers: async () => {
        const div = document.getElementById('admin-users-list'); div.innerHTML = 'Cargando...';
        const snap = await getDocs(collection(db, "users"));
        div.innerHTML = '';
        snap.forEach(d => {
            const u = d.data();
            div.innerHTML += `<div class="user-row" onclick="window.admin.viewClient('${d.id}')">
                <img src="${u.photoURL||'https://placehold.co/100/39ff14'}" class="user-avatar-small">
                <div class="user-info"><h5>${u.name}</h5><span>${u.clientType||'Cliente'}</span></div>
            </div>`;
        });
    },
    viewClient: async (uid) => {
        state.currentClientId = uid;
        const userSnap = await getDoc(doc(db, "users", uid));
        const user = userSnap.data();
        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('toggle-jp7').checked = user.settings?.showJP7 || false;
        document.getElementById('toggle-measures').checked = user.settings?.showMeasures || false;
        document.getElementById('client-jp7-charts').classList.toggle('hidden', !user.settings?.showJP7);
        app.navTo('client-detail');
    },
    // ... Restaurar aquí todas las funciones de admin.saveRoutine, admin.editRoutine, admin.deleteUser de tu V1 ...
};

const profile = {
    render: () => {
        document.getElementById('profile-name').innerText = state.profile.name;
        document.getElementById('section-jp7').classList.toggle('hidden', !state.profile.settings?.showJP7);
        document.getElementById('section-measures').classList.toggle('hidden', !state.profile.settings?.showMeasures);
        profile.calculateGlobalStats();
        profile.renderCharts();
    },
    saveJP7: async () => {
        const data = { date: new Date(), pecho: document.getElementById('jp7-pecho').value, axila: document.getElementById('jp7-axila').value, triceps: document.getElementById('jp7-triceps').value, subes: document.getElementById('jp7-subes').value, abdo: document.getElementById('jp7-abdo').value, supra: document.getElementById('jp7-supra').value, muslo: document.getElementById('jp7-muslo').value };
        await updateDoc(doc(db, "users", state.user.uid), { jp7History: arrayUnion(data) });
        app.showToast("Pliegues guardados", "gold");
    },
    saveMeasures: async () => {
        const data = { date: new Date(), cuello: document.getElementById('m-cuello').value, hombro: document.getElementById('m-hombro').value, brazo: document.getElementById('m-brazo').value, cintura: document.getElementById('m-cintura').value };
        await updateDoc(doc(db, "users", state.user.uid), { measuresHistory: arrayUnion(data) });
        app.showToast("Medidas guardadas", "gold");
    },
    showHelp: (type) => {
        document.getElementById('help-title').innerText = type === 'jp7' ? "Medición Pliegues" : "Medición Perímetros";
        document.getElementById('help-modal').classList.remove('hidden');
    },
    requestNotify: async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') app.showToast("Notificaciones OK");
    },
    testSound: () => {
        state.sounds.beep.play().catch(()=>{});
        if (Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification('BCN FITNESS', { body: 'Test de notificación forzada', vibrate: [200, 100, 200], tag: 'test' });
            });
        }
    },
    // ... Restaurar aquí profile.calculateGlobalStats, profile.saveStats, profile.uploadPhoto de tu V1 ...
};

// ... El resto de objetos Dashboard, WorkoutManager y ChartHelpers se mantienen IGUAL que en tu V1 enviada ...

window.app = app; window.admin = admin; window.profile = profile;
app.init();

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

const state = { user: null, profile: null, activeWorkout: null, lastWorkoutData: null, restTimer: null, currentClientId: null, sounds: { beep: document.getElementById('timer-beep') } };

const app = {
    init: () => {
        // Registro de Service Worker para Notificaciones Push en segundo plano
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(reg => console.log("SW OK")).catch(err => console.log("SW Error"));
        }

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
                const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none';
            }
        });

        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); app.login(); };
    },
    login: async () => { try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(e) { alert(e.message); } },
    handleLoginSuccess: () => {
        const adminBtn = document.getElementById('admin-btn');
        if(state.profile.role === 'admin' || state.profile.role === 'coach') { adminBtn.classList.remove('hidden'); admin.loadUsers(); } 
        app.navTo('dashboard');
        const spl = document.getElementById('splash-screen'); if(spl) spl.style.display = 'none';
    },
    navTo: (viewId) => {
        document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
        document.getElementById('view-'+viewId).classList.remove('hidden'); document.getElementById('view-'+viewId).classList.add('active');
        const isAuth = ['login', 'register'].includes(viewId);
        document.getElementById('app-header').classList.toggle('hidden', isAuth);
        document.getElementById('bottom-nav').classList.toggle('hidden', isAuth || viewId === 'workout');
        if(viewId === 'dashboard') dashboard.render();
        if(viewId === 'profile') profile.render();
    },
    showToast: (msg, type='normal') => {
        const div = document.createElement('div'); div.className = `toast ${type}`;
        div.innerHTML = `<span style="font-size:20px; margin-right:10px">${type==='gold'?'🏆':'✅'}</span> ${msg}`;
        document.getElementById('toast-container').appendChild(div); setTimeout(()=>div.remove(), 3000);
    }
};

const admin = {
    loadUsers: async () => {
        const div = document.getElementById('admin-users-list'); div.innerHTML = 'Cargando...';
        const snap = await getDocs(collection(db, "users"));
        div.innerHTML = '';
        snap.forEach(d => {
            const u = d.data();
            div.innerHTML += `<div class="user-row" onclick="window.admin.viewClient('${d.id}')">
                <img src="${u.photoURL||'https://placehold.co/100x100/333/39ff14?text=IMG'}" class="user-avatar-small">
                <div class="user-info"><h5>${u.name}</h5><span>${u.clientType||'Cliente'}</span></div>
            </div>`;
        });
    },
    updateTrackingConfig: async (field, value) => {
        if(!state.currentClientId) return;
        await updateDoc(doc(db, "users", state.currentClientId), { [`settings.${field}`]: value });
        app.showToast("Configuración actualizada");
    },
    viewClient: async (uid) => {
        state.currentClientId = uid;
        const uSnap = await getDoc(doc(db, "users", uid));
        const user = uSnap.data();
        document.getElementById('client-detail-name').innerText = user.name;
        document.getElementById('toggle-jp7').checked = user.settings?.showJP7 || false;
        document.getElementById('toggle-measures').checked = user.settings?.showMeasures || false;
        document.getElementById('client-jp7-charts').classList.toggle('hidden', !user.settings?.showJP7);
        app.navTo('client-detail');
    }
};

const profile = {
    render: () => {
        document.getElementById('profile-name').innerText = state.profile.name;
        document.getElementById('section-jp7').classList.toggle('hidden', !state.profile.settings?.showJP7);
        document.getElementById('section-measures').classList.toggle('hidden', !state.profile.settings?.showMeasures);
    },
    saveJP7: async () => {
        const fields = ['pecho','axila','triceps','subes','abdo','supra','muslo'];
        const data = { date: new Date() };
        fields.forEach(f => data[f] = document.getElementById(`jp7-${f}`).value);
        await updateDoc(doc(db, "users", state.user.uid), { jp7History: arrayUnion(data) });
        app.showToast("Pliegues guardados", "gold");
    },
    saveMeasures: async () => {
        const fields = ['cuello','hombro','pecho','brazo','cintura','cadera','muslo'];
        const data = { date: new Date() };
        fields.forEach(f => data[f] = document.getElementById(`m-${f}`).value);
        await updateDoc(doc(db, "users", state.user.uid), { measuresHistory: arrayUnion(data) });
        app.showToast("Medidas guardadas", "gold");
    },
    showHelp: (type) => {
        document.getElementById('help-title').innerText = type === 'jp7' ? "Guía JP7" : "Guía Medidas";
        document.getElementById('help-modal').classList.remove('hidden');
    },
    requestNotify: async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') app.showToast("Avisos activados");
    },
    testSound: () => {
        if(state.sounds.beep) state.sounds.beep.play();
        if (Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification('BCN FITNESS', {
                    body: '¡Notificaciones habilitadas!',
                    icon: 'logo.png',
                    vibrate: [200, 100, 200],
                    tag: 'test'
                });
            });
        }
    }
};

// ... Resto de objetos (dashboard, workoutManager) se mantienen iguales ...
window.app = app; window.admin = admin; window.profile = profile;
app.init();

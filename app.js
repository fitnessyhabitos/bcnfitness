/* Copia todo el contenido anterior y AÑADE O REEMPLAZA esto */

/* --- FOTO PERFIL ESFÉRICA --- */
.avatar-container {
    position: relative;
    width: 120px; height: 120px;
    margin: 0 auto 10px;
    border-radius: 50%;
    cursor: pointer; /* Manita al pasar por encima */
    overflow: hidden;
    border: 3px solid var(--neon-green);
    background: #222;
}
.profile-avatar {
    width: 100%; height: 100%;
    object-fit: cover;
}
.avatar-overlay {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center;
    opacity: 0;
    transition: opacity 0.3s;
}
.avatar-container:hover .avatar-overlay { opacity: 1; } /* Muestra cámara al tocar */
.avatar-overlay i { color: white; font-size: 30px; }

.role-badge {
    background: #333; color: var(--neon-green);
    padding: 4px 12px; border-radius: 20px;
    font-size: 12px; text-transform: uppercase; border: 1px solid var(--neon-green);
}

/* --- SEMÁFORO RPE --- */
.traffic-light-container {
    display: flex; gap: 10px; justify-content: center;
}
.traffic-btn {
    flex: 1;
    border: none;
    border-radius: 12px;
    padding: 15px 5px;
    color: black;
    font-weight: bold;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    cursor: pointer;
    transition: transform 0.1s;
}
.traffic-btn:active { transform: scale(0.95); }
.traffic-btn.green { background: #4cd964; }
.traffic-btn.orange { background: #ffcc00; }
.traffic-btn.red { background: #ff3b30; color: white; }
.traffic-btn i { font-size: 28px; }

/* --- CREADOR DE RUTINAS (Inputs pequeños) --- */
.routine-edit-row {
    background: #222; padding: 10px; margin-bottom: 5px; border-radius: 5px;
}
.routine-edit-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
}
.routine-mini-img { width: 30px; height: 30px; border-radius: 4px; background: #000; }
.routine-sets-inputs {
    display: flex; gap: 5px; overflow-x: auto; padding-bottom: 5px;
}
.mini-input {
    width: 40px; background: #333; border: 1px solid #444; color: white;
    text-align: center; padding: 5px; border-radius: 4px; font-size: 12px;
}

/* --- TABS PERFIL --- */
.profile-tabs {
    display: flex; justify-content: center; gap: 20px; margin-bottom: 20px; border-bottom: 1px solid #333;
}
.tab-btn {
    background: none; border: none; color: #888;
    padding: 10px 20px; cursor: pointer; font-size: 14px;
    border-bottom: 2px solid transparent;
}
.tab-btn.active { color: var(--neon-green); border-bottom-color: var(--neon-green); }

/* --- HISTORIAL --- */
.history-item {
    background: #1c1c1e; padding: 15px; border-radius: 8px; margin-bottom: 10px;
    border-left: 3px solid #666;
}
.history-date { font-size: 12px; color: #888; margin-bottom: 5px; }
.history-title { font-weight: bold; color: white; font-size: 16px; }
.history-meta { display: flex; gap: 10px; margin-top: 5px; font-size: 12px; }
.tag { background: #333; padding: 2px 6px; border-radius: 4px; color: #ccc; }
.tag.easy { color: #4cd964; border: 1px solid #4cd964; }
.tag.hard { color: #ff3b30; border: 1px solid #ff3b30; }

/* --- OTROS --- */
/* (Asegúrate de mantener todo el CSS anterior: .btn-primary, .modal-overlay, etc.) */

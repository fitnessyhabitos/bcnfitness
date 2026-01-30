self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : '¡Es hora de tu sesión!',
        icon: 'logo.png',
        vibrate: [200, 100, 200],
        tag: 'bcn-fitness-notif'
    };
    event.waitUntil(self.registration.showNotification('BCN FITNESS', options));
});

self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : { title: 'BCN FITNESS', body: '¡Es hora de tu serie!' };
    const options = {
        body: data.body,
        icon: 'logo.png',
        vibrate: [300, 100, 300],
        tag: 'workout-alert',
        renotify: true,
        requireInteraction: true
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});

self.addEventListener('message', event => {
  if (event.data.type === 'REST_FINISHED') {
    self.registration.showNotification('BCN Fitness', {
      body: '¡Descanso terminado! Siguiente serie.',
      icon: './logo.png',
      vibrate: [500, 200, 500],
      tag: 'rest-timer'
    });
  }
});

// Simple EventEmitter for broadcasting restaurant switch events across tabs
// Each tab listens for 'switch' event to reset state and reload data

class RestaurantEventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    // Return unsubscribe function for useEffect cleanup
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this.listeners[event] = (this.listeners[event] || []).filter(f => f !== fn);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(fn => {
      try {
        fn(data);
      } catch (e) {
        console.error(`RestaurantEvent listener error [${event}]:`, e);
      }
    });
  }
}

const restaurantEvents = new RestaurantEventEmitter();
export default restaurantEvents;

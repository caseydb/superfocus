// Global singleton pulse ticker that all ActiveWorkers components share
class GlobalPulseTicker {
  private static instance: GlobalPulseTicker | null = null;
  private listeners: Set<(opacity: number) => void> = new Set();
  private animationFrame: number | null = null;
  private currentOpacity: number = 1;
  private lastLogTime: number = 0;

  private constructor() {
    this.startTicker();
  }

  static getInstance(): GlobalPulseTicker {
    if (!GlobalPulseTicker.instance) {
      GlobalPulseTicker.instance = new GlobalPulseTicker();
    }
    return GlobalPulseTicker.instance;
  }

  private startTicker() {
    const updatePulse = () => {
      const now = Date.now();
      
      // CRITICAL: Use absolute time to ensure all browsers sync to the same cycle
      // We use Unix epoch time modulo 2000ms to get position in a 2-second cycle
      // This means at 12:00:00.000, 12:00:02.000, 12:00:04.000 etc, ALL browsers will be at position 0
      const cyclePosition = (now % 2000) / 2000;
      
      // Use cosine for smooth pulsing (opacity between 0.3 and 1)
      // At cycle position 0 and 1, opacity is at maximum (1.0)
      // At cycle position 0.5, opacity is at minimum (0.3)
      const opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(cyclePosition * Math.PI * 2));
      
      this.currentOpacity = opacity;
      
      
      // Notify all listeners
      this.listeners.forEach(listener => listener(opacity));
      
      this.animationFrame = requestAnimationFrame(updatePulse);
    };
    
    updatePulse();
  }

  subscribe(listener: (opacity: number) => void): () => void {
    this.listeners.add(listener);
    // Immediately send current opacity
    listener(this.currentOpacity);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  getCurrentOpacity(): number {
    return this.currentOpacity;
  }
}

export default GlobalPulseTicker;
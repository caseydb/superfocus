// Simple tracker for active audio elements to enable real-time volume changes
const activeAudio: Set<HTMLAudioElement> = new Set();

export function playAudio(path: string, volume: number): HTMLAudioElement {
  const audio = new Audio(path);
  audio.volume = Math.max(0, Math.min(1, volume || 0)); // Ensure volume is between 0 and 1
  
  // Track this audio element
  activeAudio.add(audio);
  
  // Remove from tracking when done
  audio.addEventListener('ended', () => {
    activeAudio.delete(audio);
  });
  
  audio.addEventListener('error', () => {
    activeAudio.delete(audio);
  });
  
  audio.play().catch(err => {
    console.error('Failed to play audio:', err);
    activeAudio.delete(audio);
  });
  
  return audio;
}

export function updateAllVolumes(newVolume: number) {
  const safeVolume = Math.max(0, Math.min(1, newVolume || 0));
  activeAudio.forEach(audio => {
    audio.volume = safeVolume;
  });
}

export function stopAllAudio() {
  activeAudio.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
  activeAudio.clear();
}
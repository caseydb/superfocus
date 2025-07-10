//Sounds

import React, { useEffect, useRef, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";

export default function Sounds({ roomId, localVolume = 0.2, currentUserId }: { roomId: string; localVolume?: number; currentUserId?: string }) {
  const completeRef = useRef<HTMLAudioElement>(null);
  const startedRef = useRef<HTMLAudioElement>(null);
  const quitRef = useRef<HTMLAudioElement>(null);
  const lastEventTimestamp = useRef<number>(0);
  const [audioInitialized, setAudioInitialized] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    const lastEventRef = ref(rtdb, `instances/${roomId}/lastEvent`);
    let firstRun = true;
    const handle = onValue(lastEventRef, (snap) => {
      if (firstRun) {
        firstRun = false;
        return;
      }
      const val = snap.val();
      if (val && val.timestamp !== lastEventTimestamp.current) {
        lastEventTimestamp.current = val.timestamp;
        
        // Skip playing sound if this event is from the current user
        if (val.userId && val.userId === currentUserId) {
          return;
        }
        
        if (val.type === "complete" && completeRef.current) {
          completeRef.current.currentTime = 0;
          completeRef.current.play();
        } else if (val.type === "start" && startedRef.current) {
          startedRef.current.currentTime = 0;
          startedRef.current.play();
        } else if (val.type === "quit" && quitRef.current) {
          quitRef.current.currentTime = 0;
          quitRef.current.play();
        }
      }
    });
    return () => off(lastEventRef, "value", handle);
  }, [roomId, currentUserId]);

  useEffect(() => {
    if (completeRef.current) completeRef.current.volume = localVolume;
    if (startedRef.current) startedRef.current.volume = localVolume;
    if (quitRef.current) quitRef.current.volume = localVolume;
  }, [localVolume]);

  // Initialize audio on first user interaction to comply with browser autoplay policies
  useEffect(() => {
    if (audioInitialized) return;

    const initializeAudio = () => {
      // Play a silent sound to unlock audio context
      if (completeRef.current && startedRef.current && quitRef.current) {
        // Create a silent audio context to initialize
        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          const audioContext = new AudioContextClass();
          audioContext.resume();
        }
        
        // Play each audio element silently to initialize them
        [completeRef.current, startedRef.current, quitRef.current].forEach(audio => {
          audio.volume = 0;
          audio.play().then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = localVolume;
          }).catch(() => {
            // Ignore errors, browser might still block
          });
        });
        
        setAudioInitialized(true);
        // Remove the listener after initialization
        document.removeEventListener('click', initializeAudio);
        document.removeEventListener('keydown', initializeAudio);
      }
    };

    // Add listeners for first user interaction
    document.addEventListener('click', initializeAudio);
    document.addEventListener('keydown', initializeAudio);

    return () => {
      document.removeEventListener('click', initializeAudio);
      document.removeEventListener('keydown', initializeAudio);
    };
  }, [audioInitialized, localVolume]);

  return (
    <>
      <audio 
        ref={(el) => {
          completeRef.current = el;
          if (el) el.volume = localVolume;
        }} 
        src="/complete.mp3" 
        preload="auto" 
      />
      <audio 
        ref={(el) => {
          startedRef.current = el;
          if (el) el.volume = localVolume;
        }} 
        src="/started.mp3" 
        preload="auto" 
      />
      <audio 
        ref={(el) => {
          quitRef.current = el;
          if (el) el.volume = localVolume;
        }} 
        src="/quit.mp3" 
        preload="auto" 
      />
    </>
  );
}

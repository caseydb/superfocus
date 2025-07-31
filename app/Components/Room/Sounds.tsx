//Sounds

import React, { useEffect, useRef, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off, query, orderByChild, limitToLast } from "firebase/database";

export default function Sounds({ roomId, localVolume = 0.2, currentUserId }: { roomId: string; localVolume?: number; currentUserId?: string }) {
  const completeRef = useRef<HTMLAudioElement>(null);
  const startedRef = useRef<HTMLAudioElement>(null);
  const quitRef = useRef<HTMLAudioElement>(null);
  const lastEventTimestamp = useRef<number>(Date.now());  // Initialize to current time to ignore existing events
  const [audioInitialized, setAudioInitialized] = useState(false);


  useEffect(() => {
    if (!roomId) return;
    // Listen to GlobalEffects events for this room - only get recent events
    const eventsQuery = query(
      ref(rtdb, `GlobalEffects/${roomId}/events`),
      orderByChild('timestamp'),
      limitToLast(20) // Only fetch the 20 most recent events
    );
    
    const handle = onValue(eventsQuery, (snap) => {
      const events = snap.val();
      if (!events) return;
      
      // Find the most recent event
      const eventEntries = Object.entries(events as Record<string, { timestamp: number; type?: string; userId?: string; displayName?: string; duration?: number }>);
      if (eventEntries.length === 0) return;
      
      // Sort by timestamp to get the most recent
      const sortedEvents = eventEntries.sort((a, b) => 
        b[1].timestamp - a[1].timestamp
      );
      
      const [, mostRecentEvent] = sortedEvents[0];
      
      // Check if this is a new event we haven't processed
      if (mostRecentEvent.timestamp > lastEventTimestamp.current) {
        lastEventTimestamp.current = mostRecentEvent.timestamp;
        
        // Skip playing sound if this event is from the current user
        if (mostRecentEvent.userId === currentUserId) {
          return;
        }
        
        // Play the appropriate sound based on event type - no cooldowns or duration checks
        if (mostRecentEvent.type === "complete" && completeRef.current) {
          completeRef.current.currentTime = 0;
          completeRef.current.play();
        } else if (mostRecentEvent.type === "start" && startedRef.current) {
          startedRef.current.currentTime = 0;
          startedRef.current.play();
        } else if (mostRecentEvent.type === "quit" && quitRef.current) {
          quitRef.current.currentTime = 0;
          quitRef.current.play();
        }
      }
    });
    return () => off(eventsQuery, "value", handle);
  }, [roomId, currentUserId]);

  useEffect(() => {
    if (completeRef.current) completeRef.current.volume = localVolume;
    if (startedRef.current) startedRef.current.volume = localVolume;
    if (quitRef.current) quitRef.current.volume = localVolume;
  }, [localVolume]);

  // Initialize audio on first user interaction to comply with browser autoplay policies
  useEffect(() => {
    const initializeAudio = () => {
      if (audioInitialized) return;
      
      // Only create AudioContext after user interaction
      if (completeRef.current && startedRef.current && quitRef.current) {
        try {
          // Create and resume audio context to enable audio playback
          const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            const audioContext = new AudioContextClass();
            // Only resume if the context is suspended
            if (audioContext.state === 'suspended') {
              audioContext.resume();
            }
          }
          
          // Set volume for audio elements
          [completeRef.current, startedRef.current, quitRef.current].forEach(audio => {
            audio.volume = localVolume;
          });
          
          setAudioInitialized(true);
        } catch (error) {
          console.log('Audio initialization deferred:', error);
        }
      }
    };

    // Add listeners for first user interaction
    document.addEventListener('click', initializeAudio);
    document.addEventListener('keydown', initializeAudio);
    document.addEventListener('touchstart', initializeAudio);

    return () => {
      document.removeEventListener('click', initializeAudio);
      document.removeEventListener('keydown', initializeAudio);
      document.removeEventListener('touchstart', initializeAudio);
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

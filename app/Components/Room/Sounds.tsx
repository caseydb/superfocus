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
  const userStartCooldowns = useRef<Record<string, number>>({});  // Track last start sound time per user
  const COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes in milliseconds for start sounds
  const MIN_DURATION_MS = 5 * 60 * 1000;  // 5 minutes minimum for complete/quit sounds

  // Cleanup old cooldown entries to prevent memory leaks
  useEffect(() => {
    const cleanupCooldowns = () => {
      const cutoff = Date.now() - (6 * 60 * 1000); // 6 minutes (1 minute after cooldown expires)
      Object.keys(userStartCooldowns.current).forEach(userId => {
        if (userStartCooldowns.current[userId] < cutoff) {
          delete userStartCooldowns.current[userId];
        }
      });
    };

    // Run cleanup every minute
    const cleanupInterval = setInterval(cleanupCooldowns, 60000);
    
    return () => clearInterval(cleanupInterval);
  }, []);

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
        
        // Play the appropriate sound based on event type
        if (mostRecentEvent.type === "complete" && completeRef.current) {
          // Play complete sound only if task duration exceeds 10 seconds
          const duration = mostRecentEvent.duration || 0;
          if (duration * 1000 > MIN_DURATION_MS) {  // duration is in seconds, convert to ms
            completeRef.current.currentTime = 0;
            completeRef.current.play();
          }
        } else if (mostRecentEvent.type === "start" && startedRef.current && mostRecentEvent.userId) {
          // Check per-user cooldown for start sounds (5 minutes)
          const lastStartTime = userStartCooldowns.current[mostRecentEvent.userId] || 0;
          const timeSinceLastStart = mostRecentEvent.timestamp - lastStartTime;
          
          // Play start sound if first time for this user or 5+ minutes since their last start
          if (lastStartTime === 0 || timeSinceLastStart >= COOLDOWN_MS) {
            startedRef.current.currentTime = 0;
            startedRef.current.play();
            userStartCooldowns.current[mostRecentEvent.userId] = mostRecentEvent.timestamp;
          }
        } else if (mostRecentEvent.type === "quit" && quitRef.current) {
          // Play quit sound only if task duration exceeds 10 seconds
          const duration = mostRecentEvent.duration || 0;
          if (duration * 1000 > MIN_DURATION_MS) {  // duration is in seconds, convert to ms
            quitRef.current.currentTime = 0;
            quitRef.current.play();
          }
        }
      }
    });
    return () => off(eventsQuery, "value", handle);
  }, [roomId, currentUserId, COOLDOWN_MS, MIN_DURATION_MS]);

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
        
        // Set volume for audio elements without playing them
        [completeRef.current, startedRef.current, quitRef.current].forEach(audio => {
          audio.volume = localVolume;
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

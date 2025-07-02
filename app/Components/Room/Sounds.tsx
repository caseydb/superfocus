//Sounds

import React, { useEffect, useRef } from "react";
import { db } from "../../firebase";
import { ref, onValue, off } from "firebase/database";

export default function Sounds({ roomId }: { roomId: string }) {
  const completeRef = useRef<HTMLAudioElement>(null);
  const startedRef = useRef<HTMLAudioElement>(null);
  const quitRef = useRef<HTMLAudioElement>(null);
  const lastEventTimestamp = useRef<number>(0);

  useEffect(() => {
    if (!roomId) return;
    const lastEventRef = ref(db, `instances/${roomId}/lastEvent`);
    const handle = onValue(lastEventRef, (snap) => {
      const val = snap.val();
      if (val && val.timestamp !== lastEventTimestamp.current) {
        lastEventTimestamp.current = val.timestamp;
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
  }, [roomId]);

  useEffect(() => {
    if (completeRef.current) completeRef.current.volume = 0.2;
    if (startedRef.current) startedRef.current.volume = 0.2;
    if (quitRef.current) quitRef.current.volume = 0.2;
  }, []);

  return (
    <>
      <audio ref={completeRef} src="/complete.mp3" preload="auto" />
      <audio ref={startedRef} src="/started.mp3" preload="auto" />
      <audio ref={quitRef} src="/quit.mp3" preload="auto" />
    </>
  );
}

//Sounds

import React, { useEffect, useRef } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";

export default function Sounds({ roomId, localVolume = 0.2 }: { roomId: string; localVolume?: number }) {
  const completeRef = useRef<HTMLAudioElement>(null);
  const startedRef = useRef<HTMLAudioElement>(null);
  const quitRef = useRef<HTMLAudioElement>(null);
  const lastEventTimestamp = useRef<number>(0);

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
    if (completeRef.current) completeRef.current.volume = localVolume;
    if (startedRef.current) startedRef.current.volume = localVolume;
    if (quitRef.current) quitRef.current.volume = localVolume;
  }, [localVolume]);

  return (
    <>
      <audio ref={completeRef} src="/complete.mp3" preload="auto" />
      <audio ref={startedRef} src="/started.mp3" preload="auto" />
      <audio ref={quitRef} src="/quit.mp3" preload="auto" />
    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import { NexusCore } from "./NexusCore";
export function SystemHeader({ onVoice }: { onVoice: () => void }) {
  const [clock,setClock] = useState("");
  useEffect(() => {
    const tick=()=>setClock(new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}));
    tick(); const timer=setInterval(tick,60000); return ()=>clearInterval(timer);
  },[]);
  return <header className="nexus-system-header mb-6 flex items-center justify-between gap-3 border-b border-nexus-border pb-4">
    <button onClick={onVoice} aria-label="Abrir asistente Nexus" className="flex min-h-11 items-center gap-2 sm:hidden"><NexusCore size={30}/><span className="font-mono text-sm tracking-[0.2em]">NEXUS</span></button>
    <p className="hud-label hidden text-nexus-muted sm:block">Tu espacio personal <span className="mx-3 text-nexus-cyan/50">/</span> Centro de control</p>
    <div className="flex items-center gap-3"><span className="hud-label hidden text-nexus-muted min-[380px]:block">Hora local</span><time className="font-mono text-sm tabular-nums text-nexus-cyan">{clock || "—:—"}</time></div>
  </header>;
}

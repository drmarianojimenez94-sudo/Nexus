"use client";

import { useEffect, useRef, useState } from "react";
import { isVoiceMuted } from "@/lib/voice";
import { NexusFace, type FaceState } from "./NexusFace";
import { useSpeech } from "@/lib/useSpeech";

interface Step {
  face: FaceState;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    face: "speaking",
    title: "Soy Nexus, tu secretario",
    body: "Te ayudo con los pacientes, la agenda, los mails y tus pendientes. Es un recorrido de un minuto y no lo volvés a ver.",
  },
  {
    face: "listening",
    title: "Un solo botón: el micrófono",
    body: "En cualquier pantalla tocá el botón grande «Dictar», hablá tranquilo (las pausas no cortan) y tocá «Listo» al terminar. Yo me encargo de ordenar lo que dijiste.",
  },
  {
    face: "idle",
    title: "Dictá la consulta y queda la ficha",
    body: "Decí «paciente nuevo…, motivo de consulta…, enfermedad actual…, tratamiento…, observaciones…». Te muestro la ficha armada para revisar y guardás con un toque. Mientras tanto te sugiero controles según las guías.",
  },
  {
    face: "action-required",
    title: "También soy tu secretario",
    body: "Pedime «agendame un turno el jueves a las 10», «poneme una alarma a las 6:30» o «mandale un mail a…». Lo agendo, te aviso o te preparo el mail para que lo confirmes.",
  },
  {
    face: "thinking",
    title: "Aprendo de vos",
    body: "Cada consulta que validás me enseña tu forma de trabajar. Lo ves y lo podés borrar en «🧠 Lo que aprendí». Nunca guardo ahí nombres ni documentos de pacientes.",
  },
];

export function OnboardingTour({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;
  const isLast = index === STEPS.length - 1;
  const { speak, ttsSupported } = useSpeech();

  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    next.current?.focus();
    if (ttsSupported && !isVoiceMuted()) void speak(step.body);
  }, [index]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") onFinish();
        // Foco atrapado en el recorrido: Tab alterna entre Omitir y Siguiente.
        if (e.key === "Tab") {
          const buttons = Array.from(e.currentTarget.querySelectorAll("button"));
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          e.preventDefault();
          buttons[(i + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
        }
      }}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-nexus-bg px-6 text-center"
    >
      <NexusFace state={step.face} size={88} />

      <div className="max-w-sm">
        <h2 id="onboarding-title" className="mb-2 text-xl font-semibold">{step.title}</h2>
        <p className="text-sm text-nexus-muted">{step.body}</p>
      </div>

      <div className="flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-nexus-cyan" : "w-1.5 bg-nexus-border"
            }`}
          />
        ))}
      </div>

      <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <button onClick={onFinish} className="min-h-11 px-4 py-2 text-sm text-nexus-muted">
          Omitir
        </button>
        <button
          ref={next}
          onClick={() => (isLast ? onFinish() : setIndex((i) => i + 1))}
          className="min-h-11 flex-1 rounded-xl bg-nexus-cyan py-2 text-sm font-medium text-nexus-bg"
        >
          {isLast ? "Empezar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { NexusFace, type FaceState } from "./NexusFace";

interface Step {
  face: FaceState;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    face: "speaking",
    title: "Soy NEXUS",
    body: "Te ayudo a organizar tareas, proyectos, agenda y el resto de tu vida. Este es un recorrido rápido — un minuto, y no lo volvés a ver.",
  },
  {
    face: "listening",
    title: "Tocá mi cara para hablarme",
    body: "En cualquier pantalla, tocá el Face (abajo en el celular, arriba en la barra lateral) para abrir Captura Rápida. Escribí lo que se te ocurra, sin pensar dónde va — yo lo guardo.",
  },
  {
    face: "idle",
    title: "Today es tu pantalla principal",
    body: "Al abrir la app ves lo próximo (NOW), tus prioridades del día, la agenda y, si hay algo atrasado, una alerta clara — sin listas infinitas.",
  },
  {
    face: "action-required",
    title: "Inbox: capturá primero, ordená después",
    body: "Todo lo que no clasifiques al vuelo cae en Inbox. Desde ahí lo convertís en tarea o lo descartás cuando tengas un minuto.",
  },
  {
    face: "idle",
    title: "Calendar, Projects y Areas",
    body: "Calendar es tu agenda. Projects agrupa tareas por objetivo (como \"La Horda\" o \"Consultorio\"). Areas son las categorías grandes de tu vida — las que quieras, no vienen fijas.",
  },
  {
    face: "thinking",
    title: "Esto recién empieza",
    body: "Hoy podés escribir; hablar en voz alta y que NEXUS te entienda, recuerde y actúe por vos viene en la próxima etapa.",
  },
];

export function OnboardingTour({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;
  const isLast = index === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-nexus-bg px-6 text-center">
      <NexusFace state={step.face} size={88} />

      <div className="max-w-sm">
        <h2 className="mb-2 text-xl font-semibold">{step.title}</h2>
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
        <button onClick={onFinish} className="px-4 py-2 text-sm text-nexus-muted">
          Omitir
        </button>
        <button
          onClick={() => (isLast ? onFinish() : setIndex((i) => i + 1))}
          className="flex-1 rounded-xl bg-nexus-cyan py-2 text-sm font-medium text-nexus-bg"
        >
          {isLast ? "Empezar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}

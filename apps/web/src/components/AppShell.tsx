"use client";

import { PREFERENCE_KEYS } from "@nexus/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { flushOfflineQueue } from "@/lib/offlineQueue";
import { clinicalCaptureUrl } from "@/lib/dictationRouting";
import { usePreferences } from "@/lib/usePreferences";
import { BottomNav } from "./BottomNav";
import { NexusCore } from "./NexusCore";
import { SystemHeader } from "./SystemHeader";
import { OnboardingTour } from "./OnboardingTour";
import { Sidebar } from "./Sidebar";
import { VoiceSession } from "./VoiceSession";
import { GlobalMicButton } from "./GlobalMicButton";
import { ThemeController } from "./ThemeController";
import { SyncStatus } from "./SyncStatus";

/**
 * Deep link for the Siri Shortcut / home-screen quick action ("hablarle
 * al teléfono para abrirlo", spec §4): ?listen=1 opens straight into the
 * voice session instead of requiring a tap first. Isolated in its own
 * component because useSearchParams() forces whatever reads it into a
 * Suspense boundary during static prerendering — this way only this
 * sliver opts into that, not the whole shell.
 */
function ListenParam({ onListen }: { onListen: () => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("listen") === "1") onListen();
  }, [searchParams, onListen]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname() || "";
  const clinical = path.startsWith("/patients");
  const focusedDictation = clinical || path.startsWith("/projects");
  const [clinicalVoiceNotice, setClinicalVoiceNotice] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [voiceDocked, setVoiceDocked] = useState(false);
  const {
    preferences,
    setPreference,
    loading: preferencesLoading,
  } = usePreferences();
  const voiceOpened = useRef(false);
  const openVoice = useCallback(() => {
    if (clinical) {
      // En la parte clínica, el orbe lleva directo a dictar la consulta.
      router.push(clinicalCaptureUrl(path));
      return;
    }
    if (focusedDictation) {
      setClinicalVoiceNotice(true);
      return;
    }
    setCaptureOpen(true);
  }, [clinical, focusedDictation, path, router]);
  const closeVoice = useCallback(() => {
    setCaptureOpen(false);
    setVoiceDocked(false);
  }, []);

  useEffect(() => {
    if (!user || preferencesLoading || voiceOpened.current || focusedDictation)
      return;
    voiceOpened.current = true;
    // Una vez por sesión del navegador: recargar o abrir un enlace no la
    // vuelve a poner a pantalla completa.
    let seen = false;
    try {
      seen = sessionStorage.getItem("nexus.console.autoOpened") === "1";
      sessionStorage.setItem("nexus.console.autoOpened", "1");
    } catch {
      // sin almacenamiento: se abre como siempre
    }
    if (!seen && path === "/today" && preferences?.[PREFERENCE_KEYS.VOICE_AUTO_START] === true)
      setCaptureOpen(true);
  }, [user, preferencesLoading, preferences, focusedDictation, path]);

  useEffect(() => {
    if (focusedDictation) closeVoice();
    else setClinicalVoiceNotice(false);
  }, [focusedDictation, closeVoice]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // Anything captured while offline (spec §51) gets flushed the moment
  // there's a session and connectivity — on load, and whenever the
  // browser tells us we came back online.
  useEffect(() => {
    if (!user) return;
    void flushOfflineQueue(user.id);
    const onOnline = () => void flushOfflineQueue(user.id);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <NexusCore state="thinking" size={56} />
      </div>
    );
  }

  const showOnboarding =
    !preferencesLoading && !preferences?.[PREFERENCE_KEYS.ONBOARDING_COMPLETED];

  return (
    <div
      className={`nexus-app-shell mx-auto flex max-w-7xl gap-5 px-3 pt-4 sm:px-6 sm:pt-5 ${voiceDocked ? "pb-[30rem] sm:pb-[22rem]" : "pb-48 sm:pb-32"}`}
    >
      <ThemeController mode={preferences?.theme_mode} />
      <Suspense fallback={null}>
        <ListenParam onListen={openVoice} />
      </Suspense>
      <Sidebar onOrbClick={openVoice} />
      <main className="min-w-0 flex-1 sm:pt-2">
        <SystemHeader onVoice={openVoice} />
        {!clinical && <SyncStatus userId={user.id} />}{" "}
        {clinicalVoiceNotice && (
          <p
            role="status"
            className="mb-3 rounded-xl border border-nexus-border p-3 text-sm"
          >
            {clinical
              ? "Para registrar una consulta, usá el dictado dentro de su plantilla."
              : "Para explicar un proyecto, usá el dictado dentro de Proyectos."}
          </p>
        )}
        {children}
      </main>
      {/* La navegación queda siempre a mano, también con la consola de voz abierta. */}
      <BottomNav
        onOrbClick={openVoice}
        elevated={captureOpen && !clinical && !voiceDocked}
      />
      {captureOpen && !clinical && (
        <VoiceSession onClose={closeVoice} onDockChange={setVoiceDocked} />
      )}
      {/* Micrófono grande en todas las pantallas (la de dictado clínico tiene el suyo). */}
      <GlobalMicButton
        hidden={
          path === "/patients/capture" ||
          /\/consultations\//.test(path) ||
          (captureOpen && !clinical) ||
          showOnboarding
        }
      />
      {showOnboarding && !captureOpen && (
        <OnboardingTour
          onFinish={() =>
            void setPreference(PREFERENCE_KEYS.ONBOARDING_COMPLETED, true)
          }
        />
      )}
    </div>
  );
}

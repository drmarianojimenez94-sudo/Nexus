"use client";

import { PREFERENCE_KEYS } from "@nexus/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { flushOfflineQueue } from "@/lib/offlineQueue";
import { usePreferences } from "@/lib/usePreferences";
import { BottomNav } from "./BottomNav";
import { NexusCore } from "./NexusCore";
import { SystemHeader } from "./SystemHeader";
import { OnboardingTour } from "./OnboardingTour";
import { Sidebar } from "./Sidebar";
import { VoiceSession } from "./VoiceSession";

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
  const [captureOpen, setCaptureOpen] = useState(false);
  const [voiceDocked, setVoiceDocked] = useState(false);
  const { preferences, setPreference, loading: preferencesLoading } = usePreferences();
  const voiceOpened = useRef(false);
  const openVoice = useCallback(() => setCaptureOpen(true), []);
  const closeVoice = useCallback(() => { setCaptureOpen(false); setVoiceDocked(false); }, []);

  useEffect(() => {
    if (!user || preferencesLoading || voiceOpened.current) return;
    voiceOpened.current = true;
    if (preferences?.[PREFERENCE_KEYS.VOICE_AUTO_START] !== false) setCaptureOpen(true);
  }, [user, preferencesLoading, preferences]);

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
    void flushOfflineQueue();
    const onOnline = () => void flushOfflineQueue();
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

  const showOnboarding = !preferencesLoading && !preferences?.[PREFERENCE_KEYS.ONBOARDING_COMPLETED];

  return (
    <div className={`nexus-app-shell mx-auto flex max-w-7xl gap-5 px-3 pt-4 sm:px-6 sm:pt-5 ${voiceDocked ? "pb-[22rem]" : "pb-24 sm:pb-6"}`}>
      <Suspense fallback={null}>
        <ListenParam onListen={openVoice} />
      </Suspense>
      <Sidebar onOrbClick={() => setCaptureOpen(true)} />
      <main className="min-w-0 flex-1 sm:pt-2"><SystemHeader onVoice={openVoice}/>{children}</main>
      {!voiceDocked && <BottomNav onOrbClick={openVoice} />}
      {captureOpen && <VoiceSession onClose={closeVoice} onDockChange={setVoiceDocked} />}
      {showOnboarding && !captureOpen && (
        <OnboardingTour onFinish={() => void setPreference(PREFERENCE_KEYS.ONBOARDING_COMPLETED, true)} />
      )}
    </div>
  );
}

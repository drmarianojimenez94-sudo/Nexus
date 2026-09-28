"use client";

import { PREFERENCE_KEYS } from "@nexus/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { flushOfflineQueue } from "@/lib/offlineQueue";
import { usePreferences } from "@/lib/usePreferences";
import { BottomNav } from "./BottomNav";
import { NexusFace } from "./NexusFace";
import { OnboardingTour } from "./OnboardingTour";
import { QuickCaptureModal } from "./QuickCaptureModal";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);
  const { preferences, setPreference, loading: preferencesLoading } = usePreferences();

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
        <NexusFace state="thinking" size={56} />
      </div>
    );
  }

  const showOnboarding = !preferencesLoading && !preferences?.[PREFERENCE_KEYS.ONBOARDING_COMPLETED];

  return (
    <div className="mx-auto flex max-w-6xl gap-4 px-3 pb-24 pt-4 sm:px-6 sm:pb-6">
      <Sidebar onOrbClick={() => setCaptureOpen(true)} />
      <main className="min-w-0 flex-1">{children}</main>
      <BottomNav onOrbClick={() => setCaptureOpen(true)} />
      {captureOpen && <QuickCaptureModal onClose={() => setCaptureOpen(false)} />}
      {showOnboarding && (
        <OnboardingTour onFinish={() => void setPreference(PREFERENCE_KEYS.ONBOARDING_COMPLETED, true)} />
      )}
    </div>
  );
}

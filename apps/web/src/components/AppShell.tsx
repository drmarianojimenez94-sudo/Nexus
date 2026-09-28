"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { BottomNav } from "./BottomNav";
import { QuickCaptureModal } from "./QuickCaptureModal";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-orb-idle rounded-full bg-gradient-to-br from-nexus-cyan to-nexus-violet" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-4 px-3 pb-24 pt-4 sm:px-6 sm:pb-6">
      <Sidebar onOrbClick={() => setCaptureOpen(true)} />
      <main className="min-w-0 flex-1">{children}</main>
      <BottomNav onOrbClick={() => setCaptureOpen(true)} />
      {captureOpen && <QuickCaptureModal onClose={() => setCaptureOpen(false)} />}
    </div>
  );
}

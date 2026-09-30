export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="glass-panel nexus-auth-panel w-full max-w-sm p-6 sm:p-8">{children}</div>
    </div>
  );
}

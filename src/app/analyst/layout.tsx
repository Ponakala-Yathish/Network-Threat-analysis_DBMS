'use client';

import { useState, useEffect } from 'react';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/Button';
import { LogOut } from 'lucide-react';

export default function AnalystLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ username: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          setSession(data);
        } else {
          redirect('/login');
        }
      } catch {
        redirect('/login');
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    redirect('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        userRole="Analyst" 
        username={session.username} 
        onLogout={handleLogout}
      />
      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between sticky top-0 z-30">
          <h1 className="text-xl font-semibold text-gray-900">Analyst Workspace</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">
              {session.username} (Analyst)
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
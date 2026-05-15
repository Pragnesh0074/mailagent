"use client";

import { useState, useEffect } from 'react';
import Dashboard from '@/components/Dashboard';
import Login from '@/components/Login';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const checkAuth = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/auth/status');
      const data = await response.json();
      setIsAuthenticated(data.authenticated);
    } catch {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkAuth();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  return isAuthenticated ? <Dashboard /> : <Login />;
}

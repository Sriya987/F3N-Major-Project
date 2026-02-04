
import React, { useState, useEffect } from 'react';
import { ViewState, AuthState } from '../types';
import { dbService } from '../services/dbService';

interface LayoutProps {
  children: React.ReactNode;
  activeView: ViewState;
  setView: (view: ViewState) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeView, setView }) => {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const authSaved = localStorage.getItem('clinical_mind_auth');
  const authState: AuthState = authSaved ? JSON.parse(authSaved) : { user: null, type: null };

  useEffect(() => {
    const check = async () => {
      const status = await dbService.checkConnection();
      setIsOnline(status);
    };
    check();
    const interval = setInterval(check, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  const drNavItems: { id: ViewState; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
    { id: 'patients', label: 'Patient Directory', icon: 'fa-users' },
    { id: 'generate', label: 'Generate SOAP', icon: 'fa-file-medical' },
    { id: 'history', label: 'All Records', icon: 'fa-history' },
    { id: 'chat', label: 'Clinical Chat', icon: 'fa-comment-medical' },
  ];

  const patientNavItems: { id: ViewState; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'My Records', icon: 'fa-history' },
    { id: 'chat', label: 'Health Assistant', icon: 'fa-comment-medical' },
    { id: 'profile', label: 'My Profile', icon: 'fa-user-cog' },
  ];

  const navItems = authState.type === 'doctor' ? drNavItems : patientNavItems;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-slate-900 text-white flex-shrink-0 relative">
        <div className="p-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <i className="fas fa-heart-pulse text-blue-400"></i>
            From Findings to Final Notes
          </h1>
          {/* <p className="text-slate-400 text-xs mt-1">Hybrid AI Scribe</p> */}
          
          <div className="mt-4 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isOnline === null ? 'bg-slate-500' : isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
              {isOnline === null ? 'Connecting...' : isOnline ? 'Cloud Connected' : 'Local Mode Only'}
            </span>
          </div>
        </div>
        
        <nav className="mt-4 px-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeView === item.id 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <i className={`fas ${item.icon} w-5`}></i>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 w-64 p-4 text-xs text-slate-500 hidden md:block border-t border-slate-800">
          Logged in as: <br/>
          <span className="text-slate-300 font-bold truncate block">
            {authState.user ? (authState.type === 'doctor' ? (authState.user as any).fullName : (authState.user as any).name) : 'Guest'}
          </span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8">
        {!isOnline && isOnline !== null && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800 text-sm shadow-sm animate-pulse">
            <i className="fas fa-triangle-exclamation"></i>
            <p><strong>Database Offline:</strong> Your changes are being saved to your browser only. Check your <code>server.ts</code> and MongoDB Atlas IP whitelist.</p>
          </div>
        )}
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;

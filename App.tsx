
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import GenerateSOAP from './components/GenerateSOAP';
import Comparison from './components/Comparison';
import Chatbot from './components/Chatbot';
import PatientDirectory from './components/PatientDirectory';
import PatientProfile from './components/PatientProfile';
import PatientSignup from './components/PatientSignup';
import Auth from './components/Auth';
import { dbService } from './services/dbService';
import { SOAPNote, ViewState, Patient, AuthState, Doctor } from './types';

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, type: null });
  const [view, setView] = useState<ViewState>('dashboard');
  const [notes, setNotes] = useState<SOAPNote[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  useEffect(() => {
    // Check local storage for existing session
    const saved = localStorage.getItem('clinical_mind_auth');
    if (saved) {
      setAuthState(JSON.parse(saved));
    }

    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const idParam = params.get('id');

    if (viewParam === 'signup' && idParam) {
      setView('signup');
    }
  }, []);

  useEffect(() => {
    if (authState.user && view !== 'signup') {
      fetchNotes();
    }
  }, [view, authState.user]);

  const fetchNotes = async () => {
    if (!authState.user) return;
    
    // If patient, only fetch their notes
    const patientId = authState.type === 'patient' ? authState.user.id : undefined;
    const data = await dbService.getNotes(patientId);
    setNotes(data.sort((a, b) => b.timestamp - a.timestamp));
  };

  const handleLogin = (auth: AuthState) => {
    setAuthState(auth);
    localStorage.setItem('clinical_mind_auth', JSON.stringify(auth));
    setView('dashboard');
  };

  const handleLogout = () => {
    setAuthState({ user: null, type: null });
    localStorage.removeItem('clinical_mind_auth');
    setView('dashboard'); // Will trigger Auth view
  };

  const handleNoteGenerated = async (note: SOAPNote) => {
    if (authState.type === 'doctor') {
      note.doctorId = authState.user!.id;
    }
    await dbService.saveNote(note);
    setNotes(prev => [note, ...prev]);
    setView('dashboard');
  };

  if (!authState.user && view !== 'signup') {
    return <Auth onLogin={handleLogin} />;
  }

  const renderContent = () => {
    if (view === 'signup') {
      const idParam = new URLSearchParams(window.location.search).get('id') || '';
      return (
        <PatientSignup 
          patientId={idParam} 
          onComplete={() => {
            window.history.replaceState({}, '', window.location.pathname);
            setView('dashboard'); // Redirect to login basically
          }} 
        />
      );
    }

    // Role based restrictions
    if (authState.type === 'patient') {
      switch (view) {
        case 'dashboard':
        case 'history':
          return (
            <div className="space-y-6">
               <header>
                <h2 className="text-2xl font-bold">Your Clinical Records</h2>
                <p className="text-slate-600">Access your SOAP notes and treatment plans securely.</p>
              </header>
              <div className="grid grid-cols-1 gap-4">
                {notes.map(note => (
                  <div key={note.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-slate-900">{note.date}</h3>
                        <p className="text-slate-500 text-sm">Provider ID: {note.doctorId}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="block font-bold text-xs text-slate-400 mb-1 uppercase">Assessment</span>
                        <p className="text-slate-700">{note.assessment}</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="block font-bold text-xs text-slate-400 mb-1 uppercase">Treatment Plan</span>
                        <p className="text-slate-700">{note.plan}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-center py-20 text-slate-400">No records found yet.</p>}
              </div>
            </div>
          );
        default:
          setView('dashboard');
          return null;
      }
    }

    // Doctor Views
    if (selectedPatient && view === 'patients') {
      return (
        <PatientProfile 
          patient={selectedPatient} 
          onBack={() => setSelectedPatient(null)} 
        />
      );
    }

    switch (view) {
      case 'dashboard':
        return <Dashboard notes={notes} onGenerateClick={() => setView('generate')} />;
      case 'patients':
        return <PatientDirectory onSelectPatient={(p) => setSelectedPatient(p)} />;
      case 'generate':
        return <GenerateSOAP onNoteGenerated={handleNoteGenerated} />;
      case 'history':
        return (
          <div className="space-y-6">
            <header>
              <h2 className="text-2xl font-bold">Comprehensive Patient Records</h2>
              <p className="text-slate-600">Unified audit trail of all AI-generated clinical summaries.</p>
            </header>
            <div className="grid grid-cols-1 gap-4">
              {notes.map(note => (
                <div key={note.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-slate-900">{note.patientName}</h3>
                      <p className="text-slate-500 text-sm">{note.date} • {note.modelUsed}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="block font-bold text-xs text-slate-400 mb-1 uppercase">Assessment</span>
                      <p className="line-clamp-2 text-slate-700">{note.assessment}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="block font-bold text-xs text-slate-400 mb-1 uppercase">Plan</span>
                      <p className="line-clamp-2 text-slate-700">{note.plan}</p>
                    </div>
                  </div>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                  <i className="fas fa-folder-open text-4xl mb-4"></i>
                  <p>No records found.</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'compare':
        return <Comparison />;
      case 'chat':
        return <Chatbot history={notes} />;
      default:
        return <Dashboard notes={notes} onGenerateClick={() => setView('generate')} />;
    }
  };

  return (
    <Layout activeView={view} setView={setView}>
      <div className="flex justify-end mb-4">
        <button onClick={handleLogout} className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1">
          <i className="fas fa-sign-out-alt"></i> Logout
        </button>
      </div>
      {renderContent()}
    </Layout>
  );
};

export default App;

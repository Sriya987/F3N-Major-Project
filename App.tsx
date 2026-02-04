
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import GenerateSOAP from './components/GenerateSOAP';
import Chatbot from './components/Chatbot';
import PatientDirectory from './components/PatientDirectory';
import PatientProfile from './components/PatientProfile';
import PatientSignup from './components/PatientSignup';
import PatientProfileEdit from './components/PatientProfileEdit';
import Auth from './components/Auth';
import { dbService } from './services/dbService';
import { SOAPNote, ViewState, Patient, AuthState, Doctor } from './types';

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, type: null });
  const [view, setView] = useState<ViewState>('dashboard');
  const [notes, setNotes] = useState<SOAPNote[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedHistoryNote, setSelectedHistoryNote] = useState<SOAPNote | null>(null);

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
          return (
            <div className="space-y-6 animate-fadeIn">
               <header>
                <h2 className="text-2xl font-bold">Your Clinical Records</h2>
                <p className="text-slate-600">Access your SOAP notes and treatment plans securely.</p>
              </header>
              <div className="grid grid-cols-1 gap-4">
                {notes.map(note => (
                  <div key={note.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-transform hover:scale-[1.01]">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-slate-900">{note.date}</h3>
                        <p className="text-slate-500 text-sm">Provider ID: {note.doctorId}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="block font-bold text-[10px] text-slate-400 mb-1 uppercase tracking-widest">Assessment</span>
                        <p className="text-slate-700">{note.assessment}</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="block font-bold text-[10px] text-slate-400 mb-1 uppercase tracking-widest">Treatment Plan</span>
                        <p className="text-slate-700">{note.plan}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-center py-20 text-slate-400">No records found yet.</p>}
              </div>
            </div>
          );
        case 'chat':
          return <Chatbot history={notes} />;
        case 'profile':
          return <PatientProfileEdit />;
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
            {selectedHistoryNote ? (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
                  <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-xl font-bold text-slate-800">Encounter Details</h2>
                    <button
                      onClick={() => setSelectedHistoryNote(null)}
                      className="text-slate-400 hover:text-slate-600 text-2xl"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Patient</h3>
                        <p className="text-lg font-semibold text-slate-900">{selectedHistoryNote.patientName}</p>
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date</h3>
                        <p className="text-lg font-semibold text-slate-900">{selectedHistoryNote.date}</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                        <h4 className="font-bold text-xs text-blue-600 uppercase tracking-widest mb-3">Subjective</h4>
                        <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{selectedHistoryNote.subjective || 'N/A'}</p>
                      </div>
                      <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                        <h4 className="font-bold text-xs text-green-600 uppercase tracking-widest mb-3">Objective</h4>
                        <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{selectedHistoryNote.objective || 'N/A'}</p>
                      </div>
                      <div className="bg-amber-50 p-6 rounded-lg border border-amber-100">
                        <h4 className="font-bold text-xs text-amber-600 uppercase tracking-widest mb-3">Assessment</h4>
                        <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{selectedHistoryNote.assessment || 'N/A'}</p>
                      </div>
                      <div className="bg-purple-50 p-6 rounded-lg border border-purple-100">
                        <h4 className="font-bold text-xs text-purple-600 uppercase tracking-widest mb-3">Plan</h4>
                        <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{selectedHistoryNote.plan || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-2">
                      <p><strong>ID:</strong> {selectedHistoryNote.id}</p>
                      <p><strong>Patient ID:</strong> {selectedHistoryNote.patientId}</p>
                      <p><strong>Doctor ID:</strong> {selectedHistoryNote.doctorId}</p>
                      <p><strong>Model Used:</strong> {selectedHistoryNote.modelUsed || 'Standard'}</p>
                      <p><strong>Timestamp:</strong> {new Date(selectedHistoryNote.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
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
                    <button
                      onClick={() => setSelectedHistoryNote(note)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-semibold hover:underline"
                    >
                      View Details
                    </button>
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
      case 'chat':
        return <Chatbot history={notes} />;
      default:
        return <Dashboard notes={notes} onGenerateClick={() => setView('generate')} />;
    }
  };

  return (
    <Layout activeView={view} setView={setView}>
      <div className="flex justify-end mb-4">
        <button onClick={handleLogout} className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors">
          <i className="fas fa-sign-out-alt"></i> Logout
        </button>
      </div>
      {renderContent()}
    </Layout>
  );
};

export default App;

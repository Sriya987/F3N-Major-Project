
import React, { useState } from 'react';
import { SOAPNote } from '../types';

interface DashboardProps {
  notes: SOAPNote[];
  onGenerateClick: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ notes, onGenerateClick }) => {
  const [selectedNote, setSelectedNote] = useState<SOAPNote | null>(null);
  return (
    <div className="space-y-6 animate-fadeIn">
      {selectedNote ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-slate-800">Encounter Details</h2>
              <button 
                onClick={() => setSelectedNote(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Patient</h3>
                  <p className="text-lg font-semibold text-slate-900">{selectedNote.patientName}</p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date</h3>
                  <p className="text-lg font-semibold text-slate-900">{selectedNote.date}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h4 className="font-bold text-xs text-blue-600 uppercase tracking-widest mb-2">Subjective</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">{selectedNote.subjective || 'N/A'}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                  <h4 className="font-bold text-xs text-green-600 uppercase tracking-widest mb-2">Objective</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">{selectedNote.objective || 'N/A'}</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                  <h4 className="font-bold text-xs text-amber-600 uppercase tracking-widest mb-2">Assessment</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">{selectedNote.assessment || 'N/A'}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                  <h4 className="font-bold text-xs text-purple-600 uppercase tracking-widest mb-2">Plan</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">{selectedNote.plan || 'N/A'}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-2">
                <p><strong>ID:</strong> {selectedNote.id}</p>
                <p><strong>Patient ID:</strong> {selectedNote.patientId}</p>
                <p><strong>Doctor ID:</strong> {selectedNote.doctorId}</p>
                <p><strong>Model Used:</strong> {selectedNote.modelUsed || 'Standard'}</p>
                <p><strong>Timestamp:</strong> {new Date(selectedNote.timestamp).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <header>
        <h2 className="text-2xl font-bold text-slate-800">Welcome Back!</h2>
        <p className="text-slate-600">You have {notes.length} processed clinical records today.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-file-alt"></i>
            </div>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded">Active</span>
          </div>
          <h3 className="text-sm text-slate-500 font-medium">Total Notes</h3>
          <p className="text-2xl font-bold text-slate-900">{notes.length}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-clock"></i>
            </div>
          </div>
          <h3 className="text-sm text-slate-500 font-medium">Avg. Processing Time</h3>
          <p className="text-2xl font-bold text-slate-900">4.2s</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-teal-100 text-teal-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-shield-halved"></i>
            </div>
          </div>
          <h3 className="text-sm text-slate-500 font-medium">Data Compliance</h3>
          <p className="text-2xl font-bold text-slate-900">HIPAA Secured</p>
        </div>
      </div>

      <div className="bg-blue-600 rounded-2xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg">
        <div>
          <h3 className="text-xl font-bold mb-2">Start a New Clinical Note</h3>
          <p className="text-blue-100 max-w-md">Our hybrid AI combines semantic structuring with generative refinement to provide reliable, fact-checked SOAP notes.</p>
        </div>
        <button 
          onClick={onGenerateClick}
          className="bg-white text-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-50 transition-all shadow-md whitespace-nowrap"
        >
          <i className="fas fa-plus mr-2"></i> New Encounter
        </button>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Recent Encounters</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3">Patient</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Assessment</th>
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {notes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">No records found. Start by generating a SOAP note.</td>
                </tr>
              ) : (
                notes.slice(0, 5).map(note => (
                  <tr key={note.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{note.patientName}</td>
                    <td className="px-6 py-4 text-slate-600">{note.date}</td>
                    <td className="px-6 py-4 text-slate-600 truncate max-w-[200px]">{note.assessment}</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => setSelectedNote(note)}
                        className="text-blue-600 hover:text-blue-800 cursor-pointer text-sm font-semibold hover:underline transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

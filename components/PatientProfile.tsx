
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { Patient, SOAPNote } from '../types';

interface PatientProfileProps {
  patient: Patient;
  onBack: () => void;
}

const PatientProfile: React.FC<PatientProfileProps> = ({ patient, onBack }) => {
  const [notes, setNotes] = useState<SOAPNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, [patient.id]);

  const loadNotes = async () => {
    setLoading(true);
    const data = await dbService.getNotes(patient.id);
    setNotes(data);
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <button 
        onClick={onBack}
        className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-2"
      >
        <i className="fas fa-arrow-left"></i> Back to Directory
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-8 text-white relative">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-24 h-24 bg-blue-500 rounded-2xl flex items-center justify-center text-3xl font-bold">
              {patient.name.charAt(0)}
            </div>
            <div className="text-center md:text-left">
              <h2 className="text-3xl font-bold">{patient.name}</h2>
              <p className="text-slate-400">Patient ID: {patient.id} • Age: {patient.age}</p>
            </div>
          </div>
        </div>
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Contact Info</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3"><i className="fas fa-envelope text-slate-400"></i> {patient.email}</li>
              <li className="flex items-center gap-3"><i className="fas fa-phone text-slate-400"></i> {patient.phNo}</li>
              <li className="flex items-center gap-3"><i className="fas fa-map-marker-alt text-slate-400"></i> {patient.address}</li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Medical Metadata</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3"><i className="fas fa-calendar-check text-slate-400"></i> First Visit: {patient.firstVisitDate}</li>
              <li className="flex items-center gap-3"><i className="fas fa-file-medical text-slate-400"></i> Records: {notes.length}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-bold text-slate-800">Clinical Record History</h3>
        {loading ? (
          <div className="h-32 bg-white rounded-xl animate-pulse"></div>
        ) : notes.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400">
            <i className="fas fa-folder-open text-4xl mb-4"></i>
            <p>No SOAP notes found for this patient.</p>
          </div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-slate-800">{note.date}</span>
                <span className="text-[10px] font-bold px-2 py-1 bg-blue-50 text-blue-600 rounded uppercase">{note.modelUsed}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Assessment</span>
                  <p className="text-sm text-slate-700">{note.assessment}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Plan</span>
                  <p className="text-sm text-slate-700">{note.plan}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PatientProfile;

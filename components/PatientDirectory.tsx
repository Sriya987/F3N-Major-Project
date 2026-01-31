
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { Patient } from '../types';

interface PatientDirectoryProps {
  onSelectPatient: (patient: Patient) => void;
}

const PatientDirectory: React.FC<PatientDirectoryProps> = ({ onSelectPatient }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'name' | 'id' | 'email'>('name');
  
  // Registration Modal State
  const [showModal, setShowModal] = useState(false);
  const [regData, setRegData] = useState({ name: '', age: '', dob: '', email: '' });
  const [signupLink, setSignupLink] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    setLoading(true);
    const data = await dbService.getPatients();
    setPatients(data);
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    try {
      const newPatient = await dbService.createPatient({
        name: regData.name,
        age: parseInt(regData.age),
        dob: regData.dob,
        email: regData.email,
        phNo: '',
        address: '',
      });
      // Simulate sending mail by generating a link
      const link = `${window.location.origin}${window.location.pathname}?view=signup&id=${newPatient.id}`;
      setSignupLink(link);
      loadPatients();
    } catch (err) {
      setError("Registration failed. Email might already be in use.");
    } finally {
      setIsCreating(false);
    }
  };

  const filteredPatients = patients.filter(p => {
    const val = p[filterType]?.toString().toLowerCase() || '';
    return val.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Patient Directory</h2>
          <p className="text-slate-600">Search and access comprehensive patient history.</p>
        </div>
        <button 
          onClick={() => { setShowModal(true); setSignupLink(''); setError(null); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <i className="fas fa-user-plus"></i> Register Patient
        </button>
      </header>

      {/* Registration Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <i className="fas fa-times"></i>
            </button>
            
            {!signupLink ? (
              <>
                <h3 className="text-xl font-bold mb-4">Register New Patient</h3>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center gap-2">
                    <i className="fas fa-circle-exclamation"></i>
                    {error}
                  </div>
                )}
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                    <input required type="text" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={regData.name} onChange={e => setRegData({...regData, name: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Age</label>
                      <input required type="number" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={regData.age} onChange={e => setRegData({...regData, age: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">DOB</label>
                      <input required type="date" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={regData.dob} onChange={e => setRegData({...regData, dob: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                    <input required type="email" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} />
                  </div>
                  <button disabled={isCreating} type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold disabled:opacity-50">
                    {isCreating ? <i className="fas fa-spinner fa-spin mr-2"></i> : 'Create Profile'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-2xl">
                  <i className="fas fa-check"></i>
                </div>
                <h3 className="text-xl font-bold">Patient Registered!</h3>
                <p className="text-sm text-slate-500">A registration link has been generated. Provide this to the patient to complete their profile.</p>
                <div className="bg-slate-50 p-3 rounded-lg border text-left flex items-center justify-between gap-2 overflow-hidden">
                  <span className="text-xs font-mono text-slate-600 truncate">{signupLink}</span>
                  <button onClick={() => navigator.clipboard.writeText(signupLink)} className="text-blue-600 hover:text-blue-800 flex-shrink-0">
                    <i className="fas fa-copy"></i>
                  </button>
                </div>
                <button onClick={() => setShowModal(false)} className="w-full bg-slate-900 text-white py-2.5 rounded-lg">Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input 
            type="text"
            placeholder={`Search by ${filterType}...`}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['name', 'id', 'email'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors capitalize ${
                filterType === type ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse"></div>
          ))
        ) : filteredPatients.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-400">
            <i className="fas fa-user-slash text-4xl mb-4"></i>
            <p>No patients found matching your criteria.</p>
          </div>
        ) : (
          filteredPatients.map(patient => (
            <div 
              key={patient.id} 
              onClick={() => onSelectPatient(patient)}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
            >
              {patient.status === 'pending' && (
                <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] px-2 py-0.5 font-bold uppercase">Pending Completion</div>
              )}
              <div className="flex items-center gap-4 mb-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-colors ${
                  patient.status === 'completed' ? 'bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500' : 'bg-amber-50 text-amber-500'
                }`}>
                  <i className={`fas ${patient.status === 'completed' ? 'fa-user' : 'fa-user-clock'}`}></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{patient.name}</h3>
                  <p className="text-xs text-slate-500">ID: {patient.id}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-600 flex items-center gap-2 truncate">
                  <i className="fas fa-envelope w-4"></i> {patient.email}
                </p>
                <p className="text-xs text-slate-600 flex items-center gap-2">
                  <i className="fas fa-phone w-4"></i> {patient.phNo || 'Not provided'}
                </p>
                <p className="text-xs text-slate-600 flex items-center gap-2">
                  <i className="fas fa-calendar-alt w-4"></i> DOB: {patient.dob}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PatientDirectory;


import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { UserType, AuthState } from '../types';

interface AuthProps {
  onLogin: (auth: AuthState) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [userType, setUserType] = useState<UserType>('doctor');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success', message: string } | null>(null);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [experience, setExperience] = useState('');
  const [address, setAddress] = useState('');

  // Clear status when switching modes
  useEffect(() => {
    setStatus(null);
  }, [mode, userType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(false);
    setStatus(null);
    setIsLoading(true);
    
    try {
      if (mode === 'login') {
        const res = await dbService.login(email, password, userType);
        setStatus({ type: 'success', message: 'Authentication successful! Redirecting...' });
        // Small delay to let user see success message
        setTimeout(() => {
          onLogin({ user: res.user, type: res.type });
        }, 1000);
      } else {
        if (userType !== 'doctor') {
           setStatus({ type: 'error', message: "Patient registration is handled by clinical staff." });
           setIsLoading(false);
           return;
        }
        const doctor = await dbService.registerDoctor({
          fullName,
          email,
          password,
          age: parseInt(age),
          experience: parseInt(experience),
          address
        });
        setStatus({ type: 'success', message: 'Account created successfully! Welcome.' });
        setTimeout(() => {
          onLogin({ user: doctor, type: 'doctor' });
        }, 1000);
      }
    } catch (err: any) {
      setStatus({ 
        type: 'error', 
        message: err.message || "Authentication failed. Please check your credentials." 
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-8 text-white text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl shadow-lg shadow-blue-500/30">
            <i className="fas fa-heart-pulse"></i>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ClinicalMind AI</h1>
          <p className="text-slate-400 text-sm mt-1">Intelligent Healthcare Documentation</p>
        </div>

        <div className="p-8">
          {status && (
            <div className={`mb-6 p-4 rounded-xl text-sm border flex items-start gap-3 animate-fadeIn ${
              status.type === 'error' 
                ? 'bg-red-50 border-red-100 text-red-600' 
                : 'bg-green-50 border-green-100 text-green-600'
            }`}>
              <i className={`fas mt-0.5 ${status.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`}></i>
              <span>{status.message}</span>
            </div>
          )}

          <div className="flex bg-slate-100 p-1 rounded-xl mb-8">
            <button 
              onClick={() => { setMode('login'); setUserType('doctor'); }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'login' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
            >
              Sign In
            </button>
            <button 
              onClick={() => { setMode('signup'); setUserType('doctor'); }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'signup' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
            >
              Dr. Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'login' && (
              <div className="flex gap-4 mb-4">
                <label className={`flex-1 flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-all ${userType === 'doctor' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                  <input type="radio" className="hidden" checked={userType === 'doctor'} onChange={() => setUserType('doctor')} />
                  <i className={`fas fa-user-md ${userType === 'doctor' ? 'text-blue-600' : 'text-slate-400'}`}></i>
                  <span className={`text-xs font-bold ${userType === 'doctor' ? 'text-blue-700' : 'text-slate-500'}`}>Doctor</span>
                </label>
                <label className={`flex-1 flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-all ${userType === 'patient' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                  <input type="radio" className="hidden" checked={userType === 'patient'} onChange={() => setUserType('patient')} />
                  <i className={`fas fa-user-injured ${userType === 'patient' ? 'text-blue-600' : 'text-slate-400'}`}></i>
                  <span className={`text-xs font-bold ${userType === 'patient' ? 'text-blue-700' : 'text-slate-500'}`}>Patient</span>
                </label>
              </div>
            )}

            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                  <input required type="text" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="Dr. John Doe" value={fullName} onChange={e => setFullName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Age</label>
                    <input required type="number" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="45" value={age} onChange={e => setAge(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Experience (Yrs)</label>
                    <input required type="number" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="10" value={experience} onChange={e => setExperience(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Clinic Address</label>
                  <input required type="text" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="123 Medical St" value={address} onChange={e => setAddress(e.target.value)} />
                </div>
              </>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
              <input required type="email" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="doctor@clinicalmind.ai" value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Password</label>
              <input required type="password" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            <button 
              disabled={isLoading}
              type="submit" 
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-100 transition-all active:scale-[0.98] disabled:opacity-50 mt-6"
            >
              {isLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
              {mode === 'login' ? 'Continue to Dashboard' : 'Register as Practitioner'}
            </button>
          </form>

          {mode === 'login' && userType === 'patient' && (
            <p className="text-center text-xs text-slate-500 mt-6">
              New patient? Complete your profile using the link sent to your email by your healthcare provider.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;

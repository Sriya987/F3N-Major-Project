
import React, { useState } from 'react';
import { dbService } from '../services/dbService';
import { Patient, AuthState } from '../types';

const PatientProfileEdit: React.FC = () => {
  const authSaved = localStorage.getItem('clinical_mind_auth');
  const authState: AuthState = authSaved ? JSON.parse(authSaved) : { user: null, type: null };
  const patient = authState.user as Patient;

  const [formData, setFormData] = useState({
    phNo: patient.phNo || '',
    address: patient.address || '',
    password: '',
    confirmPassword: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success', message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    
    if (formData.password && formData.password !== formData.confirmPassword) {
      setStatus({ type: 'error', message: "Passwords do not match." });
      return;
    }

    setIsSubmitting(true);
    try {
      const updates: any = {
        phNo: formData.phNo,
        address: formData.address
      };
      if (formData.password) updates.password = formData.password;

      const updated = await dbService.updatePatient(patient.id, updates);
      
      // Update local storage
      const newAuth = { ...authState, user: updated };
      localStorage.setItem('clinical_mind_auth', JSON.stringify(newAuth));
      
      setStatus({ type: 'success', message: "Profile updated successfully!" });
      setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
    } catch (err) {
      setStatus({ type: 'error', message: "Error updating profile. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fadeIn">
      <header className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">My Profile</h2>
        <p className="text-slate-600">Update your contact information and security settings.</p>
      </header>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 opacity-60">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Full Name</label>
              <p className="font-bold text-slate-700">{patient.name}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 opacity-60">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Email (Primary)</label>
              <p className="font-bold text-slate-700">{patient.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-2">Contact Details</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Phone Number</label>
              <input 
                type="tel" 
                className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" 
                value={formData.phNo} 
                onChange={e => setFormData({...formData, phNo: e.target.value})} 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Home Address</label>
              <textarea 
                rows={3} 
                className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" 
                value={formData.address} 
                onChange={e => setFormData({...formData, address: e.target.value})} 
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-2">Security</h3>
            <p className="text-xs text-slate-400 italic">Leave password blank to keep your current one.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">New Password</label>
                <input 
                  type="password" 
                  className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" 
                  placeholder="••••••••" 
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Confirm New Password</label>
                <input 
                  type="password" 
                  className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" 
                  placeholder="••••••••" 
                  value={formData.confirmPassword} 
                  onChange={e => setFormData({...formData, confirmPassword: e.target.value})} 
                />
              </div>
            </div>
          </div>

          <button 
            disabled={isSubmitting} 
            type="submit" 
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-100 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? <i className="fas fa-spinner fa-spin mr-2"></i> : 'Update Profile'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PatientProfileEdit;

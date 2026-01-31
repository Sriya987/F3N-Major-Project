
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { Patient } from '../types';

interface PatientSignupProps {
  patientId: string;
  onComplete: () => void;
}

const PatientSignup: React.FC<PatientSignupProps> = ({ patientId, onComplete }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    phNo: '',
    address: '',
    password: '',
    confirmPassword: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success', message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const patients = await dbService.getPatients({ id: patientId });
        if (patients.length > 0) setPatient(patients[0]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [patientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (formData.password !== formData.confirmPassword) {
      setStatus({ type: 'error', message: "Passwords do not match." });
      return;
    }
    setIsSubmitting(true);
    try {
      await dbService.updatePatient(patientId, {
        phNo: formData.phNo,
        address: formData.address,
        password: formData.password
      });
      setStatus({ type: 'success', message: "Profile completed successfully! Your account is now active." });
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      setStatus({ type: 'error', message: "Error updating profile. Please try again." });
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-20 text-center text-slate-400 animate-pulse">Loading secure profile...</div>;
  if (!patient) return <div className="p-20 text-center text-red-500 font-bold">Invalid or expired signup link.</div>;
  if (patient.status === 'completed' && !status) return <div className="p-20 text-center text-green-600 font-bold">This profile is already completed.</div>;

  return (
    <div className="max-w-md mx-auto py-12 px-4 animate-fadeIn">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl shadow-lg shadow-blue-200">
            <i className="fas fa-lock"></i>
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Complete Your Profile</h2>
          <p className="text-slate-500 text-sm mt-2">Welcome, <span className="text-slate-900 font-bold">{patient.name}</span>. Please provide your remaining details to activate your account.</p>
        </div>

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

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-slate-50 p-4 rounded-xl text-xs space-y-1 mb-6 border border-slate-100">
            <p className="font-bold text-slate-400 uppercase tracking-widest">Confirmed Details</p>
            <p className="text-slate-700"><strong>Email:</strong> {patient.email}</p>
            <p className="text-slate-700"><strong>DOB:</strong> {patient.dob}</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Phone Number</label>
            <input required type="tel" className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="e.g. +1 555-010-999" value={formData.phNo} onChange={e => setFormData({...formData, phNo: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Physical Address</label>
            <textarea required rows={3} className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="Your current residence" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Secure Password</label>
            <input required type="password" className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 mb-3" placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
            <input required type="password" className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" placeholder="Confirm Password" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} />
          </div>

          <button disabled={isSubmitting || status?.type === 'success'} type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-100 transition-transform active:scale-[0.98] disabled:opacity-50 mt-4">
            {isSubmitting ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
            {status?.type === 'success' ? 'Profile Activated!' : 'Activate My Account'}
          </button>
        </form>
      </div>
      <p className="text-center text-[10px] text-slate-400 mt-8 uppercase tracking-widest">HIPAA Compliant Secure Enrollment</p>
    </div>
  );
};

export default PatientSignup;

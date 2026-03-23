
import { SOAPNote, Patient, Doctor, UserType } from '../types';

const API_BASE = 'http://localhost:3001/api';

type NoteScope = {
  patientId?: string;
  doctorId?: string;
};

export const dbService = {
  // Utility to check if backend is alive
  checkConnection: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/health`, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  },

  // AUTH
  login: async (email: string, password: string, type: UserType): Promise<{ user: Patient | Doctor, type: UserType }> => {
    const endpoint = type === 'doctor' ? 'doctors/login' : 'patients/login';
    const response = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Invalid credentials');
    }
    const user = await response.json();
    return { user, type };
  },

  registerDoctor: async (doctor: Partial<Doctor>): Promise<Doctor> => {
    const response = await fetch(`${API_BASE}/doctors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doctor),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Doctor registration failed');
    }
    return await response.json();
  },

  // NOTES
  getNotes: async (scope?: string | NoteScope): Promise<SOAPNote[]> => {
    const normalizedScope: NoteScope = typeof scope === 'string' ? { patientId: scope } : (scope || {});
    const query = new URLSearchParams();
    if (normalizedScope.patientId) query.set('patientId', normalizedScope.patientId);
    if (normalizedScope.doctorId) query.set('doctorId', normalizedScope.doctorId);
    const url = query.toString() ? `${API_BASE}/notes?${query.toString()}` : `${API_BASE}/notes`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch from remote');
      return await response.json();
    } catch (error) {
      console.warn('Backend unreachable, attempting local storage fallback.');
      const data = localStorage.getItem('clinical_mind_records');
      const all: SOAPNote[] = data ? JSON.parse(data) : [];
      return all.filter(n => {
        if (normalizedScope.patientId && n.patientId !== normalizedScope.patientId) return false;
        if (normalizedScope.doctorId && n.doctorId !== normalizedScope.doctorId) return false;
        return true;
      });
    }
  },

  saveNote: async (note: SOAPNote): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      if (!response.ok) throw new Error('Remote save failed');
      console.log('Successfully saved note to MongoDB Atlas');
    } catch (error) {
      console.error('Remote storage error:', error);
      // Still save locally as a safety net, but alert the user
      const data = localStorage.getItem('clinical_mind_records');
      const notes: SOAPNote[] = data ? JSON.parse(data) : [];
      notes.push(note);
      localStorage.setItem('clinical_mind_records', JSON.stringify(notes));
      throw new Error('Could not reach Atlas database. Data saved locally to browser instead.');
    }
  },

  // PATIENTS
  getPatients: async (filters?: Partial<Patient>): Promise<Patient[]> => {
    const query = new URLSearchParams(filters as any).toString();
    try {
      const response = await fetch(`${API_BASE}/patients?${query}`);
      if (!response.ok) throw new Error('Remote fetch failed');
      return await response.json();
    } catch (error) {
      const data = localStorage.getItem('clinical_mind_patients');
      let patients: Patient[] = data ? JSON.parse(data) : [];
      if (filters) {
        if (filters.name) patients = patients.filter(p => p.name.toLowerCase().includes(filters.name!.toLowerCase()));
        if (filters.id) patients = patients.filter(p => p.id === filters.id);
      }
      return patients;
    }
  },

  createPatient: async (patient: Partial<Patient>): Promise<Patient> => {
    const response = await fetch(`${API_BASE}/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patient),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to create patient');
    }
    return await response.json();
  },

  updatePatient: async (id: string, updates: Partial<Patient>): Promise<Patient> => {
    const response = await fetch(`${API_BASE}/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update patient');
    return await response.json();
  },

  getDoctor: async (id: string): Promise<Doctor> => {
    const response = await fetch(`${API_BASE}/doctors/${id}`);
    if (!response.ok) throw new Error('Doctor not found');
    return await response.json();
  }
};

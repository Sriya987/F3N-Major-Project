
export interface Patient {
  id: string;
  name: string;
  email: string;
  phNo: string;
  age: number;
  dob: string;
  firstVisitDate: string;
  password?: string;
  address: string;
  status: 'pending' | 'completed';
}

export interface Doctor {
  id: string;
  fullName: string;
  age: number;
  experience: number;
  address: string;
  email: string;
  password?: string;
}

export interface SOAPNote {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  date: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  rawDialogue: string;
  rawLabData: string;
  modelUsed: string;
  timestamp: number;
}

export type UserType = 'doctor' | 'patient';

export interface AuthState {
  user: Patient | Doctor | null;
  type: UserType | null;
}

export type ViewState = 'dashboard' | 'generate' | 'patients' | 'history' | 'chat' | 'signup' | 'auth' | 'profile';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

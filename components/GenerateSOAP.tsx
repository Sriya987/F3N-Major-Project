import React, { useState, useRef, useEffect } from 'react';
import { geminiService } from '../services/geminiService';
import { flanSoapService } from '../services/flanSoapService';
import { dbService } from '../services/dbService';
import { SOAPNote, Patient } from '../types';

interface GenerateSOAPProps {
  onNoteGenerated: (note: SOAPNote) => void;
}

const GenerateSOAP: React.FC<GenerateSOAPProps> = ({ onNoteGenerated }) => {
  const [step, setStep] = useState(1);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [previewNote, setPreviewNote] = useState<Partial<SOAPNote> | null>(null);

  const [labFile, setLabFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | Blob | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  /* -------------------- LOAD PATIENTS -------------------- */

  useEffect(() => {
    dbService.getPatients().then(setPatients);
  }, []);

  /* -------------------- RECORDING TIMER -------------------- */

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [isRecording]);

  /* -------------------- AUDIO RECORDING -------------------- */

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioFile(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      alert("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  /* -------------------- AUDIO PREPROCESSING -------------------- */
  /* Silence removal + normalization (browser-safe) */

  const preprocessAudio = async (audioBlob: Blob): Promise<Blob> => {
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const buffer = await audioBlob.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(buffer);
    const data = decoded.getChannelData(0);

    // Silence trimming
    const threshold = 0.02;
    let start = 0;
    let end = data.length - 1;

    while (start < end && Math.abs(data[start]) < threshold) start++;
    while (end > start && Math.abs(data[end]) < threshold) end--;

    const trimmed = data.slice(start, end);

    // Normalization
    let max = 0;
    for (let i = 0; i < trimmed.length; i++) {
      max = Math.max(max, Math.abs(trimmed[i]));
    }

    const normalized = max > 0 ? trimmed.map(v => v / max) : trimmed;

    // Rebuild buffer
    const processedBuffer = audioCtx.createBuffer(1, normalized.length, 16000);
    processedBuffer.copyToChannel(new Float32Array(normalized), 0);
    
    // Convert back to audio using MediaRecorder
    const destination = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = processedBuffer;
    source.connect(destination);
    source.start();

    const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm' });
    const chunks: Blob[] = [];

    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.start();
    await new Promise(r => setTimeout(r, 300));
    recorder.stop();
    await new Promise(r => recorder.onstop = r);

    return new Blob(chunks, { type: 'audio/webm' });
  };

  /* -------------------- BASE64 -------------------- */

  const fileToBase64 = (file: File | Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /* -------------------- MULTIMODAL PROCESS -------------------- */

  const handleMultimodalProcess = async () => {
    if (!selectedPatient) {
      alert("Please select a patient.");
      return;
    }

    setIsLoading(true);
    try {
      let audioData;
      let labData;

      if (audioFile) {
        const processedAudio = await preprocessAudio(audioFile);
        audioData = {
          data: await fileToBase64(processedAudio),
          mimeType: 'audio/webm',
          hint: "Preserve all patient-reported symptoms verbatim in Subjective"
        };
      }

      if (labFile) {
        labData = {
          data: await fileToBase64(labFile),
          mimeType: 'application/pdf'
        };
      }
      // console.log(audioData);
      const transcript = await geminiService.transcribeAudio(audioData)
      try {
        const transcript = await geminiService.transcribeAudio(audioData)
        console.log("Transcript:", transcript);
      } catch (err) {
        console.error("TRANSCRIPTION ERROR:", err);
      }
      console.log("Transcript:", transcript);
    // const rawSOAP = await flanSoapService.generateSOAP(transcript)
    const rawSOAP1 = await flanSoapService.generateSOAP(transcript);

    const rawSOAPString = JSON.stringify(rawSOAP1);
    const rawSOAP = parseSOAPString(rawSOAPString);

    setPreviewNote(rawSOAP);

    // normalize structure before preview
    const normalizedSOAP = {
      subjective: rawSOAP.subjective || "",
      objective: rawSOAP.objective || "",
      assessment: rawSOAP.assessment || "",
      plan: rawSOAP.plan || ""
    }

    setPreviewNote(normalizedSOAP)
    setStep(2)
    } catch (err: any) {
      alert(err?.message || "Processing failed");
    } finally {
      setIsLoading(false);
    }
  };

  /* -------------------- CONTROLLED REFINEMENT -------------------- */
  const parseSOAPString = (text: string) => {
  const sections = {
    subjective: "",
    objective: "",
    assessment: "",
    plan: ""
  };

  const regex = /([SOAP]):\s*([\s\S]*?)(?=\s*[SOAP]:|$)/gi;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const label = match[1].toUpperCase();
    const content = match[2].trim();

    if (label === "S") sections.subjective = content;
    if (label === "O") sections.objective = content;
    if (label === "A") sections.assessment = content;
    if (label === "P") sections.plan = content;
  }

  return {
    subjective: sections.subjective || "Not reported",
    objective: sections.objective || "Not reported",
    assessment: sections.assessment || "Not reported",
    plan: sections.plan || "Not reported"
  };
};

  const handleControlledRefinement = async () => {
    if (!previewNote || !selectedPatient) return;

    setIsLoading(true);
    try {
        const rawText = `
        Subjective:
        ${previewNote.subjective}

        Objective:
        ${previewNote.objective}

        Assessment:
        ${previewNote.assessment}

        Plan:
        ${previewNote.plan}
        `

      const refined = await geminiService.refineSOAP(previewNote);
      const finalNote: SOAPNote = {
        id: Math.random().toString(36).substr(2, 9),
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        doctorId: 'DR001',
        date: new Date().toLocaleDateString(),
        subjective: refined.subjective || '',
        objective: refined.objective || '',
        assessment: refined.assessment || '',
        plan: refined.plan || '',
        rawDialogue: "[Audio Preprocessed]",
        rawLabData: "[PDF Processed]",
        modelUsed: 'Hybrid (Preprocessed Multimodal)',
        timestamp: Date.now()
      };

      onNoteGenerated(finalNote);
    } catch (err: any) {
      alert(err?.message || "Refinement failed");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  /* -------------------- UI (UNCHANGED) -------------------- */

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1</div>
        <div className={`h-1 flex-1 transition-colors ${step >= 2 ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</div>
        <div className={`h-1 flex-1 transition-colors ${step >= 3 ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</div>
      </div>

      {step === 1 && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Initiate AI Encounter</h3>
            <p className="text-slate-500 text-sm">Select patient and upload multimodal artifacts.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Select Patient</label>
              <select 
                className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedPatient?.id || ''}
                onChange={(e) => {
                  const p = patients.find(pat => pat.id === e.target.value);
                  setSelectedPatient(p || null);
                }}
              >
                <option value="">-- Choose a patient --</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:border-blue-300 transition-colors">
                <label className="block text-sm font-bold text-slate-700 mb-3"><i className="fas fa-file-pdf mr-2 text-red-500"></i>Lab Report (PDF)</label>
                <div className="flex flex-col items-center justify-center py-4">
                  {labFile ? (
                    <p className="text-xs font-bold text-blue-600">{labFile.name}</p>
                  ) : (
                    <input type="file" accept=".pdf" onChange={e => setLabFile(e.target.files?.[0] || null)} className="text-xs" />
                  )}
                </div>
              </div>

              <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:border-blue-300 transition-colors">
                <label className="block text-sm font-bold text-slate-700 mb-3"><i className="fas fa-microphone mr-2 text-blue-500"></i>Conversation Audio</label>
                <div className="flex flex-col items-center gap-3">
                  {isRecording ? (
                    <div className="flex flex-col items-center gap-2">
                      <button onClick={stopRecording} className="w-12 h-12 bg-red-500 text-white rounded-full animate-pulse"><i className="fas fa-stop"></i></button>
                      <span className="text-xs font-mono">{formatTime(recordingTime)}</span>
                    </div>
                  ) : audioFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-xs text-green-600 font-bold flex items-center gap-1">
                        <i className="fas fa-check-circle"></i>
                        {audioFile instanceof File ? audioFile.name : 'Audio Ready'}
                      </p>
                      <button 
                        onClick={() => setAudioFile(null)} 
                        className="text-xs text-red-500 hover:underline"
                      >
                        Clear Audio
                      </button>
                    </div>
                  ) : (
                    <>
                      <button onClick={startRecording} className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors">
                        <i className="fas fa-microphone"></i>
                      </button>
                      <span className="text-xs text-slate-400">or</span>
                      <label className="cursor-pointer">
                        <div className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors">
                          <i className="fas fa-upload mr-1"></i> Upload Audio
                        </div>
                        <input 
                          type="file" 
                          accept="audio/*,.wav,.mp3,.m4a,.ogg" 
                          onChange={e => setAudioFile(e.target.files?.[0] || null)} 
                          className="hidden" 
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={handleMultimodalProcess}
            disabled={isLoading || !selectedPatient || (!audioFile && !labFile)}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold disabled:opacity-50 shadow-lg shadow-blue-100"
          >
            {isLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
            Process Multimodal Encounter
          </button>
        </div>
      )}

      {step === 2 && previewNote && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-lg mb-4">Patient: {selectedPatient?.name}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {['subjective', 'objective', 'assessment', 'plan'].map((section) => (
                <div key={section} className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <h4 className="font-bold uppercase text-[10px] text-slate-400 mb-2 tracking-widest">{section}</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">{(previewNote as any)[section] || 'N/A'}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(1)} className="flex-1 bg-slate-100 py-4 rounded-2xl font-bold">Back</button>
            <button onClick={handleControlledRefinement} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold">Finalize & Refine</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerateSOAP;

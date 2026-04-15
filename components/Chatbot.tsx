
import React, { useState, useRef, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { SOAPNote, ChatMessage, AuthState } from '../types';

interface ChatbotProps {
  history: SOAPNote[];
}

type StoredEmbedding = {
  noteId: string;
  vector: number[];
  text: string;
  source?: 'ollama' | 'local';
};

type EmbeddingResult = {
  vector: number[];
  source: 'ollama' | 'local';
};

const EMBEDDING_DIM = 128;

const RAW_API_BASE = ((import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const API_ROOT = RAW_API_BASE.replace(/\/api$/i, '');

const safeReadAuthState = (): AuthState => {
  try {
    const raw = localStorage.getItem('clinical_mind_auth');
    if (!raw) return { user: null, type: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { user: null, type: null };
    return {
      user: parsed.user || null,
      type: parsed.type === 'doctor' || parsed.type === 'patient' ? parsed.type : null,
    };
  } catch {
    return { user: null, type: null };
  }
};

const noteToText = (note: SOAPNote) =>
  [
    `Date: ${note.date}`,
    `Patient: ${note.patientName} (${note.patientId})`,
    `Subjective: ${note.subjective}`,
    `Objective: ${note.objective}`,
    `Assessment: ${note.assessment}`,
    `Plan: ${note.plan}`,
  ].join('\n');

const tokenize = (text: string) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const hashToken = (token: string) => {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) - h + token.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

const localEmbedText = (text: string): number[] => {
  const v = new Array(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return v;

  for (const t of tokens) {
    const idx = hashToken(t) % EMBEDDING_DIM;
    v[idx] += 1;
  }

  const norm = Math.sqrt(v.reduce((acc, n) => acc + n * n, 0));
  return norm > 0 ? v.map(n => n / norm) : v;
};

const fetchEmbedding = async (text: string): Promise<EmbeddingResult> => {
  try {
    const response = await fetch(`${API_ROOT}/api/ollama/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text:latest',
        input: text,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Embeddings request failed: ${err}`);
    }

    const data = await response.json();
    const vector = Array.isArray(data.embedding) ? data.embedding : [];
    if (!vector.length) {
      throw new Error('Empty embedding returned by Ollama');
    }
    return { vector, source: 'ollama' };
  } catch (err) {
    console.warn('Using local fallback embeddings:', err);
    return { vector: localEmbedText(text), source: 'local' };
  }
};

const askRagModel = async (question: string, contexts: string[]): Promise<string> => {
  // 1. STRENGTHENED PROMPT:
  // We use a "System-User" structure to keep the model within clinical guardrails.
  const prompt = `
### SYSTEM ROLE
You are a highly precise Medical Record Assistant. Your goal is to answer user queries using ONLY the provided Clinical Context.

### RULES
1. LIMIT: Answer in 2-3 concise sentences.
2. SOURCE: If the answer isn't in the context, say exactly: "I cannot find specific details for that in the clinical records."
3. SAFETY: Do not provide general medical advice or diagnosis beyond what is written.
4. GREETINGS: If the user says "Hi" or "Hello", ignore the context and give a professional medical greeting.

### CLINICAL CONTEXT
${contexts.length > 0 ? contexts.join('\n---\n') : "No relevant records found."}

### USER QUESTION
${question}

### ASSISTANT RESPONSE:`;

  try {
    const response = await fetch(`${API_ROOT}/api/ollama/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:latest',
        prompt,
        stream: false, // Ensure we get a single complete response
        options: {
          temperature: 0.1,   // Low temperature = less "hallucination", more factual
          top_p: 0.9,
          stop: ["###", "USER:"] // Prevent the model from "talking to itself"
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    
    // 2. CLEANING THE OUTPUT:
    // Sometimes local models add extra whitespace or "Assistant:" prefixes.
    const cleanResponse = (data?.response || '')
      .replace(/^assistant\s*:\s*/i, '')
      .replace(/^response\s*:\s*/i, '')
      .trim() || "I don't have enough information.";
    
    return cleanResponse;

  } catch (err) {
    console.error('RAG Generation Error:', err);
    // Return a safe fallback rather than crashing the UI
    throw err; 
  }
};

const askGeminiModel = async (question: string, contexts: string[]): Promise<string> => {
  const response = await fetch(`${API_ROOT}/api/gemini/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, contexts }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return (data?.response || '').trim() || "I don't have enough information.";
};

 

const cosineSim = (a: number[], b: number[]) => {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot;
};

const buildLocalFallbackAnswer = (question: string, notes: SOAPNote[]): string => {
  if (!notes.length) return "I don't have enough information";

  const q = question.toLowerCase();
  const statusIntent = /health|status|condition|how is|how's|diagnosis|follow-?up/i.test(q);

  const patientMatched = notes.filter(n => q.includes((n.patientName || '').toLowerCase()));
  const candidates = (patientMatched.length ? patientMatched : notes)
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp);

  const note = candidates[0];
  if (!note) return "I don't have enough information";

  if (statusIntent) {
    const assessment = note.assessment || 'Not reported';
    const plan = note.plan || 'Not reported';
    return `Latest status for ${note.patientName} (${note.date}): Assessment: ${assessment}. Plan: ${plan}.`;
  }

  return `Most relevant record for ${note.patientName} (${note.date}): Subjective: ${note.subjective || 'Not reported'}. Assessment: ${note.assessment || 'Not reported'}.`;
};

const getNotesFingerprint = (notes: SOAPNote[]) =>
  notes.map(n => `${n.id}:${n.timestamp}`).join('|');

const lexicalScore = (query: string, text: string): number => {
  const qTokens = new Set(tokenize(query));
  const tTokens = new Set(tokenize(text));
  if (qTokens.size === 0 || tTokens.size === 0) return 0;

  let overlap = 0;
  qTokens.forEach(token => {
    if (tTokens.has(token)) overlap += 1;
  });

  return overlap / Math.max(1, Math.sqrt(qTokens.size * tTokens.size));
};

const normalizeText = (text: string) =>
  (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const getReferencedPatientIds = (query: string, notes: SOAPNote[]): string[] => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const qTokens = new Set(tokenize(normalizedQuery));
  const ids = new Set<string>();

  for (const note of notes) {
    const patientName = normalizeText(note.patientName || '');
    const patientId = normalizeText(note.patientId || '');
    if (!patientName && !patientId) continue;

    // Direct mention via patient id or full patient name has highest priority.
    if ((patientId && normalizedQuery.includes(patientId)) || (patientName && normalizedQuery.includes(patientName))) {
      ids.add(note.patientId);
      continue;
    }

    // Handle short queries like "issue with srihith" by matching rare name tokens.
    const nameTokens = tokenize(patientName).filter(t => t.length >= 3);
    if (nameTokens.some(t => qTokens.has(t))) {
      ids.add(note.patientId);
    }
  }

  return Array.from(ids);
};

const buildDoctorInitialMessage = (doctorName: string) =>
  `Hello Dr. ${doctorName.split(' ').pop()}. Please provide a patient name or patient ID to begin.`;

const Chatbot: React.FC<ChatbotProps> = ({ history }) => {
  const authState: AuthState = safeReadAuthState();
  const userName = authState.user ? (authState.type === 'doctor' ? (authState.user as any).fullName : (authState.user as any).name) : 'there';
  
  const initialMessage = authState.type === 'doctor' 
    ? buildDoctorInitialMessage(userName)
    : `Hello ${userName.split(' ')[0]}, I am your personal health assistant. I have access to your medical history. What would you like to know about your recent visits?`;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: initialMessage }
  ]);
  const [scopedHistory, setScopedHistory] = useState<SOAPNote[]>(history);
  const [embeddings, setEmbeddings] = useState<StoredEmbedding[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [needsIndex, setNeedsIndex] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string>('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedPatientName = selectedPatientId
    ? scopedHistory.find(n => n.patientId === selectedPatientId)?.patientName || selectedPatientId
    : null;

  const embeddingStorageKey = authState.user
    ? `chat_embeddings_${authState.type}_${(authState.user as any).id}`
    : 'chat_embeddings_guest';

  const embeddingsMetaKey = `${embeddingStorageKey}_meta`;

  useEffect(() => {
    const loadScopedNotes = async () => {
      if (!authState.user || !authState.type) {
        setScopedHistory(history);
        return;
      }

      const scope = authState.type === 'doctor'
        ? { doctorId: (authState.user as any).id }
        : { patientId: (authState.user as any).id };

      try {
        const data = await dbService.getNotes(scope);
        const sorted = data.sort((a, b) => b.timestamp - a.timestamp);
        setScopedHistory(sorted);
      } catch {
        setScopedHistory(history);
      }
    };

    loadScopedNotes();
  }, [authState.type, authState.user, history]);

  const handleIndexRecords = async () => {
    const fingerprint = getNotesFingerprint(scopedHistory);
    setIndexStatus('');

    if (scopedHistory.length === 0) {
      setEmbeddings([]);
      setNeedsIndex(false);
      localStorage.setItem(embeddingStorageKey, JSON.stringify([]));
      localStorage.setItem(embeddingsMetaKey, fingerprint);
      setIndexStatus('No records to index.');
      return;
    }

    setIsIndexing(true);
    try {
      const built: StoredEmbedding[] = [];
      let usedLocalFallback = false;
      for (const note of scopedHistory) {
        const text = noteToText(note);
        const embedding = await fetchEmbedding(text);
        if (embedding.source === 'local') usedLocalFallback = true;
        built.push({ noteId: note.id, text, vector: embedding.vector, source: embedding.source });
      }
      setEmbeddings(built);
      setNeedsIndex(false);
      localStorage.setItem(embeddingStorageKey, JSON.stringify(built));
      localStorage.setItem(embeddingsMetaKey, fingerprint);
      setIndexStatus(
        usedLocalFallback
          ? `Indexed ${built.length} records using local fallback embeddings.`
          : `Indexed ${built.length} records successfully.`
      );
    } catch (err) {
      console.error('Embedding build failed:', err);
      setNeedsIndex(true);
      setIndexStatus('Indexing failed. Chat will continue using latest records fallback.');
    } finally {
      setIsIndexing(false);
    }
  };

  useEffect(() => {
    const fingerprint = getNotesFingerprint(scopedHistory);

    try {
      const cachedMeta = localStorage.getItem(embeddingsMetaKey);
      const cachedVectorsRaw = localStorage.getItem(embeddingStorageKey);
      if (cachedMeta === fingerprint && cachedVectorsRaw) {
        const cached = JSON.parse(cachedVectorsRaw) as StoredEmbedding[];
        if (Array.isArray(cached) && cached.length > 0) {
          setEmbeddings(cached);
          setNeedsIndex(false);
          return;
        }
      }
    } catch {
      // Ignore cache parse issues.
    }

    setEmbeddings([]);
    setNeedsIndex(scopedHistory.length > 0);
  }, [scopedHistory, embeddingStorageKey, embeddingsMetaKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
  if (!input.trim() || isLoading) return;

  const userInput = input.trim();
  setMessages(prev => [...prev, { role: 'user', content: userInput }]);
  setInput('');
  setIsLoading(true);

  try {
    // 1. Better Greeting Check (LLM-like logic via Regex)
    if (/^(hi|hello|hey|hii|helo|greetings)\b/i.test(userInput)) {
      const greeting = authState.type === 'doctor'
        ? 'Hello Doctor. How can I assist you with your patient database today?'
        : 'Hello. I am here to help you review your medical history. What would you like to know?';
      setMessages(prev => [...prev, { role: 'assistant', content: greeting }]);
      setIsLoading(false); // Fix: need to turn off loading here
      return;
    }

    let contexts: string[] = [];
    let candidateNotes: SOAPNote[] = [];
    
    if (authState.type === 'doctor' && !selectedPatientId) {
      const mentioned = getReferencedPatientIds(userInput.toLowerCase(), scopedHistory);
      if (mentioned.length === 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Please provide a patient name or patient ID first. Example: "Show records for P003" or "Tell me about Srihith".'
        }]);
        return;
      }

      if (mentioned.length > 1) {
        const options = Array.from(new Set(
          scopedHistory
            .filter(n => mentioned.includes(n.patientId))
            .map(n => `${n.patientName} (${n.patientId})`)
        ));
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `I found multiple patients in your query: ${options.join(', ')}. Please provide one exact patient name or ID.`
        }]);
        return;
      }

      const patientId = mentioned[0];
      const patientName = scopedHistory.find(n => n.patientId === patientId)?.patientName || patientId;
      setSelectedPatientId(patientId);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Patient selected: ${patientName} (${patientId}). Ask your question about this patient's records.`
      }]);
      return;
    }

    const referencedPatientIds = getReferencedPatientIds(userInput, scopedHistory);
    const hasExplicitPatientReference = referencedPatientIds.length > 0;
    let retrievalPool: SOAPNote[] = [];

    if (referencedPatientIds.length > 0) {

      // fetch only that patient's notes from mongodb
      retrievalPool = await dbService.getNotes({
        patientId: referencedPatientIds[0]
      });

    } else if (selectedPatientId) {

      retrievalPool = await dbService.getNotes({
        patientId: selectedPatientId
      });

    } else {

      retrievalPool = scopedHistory;
    }

    if (selectedPatientId && hasExplicitPatientReference && !referencedPatientIds.includes(selectedPatientId)) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `You are currently querying ${selectedPatientName} (${selectedPatientId}). Click Restart to switch to another patient.`
      }]);
      return;
    }

    // 2. Semantic Search with Relevancy Guard
    if (embeddings.length > 0) {
      const queryEmbedding = await fetchEmbedding(userInput);
      const similarityThreshold = queryEmbedding.source === 'local' ? 0.2 : 0.62;
      const ranked = embeddings
        .map(e => ({
          note: retrievalPool.find(n => n.id === e.noteId),
          text: e.text,
          score: cosineSim(queryEmbedding.vector, e.vector)
        }))
        .filter(item => !!item.note && item.score > similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      
      contexts = ranked.map(item => item.text);
      candidateNotes = ranked.map(item => item.note as SOAPNote);
    }

    // 2b. Lexical fallback retrieval if semantic search misses.
    if (contexts.length === 0 && retrievalPool.length > 0) {
      const lexicalRanked = retrievalPool
        .map(note => {
          const text = noteToText(note);
          return { note, text, score: lexicalScore(userInput, text) };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);

      if (lexicalRanked.length > 0) {
        contexts = lexicalRanked.map(item => item.text);
        candidateNotes = lexicalRanked.map(item => item.note);
      }
    }

    // 3. Smart Decision Logic
    // If no specific records were found via semantic search, 
    // only fall back to "latest" if the query actually looks like a health question.
    const isHealthRelated = /patient|status|health|med|plan|diagnosis|treatment|visit|history|issue|problem|follow-?up|symptom/i.test(userInput);

    if (contexts.length === 0 && isHealthRelated && !hasExplicitPatientReference) {
      const latest = retrievalPool.slice(0, 2);
      contexts = latest.map(noteToText);
      candidateNotes = latest;
    }

    // 4. Final Response Generation
    if (contexts.length === 0) {
      // If we found nothing and it's not health related, don't show medical data!
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "I'm sorry, I couldn't find any information in the clinical records related to that query." 
      }]);
    } else {
      let response = '';
      try {
        response = await askGeminiModel(userInput, contexts);
      } catch {
        try {
          response = await askRagModel(userInput, contexts);
        } catch {
          response = buildLocalFallbackAnswer(userInput, candidateNotes);
        }
      }
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    }

  } catch (e) {
    setMessages(prev => [...prev, { role: 'assistant', content: 'Error processing your request.' }]);
  } finally {
    setIsLoading(false);
  }
};
  

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fadeIn">
      <div className="bg-slate-50 p-4 border-b border-slate-200">
        <h3 className="font-bold flex items-center gap-2">
          <i className="fas fa-robot text-blue-600"></i> {authState.type === 'doctor' ? 'Clinical Knowledge Assistant' : 'Personal Health Assistant'}
        </h3>
        <p className="text-xs text-slate-500">
          {authState.type === 'doctor' ? `Accessing ${scopedHistory.length} patient records` : `Reviewing your ${scopedHistory.length} clinical records`}
        </p>
        {authState.type === 'doctor' && selectedPatientId && (
          <p className="text-xs text-blue-700 mt-1">
            Active patient: {selectedPatientName} ({selectedPatientId})
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleIndexRecords}
            disabled={isIndexing || scopedHistory.length === 0}
            className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isIndexing ? 'Indexing...' : 'Index Records'}
          </button>
          {authState.type === 'doctor' && (
            <button
              onClick={() => {
                setSelectedPatientId(null);
                setInput('');
                setMessages([{ role: 'assistant', content: buildDoctorInitialMessage(userName) }]);
              }}
              className="px-3 py-1 text-xs font-semibold rounded-md bg-slate-700 text-white hover:bg-slate-800"
            >
              Restart
            </button>
          )}
          {needsIndex && !isIndexing && (
            <span className="text-xs text-amber-600">Index is outdated. Chat will use latest records until re-indexed.</span>
          )}
        </div>
        {indexStatus && (
          <p className="text-xs text-slate-600 mt-1">{indexStatus}</p>
        )}
        {isIndexing && (
          <p className="text-xs text-amber-600 mt-1">Indexing records for semantic search...</p>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
              m.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-100' 
                : 'bg-slate-100 text-slate-800 rounded-bl-none'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl px-4 py-3 text-sm animate-pulse flex items-center gap-2">
              <i className="fas fa-circle-notch fa-spin text-blue-500"></i>
              <span>Analysing records...</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={authState.type === 'doctor' ? "Ask about patient history..." : "Ask about your treatment plans..."}
            className="flex-1 border border-slate-300 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading || isIndexing}
            className="bg-blue-600 text-white p-2 rounded-lg w-10 flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;

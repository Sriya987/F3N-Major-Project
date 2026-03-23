
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
};

type EmbeddingResult = {
  vector: number[];
  source: 'ollama' | 'local';
};

const EMBEDDING_DIM = 128;

const RAW_API_BASE = ((import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const API_ROOT = RAW_API_BASE.replace(/\/api$/i, '');

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
  const prompt = `Answer briefly based only on the context.\nIf the context is insufficient, say "I don't have enough information".\n\nContext:\n${contexts.join('\n\n')}\n\nQuestion:\n${question}`;

  const response = await fetch(`${API_ROOT}/api/ollama/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.2:latest',
      prompt,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`RAG response failed: ${err}`);
  }

  const data = await response.json();
  return data?.response || "I don't have enough information";
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

const Chatbot: React.FC<ChatbotProps> = ({ history }) => {
  const authSaved = localStorage.getItem('clinical_mind_auth');
  const authState: AuthState = authSaved ? JSON.parse(authSaved) : { user: null, type: null };
  const userName = authState.user ? (authState.type === 'doctor' ? (authState.user as any).fullName : (authState.user as any).name) : 'there';
  
  const initialMessage = authState.type === 'doctor' 
    ? `Hello Dr. ${userName.split(' ').pop()}. I have access to your clinical records. How can I help you query the patient database today?`
    : `Hello ${userName.split(' ')[0]}, I am your personal health assistant. I have access to your medical history. What would you like to know about your recent visits?`;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: initialMessage }
  ]);
  const [scopedHistory, setScopedHistory] = useState<SOAPNote[]>(history);
  const [embeddings, setEmbeddings] = useState<StoredEmbedding[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [needsIndex, setNeedsIndex] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string>('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        built.push({ noteId: note.id, text, vector: embedding.vector });
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
    
    const userMsg: ChatMessage = { role: 'user', content: userInput };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      if (/^(hi|hello|hey|hii|helo)\b/i.test(userInput)) {
        const greeting = authState.type === 'doctor'
          ? 'Hello Doctor. Ask about any patient SOAP summary, diagnosis trends, or follow-up plans.'
          : 'Hello. Ask me anything about your notes, diagnosis summaries, or treatment plans.';
        setMessages(prev => [...prev, { role: 'assistant', content: greeting }]);
        return;
      }

      let contexts: string[] = [];
      let candidateNotes: SOAPNote[] = [];
      if (embeddings.length > 0) {
        try {
          const queryEmbedding = await fetchEmbedding(userInput);
          const queryVector = queryEmbedding.vector;
          const ranked = embeddings
            .map(e => ({
              note: scopedHistory.find(n => n.id === e.noteId),
              text: e.text,
              score: cosineSim(queryVector, e.vector)
            }))
            .filter(item => !!item.note && item.text)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          contexts = ranked.map(item => item.text);
          candidateNotes = ranked.map(item => item.note as SOAPNote);
        } catch {
          // Keep fallback below.
        }
      }

      // Always fallback to latest records when index is missing/stale/unavailable.
      if (contexts.length === 0) {
        const latest = scopedHistory.slice(0, 3);
        contexts = latest.map(noteToText);
        candidateNotes = latest;
      }

      if (contexts.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: "I don't have enough information" }]);
        return;
      }

      let response = '';
      try {
        response = await askRagModel(userInput, contexts);
      } catch (ragError) {
        console.error('RAG generation failed, using local fallback:', ragError);
        response = buildLocalFallbackAnswer(userInput, candidateNotes);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error processing that query.' }]);
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
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleIndexRecords}
            disabled={isIndexing || scopedHistory.length === 0}
            className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isIndexing ? 'Indexing...' : 'Index Records'}
          </button>
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

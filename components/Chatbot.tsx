
import React, { useState, useRef, useEffect } from 'react';
import { geminiService } from '../services/geminiService';
import { SOAPNote, ChatMessage, AuthState } from '../types';

interface ChatbotProps {
  history: SOAPNote[];
}

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
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await geminiService.queryNotes(input, history);
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
          {authState.type === 'doctor' ? `Accessing ${history.length} patient records` : `Reviewing your ${history.length} clinical records`}
        </p>
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
            disabled={!input.trim() || isLoading}
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

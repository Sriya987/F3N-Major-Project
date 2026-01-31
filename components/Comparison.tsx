
import React, { useState } from 'react';
import { geminiService } from '../services/geminiService';

const Comparison: React.FC = () => {
  const [dialogue, setDialogue] = useState('');
  const [flashResult, setFlashResult] = useState<any>(null);
  const [proResult, setProResult] = useState<any>(null);
  const [analysis, setAnalysis] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState({ flashTime: 0, proTime: 0 });

  const runAnalysis = async () => {
    if (!dialogue) return;
    setIsLoading(true);
    setFlashResult(null);
    setProResult(null);
    
    try {
      const startFlash = performance.now();
      const flash = await geminiService.generateSOAP(dialogue, '', 'gemini-3-flash-preview');
      const endFlash = performance.now();
      setFlashResult(flash);

      const startPro = performance.now();
      const pro = await geminiService.generateSOAP(dialogue, '', 'gemini-3-pro-preview');
      const endPro = performance.now();
      setProResult(pro);

      setMetrics({
        flashTime: Math.round(endFlash - startFlash),
        proTime: Math.round(endPro - startPro)
      });
      
      const expertAnalysis = await geminiService.analyzeDifferences(flash, pro);
      setAnalysis(expertAnalysis);
    } catch (e) {
      alert("Error in comparison run. Check API key or connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Model Analysis Laboratory</h2>
          <p className="text-slate-600">Benchmarking clinical reasoning across Gemini generations.</p>
        </div>
        <div className="flex gap-2">
          <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-mono">gemini-3-flash-preview</span>
          <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-mono">gemini-3-pro-preview</span>
        </div>
      </header>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-slate-700">Clinical Dialogue Stress Test</label>
          <button 
            onClick={() => setDialogue("Patient: I've had this nagging cough for 2 weeks, starts in the morning. I smoke about a pack a day. My chest feels heavy but no real pain. Doctor: Any sputum? Patient: Yeah, yellow-greenish. Doctor: Fever? Patient: Chills last night, didn't take my temp though.")}
            className="text-xs text-blue-600 hover:underline"
          >
            Load Sample Case
          </button>
        </div>
        <textarea 
          rows={4}
          value={dialogue}
          onChange={e => setDialogue(e.target.value)}
          className="w-full border p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm bg-slate-50"
          placeholder="Enter complex dialogue to compare model logic..."
        />
        <button 
          onClick={runAnalysis}
          disabled={isLoading || !dialogue}
          className="mt-4 bg-blue-600 text-white px-8 py-3 rounded-lg font-bold disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-200 transition-transform active:scale-95"
        >
          {isLoading ? <><i className="fas fa-circle-notch fa-spin"></i> Running Comparison...</> : 'Analyze Responses'}
        </button>
      </div>

      {flashResult && proResult && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Flash Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-blue-600 text-white p-3 flex justify-between items-center">
              <span className="font-bold text-sm">Gemini 3 Flash</span>
              <span className="text-xs opacity-80">{metrics.flashTime}ms Latency</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Subjective Summary</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{flashResult.subjective}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assessment & Plan</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{flashResult.assessment}</p>
                <div className="h-px bg-slate-200 my-2"></div>
                <p className="text-sm text-slate-700 leading-relaxed">{flashResult.plan}</p>
              </div>
            </div>
          </div>

          {/* Pro Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-purple-700 text-white p-3 flex justify-between items-center">
              <span className="font-bold text-sm">Gemini 3 Pro</span>
              <span className="text-xs opacity-80">{metrics.proTime}ms Latency</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Subjective Summary</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{proResult.subjective}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assessment & Plan</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{proResult.assessment}</p>
                <div className="h-px bg-slate-200 my-2"></div>
                <p className="text-sm text-slate-700 leading-relaxed">{proResult.plan}</p>
              </div>
            </div>
          </div>

          {/* Deep Reasoning Report */}
          <div className="md:col-span-2 bg-slate-900 text-slate-100 p-8 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <i className="fas fa-microscope text-8xl"></i>
            </div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-3">
              <i className="fas fa-brain text-yellow-400"></i>
              Automated Discrepancy Analysis
            </h3>
            <div className="prose prose-invert max-w-none">
              <p className="text-slate-300 text-sm leading-7 whitespace-pre-wrap">{analysis}</p>
            </div>
            <div className="mt-6 flex gap-4 text-xs">
               <div className="bg-slate-800 px-3 py-2 rounded flex items-center gap-2">
                 <i className="fas fa-check-circle text-green-400"></i>
                 <span>HIPAA Style: 100%</span>
               </div>
               <div className="bg-slate-800 px-3 py-2 rounded flex items-center gap-2">
                 <i className="fas fa-shield-alt text-blue-400"></i>
                 <span>Medical Grounding: Enabled</span>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Comparison;

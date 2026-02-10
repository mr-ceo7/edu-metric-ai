
import React, { useState, useEffect } from 'react';
import { ExamData, DiagnosisResult } from '../types';
import { analyzeExamData } from '../services/geminiService';

interface InferenceEngineProps {
  exam: ExamData;
}

const InferenceEngine: React.FC<InferenceEngineProps> = ({ exam }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  const performDiagnosis = async () => {
    setLoading(true);
    try {
      const diagnosis = await analyzeExamData(exam);
      setResult(diagnosis);
    } catch (err) {
      console.error(err);
      alert("Error generating diagnosis. Please check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">AI Diagnostic Engine</h2>
          <p className="text-slate-400">Deep patterns and hidden learning gaps detected by Gemini 3</p>
        </div>
        {!result && (
          <button
            onClick={performDiagnosis}
            disabled={loading}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/20 transition-all flex items-center space-x-2"
          >
            {loading ? (
              <><i className="fa-solid fa-spinner animate-spin"></i><span>Analyzing Class...</span></>
            ) : (
              <><i className="fa-solid fa-bolt"></i><span>Run AI Diagnosis</span></>
            )}
          </button>
        )}
      </header>

      {result ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom duration-500">
          <div className="glass p-8 rounded-3xl border-indigo-500/20 shadow-2xl relative overflow-hidden h-fit">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <i className="fa-solid fa-brain text-8xl"></i>
            </div>
            <h3 className="text-xl font-bold text-white mb-4 flex items-center">
              <i className="fa-solid fa-magnifying-glass-chart text-indigo-400 mr-3"></i>
              Executive Summary
            </h3>
            <p className="text-slate-300 leading-relaxed mb-8 text-lg">
              {result.overview}
            </p>

            <h4 className="font-bold text-white mb-3 text-sm uppercase tracking-widest text-indigo-400">Topic Performance</h4>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl">
                <span className="text-xs font-bold text-emerald-400 block mb-2">STRENGTHS</span>
                <ul className="space-y-1">
                  {result.topicStrengths.map((s, i) => (
                    <li key={i} className="text-emerald-100 text-sm flex items-center">
                      <i className="fa-solid fa-check-circle mr-2 opacity-50"></i> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-rose-500/5 border border-rose-500/20 p-4 rounded-xl">
                <span className="text-xs font-bold text-rose-400 block mb-2">WEAKNESSES</span>
                <ul className="space-y-1">
                  {result.topicWeaknesses.map((w, i) => (
                    <li key={i} className="text-rose-100 text-sm flex items-center">
                      <i className="fa-solid fa-warning mr-2 opacity-50"></i> {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <h4 className="font-bold text-white mb-3 text-sm uppercase tracking-widest text-indigo-400">Cognitive Analysis</h4>
            <div className="bg-indigo-500/5 border border-indigo-500/20 p-5 rounded-xl">
              <p className="text-slate-300 text-sm leading-relaxed italic">
                "{result.cognitiveAnalysis}"
              </p>
            </div>
          </div>

          <div className="space-y-6">
             <div className="glass p-8 rounded-3xl border-white/5 shadow-xl">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center">
                  <i className="fa-solid fa-lightbulb text-amber-400 mr-3"></i>
                  Actionable Recommendations
                </h3>
                <div className="space-y-4">
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="flex space-x-4 group">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 text-indigo-400 font-bold border border-white/5">
                        {i + 1}
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed group-hover:text-white transition-colors">
                        {rec}
                      </p>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setResult(null)}
                  className="mt-8 text-slate-500 text-sm hover:text-white transition-colors"
                >
                  Clear and Recalculate
                </button>
             </div>
          </div>
        </div>
      ) : (
        <div className="glass-dark border-dashed border-2 border-white/10 rounded-3xl h-[400px] flex flex-col items-center justify-center text-center p-8">
          <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-white/10 shadow-inner">
            <i className="fa-solid fa-robot text-3xl text-slate-600"></i>
          </div>
          <h3 className="text-xl font-semibold text-slate-400 mb-2">Awaiting Diagnosis</h3>
          <p className="text-slate-500 max-w-sm">
            Our AI engine is ready to process your class results to find cognitive gaps and hidden trends.
          </p>
        </div>
      )}
    </div>
  );
};

export default InferenceEngine;

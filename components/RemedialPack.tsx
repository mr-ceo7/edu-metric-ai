
import React, { useState, useEffect } from 'react';
import { generateRemedialPack } from '../services/geminiService';
import { RemedialPack as IRemedialPack } from '../types';

interface RemedialPackProps {
  preTopic?: string;
}

const RemedialPack: React.FC<RemedialPackProps> = ({ preTopic }) => {
  const [topic, setTopic] = useState(preTopic || '');
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState<IRemedialPack | null>(null);

  useEffect(() => {
    if (preTopic) {
      setTopic(preTopic);
      handleGenerate(preTopic);
    }
  }, [preTopic]);

  const handleGenerate = async (overrideTopic?: string) => {
    const topicToUse = overrideTopic || topic;
    if (!topicToUse) return;
    setLoading(true);
    try {
      const data = await generateRemedialPack(topicToUse, "Mathematics");
      setPack(data);
    } catch (err) {
      console.error(err);
      alert("Failed to generate pack.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      <header className="text-center space-y-4">
        <h2 className="text-4xl font-black text-white">Automated Remediation</h2>
        <p className="text-slate-400">Fix learning gaps instantly with AI-generated targeted lesson plans.</p>
        
        <div className="max-w-md mx-auto relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative flex items-center glass p-1 rounded-2xl">
            <input 
              type="text" 
              placeholder="Enter weak topic (e.g., Quadratic Equations)" 
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="flex-1 bg-transparent border-none focus:ring-0 text-white px-4 text-sm"
            />
            <button 
              onClick={() => handleGenerate()}
              disabled={loading}
              className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold text-sm shadow-xl hover:bg-slate-100 disabled:opacity-50 transition-all"
            >
              {loading ? <i className="fa-solid fa-sync animate-spin"></i> : "Generate Pack"}
            </button>
          </div>
        </div>
      </header>

      {pack && !loading && (
        <div className="grid grid-cols-1 gap-6 animate-in zoom-in-95 duration-500">
          <div className="glass p-8 rounded-3xl border-white/10 shadow-2xl space-y-8">
            <div className="flex items-center space-x-4 border-b border-white/5 pb-6">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 text-xl">
                <i className="fa-solid fa-scroll"></i>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">{pack.topic}</h3>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Targeted Learning Path</p>
              </div>
            </div>

            <section>
              <h4 className="text-indigo-300 font-bold mb-4 flex items-center text-lg">
                <i className="fa-solid fa-chalkboard-user mr-3"></i>
                Mini Lesson Plan
              </h4>
              <div className="bg-white/5 rounded-2xl p-6 text-slate-300 whitespace-pre-line leading-relaxed border border-white/5">
                {pack.lessonPlan}
              </div>
            </section>

            <section>
              <h4 className="text-purple-300 font-bold mb-4 flex items-center text-lg">
                <i className="fa-solid fa-list-check mr-3"></i>
                Check for Understanding (5 Questions)
              </h4>
              <div className="space-y-4">
                {pack.quiz.map((q, i) => (
                  <div key={i} className="glass p-5 rounded-2xl border-white/5">
                    <div className="flex space-x-3 mb-2">
                      <span className="text-indigo-400 font-black">Q{i+1}.</span>
                      <p className="text-white font-medium">{q.question}</p>
                    </div>
                    <details className="mt-2 text-sm">
                      <summary className="text-slate-500 cursor-pointer hover:text-indigo-400 transition-colors">Show Correct Answer</summary>
                      <div className="mt-2 p-3 bg-emerald-500/10 text-emerald-300 rounded-lg border border-emerald-500/20 font-semibold">
                        {q.answer}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex justify-center pt-8 border-t border-white/5">
              <button className="px-8 py-3 glass hover:bg-white/5 rounded-xl font-bold text-white border-white/20 transition-all flex items-center space-x-2">
                <i className="fa-solid fa-print"></i>
                <span>Print Remedial Handout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="py-20 flex flex-col items-center space-y-4">
           <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
           <p className="text-slate-400 animate-pulse font-medium italic">Synthesizing pedagogical content for "{topic}"...</p>
        </div>
      )}
    </div>
  );
};

export default RemedialPack;

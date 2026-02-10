import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';
import { ExamData, CognitiveLevel } from '../types';
import { BLOOM_COLORS } from '../constants';

interface DashboardProps {
  exam: ExamData;
  onRemediate: (topic: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ exam, onRemediate }) => {
  const aggregatedStats = useMemo(() => {
    const topicScores: Record<string, { total: number, max: number, concepts: Record<string, { total: number, max: number }> }> = {};
    const bloomScores: Record<string, { total: number, max: number }> = {};
    let subjectTotal = 0;
    let subjectMax = 0;

    exam.studentScores.forEach(student => {
      Object.entries(student.scores).forEach(([qId, scoreValue]) => {
        const score = scoreValue as number;
        const q = exam.questions.find(q => q.id === parseInt(qId));
        if (q) {
          subjectTotal += score;
          subjectMax += q.maxScore;

          if (!topicScores[q.topic]) {
            topicScores[q.topic] = { total: 0, max: 0, concepts: {} };
          }
          topicScores[q.topic].total += score;
          topicScores[q.topic].max += q.maxScore;

          if (!topicScores[q.topic].concepts[q.subTopic]) {
            topicScores[q.topic].concepts[q.subTopic] = { total: 0, max: 0 };
          }
          topicScores[q.topic].concepts[q.subTopic].total += score;
          topicScores[q.topic].concepts[q.subTopic].max += q.maxScore;

          if (!bloomScores[q.cognitiveLevel]) bloomScores[q.cognitiveLevel] = { total: 0, max: 0 };
          bloomScores[q.cognitiveLevel].total += score;
          bloomScores[q.cognitiveLevel].max += q.maxScore;
        }
      });
    });

    const topicData = Object.entries(topicScores).map(([name, stats]) => ({
      name,
      percentage: Math.round((stats.total / (stats.max || 1)) * 100),
      concepts: Object.entries(stats.concepts).map(([cName, cStats]) => ({
        name: cName,
        percentage: Math.round((cStats.total / (cStats.max || 1)) * 100)
      }))
    }));

    const bloomData = Object.entries(bloomScores).map(([name, stats]) => ({
      name,
      value: Math.round((stats.total / (stats.max || 1)) * 100)
    }));

    return { 
      topicData, 
      bloomData, 
      subjectPercentage: Math.round((subjectTotal / (subjectMax || 1)) * 100) 
    };
  }, [exam]);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
             <h2 className="text-2xl md:text-4xl font-black text-white">{exam.subject}</h2>
             <span className="hidden md:inline-block px-3 py-1 bg-indigo-600/20 text-indigo-400 rounded-full text-[10px] font-bold border border-indigo-500/30">SUBJECT PERFORMANCE</span>
          </div>
          <p className="text-slate-400 text-sm md:text-base">{exam.title} • {exam.date}</p>
        </div>
        <div className="flex items-end md:items-center space-x-4 md:text-right bg-white/5 md:bg-transparent p-3 md:p-0 rounded-2xl w-full md:w-auto">
          <div className="flex-1 md:flex-none">
            <div className="text-3xl md:text-5xl font-black text-indigo-400 leading-none">{aggregatedStats.subjectPercentage}%</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-1">Class Mastery</div>
          </div>
          <div className="md:hidden w-12 h-12 rounded-full border-4 border-indigo-500/20 flex items-center justify-center">
            <i className="fa-solid fa-chart-line text-indigo-500"></i>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-3xl p-5 md:p-8 border-white/10 shadow-xl overflow-hidden">
            <h3 className="text-lg md:text-xl font-bold text-white mb-6 flex items-center">
              <i className="fa-solid fa-sitemap text-indigo-500 mr-3"></i>
              Topic & Concept Health
            </h3>
            <div className="space-y-8">
              {aggregatedStats.topicData.map((topic) => (
                <div key={topic.name} className="space-y-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h4 className="text-base md:text-lg font-bold text-white flex items-center">
                      {topic.name}
                      <span className="ml-2 text-xs text-slate-500 font-medium">{topic.percentage}%</span>
                    </h4>
                    {topic.percentage < 60 && (
                      <button 
                        onClick={() => onRemediate(topic.name)}
                        className="px-3 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-[10px] font-bold hover:bg-rose-500 hover:text-white transition-all flex items-center space-x-2"
                      >
                        <i className="fa-solid fa-wand-magic-sparkles"></i>
                        <span>Fix Gap</span>
                      </button>
                    )}
                  </div>
                  <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${topic.percentage > 70 ? 'bg-emerald-500' : topic.percentage > 40 ? 'bg-indigo-500' : 'bg-rose-500'}`}
                      style={{ width: `${topic.percentage}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-2 md:pl-4">
                    {topic.concepts.map(concept => (
                      <div key={concept.name} className="flex justify-between items-center text-xs p-2.5 glass rounded-xl border-white/5 bg-white/2">
                        <span className="text-slate-400 font-medium truncate pr-2">{concept.name}</span>
                        <span className={`font-bold shrink-0 ${concept.percentage > 70 ? 'text-emerald-400' : concept.percentage > 40 ? 'text-slate-300' : 'text-rose-400'}`}>
                          {concept.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-3xl p-5 md:p-8 border-white/10 shadow-xl overflow-hidden">
            <h3 className="text-lg md:text-xl font-bold text-white mb-6 flex items-center">
              <i className="fa-solid fa-brain text-purple-500 mr-3"></i>
              Bloom's Proficiencies
            </h3>
            <div className="h-56 md:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={aggregatedStats.bloomData}>
                  <PolarGrid stroke="rgba(255,255,255,0.05)" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Proficiency"
                    dataKey="value"
                    stroke="#a855f7"
                    fill="#a855f7"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
               {aggregatedStats.bloomData.map(level => (
                 <div key={level.name} className="p-2.5 glass rounded-xl border-l-4" style={{ borderLeftColor: BLOOM_COLORS[level.name as CognitiveLevel] }}>
                   <div className="text-[9px] text-slate-500 uppercase font-black truncate">{level.name}</div>
                   <div className="text-base font-black text-white">{level.value}%</div>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
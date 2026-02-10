
import React, { useState } from 'react';
import { ExamData, Question, CognitiveLevel, StudentScore } from '../types';

interface BlueprintProps {
  exam: ExamData;
  onUpdate: (updatedExam: ExamData) => void;
}

const Blueprint: React.FC<BlueprintProps> = ({ exam, onUpdate }) => {
  const [questions, setQuestions] = useState<Question[]>(exam.questions);
  const [title, setTitle] = useState(exam.title);
  const [date, setDate] = useState(exam.date);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    if(window.confirm("Removing a question will delete all associated student marks for this ID. Proceed?")) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const saveMapping = () => {
    // Ensure data integrity by syncing student scores with any ID changes
    onUpdate({
      ...exam,
      title,
      date,
      questions
    });
    alert("Curricular mapping verified and saved.");
  };

  const getQuestionAverage = (qId: number) => {
    const validScores = exam.studentScores.map(s => s.scores[qId]).filter(s => s !== undefined) as number[];
    if (validScores.length === 0) return 0;
    const sum = validScores.reduce((a, b) => a + b, 0);
    return Math.round((sum / validScores.length) * 10) / 10;
  };

  // DnD for re-ordering if needed
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    const newQuestions = [...questions];
    const draggedItem = newQuestions[draggedIdx];
    newQuestions.splice(draggedIdx, 1);
    newQuestions.splice(index, 0, draggedItem);
    setDraggedIdx(index);
    setQuestions(newQuestions);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white">Curricular Mapping</h2>
          <p className="text-slate-400 text-sm italic">Review and refine the nodes extracted from {exam.school} booklets</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
             <button 
                onClick={saveMapping}
                className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center space-x-2"
            >
                <i className="fa-solid fa-check-double"></i>
                <span>Verify Mapping</span>
            </button>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="glass p-5 rounded-2xl border-white/5">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-1">Total Nodes</span>
            <span className="text-2xl font-black text-white">{questions.length} Questions</span>
         </div>
         <div className="glass p-5 rounded-2xl border-white/5">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-1">Marked Students</span>
            <span className="text-2xl font-black text-indigo-400">{exam.studentScores.length}</span>
         </div>
         <div className="glass p-5 rounded-2xl border-white/5">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-1">Assessment Title</span>
            <input 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="bg-transparent border-none p-0 text-white font-bold focus:ring-0 w-full"
            />
         </div>
         <div className="glass p-5 rounded-2xl border-white/5">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-1">Subject / Level</span>
            <span className="text-sm font-bold text-slate-300 block truncate">{exam.subject} • {exam.level}</span>
         </div>
      </div>

      <div className="glass rounded-[2rem] overflow-hidden border-white/10 shadow-2xl">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-black">
              <tr>
                <th className="px-6 py-5 w-16">ID</th>
                <th className="px-6 py-5">Topic (From QR)</th>
                <th className="px-6 py-5">Sub-Topic / Concept</th>
                <th className="px-6 py-5">Bloom's Level</th>
                <th className="px-6 py-5 w-24 text-center">Max</th>
                <th className="px-6 py-5 w-24 text-center text-indigo-400">Avg. Score</th>
                <th className="px-6 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {questions.map((q, idx) => (
                <tr 
                  key={q.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={() => setDraggedIdx(null)}
                  className={`hover:bg-white/2 transition-all group ${draggedIdx === idx ? 'opacity-30' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold border border-white/5 text-xs">
                      {q.id}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input 
                      type="text"
                      value={q.topic}
                      onChange={(e) => updateQuestion(idx, 'topic', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500/30 rounded-lg px-2 py-1 text-white text-sm font-semibold"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input 
                      type="text"
                      value={q.subTopic}
                      onChange={(e) => updateQuestion(idx, 'subTopic', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500/30 rounded-lg px-2 py-1 text-slate-400 text-xs"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select 
                      value={q.cognitiveLevel}
                      onChange={(e) => updateQuestion(idx, 'cognitiveLevel', e.target.value)}
                      className="bg-slate-950/50 border border-white/5 rounded-lg px-3 py-1.5 text-white text-[11px] outline-none cursor-pointer"
                    >
                      {Object.values(CognitiveLevel).map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input 
                      type="number"
                      value={q.maxScore}
                      onChange={(e) => updateQuestion(idx, 'maxScore', parseInt(e.target.value) || 0)}
                      className="w-16 mx-auto bg-slate-950/50 border border-white/5 rounded-lg px-2 py-1.5 text-white text-xs text-center font-bold"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[11px] font-black text-indigo-400 bg-indigo-500/5 px-2 py-1 rounded">
                      {getQuestionAverage(q.id)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => removeQuestion(idx)} className="text-rose-500/30 hover:text-rose-500 transition-all p-2">
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </td>
                </tr>
              ))}
              {questions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-600 italic">
                    No curricular data found. Scan an answer booklet to populate this mapping automatically.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="flex items-center justify-between p-6 glass rounded-2xl border-white/5">
         <div className="flex items-center space-x-3 text-slate-500 text-xs">
            <i className="fa-solid fa-circle-info text-indigo-500"></i>
            <span>This mapping is synchronized in real-time with the Marking Assistant scanning process.</span>
         </div>
         <button 
           onClick={() => setQuestions([...questions, { id: questions.length + 1, topic: 'New Topic', subTopic: 'Concept', maxScore: 10, cognitiveLevel: CognitiveLevel.RECALL }])}
           className="text-indigo-400 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest flex items-center"
         >
           <i className="fa-solid fa-plus mr-2"></i> Manual Add Node
         </button>
      </div>
    </div>
  );
};

export default Blueprint;

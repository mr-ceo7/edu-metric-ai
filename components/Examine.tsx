import React, { useState, useMemo } from 'react';
import { ExamSession, Question, StudentInfo, CognitiveLevel, AppConfig } from '../types';
import { createNewSession, saveSession } from '../services/storageService';
import { generateExamQuestions } from '../services/geminiService';

interface ExamineProps {
  config: AppConfig;
  session: ExamSession | null;
  onSessionCreated: (session: ExamSession) => void;
  onSessionUpdated: (session: ExamSession) => void;
}

const Examine: React.FC<ExamineProps> = ({ config, session, onSessionCreated, onSessionUpdated }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [examTitle, setExamTitle] = useState(session?.examTitle || 'Term 1 Mid-Exams');
  const [examDate, setExamDate] = useState(session?.date || new Date().toISOString().split('T')[0]);
  const [questions, setQuestions] = useState<Question[]>(session?.questions || []);
  // Auto-compute total pages: 3 questions on page 1 (header), 4 on subsequent
  const totalPages = useMemo(() => {
    if (questions.length === 0) return 1;
    const FIRST_PAGE = 3;
    const PER_PAGE = 4;
    if (questions.length <= FIRST_PAGE) return 1;
    return 1 + Math.ceil((questions.length - FIRST_PAGE) / PER_PAGE);
  }, [questions.length]);
  const [students, setStudents] = useState<StudentInfo[]>(session?.students || []);
  const [csvInput, setCsvInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoTopic, setAutoTopic] = useState('');
  const [autoSubTopic, setAutoSubTopic] = useState('');
  const [autoCount, setAutoCount] = useState(5);

  // New question form state
  const [newQ, setNewQ] = useState({
    topic: '',
    subTopic: '',
    questionText: '',
    maxScore: 5,
    cognitiveLevel: CognitiveLevel.RECALL,
    pageNumber: 1,
  });

  // New student form state
  const [newStudent, setNewStudent] = useState({ name: '', id: '' });

  // ---- Step 1: Questions ----
  const addQuestion = () => {
    if (!newQ.topic || !newQ.subTopic) return;
    const q: Question = {
      id: questions.length + 1,
      topic: newQ.topic,
      subTopic: newQ.subTopic,
      questionText: newQ.questionText,
      maxScore: newQ.maxScore,
      cognitiveLevel: newQ.cognitiveLevel,
      pageNumber: newQ.pageNumber,
    };
    setQuestions([...questions, q]);
    setNewQ({ topic: '', subTopic: '', questionText: '', maxScore: 5, cognitiveLevel: CognitiveLevel.RECALL, pageNumber: newQ.pageNumber });
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleAutoGenerate = async () => {
    if (!autoTopic || !autoSubTopic) return;
    setIsGenerating(true);
    try {
      const newQuestions = await generateExamQuestions(autoTopic, autoSubTopic, autoCount);
      const startId = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;
      
      const processedQuestions = newQuestions.map((q, i) => ({
        ...q,
        id: startId + i,
        pageNumber: 1 // Default to page 1, user can adjust
      }));
      
      setQuestions([...questions, ...processedQuestions]);
      setShowAutoModal(false);
      setAutoTopic('');
      setAutoSubTopic('');
    } catch (err) {
      console.error(err);
      alert('Failed to generate questions. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- Step 2: Students ----
  const addStudent = () => {
    if (!newStudent.name) return;
    const student: StudentInfo = {
      id: newStudent.id || `STU-${students.length + 1}`,
      name: newStudent.name,
    };
    setStudents([...students, student]);
    setNewStudent({ name: '', id: '' });
  };

  const removeStudent = (idx: number) => {
    setStudents(students.filter((_, i) => i !== idx));
  };

  const importCSV = () => {
    if (!csvInput.trim()) return;
    const lines = csvInput.trim().split('\n');
    const newStudents: StudentInfo[] = lines.map((line, i) => {
      const parts = line.split(',').map(s => s.trim());
      return {
        name: parts[0] || `Student ${students.length + i + 1}`,
        id: parts[1] || `STU-${students.length + i + 1}`,
      };
    });
    setStudents([...students, ...newStudents]);
    setCsvInput('');
  };

  // ---- Step 3: Generate ----
  const saveExamSession = () => {
    if (session) {
      const updated: ExamSession = {
        ...session,
        examTitle,
        date: examDate,
        questions,
        students,
        totalPages,
        updatedAt: Date.now(),
      };
      onSessionUpdated(updated);
    } else {
      const newSession = createNewSession(
        config.school,
        config.subject,
        config.level,
        examTitle,
        examDate,
        questions,
        students,
        totalPages
      );
      onSessionCreated(newSession);
    }
  };

  const handleGeneratePDF = async () => {
    saveExamSession();
    setIsGenerating(true);

    try {
      // Dynamically import PDF generation to avoid loading heavy deps upfront
      const { generateBookletPDF } = await import('./BookletPDF');
      await generateBookletPDF({
        school: config.school,
        subject: config.subject,
        level: config.level,
        examTitle,
        date: examDate,
        questions,
        students,
        totalPages,
      });
      setPdfReady(true);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF. Check console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  const questionsPerPage = useMemo(() => {
    const grouped: Record<number, Question[]> = {};
    questions.forEach(q => {
      const page = q.pageNumber || 1;
      if (!grouped[page]) grouped[page] = [];
      grouped[page].push(q);
    });
    return grouped;
  }, [questions]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white">Examination Setup</h2>
          <p className="text-slate-400 text-sm">Create exams, define questions, and generate personalized answer booklets</p>
        </div>
        <div className="flex items-center space-x-1 bg-white/5 rounded-xl p-1">
          {[1, 2, 3].map(s => (
            <button
              key={s}
              onClick={() => setStep(s as 1 | 2 | 3)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                step === s
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {s === 1 ? 'Questions' : s === 2 ? 'Students' : 'Generate'}
            </button>
          ))}
        </div>
      </header>

      {/* Exam Info Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="glass rounded-xl p-4">
          <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block mb-1">Exam Title</label>
          <input
            value={examTitle}
            onChange={e => setExamTitle(e.target.value)}
            className="w-full bg-transparent text-white font-bold text-sm focus:outline-none"
          />
        </div>
        <div className="glass rounded-xl p-4">
          <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block mb-1">Date</label>
          <input
            type="date"
            value={examDate}
            onChange={e => setExamDate(e.target.value)}
            className="w-full bg-transparent text-white font-bold text-sm focus:outline-none"
          />
        </div>
        <div className="glass rounded-xl p-4">
          <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block mb-1">Subject & Level</label>
          <span className="text-white font-bold text-sm">{config.subject} • {config.level}</span>
        </div>
        <div className="glass rounded-xl p-4">
          <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block mb-1">Pages (auto)</label>
          <span className="text-white font-bold text-sm">{totalPages}</span>
        </div>
      </div>

      {/* Step 1: Questions */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          {/* Add Question Form */}
          <div className="glass-card">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <i className="fa-solid fa-plus-circle text-indigo-400 mr-3"></i>
                Add Question
              </div>
              <button
                onClick={() => setShowAutoModal(true)}
                className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg text-xs font-bold border border-purple-500/30 flex items-center space-x-2 transition-all"
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
                <span>Auto-Generate</span>
              </button>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Topic</label>
                <input
                  value={newQ.topic}
                  onChange={e => setNewQ({ ...newQ, topic: e.target.value })}
                  placeholder="e.g., Algebra"
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-indigo-500/50 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Sub-Topic / Concept</label>
                <input
                  value={newQ.subTopic}
                  onChange={e => setNewQ({ ...newQ, subTopic: e.target.value })}
                  placeholder="e.g., Linear Equations"
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-indigo-500/50 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Question Text</label>
                <textarea
                  value={newQ.questionText}
                  onChange={e => setNewQ({ ...newQ, questionText: e.target.value })}
                  placeholder="Full question text..."
                  rows={2}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-indigo-500/50 focus:outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Max Score</label>
                  <input
                    type="number"
                    min={1}
                    value={newQ.maxScore}
                    onChange={e => setNewQ({ ...newQ, maxScore: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm text-center font-bold focus:border-indigo-500/50 focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Page #</label>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={newQ.pageNumber}
                    onChange={e => setNewQ({ ...newQ, pageNumber: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm text-center font-bold focus:border-indigo-500/50 focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Bloom's</label>
                  <select
                    value={newQ.cognitiveLevel}
                    onChange={e => setNewQ({ ...newQ, cognitiveLevel: e.target.value as CognitiveLevel })}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-3 py-3 text-white text-[11px] font-bold focus:border-indigo-500/50 focus:outline-none appearance-none cursor-pointer"
                  >
                    {Object.values(CognitiveLevel).map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-end">
                <button
                  onClick={addQuestion}
                  disabled={!newQ.topic || !newQ.subTopic}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl text-white font-bold transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                >
                  <i className="fa-solid fa-plus"></i>
                  <span>Add Question</span>
                </button>
              </div>
            </div>
          </div>

          {/* Questions List */}
          {questions.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden border border-white/10">
              <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-white text-sm flex items-center">
                  <i className="fa-solid fa-list-ol text-indigo-400 mr-2"></i>
                  {questions.length} Questions Defined
                </h3>
                <span className="text-[10px] text-slate-500 font-bold">
                  Total Marks: {questions.reduce((a, q) => a + q.maxScore, 0)}
                </span>
              </div>
              <div className="divide-y divide-white/5">
                {questions.map((q, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-indigo-600/15 rounded-lg flex items-center justify-center text-indigo-400 font-bold text-xs">
                        {q.id}
                      </div>
                      <div>
                        <div className="text-white font-semibold text-sm">{q.topic} — {q.subTopic}</div>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-[10px] text-slate-500 font-bold">Page {q.pageNumber || 1}</span>
                          <span className="text-[10px] text-slate-600">•</span>
                          <span className="text-[10px] text-slate-500 font-bold">{q.maxScore} marks</span>
                          <span className="text-[10px] text-slate-600">•</span>
                          <span className="text-[10px] text-indigo-400 font-bold">{q.cognitiveLevel}</span>
                        </div>
                        {q.questionText && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">{q.questionText}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeQuestion(idx)} className="text-slate-600 hover:text-rose-400 transition-colors p-2">
                      <i className="fa-solid fa-trash-can text-sm"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {questions.length === 0 && (
            <div className="glass-card text-center py-12">
              <i className="fa-solid fa-clipboard-question text-4xl text-slate-700 mb-4"></i>
              <p className="text-slate-500">No questions added yet. Create your exam questions above.</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => { if (questions.length > 0) setStep(2); }}
              disabled={questions.length === 0}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl text-white font-bold transition-all flex items-center space-x-2"
            >
              <span>Next: Add Students</span>
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Students */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center">
              <i className="fa-solid fa-user-plus text-indigo-400 mr-3"></i>
              Add Students
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Student Name</label>
                <input
                  value={newStudent.name}
                  onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="e.g., John Doe"
                  onKeyDown={e => e.key === 'Enter' && addStudent()}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-indigo-500/50 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Student ID (optional)</label>
                <input
                  value={newStudent.id}
                  onChange={e => setNewStudent({ ...newStudent, id: e.target.value })}
                  placeholder="Auto-generated if blank"
                  onKeyDown={e => e.key === 'Enter' && addStudent()}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-indigo-500/50 focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={addStudent}
                  disabled={!newStudent.name}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl text-white font-bold transition-all active:scale-[0.98]"
                >
                  <i className="fa-solid fa-plus mr-2"></i>Add
                </button>
              </div>
            </div>

            {/* CSV Import */}
            <div className="mt-6 pt-6 border-t border-white/5">
              <h4 className="text-sm font-bold text-slate-400 mb-3 flex items-center">
                <i className="fa-solid fa-file-csv text-emerald-400 mr-2"></i>
                Bulk Import (CSV)
              </h4>
              <div className="flex gap-3">
                <textarea
                  value={csvInput}
                  onChange={e => setCsvInput(e.target.value)}
                  placeholder="Name, ID (one per line)&#10;John Doe, STU-001&#10;Jane Smith, STU-002"
                  rows={3}
                  className="flex-1 bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-indigo-500/50 focus:outline-none resize-none font-mono"
                />
                <button
                  onClick={importCSV}
                  disabled={!csvInput.trim()}
                  className="px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl text-white font-bold transition-all text-sm"
                >
                  Import
                </button>
              </div>
            </div>
          </div>

          {students.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden border border-white/10">
              <div className="p-4 bg-white/5 border-b border-white/5">
                <h3 className="font-bold text-white text-sm">
                  <i className="fa-solid fa-users text-indigo-400 mr-2"></i>
                  {students.length} Students
                </h3>
              </div>
              <div className="divide-y divide-white/5 max-h-64 overflow-y-auto no-scrollbar">
                {students.map((s, idx) => (
                  <div key={idx} className="p-3 px-4 flex items-center justify-between hover:bg-white/[0.02]">
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 bg-purple-600/15 rounded-full flex items-center justify-center text-purple-400 font-bold text-[10px]">
                        {idx + 1}
                      </div>
                      <span className="text-white text-sm font-medium">{s.name}</span>
                      <span className="text-slate-600 text-xs">{s.id}</span>
                    </div>
                    <button onClick={() => removeStudent(idx)} className="text-slate-600 hover:text-rose-400 transition-colors">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-6 py-3 glass rounded-xl text-slate-400 font-bold transition-all hover:text-white">
              <i className="fa-solid fa-arrow-left mr-2"></i>Back
            </button>
            <button
              onClick={() => { if (students.length > 0) setStep(3); }}
              disabled={students.length === 0}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl text-white font-bold transition-all flex items-center space-x-2"
            >
              <span>Next: Preview & Generate</span>
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Generate */}
      {step === 3 && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="glass rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-indigo-400">{questions.length}</div>
              <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Questions</div>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-purple-400">{students.length}</div>
              <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Students</div>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-cyan-400">{totalPages}</div>
              <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Pages</div>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-emerald-400">{questions.reduce((a, q) => a + q.maxScore, 0)}</div>
              <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Total Marks</div>
            </div>
          </div>

          {/* Page Preview */}
          <div className="glass-card">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center">
              <i className="fa-solid fa-eye text-indigo-400 mr-3"></i>
              Booklet Page Preview
            </h3>
            <div className="bg-white rounded-2xl p-6 max-w-lg mx-auto shadow-2xl">
              {/* Simulated page layout */}
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 relative min-h-[300px]">
                {/* Corner QR indicators */}
                <div className="absolute top-2 left-2 w-12 h-12 border-2 border-indigo-500 rounded bg-indigo-50 flex items-center justify-center">
                  <span className="text-[8px] text-indigo-600 font-bold">QR</span>
                </div>
                <div className="absolute top-2 right-2 w-12 h-12 border-2 border-indigo-500 rounded bg-indigo-50 flex items-center justify-center">
                  <span className="text-[8px] text-indigo-600 font-bold">QR</span>
                </div>
                <div className="absolute bottom-2 left-2 w-12 h-12 border-2 border-indigo-500 rounded bg-indigo-50 flex items-center justify-center">
                  <span className="text-[8px] text-indigo-600 font-bold">QR</span>
                </div>
                <div className="absolute bottom-2 right-2 w-12 h-12 border-2 border-indigo-500 rounded bg-indigo-50 flex items-center justify-center">
                  <span className="text-[8px] text-indigo-600 font-bold">QR</span>
                </div>

                <div className="text-center mb-4 pt-14">
                  <p className="text-slate-800 font-bold text-sm">{config.school}</p>
                  <p className="text-slate-500 text-xs">{examTitle} • {config.subject} • {config.level}</p>
                  <p className="text-indigo-600 font-bold text-xs mt-1">Student: [Student Name]</p>
                </div>

                {/* Sample question blocks */}
                {(questionsPerPage[1] || questions.slice(0, 2)).slice(0, 2).map((q, i) => (
                  <div key={i} className="mb-4 border border-slate-200 rounded-lg p-3">
                    <div>
                      <p className="text-slate-800 text-xs font-bold">Q{q.id}. {q.questionText || q.subTopic}</p>
                      <p className="text-slate-400 text-[10px]">{q.topic} • {q.maxScore} marks</p>
                      {/* OMR Strip */}
                      <div className="flex items-center space-x-1 mt-2">
                        <span className="text-[8px] text-slate-500 font-bold mr-1">Score:</span>
                        {Array.from({ length: q.maxScore + 1 }, (_, n) => (
                          <div key={n} className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center">
                            <span className="text-[7px] text-slate-400">{n}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Answer writing area */}
                    <div className="mt-2 border-t border-dashed border-slate-200 pt-2 space-y-1">
                      <div className="h-5 bg-slate-50 rounded border border-slate-100"></div>
                      <div className="h-5 bg-slate-50 rounded border border-slate-100"></div>
                    </div>
                  </div>
                ))}

                <p className="text-center text-[9px] text-slate-400 mt-auto">Page 1 of {totalPages}</p>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex flex-col items-center space-y-4">
            <button
              onClick={handleGeneratePDF}
              disabled={isGenerating || questions.length === 0 || students.length === 0}
              className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-2xl text-white font-black text-lg shadow-2xl shadow-indigo-500/25 transition-all active:scale-[0.98] flex items-center space-x-3"
            >
              {isGenerating ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin"></i>
                  <span>Generating {students.length} Booklets...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-file-pdf"></i>
                  <span>Generate All Booklets (PDF)</span>
                </>
              )}
            </button>

            {pdfReady && (
              <div className="flex items-center space-x-2 text-emerald-400 animate-fade-in">
                <i className="fa-solid fa-circle-check"></i>
                <span className="text-sm font-bold">PDF downloaded successfully!</span>
              </div>
            )}

            <button onClick={() => setStep(2)} className="text-slate-500 text-sm font-semibold hover:text-white transition-colors">
              <i className="fa-solid fa-arrow-left mr-2"></i>Back to Students
            </button>
          </div>
        </div>
      )}
      {/* Auto-Generate Modal */}
      {showAutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-md relative animate-slide-up">
            <button 
              onClick={() => setShowAutoModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
            
            <h3 className="text-xl font-black text-white mb-1 flex items-center">
              <i className="fa-solid fa-wand-magic-sparkles text-purple-400 mr-3"></i>
              AI Question Generator
            </h3>
            <p className="text-slate-400 text-xs mb-6">Enter a topic and let AI create questions for you.</p>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest">Topic</label>
                <input
                  value={autoTopic}
                  onChange={e => setAutoTopic(e.target.value)}
                  placeholder="e.g., Calculus"
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest">Sub-Topic</label>
                <input
                  value={autoSubTopic}
                  onChange={e => setAutoSubTopic(e.target.value)}
                  placeholder="e.g., Derivatives"
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest">Count</label>
                <div className="flex space-x-2">
                  {[3, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => setAutoCount(n)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                        autoCount === n
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {n} Questions
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={handleAutoGenerate}
                disabled={isGenerating || !autoTopic || !autoSubTopic}
                className="w-full py-3 mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 rounded-xl text-white font-black shadow-xl transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
              >
                {isGenerating ? (
                   <i className="fa-solid fa-circle-notch animate-spin"></i>
                ) : (
                   <i className="fa-solid fa-bolt"></i>
                )}
                <span>{isGenerating ? 'Dreaming up questions...' : 'Generate Questions'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Examine;

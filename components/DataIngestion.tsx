import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ExamSession, ScanRecord, CornerQRData, QuestionQRData, AppConfig } from '../types';
import { addScanToSession, getStudentScanProgress } from '../services/storageService';
import { extractOMRScores } from '../services/geminiService';

interface DataIngestionProps {
  session: ExamSession | null;
  config: AppConfig;
  onSessionUpdated: (session: ExamSession) => void;
}

const DataIngestion: React.FC<DataIngestionProps> = ({ session, config, onSessionUpdated }) => {
  const [mode, setMode] = useState<'capture' | 'processing' | 'confirm' | 'history'>('capture');
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [decodedCorner, setDecodedCorner] = useState<CornerQRData | null>(null);
  const [decodedQuestions, setDecodedQuestions] = useState<QuestionQRData[]>([]);
  const [extractedScores, setExtractedScores] = useState<Record<number, number>>({});
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // No session guard
  if (!session) {
    return (
      <div className="text-center py-20 glass-card animate-fade-in">
        <i className="fa-solid fa-circle-exclamation text-5xl text-amber-500 mb-6"></i>
        <h2 className="text-2xl font-bold text-white mb-2">No Exam Session Active</h2>
        <p className="text-slate-400 max-w-md mx-auto">
          Go to the <strong>Examine</strong> tab first to create an exam, define questions, and add students before you can start marking.
        </p>
      </div>
    );
  }

  const progress = getStudentScanProgress(session);

  // Camera management
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      alert('Camera error. Please ensure permissions are granted or use image upload instead.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Capture from camera
  const captureFromCamera = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      stopCamera();
      setCapturedImage(dataUrl);
      processImage(dataUrl);
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedImage(dataUrl);
      processImage(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset the input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Process image: decode QR codes + extract OMR scores
  const processImage = async (imageDataUrl: string) => {
    setMode('processing');
    setIsProcessing(true);
    setStatusMessage('Detecting QR codes...');

    try {
      // Try to decode QR codes using html5-qrcode
      let cornerData: CornerQRData | null = null;
      let questionDataList: QuestionQRData[] = [];

      try {
        const { Html5Qrcode } = await import('html5-qrcode');

        // Create a temporary element for scanning
        const tempDiv = document.createElement('div');
        tempDiv.id = 'qr-temp-reader';
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);

        const scanner = new Html5Qrcode('qr-temp-reader');

        // Convert data URL to File
        const response = await fetch(imageDataUrl);
        const blob = await response.blob();
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });

        try {
          const result = await scanner.scanFile(file, /* showImage */ false);
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(result);
            if (parsed.type === 'corner') {
              cornerData = parsed as CornerQRData;
            } else if (parsed.type === 'question') {
              questionDataList.push(parsed as QuestionQRData);
            }
          } catch {
            // Not JSON, might be other QR content
          }
        } catch {
          // QR detection may fail, we can still try Gemini
        }

        await scanner.clear();
        document.body.removeChild(tempDiv);
      } catch (qrError) {
        console.warn('QR scanning failed, falling back to Gemini:', qrError);
      }

      // If QR detection didn't find corner data, use session data
      // In a real deployment with printed QR codes, this would work reliably
      // For now, we can prompt the user to select the student
      if (!cornerData && session.students.length > 0) {
        setStatusMessage('QR codes not detected. Proceeding with AI analysis...');
      }

      // Extract OMR scores using Gemini
      setStatusMessage('Reading OMR scoring bubbles...');
      const base64 = imageDataUrl.split(',')[1];

      // Get questions for context
      const pageQuestions = cornerData
        ? session.questions.filter(q => (q.pageNumber || 1) === cornerData!.pageNumber)
        : session.questions;

      const scores = await extractOMRScores(base64, pageQuestions);

      setDecodedCorner(cornerData);
      setDecodedQuestions(
        questionDataList.length > 0
          ? questionDataList
          : pageQuestions.map(q => ({
              type: 'question' as const,
              questionId: q.id,
              topic: q.topic,
              concept: q.subTopic,
              maxScore: q.maxScore,
              questionText: q.questionText || '',
            }))
      );
      setExtractedScores(scores);
      setMode('confirm');
      setStatusMessage('');
    } catch (err) {
      console.error('Processing failed:', err);
      setStatusMessage('');
      alert('Failed to process the image. Please try again with a clearer image.');
      setMode('capture');
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm and save scores
  const confirmScores = (selectedStudentName?: string) => {
    const studentName = decodedCorner?.studentName || selectedStudentName || 'Unknown Student';

    const scanRecord: ScanRecord = {
      id: `scan-${Date.now()}`,
      imageDataUrl: capturedImage || '',
      timestamp: Date.now(),
      cornerData: decodedCorner,
      questions: decodedQuestions,
      extractedScores: { ...extractedScores },
      confirmed: true,
    };

    // If no corner data, create a mock one
    if (!scanRecord.cornerData) {
      scanRecord.cornerData = {
        type: 'corner',
        studentName,
        studentId: session.students.find(s => s.name === studentName)?.id || `temp-${Date.now()}`,
        level: config.level,
        subject: config.subject,
        date: session.date,
        examTitle: session.examTitle,
        pageNumber: 1,
        totalPages: session.totalPages,
        isFinalPage: false,
      };
    }

    const updatedSession = addScanToSession(session, scanRecord);
    onSessionUpdated(updatedSession);

    // Reset for next scan
    setCapturedImage(null);
    setDecodedCorner(null);
    setDecodedQuestions([]);
    setExtractedScores({});
    setMode('capture');
  };

  // Student selector for when QR isn't detected
  const [selectedStudent, setSelectedStudent] = useState('');

  const totalMarked = session.studentScores.length;
  const totalStudents = session.students.length;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white">Marking Station</h2>
          <p className="text-slate-400 text-sm">{session.examTitle} • {config.subject} • {config.level}</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="glass px-4 py-2 rounded-xl flex items-center space-x-2">
            <i className="fa-solid fa-users text-indigo-400"></i>
            <span className="text-white font-bold text-sm">{totalMarked}/{totalStudents}</span>
            <span className="text-[10px] text-slate-500 font-bold">MARKED</span>
          </div>
          <button
            onClick={() => setMode(mode === 'history' ? 'capture' : 'history')}
            className={`glass px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              mode === 'history' ? 'text-indigo-400 border-indigo-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left mr-2"></i>History
          </button>
        </div>
      </header>

      {/* Capture Mode */}
      {mode === 'capture' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Camera capture */}
            <div className="glass-card text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-indigo-600/15 rounded-2xl flex items-center justify-center mb-2">
                <i className="fa-solid fa-camera text-indigo-400 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-white">Camera Scan</h3>
              <p className="text-slate-500 text-sm">Point your camera at the marked answer sheet page</p>

              {cameraActive ? (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    {/* Overlay with corner indicators */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-3 left-3 w-10 h-10 border-t-3 border-l-3 border-indigo-400 rounded-tl-lg"></div>
                      <div className="absolute top-3 right-3 w-10 h-10 border-t-3 border-r-3 border-indigo-400 rounded-tr-lg"></div>
                      <div className="absolute bottom-3 left-3 w-10 h-10 border-b-3 border-l-3 border-indigo-400 rounded-bl-lg"></div>
                      <div className="absolute bottom-3 right-3 w-10 h-10 border-b-3 border-r-3 border-indigo-400 rounded-br-lg"></div>
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button onClick={stopCamera} className="flex-1 py-3 glass rounded-xl text-slate-400 font-bold hover:text-white transition-all">
                      Cancel
                    </button>
                    <button onClick={captureFromCamera} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold transition-all active:scale-[0.98]">
                      <i className="fa-solid fa-circle mr-2"></i>Capture
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={startCamera}
                  className="w-full py-4 bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600/20 rounded-xl text-indigo-400 font-bold transition-all"
                >
                  <i className="fa-solid fa-video mr-2"></i>Open Camera
                </button>
              )}
            </div>

            {/* File upload */}
            <div className="glass-card text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-purple-600/15 rounded-2xl flex items-center justify-center mb-2">
                <i className="fa-solid fa-upload text-purple-400 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-white">Upload Image</h3>
              <p className="text-slate-500 text-sm">Upload a photo of the marked answer sheet page</p>

              <label className="block w-full py-10 border-2 border-dashed border-white/10 hover:border-indigo-500/30 rounded-xl cursor-pointer transition-all group">
                <div className="space-y-2">
                  <i className="fa-solid fa-cloud-arrow-up text-3xl text-slate-600 group-hover:text-indigo-400 transition-colors"></i>
                  <p className="text-slate-500 text-sm group-hover:text-slate-300 transition-colors">
                    Click or drag image here
                  </p>
                  <p className="text-slate-600 text-[10px]">JPG, PNG — Max 10MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Student Progress */}
          {session.students.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden border border-white/10">
              <div className="p-4 bg-white/5 border-b border-white/5">
                <h3 className="font-bold text-white text-sm flex items-center">
                  <i className="fa-solid fa-chart-bar text-indigo-400 mr-2"></i>
                  Marking Progress
                </h3>
              </div>
              <div className="divide-y divide-white/5 max-h-64 overflow-y-auto no-scrollbar">
                {session.students.map(student => {
                  const p = progress[student.id];
                  const percentage = p ? Math.round((p.pagesScanned / p.totalPages) * 100) : 0;
                  return (
                    <div key={student.id} className="p-3 px-4 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          p?.isComplete ? 'bg-emerald-600/20 text-emerald-400' : 'bg-white/5 text-slate-500'
                        }`}>
                          {p?.isComplete ? <i className="fa-solid fa-check"></i> : student.name.charAt(0)}
                        </div>
                        <span className="text-white text-sm font-medium">{student.name}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${p?.isComplete ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold w-10 text-right">
                          {p ? `${p.pagesScanned}/${p.totalPages}` : '0/0'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing Mode */}
      {mode === 'processing' && (
        <div className="glass-card text-center py-16 animate-fade-in">
          <div className="w-16 h-16 mx-auto border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h3 className="text-xl font-bold text-white mb-2">Processing Answer Sheet</h3>
          <p className="text-slate-400 animate-pulse">{statusMessage || 'Analyzing image...'}</p>
          {capturedImage && (
            <img src={capturedImage} alt="Captured" className="w-48 h-auto mx-auto mt-6 rounded-xl opacity-50" />
          )}
        </div>
      )}

      {/* Confirm Mode */}
      {mode === 'confirm' && (
        <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
          {/* Student Info Header */}
          <div className="glass-card flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                <i className="fa-solid fa-user-check"></i>
              </div>
              <div>
                {decodedCorner ? (
                  <>
                    <h3 className="text-xl font-black text-white">{decodedCorner.studentName}</h3>
                    <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest">
                      Page {decodedCorner.pageNumber} of {decodedCorner.totalPages}
                      {decodedCorner.isFinalPage && ' • FINAL PAGE'}
                    </p>
                  </>
                ) : (
                  <>
                    <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block mb-1">
                      Select Student (QR not detected)
                    </label>
                    <select
                      value={selectedStudent}
                      onChange={e => setSelectedStudent(e.target.value)}
                      className="bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                    >
                      <option value="">— Select —</option>
                      {session.students.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-white">
                {Object.values(extractedScores).reduce((a: number, b: number) => a + b, 0)}
                <span className="text-sm text-slate-500 ml-1">
                  /{decodedQuestions.reduce((a, q) => a + q.maxScore, 0)}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold uppercase">Page Score</p>
            </div>
          </div>

          {/* Scanned Image Preview */}
          {capturedImage && (
            <details className="glass rounded-2xl overflow-hidden border border-white/10">
              <summary className="p-4 text-sm text-slate-400 font-semibold cursor-pointer hover:text-white transition-colors">
                <i className="fa-solid fa-image mr-2"></i>View Scanned Image (Evidence)
              </summary>
              <div className="p-4 pt-0">
                <img src={capturedImage} alt="Scanned page" className="w-full rounded-xl" />
              </div>
            </details>
          )}

          {/* Score Review */}
          <div className="glass rounded-2xl overflow-hidden border border-white/10">
            <div className="p-4 bg-white/5 border-b border-white/5">
              <h3 className="font-bold text-white text-sm flex items-center">
                <i className="fa-solid fa-list-check text-indigo-400 mr-2"></i>
                Review Extracted Scores
              </h3>
            </div>
            <div className="divide-y divide-white/5">
              {decodedQuestions.map(q => (
                <div key={q.questionId} className="p-4 flex items-center justify-between hover:bg-white/[0.02]">
                  <div className="space-y-1 flex-1">
                    <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">
                      Question {q.questionId}
                    </span>
                    <div className="text-white font-bold text-sm">{q.topic}</div>
                    <div className="text-[11px] text-slate-500">{q.concept}</div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min={0}
                      max={q.maxScore}
                      value={extractedScores[q.questionId] ?? 0}
                      onChange={e => {
                        const val = Math.min(Math.max(0, parseFloat(e.target.value) || 0), q.maxScore);
                        setExtractedScores({ ...extractedScores, [q.questionId]: val });
                      }}
                      className="w-16 bg-slate-950 border border-white/10 rounded-xl px-2 py-2 text-white text-center font-black focus:border-indigo-500 outline-none"
                    />
                    <span className="text-slate-600 text-xs font-bold">/ {q.maxScore}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={() => {
                setCapturedImage(null);
                setDecodedCorner(null);
                setDecodedQuestions([]);
                setExtractedScores({});
                setMode('capture');
              }}
              className="flex-1 py-4 glass text-slate-400 hover:text-white rounded-2xl font-bold transition-all"
            >
              Discard
            </button>
            <button
              onClick={() => confirmScores(selectedStudent || undefined)}
              disabled={!decodedCorner && !selectedStudent}
              className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center space-x-3 transition-all"
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>Confirm & Next Page</span>
            </button>
          </div>
        </div>
      )}

      {/* History Mode */}
      {mode === 'history' && (
        <div className="space-y-4 animate-fade-in">
          <h3 className="text-lg font-bold text-white flex items-center">
            <i className="fa-solid fa-clock-rotate-left text-indigo-400 mr-3"></i>
            Scan History ({session.scans.length} scans)
          </h3>
          {session.scans.length === 0 ? (
            <div className="glass-card text-center py-12">
              <i className="fa-solid fa-inbox text-4xl text-slate-700 mb-4"></i>
              <p className="text-slate-500">No scans recorded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...session.scans].reverse().map(scan => (
                <div key={scan.id} className="glass rounded-xl overflow-hidden border border-white/10">
                  <div className="flex items-center space-x-4 p-4">
                    {scan.imageDataUrl && (
                      <img src={scan.imageDataUrl} alt="Scan" className="w-16 h-16 rounded-lg object-cover opacity-70" />
                    )}
                    <div className="flex-1">
                      <p className="text-white font-bold text-sm">{scan.cornerData?.studentName || 'Unknown'}</p>
                      <p className="text-[10px] text-slate-500">
                        Page {scan.cornerData?.pageNumber || '?'} • {new Date(scan.timestamp).toLocaleTimeString()}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`text-[10px] font-bold ${scan.confirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {scan.confirmed ? '✓ Confirmed' : 'Pending'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Score: {Object.values(scan.extractedScores).reduce((a: number, b: number) => a + b, 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default DataIngestion;

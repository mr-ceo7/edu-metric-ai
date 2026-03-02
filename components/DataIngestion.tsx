import React, { useState, useRef } from 'react';
import { ExamSession, ScanRecord, CornerQRData, Question, AppConfig } from '../types';
import { addScanToSession, getStudentScanProgress } from '../services/storageService';
import { extractOMRScores, PageAnalysisResult } from '../services/geminiService';
import { scanPageCorners, PageCompletenessResult, CornerPosition } from '../services/cornerScanner';
import { extractOMRScoresClient, ClientOMRResult } from '../services/omrScanner';

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
  const [pageQuestions, setPageQuestions] = useState<Question[]>([]);
  const [extractedScores, setExtractedScores] = useState<Record<number, number>>({});
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedPage, setSelectedPage] = useState(1);

  // Page completeness state
  const [clientCornerResult, setClientCornerResult] = useState<PageCompletenessResult | null>(null);
  const [aiCornerResult, setAiCornerResult] = useState<PageAnalysisResult['cornerVisibility'] | null>(null);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [scoreConfidence, setScoreConfidence] = useState<Record<number, number>>({});
  const [scoreSource, setScoreSource] = useState<'client' | 'ai' | 'none'>('none');

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
      // Set cameraActive first so the <video> element renders,
      // then attach the stream on the next frame once the ref is available.
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ====== 3-LAYER PAGE PROCESSING ======
  const processImage = async (imageDataUrl: string) => {
    setMode('processing');
    setIsProcessing(true);
    setClientCornerResult(null);
    setAiCornerResult(null);
    setAnalysisWarnings([]);
    setScoreConfidence({});
    setScoreSource('none');

    const allWarnings: string[] = [];

    try {
      // ---- LAYER 1: Client-side corner QR detection (instant) ----
      setStatusMessage('Scanning corner QR codes...');
      let cornerResult: PageCompletenessResult;
      try {
        cornerResult = await scanPageCorners(imageDataUrl);
      } catch (err) {
        console.warn('Client-side corner scan failed:', err);
        cornerResult = {
          allCornersDetected: false,
          cornersFound: 0,
          corners: [
            { position: 'TL', detected: false, data: null },
            { position: 'TR', detected: false, data: null },
            { position: 'BL', detected: false, data: null },
            { position: 'BR', detected: false, data: null },
          ],
          cornerData: null,
          warnings: ['Client-side QR scanning unavailable.'],
        };
      }
      setClientCornerResult(cornerResult);
      allWarnings.push(...cornerResult.warnings);

      // Use corner data to identify student and page
      const cornerData = cornerResult.cornerData;
      const pageNum = cornerData?.pageNumber || 1;
      const questionsOnPage = session.questions.filter(q => (q.pageNumber || 1) === pageNum);

      if (!cornerResult.allCornersDetected) {
        setStatusMessage(`${cornerResult.cornersFound}/4 corners detected. Reading OMR bubbles...`);
      } else {
        setStatusMessage('All 4 corners detected ✓ Reading OMR bubbles...');
      }

      // ---- LAYER 2: Client-side OMR extraction (pixel analysis, ~200ms) ----
      let clientScores: Record<number, number> = {};
      let clientConfidence: Record<number, number> = {};
      try {
        const clientResult: ClientOMRResult = await extractOMRScoresClient(imageDataUrl, questionsOnPage);
        clientScores = clientResult.scores;
        clientConfidence = clientResult.confidence;
        allWarnings.push(...clientResult.warnings);
        console.log('[processImage] Client-side OMR scores:', clientScores, 'confidence:', clientConfidence);
      } catch (err) {
        console.warn('[processImage] Client-side OMR failed:', err);
        allWarnings.push('Client-side OMR extraction failed.');
        // Initialize to zeros
        questionsOnPage.forEach(q => { clientScores[q.id] = 0; clientConfidence[q.id] = 0; });
      }

      // Use client scores as initial values
      let finalScores = { ...clientScores };
      let finalConfidence = { ...clientConfidence };
      let source: 'client' | 'ai' | 'none' = 'client';

      // ---- LAYER 3: AI OMR validation (optional, may fail) ----
      setStatusMessage('Verifying with AI...');
      try {
        const base64 = imageDataUrl.split(',')[1];
        const aiResult = await extractOMRScores(base64, questionsOnPage);

        setAiCornerResult(aiResult.cornerVisibility);
        allWarnings.push(...aiResult.warnings);

        // Only override client scores if AI produced meaningful results
        // (not the default all-zeros from failed parsing)
        const aiHasRealScores = Object.values(aiResult.scores).some(s => s > 0);
        if (aiHasRealScores) {
          finalScores = aiResult.scores;
          finalConfidence = {};
          questionsOnPage.forEach(q => { finalConfidence[q.id] = 0.95; });
          source = 'ai';
          console.log('[processImage] AI scores override:', finalScores);
        } else {
          console.log('[processImage] AI returned defaults, keeping client-side scores:', finalScores);
          allWarnings.push('AI returned default scores — keeping client-side OMR results.');
        }
      } catch (aiErr) {
        console.warn('[processImage] AI OMR failed, using client-side scores:', aiErr);
        allWarnings.push('AI analysis unavailable — using client-side OMR scores. Please verify carefully.');
      }

      setDecodedCorner(cornerData);
      setPageQuestions(questionsOnPage);
      setExtractedScores(finalScores);
      setScoreConfidence(finalConfidence);
      setScoreSource(source);
      setAnalysisWarnings(allWarnings);
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

  const confirmScores = (selectedStudentName?: string) => {
    const studentName = decodedCorner?.studentName || selectedStudentName || 'Unknown Student';
    const pageNum = decodedCorner?.pageNumber || selectedPage;

    const scanRecord: ScanRecord = {
      id: `scan-${Date.now()}`,
      imageDataUrl: capturedImage || '',
      timestamp: Date.now(),
      cornerData: decodedCorner,
      pageNumber: pageNum,
      extractedScores: { ...extractedScores },
      confirmed: true,
    };

    if (!scanRecord.cornerData) {
      scanRecord.cornerData = {
        type: 'corner',
        studentName,
        studentId: session.students.find(s => s.name === studentName)?.id || `temp-${Date.now()}`,
        level: config.level,
        subject: config.subject,
        date: session.date,
        examTitle: session.examTitle,
        pageNumber: pageNum,
        totalPages: session.totalPages,
        isFinalPage: pageNum === session.totalPages,
      };
    }

    const updatedSession = addScanToSession(session, scanRecord);
    onSessionUpdated(updatedSession);
    resetState();
  };

  const resetState = () => {
    setCapturedImage(null);
    setDecodedCorner(null);
    setPageQuestions([]);
    setExtractedScores({});
    setSelectedStudent('');
    setSelectedPage(1);
    setClientCornerResult(null);
    setAiCornerResult(null);
    setAnalysisWarnings([]);
    setScoreConfidence({});
    setScoreSource('none');
    setMode('capture');
  };

  const totalMarked = session.studentScores.length;
  const totalStudents = session.students.length;

  // Helper to render a corner indicator
  const CornerIndicator = ({ position, clientDetected, aiDetected }: {
    position: CornerPosition;
    clientDetected: boolean;
    aiDetected: boolean;
  }) => {
    const bothDetected = clientDetected && aiDetected;
    const eitherDetected = clientDetected || aiDetected;
    const posLabels: Record<CornerPosition, string> = { TL: 'TL', TR: 'TR', BL: 'BL', BR: 'BR' };

    return (
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black border-2 transition-all ${
        bothDetected
          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
          : eitherDetected
          ? 'bg-amber-500/20 border-amber-500 text-amber-400'
          : 'bg-rose-500/20 border-rose-500 text-rose-400'
      }`}>
        {posLabels[position]}
      </div>
    );
  };

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
            <span className="text-[10px] text-slate-500 font-bold uppercase">Marked</span>
          </div>
          <button
            onClick={() => setMode(mode === 'history' ? 'capture' : 'history')}
            className={`glass px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              mode === 'history' ? 'text-indigo-400 bg-indigo-600/10' : 'text-slate-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left mr-2"></i>History
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      {Object.keys(progress).length > 0 && (
        <div className="glass rounded-2xl p-4 border border-white/10">
          <h3 className="text-xs text-slate-500 font-black uppercase tracking-widest mb-3">Scan Progress</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(progress).map(([name, info]) => (
              <div key={name} className="flex items-center space-x-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  info.pagesScanned >= session.totalPages
                    ? 'bg-emerald-500 text-white'
                    : info.pagesScanned > 0
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-600 border border-slate-700'
                }`}>
                  {info.pagesScanned >= session.totalPages ? '✓' : info.pagesScanned}
                </div>
                <div>
                  <p className="text-white text-[11px] font-semibold truncate max-w-[100px]">{name}</p>
                  <p className="text-[9px] text-slate-500">{info.pagesScanned}/{session.totalPages} pages</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capture Mode */}
      {mode === 'capture' && (
        <div className="space-y-4 animate-fade-in">
          {/* Fullscreen camera overlay — rendered OUTSIDE glass-card to avoid backdrop-filter breaking fixed positioning */}
          {cameraActive && (
            <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
              {/* Camera feed — full screen */}
              <div className="flex-1 relative overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-contain"
                />
                {/* Corner alignment guides */}
                <div className="absolute inset-6 md:inset-12 pointer-events-none">
                  <div className="absolute top-0 left-0 w-12 h-12 border-t-[3px] border-l-[3px] border-emerald-400 rounded-tl-xl"></div>
                  <div className="absolute top-0 right-0 w-12 h-12 border-t-[3px] border-r-[3px] border-emerald-400 rounded-tr-xl"></div>
                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[3px] border-l-[3px] border-emerald-400 rounded-bl-xl"></div>
                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[3px] border-r-[3px] border-emerald-400 rounded-br-xl"></div>
                </div>
                {/* Instruction text */}
                <div className="absolute top-4 left-0 right-0 text-center">
                  <span className="bg-black/60 backdrop-blur-sm text-white/80 text-xs font-bold px-4 py-2 rounded-full">
                    Align all 4 corner QR codes within the green markers
                  </span>
                </div>
              </div>
              {/* Action buttons — fixed at bottom */}
              <div className="flex gap-3 p-4 pb-8 bg-black/90">
                <button
                  onClick={() => { setCameraFacing(cameraFacing === 'user' ? 'environment' : 'user'); stopCamera(); setTimeout(startCamera, 300); }}
                  className="px-5 py-4 bg-white/10 text-white rounded-2xl transition-all"
                >
                  <i className="fa-solid fa-camera-rotate text-lg"></i>
                </button>
                <button
                  onClick={captureFromCamera}
                  className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-xl shadow-indigo-500/30 active:scale-[0.97] flex items-center justify-center space-x-3 transition-all"
                >
                  <i className="fa-solid fa-camera text-xl"></i>
                  <span>Capture</span>
                </button>
                <button
                  onClick={stopCamera}
                  className="px-5 py-4 bg-white/10 text-rose-400 rounded-2xl transition-all"
                >
                  <i className="fa-solid fa-xmark text-lg"></i>
                </button>
              </div>
            </div>
          )}

          {!cameraActive && (
          <div className="glass-card">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center">
              <i className="fa-solid fa-camera text-indigo-400 mr-3"></i>
              Scan Answer Sheet
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={startCamera}
                className="py-12 glass rounded-2xl border-2 border-dashed border-white/10 hover:border-indigo-500/50 text-center transition-all group"
              >
                <i className="fa-solid fa-camera text-4xl text-slate-600 group-hover:text-indigo-400 transition-colors mb-3 block"></i>
                <span className="text-slate-400 group-hover:text-white font-bold transition-colors">Open Camera</span>
                <p className="text-[10px] text-slate-600 mt-1">Scan page with device camera</p>
              </button>
              <label className="py-12 glass rounded-2xl border-2 border-dashed border-white/10 hover:border-indigo-500/50 text-center transition-all cursor-pointer group">
                <i className="fa-solid fa-cloud-arrow-up text-4xl text-slate-600 group-hover:text-indigo-400 transition-colors mb-3 block"></i>
                <span className="text-slate-400 group-hover:text-white font-bold transition-colors">Upload Image</span>
                <p className="text-[10px] text-slate-600 mt-1">Select a scanned image file</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
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

          {/* Live corner detection feedback during processing */}
          {clientCornerResult && (
            <div className="mt-6 flex items-center justify-center space-x-4">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Corners:</span>
              <div className="grid grid-cols-2 gap-1">
                {clientCornerResult.corners.filter(c => c.position === 'TL' || c.position === 'TR').map(c => (
                  <div key={c.position} className={`w-6 h-6 rounded text-[8px] font-bold flex items-center justify-center ${
                    c.detected ? 'bg-emerald-500/30 text-emerald-400' : 'bg-rose-500/30 text-rose-400'
                  }`}>
                    {c.detected ? '✓' : '✗'}
                  </div>
                ))}
                {clientCornerResult.corners.filter(c => c.position === 'BL' || c.position === 'BR').map(c => (
                  <div key={c.position} className={`w-6 h-6 rounded text-[8px] font-bold flex items-center justify-center ${
                    c.detected ? 'bg-emerald-500/30 text-emerald-400' : 'bg-rose-500/30 text-rose-400'
                  }`}>
                    {c.detected ? '✓' : '✗'}
                  </div>
                ))}
              </div>
              <span className={`text-xs font-bold ${
                clientCornerResult.allCornersDetected ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {clientCornerResult.cornersFound}/4
              </span>
            </div>
          )}

          {capturedImage && (
            <img src={capturedImage} alt="Captured" className="w-48 h-auto mx-auto mt-6 rounded-xl opacity-50" />
          )}
        </div>
      )}

      {/* Confirm Mode */}
      {mode === 'confirm' && (
        <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">

          {/* ===== PAGE COMPLETENESS STATUS ===== */}
          <div className={`glass rounded-2xl p-4 border-2 ${
            clientCornerResult?.allCornersDetected && aiCornerResult?.pageComplete
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-amber-500/30 bg-amber-500/5'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-white flex items-center">
                <i className={`fa-solid ${
                  clientCornerResult?.allCornersDetected && aiCornerResult?.pageComplete
                    ? 'fa-shield-check text-emerald-400'
                    : 'fa-triangle-exclamation text-amber-400'
                } mr-2`}></i>
                Page Completeness
              </h3>
              <span className={`text-xs font-black px-3 py-1 rounded-full ${
                clientCornerResult?.allCornersDetected && aiCornerResult?.pageComplete
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}>
                {clientCornerResult?.allCornersDetected && aiCornerResult?.pageComplete
                  ? 'COMPLETE'
                  : 'CHECK NEEDED'}
              </span>
            </div>

            {/* Corner grid visualization */}
            <div className="flex items-center space-x-6">
              {/* Client-side scan result */}
              <div className="space-y-1">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Scanner</p>
                <div className="grid grid-cols-2 gap-1">
                  {clientCornerResult ? (
                    <>
                      <CornerIndicator
                        position="TL"
                        clientDetected={clientCornerResult.corners.find(c => c.position === 'TL')?.detected || false}
                        aiDetected={aiCornerResult?.topLeft || false}
                      />
                      <CornerIndicator
                        position="TR"
                        clientDetected={clientCornerResult.corners.find(c => c.position === 'TR')?.detected || false}
                        aiDetected={aiCornerResult?.topRight || false}
                      />
                      <CornerIndicator
                        position="BL"
                        clientDetected={clientCornerResult.corners.find(c => c.position === 'BL')?.detected || false}
                        aiDetected={aiCornerResult?.bottomLeft || false}
                      />
                      <CornerIndicator
                        position="BR"
                        clientDetected={clientCornerResult.corners.find(c => c.position === 'BR')?.detected || false}
                        aiDetected={aiCornerResult?.bottomRight || false}
                      />
                    </>
                  ) : (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="w-8 h-8 rounded-lg bg-slate-800 border-2 border-slate-700"></div>
                    ))
                  )}
                </div>
              </div>

              {/* Legend + stats */}
              <div className="flex-1 space-y-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded bg-emerald-500/40 border border-emerald-500"></div>
                  <span className="text-[10px] text-slate-400">Both scanner & AI confirmed</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded bg-amber-500/40 border border-amber-500"></div>
                  <span className="text-[10px] text-slate-400">One layer detected</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded bg-rose-500/40 border border-rose-500"></div>
                  <span className="text-[10px] text-slate-400">Not detected</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Scanner: <strong className="text-white">{clientCornerResult?.cornersFound || 0}/4</strong>
                  {' • '}
                  AI: <strong className="text-white">{aiCornerResult?.totalVisible || 0}/4</strong>
                </p>
              </div>
            </div>

            {/* Warnings */}
            {analysisWarnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {analysisWarnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-amber-400 flex items-start space-x-1">
                    <i className="fa-solid fa-exclamation-circle mt-0.5 shrink-0"></i>
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}
          </div>

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
                  <div className="space-y-2">
                    <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block">
                      Select Student (QR not detected)
                    </label>
                    <select
                      value={selectedStudent}
                      onChange={e => setSelectedStudent(e.target.value)}
                      className="bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                    >
                      <option value="">— Select Student —</option>
                      {session.students.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                    <div className="flex items-center space-x-2 mt-1">
                      <label className="text-[10px] text-slate-500 font-bold">Page:</label>
                      <select
                        value={selectedPage}
                        onChange={e => {
                          const page = parseInt(e.target.value);
                          setSelectedPage(page);
                          setPageQuestions(session.questions.filter(q => (q.pageNumber || 1) === page));
                        }}
                        className="bg-slate-950/50 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                      >
                        {Array.from({ length: session.totalPages }, (_, i) => i + 1).map(p => (
                          <option key={p} value={p}>Page {p}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-white">
                {Object.values(extractedScores).reduce((a: number, b: number) => a + b, 0)}
                <span className="text-sm text-slate-500 ml-1">
                  /{pageQuestions.reduce((a, q) => a + q.maxScore, 0)}
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
            <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center">
                <i className="fa-solid fa-list-check text-indigo-400 mr-2"></i>
                Review Extracted Scores
              </h3>
              <span className={`text-[10px] font-black px-3 py-1 rounded-full ${
                scoreSource === 'ai'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : scoreSource === 'client'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                {scoreSource === 'ai' ? 'AI VERIFIED' : scoreSource === 'client' ? 'CLIENT OMR — VERIFY' : 'MANUAL ENTRY'}
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {pageQuestions.map(q => {
                const conf = scoreConfidence[q.id] ?? 0;
                const borderColor = conf >= 0.7 ? 'border-l-emerald-500' : conf >= 0.3 ? 'border-l-amber-500' : 'border-l-rose-500';
                return (
                  <div key={q.id} className={`p-4 flex items-center justify-between hover:bg-white/[0.02] border-l-4 ${borderColor}`}>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">
                          Question {q.id}
                        </span>
                        {conf < 0.3 && (
                          <span className="text-[9px] text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-full">
                            LOW CONFIDENCE
                          </span>
                        )}
                      </div>
                      <div className="text-white font-bold text-sm">{q.topic}</div>
                      <div className="text-[11px] text-slate-500">{q.subTopic}</div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <input
                        type="number"
                        min={0}
                        max={q.maxScore}
                        value={extractedScores[q.id] ?? 0}
                        onChange={e => {
                          const val = Math.min(Math.max(0, parseFloat(e.target.value) || 0), q.maxScore);
                          setExtractedScores({ ...extractedScores, [q.id]: val });
                        }}
                        className={`w-16 bg-slate-950 border rounded-xl px-2 py-2 text-white text-center font-black focus:border-indigo-500 outline-none ${
                          conf < 0.3 ? 'border-rose-500/50' : 'border-white/10'
                        }`}
                      />
                      <span className="text-slate-600 text-xs font-bold">/ {q.maxScore}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={resetState}
              className="flex-1 py-4 glass text-slate-400 hover:text-white rounded-2xl font-bold transition-all"
            >
              Discard
            </button>
            <button
              onClick={() => confirmScores(selectedStudent || undefined)}
              disabled={!decodedCorner && !selectedStudent}
              className="flex-2 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center space-x-3 transition-all"
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
                        Page {scan.pageNumber || scan.cornerData?.pageNumber || '?'} • {new Date(scan.timestamp).toLocaleTimeString()}
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

import React, { useState, useCallback, useMemo } from 'react';
import Layout from './components/Layout';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import Blueprint from './components/Blueprint';
import DataIngestion from './components/DataIngestion';
import InferenceEngine from './components/InferenceEngine';
import RemedialPack from './components/RemedialPack';
import Examine from './components/Examine';
import { useLocalStorage } from './hooks/useLocalStorage';
import { loadSession, saveSession, sessionToExamData, createNewSession } from './services/storageService';
import { ExamData, ExamSession, AppConfig, Question, StudentScore, StudentInfo } from './types';
import { MOCK_EXAM } from './mockData';
import { DEMO_SESSION } from './services/demoData';

const DEFAULT_CONFIG: AppConfig = {
  school: 'Kisii School',
  subject: 'Mathematics',
  level: 'Form 4',
  isAuthenticated: false,
};

const App: React.FC = () => {
  const [config, setConfig] = useLocalStorage<AppConfig>('edu-metric-config', DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [remedialTopic, setRemedialTopic] = useState<string | undefined>();

  // Load or create session
  const [session, setSession] = useLocalStorage<ExamSession | null>('edu-metric-active-session', null);

  // Convert session to ExamData for components that need it
  const currentExam: ExamData = useMemo(() => {
    if (session) {
      return sessionToExamData(session);
    }
    // Fallback to mock data if no session exists
    return {
      ...MOCK_EXAM,
      school: config.school,
      subject: config.subject,
      level: config.level,
    };
  }, [session, config]);

  const handleLogin = useCallback((loginConfig: { school: string; subject: string; level: string }) => {
    setConfig({
      ...loginConfig,
      isAuthenticated: true,
    });
    // Try to load existing session for this config
    const existingSession = loadSession(loginConfig.school, loginConfig.subject, loginConfig.level);
    if (existingSession) {
      setSession(existingSession);
    }
  }, [setConfig, setSession]);

  const handleLogout = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setActiveTab('dashboard');
  }, [setConfig]);

  const handleDemoLogin = useCallback(() => {
    // 1. Set authenticated config
    setConfig({
      school: DEMO_SESSION.school,
      subject: DEMO_SESSION.subject,
      level: DEMO_SESSION.level,
      isAuthenticated: true,
    });
    
    // 2. Load demo session into state and storage
    // We create a fresh copy to avoid mutating the constant if the user plays around
    const sessionCopy = JSON.parse(JSON.stringify(DEMO_SESSION));
    setSession(sessionCopy);
    saveSession(sessionCopy);
    
    // 3. Navigate to dashboard
    setActiveTab('dashboard');
  }, [setConfig, setSession]);

  const handleUpdateExam = useCallback((updatedExam: ExamData) => {
    if (session) {
      const updatedSession = {
        ...session,
        questions: updatedExam.questions,
        examTitle: updatedExam.title,
        date: updatedExam.date,
        updatedAt: Date.now(),
      };
      setSession(updatedSession);
      saveSession(updatedSession);
    }
  }, [session, setSession]);

  const handleUpdateScores = useCallback((partialScore: Partial<StudentScore>, newQuestions: Question[]) => {
    if (session) {
      const existingQIds = new Set(session.questions.map(q => q.id));
      const addedQuestions = newQuestions.filter(q => !existingQIds.has(q.id));
      const updatedQuestions = [...session.questions, ...addedQuestions];

      const existingStudentIdx = session.studentScores.findIndex(s => s.studentName === partialScore.studentName);
      let updatedStudentScores = [...session.studentScores];

      if (existingStudentIdx > -1) {
        updatedStudentScores[existingStudentIdx] = {
          ...updatedStudentScores[existingStudentIdx],
          scores: {
            ...updatedStudentScores[existingStudentIdx].scores,
            ...partialScore.scores
          }
        };
      } else {
        updatedStudentScores.push({
          studentId: `s-${Date.now()}`,
          studentName: partialScore.studentName || 'Unknown Student',
          level: partialScore.level || config.level,
          scores: partialScore.scores || {}
        });
      }

      const updatedSession: ExamSession = {
        ...session,
        questions: updatedQuestions,
        studentScores: updatedStudentScores,
        updatedAt: Date.now(),
      };
      setSession(updatedSession);
      saveSession(updatedSession);
    }
  }, [session, config.level, setSession]);

  const handleSessionCreated = useCallback((newSession: ExamSession) => {
    setSession(newSession);
    saveSession(newSession);
  }, [setSession]);

  const handleSessionUpdated = useCallback((updatedSession: ExamSession) => {
    setSession(updatedSession);
    saveSession(updatedSession);
  }, [setSession]);

  const triggerRemediation = useCallback((topic: string) => {
    setRemedialTopic(topic);
    setActiveTab('remediation');
  }, []);

  // Show login screen if not authenticated
  if (!config.isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} onDemoLogin={handleDemoLogin} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard exam={currentExam} onRemediate={triggerRemediation} />;
      case 'examine':
        return (
          <Examine
            config={config}
            session={session}
            onSessionCreated={handleSessionCreated}
            onSessionUpdated={handleSessionUpdated}
          />
        );
      case 'blueprint':
        return <Blueprint exam={currentExam} onUpdate={handleUpdateExam} />;
      case 'ingestion':
        return (
          <DataIngestion
            session={session}
            config={config}
            onSessionUpdated={handleSessionUpdated}
          />
        );
      case 'analysis':
        return <InferenceEngine exam={currentExam} />;
      case 'remediation':
        return <RemedialPack preTopic={remedialTopic} />;
      default:
        return <Dashboard exam={currentExam} onRemediate={triggerRemediation} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} config={config} onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto">
        {renderContent()}
      </div>
    </Layout>
  );
};

export default App;

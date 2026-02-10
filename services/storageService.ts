import { ExamSession, StudentInfo, ScanRecord, StudentScore, Question } from '../types';

const SESSIONS_KEY = 'edu-metric-sessions';
const ACTIVE_SESSION_KEY = 'edu-metric-active-session';

function getSessionKey(school: string, subject: string, level: string): string {
  return `${school}-${subject}-${level}`.toLowerCase().replace(/\s+/g, '-');
}

export function getAllSessions(): Record<string, ExamSession> {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function saveSession(session: ExamSession): void {
  const sessions = getAllSessions();
  const key = getSessionKey(session.school, session.subject, session.level);
  sessions[key] = { ...session, updatedAt: Date.now() };
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function loadSession(school: string, subject: string, level: string): ExamSession | null {
  const sessions = getAllSessions();
  const key = getSessionKey(school, subject, level);
  return sessions[key] || null;
}

export function deleteSession(school: string, subject: string, level: string): void {
  const sessions = getAllSessions();
  const key = getSessionKey(school, subject, level);
  delete sessions[key];
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function createNewSession(
  school: string,
  subject: string,
  level: string,
  examTitle: string,
  date: string,
  questions: Question[],
  students: StudentInfo[],
  totalPages: number
): ExamSession {
  const session: ExamSession = {
    id: `session-${Date.now()}`,
    school,
    subject,
    level,
    examTitle,
    date,
    questions,
    students,
    totalPages,
    scans: [],
    studentScores: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveSession(session);
  return session;
}

export function addScanToSession(
  session: ExamSession,
  scan: ScanRecord
): ExamSession {
  const updatedSession = {
    ...session,
    scans: [...session.scans, scan],
    updatedAt: Date.now(),
  };

  // Merge scores into studentScores if scan is confirmed
  if (scan.confirmed && scan.cornerData) {
    const studentName = scan.cornerData.studentName;
    const existingIdx = updatedSession.studentScores.findIndex(
      s => s.studentName === studentName
    );

    if (existingIdx > -1) {
      updatedSession.studentScores[existingIdx] = {
        ...updatedSession.studentScores[existingIdx],
        scores: {
          ...updatedSession.studentScores[existingIdx].scores,
          ...scan.extractedScores,
        },
      };
    } else {
      updatedSession.studentScores.push({
        studentId: scan.cornerData.studentId,
        studentName: studentName,
        level: scan.cornerData.level,
        scores: { ...scan.extractedScores },
      });
    }
  }

  saveSession(updatedSession);
  return updatedSession;
}

export function getActiveSessionKey(): string | null {
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function setActiveSessionKey(school: string, subject: string, level: string): void {
  const key = getSessionKey(school, subject, level);
  localStorage.setItem(ACTIVE_SESSION_KEY, key);
}

export function getStudentScanProgress(session: ExamSession): Record<string, { pagesScanned: number; totalPages: number; isComplete: boolean }> {
  const progress: Record<string, { pagesScanned: number; totalPages: number; isComplete: boolean }> = {};

  for (const student of session.students) {
    const studentScans = session.scans.filter(
      s => s.confirmed && s.cornerData?.studentName === student.name
    );
    const pagesScanned = new Set(studentScans.map(s => s.cornerData?.pageNumber)).size;
    const hasLastPage = studentScans.some(s => s.cornerData?.isFinalPage);


    progress[student.id] = {
      pagesScanned,
      totalPages: session.totalPages,
      isComplete: hasLastPage && pagesScanned >= session.totalPages,
    };
  }

  return progress;
}

// Convert ExamSession to ExamData for dashboard/analysis compatibility
export function sessionToExamData(session: ExamSession): import('../types').ExamData {
  return {
    id: session.id,
    title: session.examTitle,
    subject: session.subject,
    school: session.school,
    level: session.level,
    date: session.date,
    questions: session.questions,
    studentScores: session.studentScores,
  };
}


export enum CognitiveLevel {
  RECALL = 'Recall',
  UNDERSTANDING = 'Understanding',
  APPLICATION = 'Application',
  ANALYSIS = 'Analysis',
  EVALUATION = 'Evaluation',
  CREATION = 'Creation'
}

export interface Question {
  id: number;
  topic: string;
  subTopic: string;
  cognitiveLevel: CognitiveLevel;
  maxScore: number;
  questionText: string;
  pageNumber?: number; // Which page of the booklet this question appears on
}

export interface StudentScore {
  studentId: string;
  studentName: string;
  level: string;
  scores: Record<number, number>; // questionId -> score
}

export interface ExamData {
  id: string;
  title: string;
  subject: string;
  school: string;
  level: string;
  date: string;
  questions: Question[];
  studentScores: StudentScore[];
}

export interface DiagnosisResult {
  overview: string;
  topicStrengths: string[];
  topicWeaknesses: string[];
  cognitiveAnalysis: string;
  recommendations: string[];
}

export interface RemedialPack {
  topic: string;
  lessonPlan: string;
  quiz: {
    question: string;
    options?: string[];
    answer: string;
  }[];
}

// ---- New types for QR codes & scanning ----

export interface CornerQRData {
  type: 'corner';
  studentName: string;
  studentId: string;
  level: string;
  subject: string;
  date: string;
  examTitle: string;
  pageNumber: number;
  totalPages: number;
  isFinalPage: boolean;
}


export interface ScanRecord {
  id: string;
  imageDataUrl: string; // Base64 image stored as evidence
  timestamp: number;
  cornerData: CornerQRData | null;
  pageNumber: number; // Which page was scanned (from corner QR or manual selection)
  extractedScores: Record<number, number>; // questionId -> score
  confirmed: boolean;
}

export interface StudentInfo {
  id: string;
  name: string;
}

export interface ExamSession {
  id: string;
  school: string;
  subject: string;
  level: string;
  examTitle: string;
  date: string;
  questions: Question[];
  students: StudentInfo[];
  totalPages: number;
  scans: ScanRecord[];
  studentScores: StudentScore[];
  createdAt: number;
  updatedAt: number;
}

export interface AppConfig {
  school: string;
  subject: string;
  level: string;
  isAuthenticated: boolean;
}

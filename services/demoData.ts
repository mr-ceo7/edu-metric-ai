
import { ExamData, CognitiveLevel, StudentScore, ExamSession } from '../types';

export const DEMO_SESSION: ExamSession = {
  id: "ksef-demo-session",
  school: "Kisii School",
  subject: "Mathematics",
  level: "Form 4",
  examTitle: "End of Term Assessment 2024",
  date: "2024-03-20",
  totalPages: 2,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  questions: [
    { id: 1, topic: "Algebra", subTopic: "Quadratic Equations", cognitiveLevel: CognitiveLevel.RECALL, maxScore: 3, pageNumber: 1, questionText: "Solve for x: x^2 - 5x + 6 = 0" },
    { id: 2, topic: "Algebra", subTopic: "Solving for X", cognitiveLevel: CognitiveLevel.UNDERSTANDING, maxScore: 5, pageNumber: 1, questionText: "Explain the steps to isolate x in the equation 3(x - 2) = 12" },
    { id: 3, topic: "Geometry", subTopic: "Circle Theorems", cognitiveLevel: CognitiveLevel.APPLICATION, maxScore: 8, pageNumber: 1, questionText: "Calculate the angle x in the cyclic quadrilateral ABCD given..." },
    { id: 4, topic: "Geometry", subTopic: "Area of Sectors", cognitiveLevel: CognitiveLevel.ANALYSIS, maxScore: 10, pageNumber: 2, questionText: "A sector of a circle with radius 10cm has an angle of 60 degrees. Find the area." },
    { id: 5, topic: "Trigonometry", subTopic: "SOH CAH TOA", cognitiveLevel: CognitiveLevel.RECALL, maxScore: 4, pageNumber: 2, questionText: "Define Sine, Cosine and Tangent ratios in a right-angled triangle." },
    { id: 6, topic: "Calculus", subTopic: "Differentiation", cognitiveLevel: CognitiveLevel.APPLICATION, maxScore: 10, pageNumber: 2, questionText: "Find the derivative of f(x) = 3x^2 + 4x - 5" }
  ],
  students: [
     { id: "s1", name: "John Kamau" },
     { id: "s2", name: "Mercy Wanjiku" },
     { id: "s3", name: "Brian Ochieng" },
     { id: "s4", name: "Sarah Chebet" },
     { id: "s5", name: "David Mwangi" },
     { id: "s6", name: "Grace Achieng" },
     { id: "s7", name: "Peter Njoroge" },
     { id: "s8", name: "Faith Kiptoo" },
     { id: "s9", name: "Kevin Otieno" },
     { id: "s10", name: "Esther Wambui" },
     { id: "s11", name: "Samuel Korir" },
     { id: "s12", name: "Alice Muthoni" },
     { id: "s13", name: "George Kimani" },
     { id: "s14", name: "Joyce Atieno" },
     { id: "s15", name: "Paul Kibet" }
  ],
  scans: [],
  studentScores: [
    { studentId: "s1", studentName: "John Kamau", level: "Form 4", scores: { 1: 3, 2: 5, 3: 8, 4: 9, 5: 4, 6: 8 } },
    { studentId: "s2", studentName: "Mercy Wanjiku", level: "Form 4", scores: { 1: 3, 2: 4, 3: 5, 4: 4, 5: 4, 6: 2 } }, // Weak Geometry
    { studentId: "s3", studentName: "Brian Ochieng", level: "Form 4", scores: { 1: 2, 2: 3, 3: 8, 4: 10, 5: 4, 6: 9 } }, // Strong Geometry, Weak Algebra
    { studentId: "s4", studentName: "Sarah Chebet", level: "Form 4", scores: { 1: 3, 2: 5, 3: 7, 4: 8, 5: 4, 6: 7 } },
    { studentId: "s5", studentName: "David Mwangi", level: "Form 4", scores: { 1: 1, 2: 2, 3: 3, 4: 2, 5: 2, 6: 1 } }, // Needs Remediation
    { studentId: "s6", studentName: "Grace Achieng", level: "Form 4", scores: { 1: 3, 2: 5, 3: 8, 4: 9, 5: 4, 6: 10 } },
    { studentId: "s7", studentName: "Peter Njoroge", level: "Form 4", scores: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 3, 6: 4 } },
    { studentId: "s8", studentName: "Faith Kiptoo", level: "Form 4", scores: { 1: 3, 2: 5, 3: 6, 4: 7, 5: 4, 6: 6 } },
    { studentId: "s9", studentName: "Kevin Otieno", level: "Form 4", scores: { 1: 3, 2: 4, 3: 2, 4: 3, 5: 4, 6: 5 } }, // Weak Geometry
    { studentId: "s10", studentName: "Esther Wambui", level: "Form 4", scores: { 1: 3, 2: 5, 3: 8, 4: 10, 5: 4, 6: 9 } },
    { studentId: "s11", studentName: "Samuel Korir", level: "Form 4", scores: { 1: 0, 2: 1, 3: 2, 4: 1, 5: 1, 6: 0 } }, // Severe Remediation Needed
    { studentId: "s12", studentName: "Alice Muthoni", level: "Form 4", scores: { 1: 3, 2: 5, 3: 7, 4: 8, 5: 4, 6: 8 } },
    { studentId: "s13", studentName: "George Kimani", level: "Form 4", scores: { 1: 2, 2: 2, 3: 5, 4: 6, 5: 3, 6: 5 } },
    { studentId: "s14", studentName: "Joyce Atieno", level: "Form 4", scores: { 1: 3, 2: 5, 3: 8, 4: 9, 5: 4, 6: 9 } },
    { studentId: "s15", studentName: "Paul Kibet", level: "Form 4", scores: { 1: 1, 2: 3, 3: 2, 4: 4, 5: 2, 6: 3 } }
  ]
};

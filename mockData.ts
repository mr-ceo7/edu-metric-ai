
import { ExamData, CognitiveLevel } from "./types";

export const MOCK_EXAM: ExamData = {
  id: "math-t1-2024",
  title: "Term 1 Mid-Exams",
  subject: "Mathematics",
  // Fix: Added missing required properties for ExamData interface
  school: "Kisii School",
  level: "Form 4",
  date: "2024-03-15",
  questions: [
    { id: 1, topic: "Algebra", subTopic: "Linear Equations", cognitiveLevel: CognitiveLevel.RECALL, maxScore: 5, questionText: "Solve for x: 2x + 3 = 7" },
    { id: 2, topic: "Algebra", subTopic: "Word Problems", cognitiveLevel: CognitiveLevel.APPLICATION, maxScore: 10, questionText: "A train travels 60km in 1 hour..." },
    { id: 3, topic: "Geometry", subTopic: "Properties of Circles", cognitiveLevel: CognitiveLevel.RECALL, maxScore: 5, questionText: "What is the formula for the circumference of a circle?" },
    { id: 4, topic: "Geometry", subTopic: "Theorem Applications", cognitiveLevel: CognitiveLevel.ANALYSIS, maxScore: 15, questionText: "Prove that angles in the same segment are equal." },
    { id: 5, topic: "Statistics", subTopic: "Mean/Median", cognitiveLevel: CognitiveLevel.RECALL, maxScore: 5, questionText: "Define the term 'median' in a dataset." },
    { id: 6, topic: "Statistics", subTopic: "Data Interpretation", cognitiveLevel: CognitiveLevel.ANALYSIS, maxScore: 10, questionText: "Analyze the provided histogram and determine the mode." },
  ],
  studentScores: [
    // Fix: Added missing 'level' property for StudentScore interface to resolve missing property errors
    { studentId: "s1", studentName: "Alice Johnson", level: "Form 4", scores: { 1: 5, 2: 4, 3: 5, 4: 6, 5: 5, 6: 2 } },
    { studentId: "s2", studentName: "Bob Smith", level: "Form 4", scores: { 1: 4, 2: 3, 3: 4, 4: 5, 5: 4, 6: 3 } },
    { studentId: "s3", studentName: "Charlie Brown", level: "Form 4", scores: { 1: 5, 2: 9, 3: 5, 4: 12, 5: 5, 6: 8 } },
    { studentId: "s4", studentName: "Diana Prince", level: "Form 4", scores: { 1: 2, 2: 1, 3: 3, 4: 4, 5: 2, 6: 1 } },
    { studentId: "s5", studentName: "Evan Wright", level: "Form 4", scores: { 1: 5, 2: 5, 3: 4, 4: 7, 5: 5, 6: 5 } },
  ]
};

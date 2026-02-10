
import { GoogleGenAI, Type } from "@google/genai";
import { ExamData, DiagnosisResult, RemedialPack, Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Extract OMR bubble scores from a scanned answer sheet page.
 * Each question has a row of score bubbles (0 through maxScore).
 * Gemini identifies which bubble is filled for each question.
 */
export const extractOMRScores = async (
  base64Image: string,
  questions: Question[]
): Promise<Record<number, number>> => {
  const model = 'gemini-2.0-flash';

  const questionContext = questions.map(q =>
    `Question ${q.id}: Topic "${q.topic}", Concept "${q.subTopic}", Max Score: ${q.maxScore}`
  ).join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
        { text: `You are an expert OMR (Optical Mark Recognition) reader for exam answer sheets.

This image shows a scanned exam answer sheet page. Each question has a row of score bubbles numbered from 0 up to the maximum score. The teacher has filled/shaded ONE bubble per question to indicate the score.

Questions on this page:
${questionContext}

INSTRUCTIONS:
1. Look for the OMR scoring strip (row of circles/bubbles) next to each question
2. Identify which bubble is filled/shaded/marked for each question
3. If a question's bubbles are not clearly visible or no bubble is filled, return 0 for that question
4. Return the scores as a JSON object mapping questionId to the detected score

Return ONLY a JSON object in this exact format:
{ "scores": [ { "questionId": number, "score": number } ] }` }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scores: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionId: { type: Type.INTEGER },
                score: { type: Type.NUMBER }
              }
            }
          }
        }
      }
    }
  });

  try {
    const parsed = JSON.parse(response.text || '{}');
    const result: Record<number, number> = {};
    if (parsed.scores && Array.isArray(parsed.scores)) {
      parsed.scores.forEach((s: { questionId: number; score: number }) => {
        result[s.questionId] = s.score;
      });
    }
    // Fill in zeros for any questions not detected
    questions.forEach(q => {
      if (result[q.id] === undefined) {
        result[q.id] = 0;
      }
    });
    return result;
  } catch {
    // Default to zeros if parsing fails
    const result: Record<number, number> = {};
    questions.forEach(q => { result[q.id] = 0; });
    return result;
  }
};

export const analyzeExamData = async (examData: ExamData): Promise<DiagnosisResult> => {
  const model = 'gemini-2.0-flash';
  const summary = examData.studentScores.map(s => ({
    name: s.studentName,
    performance: Object.entries(s.scores).map(([qId, scoreValue]) => {
      const score = scoreValue as number;
      const q = examData.questions.find(q => q.id === parseInt(qId));
      return {
        topic: q?.topic,
        level: q?.cognitiveLevel,
        percentage: ((score / (q?.maxScore || 1)) * 100).toFixed(1)
      };
    })
  }));

  const prompt = `Diagnostic analysis for ${examData.school} - ${examData.level} ${examData.subject}.
  Assessment: "${examData.title}"
  Data: ${JSON.stringify(summary)}
  Return JSON overview, topicStrengths, topicWeaknesses, cognitiveAnalysis, recommendations.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overview: { type: Type.STRING },
          topicStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          topicWeaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
          cognitiveAnalysis: { type: Type.STRING },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const generateRemedialPack = async (topic: string, subject: string): Promise<RemedialPack> => {
  const model = 'gemini-2.0-flash';
  const prompt = `Generate remedial pack for "${topic}" in "${subject}". JSON: topic, lessonPlan, quiz (question, answer).`;
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          lessonPlan: { type: Type.STRING },
          quiz: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, answer: { type: Type.STRING } } } }
        }
      }
    }
  });
  return JSON.parse(response.text || '{}');
};

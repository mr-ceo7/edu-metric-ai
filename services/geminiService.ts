import { GoogleGenAI, Type } from "@google/genai";
import { ExamData, DiagnosisResult, RemedialPack, Question } from "../types";
import { uploadAndGenerate, generateTextOnly } from "./customApiService";

let _ai: GoogleGenAI | null = null;
const getAI = (): GoogleGenAI => {
  if (!_ai) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
};

export interface PageAnalysisResult {
  scores: Record<number, number>;
  cornerVisibility: {
    topLeft: boolean;
    topRight: boolean;
    bottomLeft: boolean;
    bottomRight: boolean;
    totalVisible: number;
    pageComplete: boolean;
  };
  warnings: string[];
}

// ---- Helper: convert base64 string to Blob ----
const base64ToBlob = (base64: string, mimeType: string = 'image/jpeg'): Blob => {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  return new Blob([byteArray], { type: mimeType });
};

// ---- Helper: build OMR prompt text (shared between SDK and fallback) ----
const buildOMRPrompt = (questionContext: string): string => {
  return `You are an expert at reading exam answer sheets. This image shows a scanned answer sheet page.

TASK 1 — CORNER QR VERIFICATION:
This page should have 4 identical QR codes, one in each corner (top-left, top-right, bottom-left, bottom-right).
Check if you can see a QR code in each corner. Report true/false for each.

TASK 2 — OMR SCORE EXTRACTION:
Each question has a row of score bubbles (circles numbered 0 through maxScore).
The teacher has filled/shaded ONE bubble per question to indicate the score.

Questions on this page (in order from top to bottom):
${questionContext}

INSTRUCTIONS:
1. For each corner, report whether a QR code is visible
2. For each question, identify which OMR bubble is filled/shaded
3. If a question's bubbles are unclear or unfilled, return 0
4. If the page appears rotated, skewed, or truncated, include a warning

Respond ONLY with valid JSON in this exact format:
{
  "corners": { "topLeft": true/false, "topRight": true/false, "bottomLeft": true/false, "bottomRight": true/false },
  "scores": [{ "questionId": <number>, "score": <number> }, ...],
  "warnings": ["<string>", ...]
}`;
};

// ---- Helper: parse OMR AI response into PageAnalysisResult ----
const parseOMRResponse = (
  parsed: any,
  questions: Question[]
): PageAnalysisResult => {
  const scores: Record<number, number> = {};
  if (parsed.scores && Array.isArray(parsed.scores)) {
    parsed.scores.forEach((s: { questionId: number; score: number }) => {
      scores[s.questionId] = s.score;
    });
  }
  questions.forEach(q => {
    if (scores[q.id] === undefined) scores[q.id] = 0;
  });

  const corners = parsed.corners || {};
  const tl = !!corners.topLeft;
  const tr = !!corners.topRight;
  const bl = !!corners.bottomLeft;
  const br = !!corners.bottomRight;
  const totalVisible = [tl, tr, bl, br].filter(Boolean).length;

  const warnings: string[] = parsed.warnings || [];
  if (totalVisible < 4) {
    const missing: string[] = [];
    if (!tl) missing.push('top-left');
    if (!tr) missing.push('top-right');
    if (!bl) missing.push('bottom-left');
    if (!br) missing.push('bottom-right');
    warnings.push(`AI detected ${totalVisible}/4 corner QR codes. Missing: ${missing.join(', ')}.`);
  }

  return {
    scores,
    cornerVisibility: {
      topLeft: tl,
      topRight: tr,
      bottomLeft: bl,
      bottomRight: br,
      totalVisible,
      pageComplete: totalVisible === 4,
    },
    warnings,
  };
};

// ---- Default fallback OMR result (all zeros) ----
const defaultOMRResult = (questions: Question[]): PageAnalysisResult => {
  const scores: Record<number, number> = {};
  questions.forEach(q => { scores[q.id] = 0; });
  return {
    scores,
    cornerVisibility: { topLeft: false, topRight: false, bottomLeft: false, bottomRight: false, totalVisible: 0, pageComplete: false },
    warnings: ['Failed to parse AI response. Scores defaulted to 0.'],
  };
};

/**
 * Analyze a scanned answer sheet page:
 * 1. Verify corner QR code visibility (page completeness check)
 * 2. Extract OMR bubble scores for each question
 *
 * Falls back to Custom API if the SDK call fails.
 */
export const extractOMRScores = async (
  base64Image: string,
  questions: Question[]
): Promise<PageAnalysisResult> => {
  const model = 'gemini-2.0-flash';

  const questionContext = questions.map(q =>
    `Question ${q.id}: Topic "${q.topic}", Concept "${q.subTopic}", Max Score: ${q.maxScore}`
  ).join('\n');

  // ---- Attempt 1: @google/genai SDK ----
  try {
    const response = await getAI().models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: buildOMRPrompt(questionContext) }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            corners: {
              type: Type.OBJECT,
              properties: {
                topLeft: { type: Type.BOOLEAN },
                topRight: { type: Type.BOOLEAN },
                bottomLeft: { type: Type.BOOLEAN },
                bottomRight: { type: Type.BOOLEAN },
              }
            },
            scores: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionId: { type: Type.INTEGER },
                  score: { type: Type.NUMBER }
                }
              }
            },
            warnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return parseOMRResponse(parsed, questions);
  } catch (sdkError) {
    console.warn('[extractOMRScores] SDK failed, falling back to Custom API...', sdkError);
  }

  // ---- Attempt 2: Custom API fallback ----
  try {
    const imageBlob = base64ToBlob(base64Image);
    const prompt = buildOMRPrompt(questionContext);
    const responseText = await uploadAndGenerate(prompt, imageBlob, `scan_${Date.now()}.jpg`);

    // Extract JSON from the response (may be wrapped in markdown code fences)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const result = parseOMRResponse(parsed, questions);
    result.warnings.push('Result obtained via Custom API fallback.');
    return result;
  } catch (fallbackError) {
    console.error('[extractOMRScores] Custom API fallback also failed:', fallbackError);
    return defaultOMRResult(questions);
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

  const promptText = `Diagnostic analysis for ${examData.school} - ${examData.level} ${examData.subject}.
  Assessment: "${examData.title}"
  Data: ${JSON.stringify(summary)}
  Return JSON with these exact keys: overview, topicStrengths, topicWeaknesses, cognitiveAnalysis, recommendations.
  - overview: string
  - topicStrengths: array of strings
  - topicWeaknesses: array of strings
  - cognitiveAnalysis: string
  - recommendations: array of strings
  Respond ONLY with valid JSON.`;

  // ---- Attempt 1: SDK ----
  try {
    const response = await getAI().models.generateContent({
      model,
      contents: promptText,
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
  } catch (sdkError) {
    console.warn('[analyzeExamData] SDK failed, falling back to Custom API...', sdkError);
  }

  // ---- Attempt 2: Custom API fallback ----
  try {
    const responseText = await generateTextOnly(promptText);

    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    return JSON.parse(jsonStr);
  } catch (fallbackError) {
    console.error('[analyzeExamData] Custom API fallback also failed:', fallbackError);
    throw new Error('Both SDK and Custom API failed for analyzeExamData.');
  }
};

export const generateRemedialPack = async (topic: string, subject: string): Promise<RemedialPack> => {
  const model = 'gemini-2.0-flash';
  const promptText = `Generate a remedial learning pack for the topic "${topic}" in the subject "${subject}".
  Return JSON with these exact keys: topic, lessonPlan, quiz.
  - topic: string (the topic name)
  - lessonPlan: string (a detailed mini lesson plan)
  - quiz: array of objects with keys "question" and "answer" (both strings), at least 5 items
  Respond ONLY with valid JSON.`;

  // ---- Attempt 1: SDK ----
  try {
    const response = await getAI().models.generateContent({
      model,
      contents: promptText,
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
  } catch (sdkError) {
    console.warn('[generateRemedialPack] SDK failed, falling back to Custom API...', sdkError);
  }

  // ---- Attempt 2: Custom API fallback ----
  try {
    const responseText = await generateTextOnly(promptText);

    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    return JSON.parse(jsonStr);
  } catch (fallbackError) {
    console.error('[generateRemedialPack] Custom API fallback also failed:', fallbackError);
    throw new Error('Both SDK and Custom API failed for generateRemedialPack.');
  }
};

export const generateExamQuestions = async (
  topic: string,
  subTopic: string,
  count: number = 5
): Promise<Question[]> => {
  const promptText = `
    Generate ${count} high-school level mathematics questions for the topic "${topic}" and subtopic "${subTopic}".
    
    Return strictly a JSON array of objects. Do not include markdown formatting.
    Each object must have:
    - "questionText": string (the question text)
    - "cognitiveLevel": string (one of: Recall, Understanding, Application, Analysis, Evaluation, Creation)
    - "maxScore": number (integer between 1 and 10)
    
    Example response:
    [
      { "questionText": "Solve for x: 2x + 5 = 15", "cognitiveLevel": "Application", "maxScore": 3 }
    ]
  `;

  // ---- Attempt 1: SDK ----
  try {
    // @ts-ignore
    const model = getAI().getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(promptText);
    const response = await result.response;
    const text = response.text();
    
    let parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) parsed = [];

    return parsed.map((q: any, i: number) => ({
      id: Date.now() + i,
      topic,
      subTopic,
      questionText: q.questionText || q.question || "Generated Question",
      cognitiveLevel: q.cognitiveLevel as any,
      maxScore: q.maxScore || 5
    }));

  } catch (sdkError) {
    console.warn('[generateExamQuestions] SDK failed, falling back to Custom API...', sdkError);
  }

  // ---- Attempt 2: Custom API fallback ----
  try {
    const responseText = await generateTextOnly(promptText);
    
    // Clean up potential markdown code fences from raw text response
    const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
    
    let parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) parsed = [];
    
    return parsed.map((q: any, i: number) => ({
      id: Date.now() + i,
      topic,
      subTopic,
      questionText: q.questionText || q.question || "Generated Question",
      cognitiveLevel: q.cognitiveLevel as any,
      maxScore: q.maxScore || 5
    }));
  } catch (fallbackError) {
    console.error('[generateExamQuestions] Custom API fallback also failed:', fallbackError);
    throw new Error('Failed to generate questions.');
  }
};

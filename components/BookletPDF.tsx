import React from 'react';
import { pdf, Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import { Question, StudentInfo, CornerQRData, QuestionQRData } from '../types';

// We need to generate QR codes as data URLs for the PDF
async function generateQRDataUrl(data: object): Promise<string> {
  try {
    // Dynamically use the canvas-based QR library
    const QRCode = await import('qrcode');
    return await QRCode.toDataURL(JSON.stringify(data), {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    // Fallback: return a minimal placeholder
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  cornerQR: {
    width: 55,
    height: 55,
    position: 'absolute',
  },
  cornerTL: { top: 15, left: 15 },
  cornerTR: { top: 15, right: 15 },
  cornerBL: { bottom: 15, left: 15 },
  cornerBR: { bottom: 15, right: 15 },
  header: {
    textAlign: 'center',
    marginTop: 50,
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: '2px solid #e2e8f0',
  },
  schoolName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
  },
  examInfo: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 4,
  },
  studentName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#4f46e5',
    marginTop: 6,
  },
  questionBlock: {
    marginBottom: 14,
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    padding: 10,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  questionQR: {
    width: 40,
    height: 40,
    marginRight: 8,
  },
  questionInfo: {
    flex: 1,
  },
  questionNumber: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
  },
  questionText: {
    fontSize: 9,
    color: '#475569',
    marginTop: 3,
  },
  topicLabel: {
    fontSize: 7,
    color: '#94a3b8',
    marginTop: 2,
  },
  omrStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1px solid #f1f5f9',
  },
  omrLabel: {
    fontSize: 7,
    color: '#64748b',
    fontFamily: 'Helvetica-Bold',
    marginRight: 6,
  },
  omrBubble: {
    width: 16,
    height: 16,
    borderRadius: 8,
    border: '1.5px solid #94a3b8',
    marginHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  omrBubbleText: {
    fontSize: 6,
    color: '#64748b',
    textAlign: 'center',
  },
  answerArea: {
    marginTop: 6,
    borderTop: '1px dashed #e2e8f0',
    paddingTop: 6,
    minHeight: 40,
  },
  answerLine: {
    borderBottom: '0.5px solid #e2e8f0',
    height: 18,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  footerText: {
    fontSize: 8,
    color: '#94a3b8',
  },
  finalPageBanner: {
    textAlign: 'center',
    padding: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 4,
    marginBottom: 10,
    marginTop: 50,
  },
  finalPageText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#92400e',
  },
});

interface BookletConfig {
  school: string;
  subject: string;
  level: string;
  examTitle: string;
  date: string;
  questions: Question[];
  students: StudentInfo[];
  totalPages: number;
}

interface PageQRCache {
  cornerQR: string;
  questionQRs: Record<number, string>; // questionId -> QR data URL
}

// Pre-generate all QR codes for a student's booklet
async function generateStudentQRs(
  student: StudentInfo,
  config: BookletConfig
): Promise<Record<number, PageQRCache>> {
  const pages: Record<number, PageQRCache> = {};

  for (let pageNum = 1; pageNum <= config.totalPages; pageNum++) {
    const isFinalPage = pageNum === config.totalPages;

    const cornerData: CornerQRData = {
      type: 'corner',
      studentName: student.name,
      studentId: student.id,
      level: config.level,
      subject: config.subject,
      date: config.date,
      examTitle: config.examTitle,
      pageNumber: pageNum,
      totalPages: config.totalPages,
      isFinalPage,
    };

    const cornerQR = await generateQRDataUrl(cornerData);

    const pageQuestions = config.questions.filter(q => (q.pageNumber || 1) === pageNum);
    const questionQRs: Record<number, string> = {};

    for (const q of pageQuestions) {
      const qData: QuestionQRData = {
        type: 'question',
        questionId: q.id,
        topic: q.topic,
        concept: q.subTopic,
        maxScore: q.maxScore,
        questionText: q.questionText || '',
      };
      questionQRs[q.id] = await generateQRDataUrl(qData);
    }

    pages[pageNum] = { cornerQR, questionQRs };
  }

  return pages;
}

// The PDF Document component
const BookletDocument: React.FC<{
  config: BookletConfig;
  allQRs: Map<string, Record<number, PageQRCache>>; // studentId -> pages
}> = ({ config, allQRs }) => {

  return (
    <Document>
      {config.students.map(student => {
        const studentQRs = allQRs.get(student.id);
        if (!studentQRs) return null;

        return Array.from({ length: config.totalPages }, (_, i) => i + 1).map(pageNum => {
          const isFinalPage = pageNum === config.totalPages;
          const pageCache = studentQRs[pageNum];
          const pageQuestions = config.questions.filter(q => (q.pageNumber || 1) === pageNum);

          return (
            <Page key={`${student.id}-p${pageNum}`} size="A4" style={styles.page}>
              {/* 4 Corner QR codes */}
              {pageCache && (
                <>
                  <Image src={pageCache.cornerQR} style={[styles.cornerQR, styles.cornerTL]} />
                  <Image src={pageCache.cornerQR} style={[styles.cornerQR, styles.cornerTR]} />
                  <Image src={pageCache.cornerQR} style={[styles.cornerQR, styles.cornerBL]} />
                  <Image src={pageCache.cornerQR} style={[styles.cornerQR, styles.cornerBR]} />
                </>
              )}

              {/* Page Header */}
              <View style={styles.header}>
                <Text style={styles.schoolName}>{config.school}</Text>
                <Text style={styles.examInfo}>
                  {config.examTitle} • {config.subject} • {config.level} • {config.date}
                </Text>
                <Text style={styles.studentName}>
                  Student: {student.name} ({student.id})
                </Text>
              </View>

              {isFinalPage && (
                <View style={styles.finalPageBanner}>
                  <Text style={styles.finalPageText}>⬛ FINAL PAGE — END OF BOOKLET ⬛</Text>
                </View>
              )}

              {/* Questions */}
              {pageQuestions.map(q => (
                <View key={q.id} style={styles.questionBlock} wrap={false}>
                  <View style={styles.questionHeader}>
                    {pageCache?.questionQRs[q.id] && (
                      <Image src={pageCache.questionQRs[q.id]} style={styles.questionQR} />
                    )}
                    <View style={styles.questionInfo}>
                      <Text style={styles.questionNumber}>
                        Question {q.id} ({q.maxScore} marks)
                      </Text>
                      {q.questionText && (
                        <Text style={styles.questionText}>{q.questionText}</Text>
                      )}
                      <Text style={styles.topicLabel}>
                        {q.topic} › {q.subTopic} • {q.cognitiveLevel}
                      </Text>
                    </View>
                  </View>

                  {/* OMR Scoring Strip */}
                  <View style={styles.omrStrip}>
                    <Text style={styles.omrLabel}>SCORE:</Text>
                    {Array.from({ length: q.maxScore + 1 }, (_, n) => (
                      <View key={n} style={styles.omrBubble}>
                        <Text style={styles.omrBubbleText}>{n}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Answer writing area */}
                  <View style={styles.answerArea}>
                    {Array.from({ length: 3 }, (_, i) => (
                      <View key={i} style={styles.answerLine} />
                    ))}
                  </View>
                </View>
              ))}

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Page {pageNum} of {config.totalPages} • {student.name} • {config.school}
                </Text>
              </View>
            </Page>
          );
        });
      })}
    </Document>
  );
};

// Main export function that generates and downloads the PDF
export async function generateBookletPDF(config: BookletConfig): Promise<void> {
  // Pre-generate all QR codes
  const allQRs = new Map<string, Record<number, PageQRCache>>();

  for (const student of config.students) {
    const qrs = await generateStudentQRs(student, config);
    allQRs.set(student.id, qrs);
  }



  // Generate the PDF blob
  const blob = await pdf(
    <BookletDocument config={config} allQRs={allQRs} />
  ).toBlob();

  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${config.school}-${config.subject}-${config.level}-Booklets.pdf`.replace(/\s+/g, '_');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

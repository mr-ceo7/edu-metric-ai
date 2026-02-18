import React from 'react';
import { pdf, Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import { Question, StudentInfo, CornerQRData } from '../types';

// Generate QR code as a high-resolution data URL for crisp PDF rendering
async function generateQRDataUrl(data: object): Promise<string> {
  try {
    const QRCode = await import('qrcode');
    return await QRCode.toDataURL(JSON.stringify(data), {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
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
    marginTop: 8,
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
    marginTop: 8,
    borderTop: '1px dashed #e2e8f0',
    paddingTop: 6,
    minHeight: 60,
  },
  answerLine: {
    borderBottom: '0.5px solid #e2e8f0',
    height: 20,
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

// Only corner QR data URLs per page (no per-question QR codes)
interface PageQRCache {
  cornerQR: string;
}

// Pre-generate corner QR codes for each page of a student's booklet
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
    pages[pageNum] = { cornerQR };
  }

  return pages;
}

// The PDF Document component
const BookletDocument: React.FC<{
  config: BookletConfig;
  allQRs: Map<string, Record<number, PageQRCache>>;
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
              {/* 4 Corner QR codes — used as page boundary markers for completeness check */}
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



              {/* Questions — no per-question QR codes, more space for answers */}
              {pageQuestions.map(q => (
                <View key={q.id} style={styles.questionBlock} wrap={false}>
                  <Text style={styles.questionNumber}>
                    Question {q.id} ({q.maxScore} marks)
                  </Text>
                  {q.questionText && (
                    <Text style={styles.questionText}>{q.questionText}</Text>
                  )}
                  <Text style={styles.topicLabel}>
                    {q.topic} › {q.subTopic} • {q.cognitiveLevel}
                  </Text>

                  {/* OMR Scoring Strip */}
                  <View style={styles.omrStrip}>
                    <Text style={styles.omrLabel}>SCORE:</Text>
                    {Array.from({ length: q.maxScore + 1 }, (_, n) => (
                      <View key={n} style={styles.omrBubble}>
                        <Text style={styles.omrBubbleText}>{n}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Answer writing area — more space without question QR */}
                  <View style={styles.answerArea}>
                    {Array.from({ length: 4 }, (_, i) => (
                      <View key={i} style={styles.answerLine} />
                    ))}
                  </View>
                </View>
              ))}

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Page {pageNum} of {config.totalPages} • {student.name} • {config.school}
                  {isFinalPage ? ' • END OF BOOKLET' : ''}
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
  const allQRs = new Map<string, Record<number, PageQRCache>>();

  for (const student of config.students) {
    const qrs = await generateStudentQRs(student, config);
    allQRs.set(student.id, qrs);
  }

  const blob = await pdf(
    <BookletDocument config={config} allQRs={allQRs} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${config.school}-${config.subject}-${config.level}-Booklets.pdf`.replace(/\s+/g, '_');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

import React from 'react';
import { pdf, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

interface QuizItem {
  question: string;
  answer: string;
}

interface RemedialPDFConfig {
  school: string;
  subject: string;
  level: string;
  topic: string;
  quiz: QuizItem[];
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
    paddingBottom: 12,
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
  topicName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#4f46e5',
    marginTop: 8,
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
    fontSize: 10,
    color: '#475569',
    marginTop: 4,
    lineHeight: 1.5,
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
  nameField: {
    marginTop: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
    marginRight: 6,
  },
  nameLine: {
    flex: 1,
    borderBottom: '1px solid #94a3b8',
    height: 16,
  },
});

const QUESTIONS_PER_PAGE = 4;

const RemedialDocument: React.FC<{ config: RemedialPDFConfig }> = ({ config }) => {
  // Split quiz into pages
  const pages: QuizItem[][] = [];
  for (let i = 0; i < config.quiz.length; i += QUESTIONS_PER_PAGE) {
    pages.push(config.quiz.slice(i, i + QUESTIONS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const totalPages = pages.length;

  return (
    <Document>
      {pages.map((pageQuestions, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.schoolName}>{config.school}</Text>
            <Text style={styles.examInfo}>
              {config.subject} • {config.level} • Remedial Handout
            </Text>
            <Text style={styles.topicName}>
              Topic: {config.topic}
            </Text>
          </View>

          {/* Student name field on first page */}
          {pageIdx === 0 && (
            <View style={styles.nameField}>
              <Text style={styles.nameLabel}>Student Name:</Text>
              <View style={styles.nameLine} />
            </View>
          )}

          {/* Questions */}
          {pageQuestions.map((q, qIdx) => {
            const globalIdx = pageIdx * QUESTIONS_PER_PAGE + qIdx;
            return (
              <View key={globalIdx} style={styles.questionBlock} wrap={false}>
                <Text style={styles.questionNumber}>
                  Question {globalIdx + 1}
                </Text>
                <Text style={styles.questionText}>{q.question}</Text>

                {/* Answer writing area */}
                <View style={styles.answerArea}>
                  {Array.from({ length: 4 }, (_, i) => (
                    <View key={i} style={styles.answerLine} />
                  ))}
                </View>
              </View>
            );
          })}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Page {pageIdx + 1} of {totalPages} • {config.school} • Remedial: {config.topic}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
};

export async function generateRemedialPDF(config: RemedialPDFConfig): Promise<void> {
  const blob = await pdf(
    <RemedialDocument config={config} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${config.school}-Remedial-${config.topic}.pdf`.replace(/\s+/g, '_');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

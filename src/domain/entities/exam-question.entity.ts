import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Exam } from './exam.entity';
import { Question } from './question.entity';

/**
 * ExamQuestion is a junction table that creates many-to-many relationship
 * between Exam and Question entities
 * 
 * Why we need this:
 * - A question can appear in multiple exams (question reusability)
 * - An exam contains multiple questions
 * - We need to track the order of questions within each exam
 * - We might want to store exam-specific metadata for each question
 * 
 * This design allows flexibility in creating new exams by reusing
 * existing questions without duplicating question data
 */
@Entity('exam_question')
export class ExamQuestion {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * Foreign key to Exam table
   */
  @Column({ type: 'int' })
  ExamID: number;

  /**
   * Foreign key to Question table
   */
  @Column({ type: 'int' })
  QuestionID: number;

  /**
   * OrderIndex determines the sequence of questions in the exam
   * This is crucial for maintaining question order, especially for:
   * - Listening sections where order matters
   * - Grouped questions (e.g., questions 1-3 based on same audio)
   * - Ensuring consistent test experience
   */
  @Column({ type: 'int' })
  OrderIndex: number;

  /**
   * Relationship to Exam
   * ManyToOne because many exam-question pairs can belong to one exam
   */
  @ManyToOne(() => Exam, (exam) => exam.examQuestions, {
    onDelete: 'CASCADE', // If exam is deleted, remove all its question associations
  })
  @JoinColumn({ name: 'ExamID' })
  exam: Exam;

  /**
   * Relationship to Question
   * ManyToOne because many exam-question pairs can reference one question
   */
  @ManyToOne(() => Question, (question) => question.examQuestions, {
    eager: true, // Auto-load question data when fetching exam questions
  })
  @JoinColumn({ name: 'QuestionID' })
  question: Question;

  // Thêm vào ExamQuestion entity
  @Column({ type: 'int', nullable: true })
  MediaQuestionID: number; // Track media group này thuộc về

  @Column({ type: 'boolean', default: false })
  IsGrouped: boolean; // Flag để biết question này thuộc group hay đứng độc lập
}
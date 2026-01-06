import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { MediaQuestion } from './media-question.entity';
import { ExamQuestion } from './exam-question.entity';
import { Choice } from './choice.entity';
import { AttemptAnswer } from './attempt-answer.entity';
import { Exam } from './exam.entity';

/**
 * Question Entity represents an individual test question
 * 
 * Design considerations:
 * - Questions can be reused across multiple exams (via ExamQuestion junction)
 * - Each question has associated media (audio/image) via MediaQuestion
 * - Questions have multiple choices, one of which is correct
 * - QuestionText contains the actual question stem/prompt
 * - UserID tracks who created this question (for admin/teacher management)
 * - Explain field provides explanation for the correct answer (for learning)
 * - ShowTime indicates when question should be displayed (for time-based presentations)
 * - OrderInGroup tracks position within a question group
 */
@Entity('question')
export class Question {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * The question text/stem that students see
   * For Listening: might be empty if question is audio-only
   * For Reading: contains the actual question text
   * Max 1000 chars - longer content should be in MediaQuestion
   */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  QuestionText: string;

  /**
   * ID of user who created this question
   * Used for tracking and permission management
   */
  @Column({ type: 'int', nullable: true })
  UserID: number;

  /**
   * Foreign key to Exercise (optional)
   * Links question to an exercise/section if applicable
   */
  @Column({ type: 'int', nullable: true })
  ExerciseID: number;

  /**
   * Foreign key to Exam (optional)
   * Direct reference to exam if question is specific to one exam
   * Note: Questions can also be reused via ExamQuestion junction table
   */
  @Column({ type: 'int', nullable: true })
  ExamID: number;

  /**
   * Foreign key to MediaQuestion
   * Contains audio files, images, scripts for this question
   * This separation keeps the Question table lean and allows
   * flexible media handling
   */
  @Column({ type: 'int', nullable: true })
  MediaQuestionID: number;

  /**
   * Explanation for the correct answer
   * Helps students understand why the correct answer is right
   * Can be a detailed explanation with HTML formatting
   * Shown to students after they submit their answer or review the test
   */
  @Column({ type: 'longtext', nullable: true })
  Explain: string;

  /**
   * Time code for when this question should be shown
   * Useful for:
   * - Listening parts where questions appear after specific audio timestamps
   * - Time-based question presentations
   * - Tracking question display timing in multimedia tests
   * Format: HH:MM:SS
   */
  @Column({ type: 'time', nullable: true })
  ShowTime: string;

  /**
   * Order/position of question within its group
   * Used when multiple questions are grouped together
   * (e.g., questions 1-3 all based on same audio)
   * Default is 1 (first question)
   */
  @Column({ type: 'int', default: 1 })
  OrderInGroup: number;

  /**
   * Relationship to MediaQuestion
   * ManyToOne because multiple questions can share the same media
   * (e.g., questions 71-73 might all use the same reading passage)
   */
  @ManyToOne(() => MediaQuestion, (media) => media.questions, {
    eager: true, // Auto-load media when fetching questions
    nullable: true,
  })
  @JoinColumn({ name: 'MediaQuestionID' })
  mediaQuestion: MediaQuestion;

  /**
   * Relationship to Exam (optional direct reference)
   * ManyToOne if question is specific to one exam
   */
  @ManyToOne(() => Exam, {
    eager: false,
    nullable: true,
  })
  @JoinColumn({ name: 'ExamID' })
  exam: Exam;

  /**
   * Relationship to ExamQuestion junction table
   * This allows the question to appear in multiple exams (many-to-many)
   */
  @OneToMany(() => ExamQuestion, (examQuestion) => examQuestion.question)
  examQuestions: ExamQuestion[];

  /**
   * Relationship to Choice
   * OneToMany because each question has multiple answer choices
   * Typically 4 choices (A, B, C, D) for TOEIC
   */
  @OneToMany(() => Choice, (choice) => choice.question, {
    cascade: true, // Save choices when saving question
    eager: true, // Always load choices with question
  })
  choices: Choice[];

  /**
   * Relationship to AttemptAnswer
   * Tracks all student attempts at answering this question
   */
  @OneToMany(() => AttemptAnswer, (attemptAnswer) => attemptAnswer.question)
  attemptAnswers: AttemptAnswer[];
}
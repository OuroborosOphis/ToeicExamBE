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

/**
 * Question Entity represents an individual test question
 * 
 * Design considerations:
 * - Questions can be reused across multiple exams (via ExamQuestion junction)
 * - Each question has associated media (audio/image) via MediaQuestion
 * - Questions have multiple choices, one of which is correct
 * - QuestionText contains the actual question stem/prompt
 * - UserID tracks who created this question (for admin/teacher management)
 */
@Entity('question')
export class Question {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * The question text/stem that students see
   * For Listening: might be empty if question is audio-only
   * For Reading: contains the actual question text
   * Max 255 chars - longer content should be in MediaQuestion
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  QuestionText: string;

  /**
   * ID of user who created this question
   * Used for tracking and permission management
   */
  @Column({ type: 'int', nullable: true })
  UserID: number;

  /**
   * Foreign key to MediaQuestion
   * Contains audio files, images, scripts for this question
   * This separation keeps the Question table lean and allows
   * flexible media handling
   */
  @Column({ type: 'int' })
  MediaQuestionID: number;

  /**
   * Relationship to MediaQuestion
   * ManyToOne because multiple questions can share the same media
   * (e.g., questions 71-73 might all use the same reading passage)
   */
  @ManyToOne(() => MediaQuestion, (media) => media.questions, {
    eager: true, // Auto-load media when fetching questions
  })
  @JoinColumn({ name: 'MediaQuestionID' })
  mediaQuestion: MediaQuestion;

  /**
   * Relationship to ExamQuestion junction table
   * This allows the question to appear in multiple exams
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

  // Thêm vào Question entity
  @Column({ type: 'int', default: 1 })
  OrderInGroup: number; // Thứ tự câu hỏi trong nhóm (1, 2, 3...)
}
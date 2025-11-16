import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Question } from './question.entity';
import { AttemptAnswer } from './attempt-answer.entity';

/**
 * Choice Entity represents answer options for each question
 * 
 * TOEIC Structure:
 * - Most questions have 4 choices (A, B, C, D)
 * - Part 2 has 3 choices (A, B, C)
 * - Only one choice is correct per question
 * 
 * Design considerations:
 * - Content stores the actual answer text
 * - Attribute stores the choice identifier (A, B, C, D)
 * - IsCorrect flag indicates the correct answer
 * - Each choice belongs to exactly one question
 */
@Entity('choice')
export class Choice {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * Foreign key to Question table
   * Each choice belongs to one question
   */
  @Column({ type: 'int' })
  QuestionID: number;

  /**
   * The actual text content of this choice
   * What the student sees as a possible answer
   * Examples:
   * - "The package will arrive tomorrow."
   * - "She is reviewing the contract."
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Content: string;

  /**
   * The choice identifier/label (A, B, C, or D)
   * Used for display and student answer selection
   * Should be consistent: typically A, B, C, D for most parts
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Attribute: string;

  /**
   * Boolean flag indicating if this is the correct answer
   * Only one choice per question should have IsCorrect = true
   * Used during automatic grading to check student answers
   */
  @Column({ type: 'bit', default: false })
  IsCorrect: boolean;

  /**
   * Relationship to Question
   * ManyToOne because many choices belong to one question
   * Typically 4 choices per question in TOEIC
   */
  @ManyToOne(() => Question, (question) => question.choices, {
    onDelete: 'CASCADE', // If question is deleted, delete all its choices
  })
  @JoinColumn({ name: 'QuestionID' })
  question: Question;

  /**
   * Relationship to AttemptAnswer
   * Tracks which students selected this choice
   * Used for analytics and statistics
   */
  @OneToMany(() => AttemptAnswer, (attemptAnswer) => attemptAnswer.choice)
  attemptAnswers: AttemptAnswer[];
}
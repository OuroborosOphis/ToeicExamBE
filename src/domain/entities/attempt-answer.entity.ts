import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Attempt } from './attempt.entity';
import { Question } from './question.entity';
import { Choice } from './choice.entity';

/**
 * AttemptAnswer Entity records each individual answer within an attempt
 * 
 * This entity is crucial for:
 * - Detailed scoring and feedback
 * - Analytics on which questions students struggle with
 * - Showing correct/incorrect answers in review
 * - Tracking answer patterns for adaptive learning
 * 
 * Relationship structure:
 * - One Attempt has many AttemptAnswers (one per question)
 * - Each AttemptAnswer references the Question that was answered
 * - Each AttemptAnswer references the Choice the student selected
 * - IsCorrect is computed by comparing selected choice with correct choice
 */
@Entity('attemptanswer')
export class AttemptAnswer {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * Foreign key to Attempt table
   * Links this answer to the overall test attempt
   */
  @Column({ type: 'int' })
  AttemptID: number;

  /**
   * Foreign key to Question table
   * Identifies which question was answered
   */
  @Column({ type: 'int' })
  QuestionID: number;

  /**
   * Foreign key to Choice table
   * The specific choice/answer the student selected
   * This allows us to see not just if they were right/wrong,
   * but also what incorrect answer they chose (useful for analytics)
   */
  @Column({ type: 'int' })
  ChoiceID: number;

  /**
   * Boolean flag indicating if the answer was correct
   * Computed by comparing the selected choice's IsCorrect flag
   * Stored for quick queries and aggregations (e.g., total score)
   * 
   * Why store this when we can compute it from Choice.IsCorrect?
   * - Performance: Faster to count correct answers without joining tables
   * - Immutability: If question/choice is edited later, historical data preserved
   * - Analytics: Easy to query statistics without complex joins
   */
  @Column({
    type: 'bit',
    nullable: true,
    transformer: {
      to: (value: boolean | number) => value,
      from: (value: any) => {
        // Convert Buffer/number to boolean
        if (Buffer.isBuffer(value)) {
          return value[0] === 1;
        }
        if (typeof value === 'number') {
          return value === 1;
        }
        return Boolean(value);
      },
    },
  })
  IsCorrect: boolean;

  /**
   * Relationship to Attempt
   * ManyToOne because many answers belong to one attempt
   */
  @ManyToOne(() => Attempt, (attempt) => attempt.attemptAnswers, {
    onDelete: 'CASCADE', // If attempt is deleted, delete all its answers
  })
  @JoinColumn({ name: 'AttemptID' })
  attempt: Attempt;

  /**
   * Relationship to Question
   * ManyToOne because many attempts can answer the same question
   * Eager loading to always have question details available
   */
  @ManyToOne(() => Question, (question) => question.attemptAnswers, {
    eager: true,
  })
  @JoinColumn({ name: 'QuestionID' })
  question: Question;

  /**
   * Relationship to Choice
   * ManyToOne because many attempt answers can select the same choice
   * Eager loading to immediately know what was selected
   */
  @ManyToOne(() => Choice, (choice) => choice.attemptAnswers, {
    eager: true,
  })
  @JoinColumn({ name: 'ChoiceID' })
  choice: Choice;
}
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';
import { Exam } from './exam.entity';
import { AttemptAnswer } from './attempt-answer.entity';

/**
 * Attempt Entity tracks each time a student takes an exam or does an exercise
 * 
 * This is a critical entity for the system as it:
 * - Records test-taking sessions
 * - Stores scores and timing information
 * - Links to individual answers via AttemptAnswer
 * - Enables progress tracking and analytics
 * 
 * We added Type field to distinguish between:
 * - EXERCISE: Practice from learning section
 * - PLACEMENT_TEST: Initial level assessment
 * - FULL_TEST: Complete 200-question TOEIC test
 * - PRACTICE_BY_PART: Partial test practice
 */
@Entity('attempt')
export class Attempt {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * Foreign key to StudentProfile
   * Links this attempt to a specific student
   */
  @Column({ type: 'int' })
  StudentProfileID: number;

  /**
   * Type of attempt to distinguish between exam and exercise attempts
   * Values: 'EXERCISE', 'PLACEMENT_TEST', 'FULL_TEST', 'PRACTICE_BY_PART'
   * This field is crucial for separating learning activities from testing
   */
  @Column({
    type: 'enum',
    enum: ['EXERCISE', 'PLACEMENT_TEST', 'FULL_TEST', 'PRACTICE_BY_PART'],
    default: 'FULL_TEST',
  })
  Type: string;

  /**
   * Foreign key to Exam table (nullable for exercise attempts)
   * When Type is FULL_TEST or PRACTICE_BY_PART, this must be set
   * When Type is EXERCISE, this is null and ExerciseID is used instead
   */
  @Column({ type: 'int', nullable: true })
  ExamID: number;

  /**
   * Foreign key to Exercise table (from learning section)
   * When Type is EXERCISE, this must be set
   * When Type is FULL_TEST or PRACTICE_BY_PART, this is null
   */
  @Column({ type: 'int', nullable: true })
  ExerciseID: number;

  /**
   * Timestamp when student started this attempt
   * Used for:
   * - Time validation (ensuring they didn't exceed time limit)
   * - Activity tracking
   * - Last active calculations
   */
  @CreateDateColumn({ type: 'datetime', nullable: true })
  StartedAt: Date;

  /**
   * Timestamp when student submitted their answers
   * If null, attempt is still in progress (student hasn't submitted yet)
   * Used to calculate total time taken
   */
  @Column({ type: 'datetime', nullable: true })
  SubmittedAt: Date | null;

  /**
   * Overall score as percentage (0-100)
   * Calculated as: (correct answers / total questions) * 100
   * Used for quick filtering and statistics
   */
  @Column({ type: 'int', nullable: true })
  ScorePercent: number;

  /**
   * Reading section score (0-495 in TOEIC scale)
   * Converted from number of correct answers using TOEIC conversion table
   * For Practice by Part, this might represent score for selected parts
   */
  @Column({ type: 'int', nullable: true })
  ScoreReading: number;

  /**
   * Listening section score (0-495 in TOEIC scale)
   * Converted from number of correct answers using TOEIC conversion table
   * For Practice by Part, this might represent score for selected parts
   */
  @Column({ type: 'int', nullable: true })
  ScoreListening: number;

  /**
   * Relationship to StudentProfile
   * ManyToOne because a student can have many attempts
   */
  @ManyToOne(() => StudentProfile, (profile) => profile.attempts)
  @JoinColumn({ name: 'StudentProfileID' })
  studentProfile: StudentProfile;

  /**
   * Relationship to Exam
   * ManyToOne because many attempts can be for the same exam
   * Optional because exercise attempts don't have an exam
   */
  @ManyToOne(() => Exam, (exam) => exam.attempts, { nullable: true })
  @JoinColumn({ name: 'ExamID' })
  exam: Exam;

  /**
   * Relationship to AttemptAnswer
   * OneToMany because one attempt has many individual answers
   * This allows us to see exactly which questions the student got right/wrong
   */
  @OneToMany(() => AttemptAnswer, (attemptAnswer) => attemptAnswer.attempt, {
    cascade: true, // Save answers when saving attempt
  })
  attemptAnswers: AttemptAnswer[];
}
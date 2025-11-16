import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ExamType } from './exam-type.entity';
import { ExamQuestion } from './exam-question.entity';
import { Attempt } from './attempt.entity';
import { Comment } from './comment.entity';

/**
 * Exam Entity represents a test (Full Test or Practice by Part)
 * 
 * Design decisions:
 * - Title and Type help identify the exam purpose
 * - TimeExam is stored in minutes for consistency
 * - ExamType provides categorization (Full Test, Mini Test, etc.)
 * - UserID tracks who created this exam (admin/teacher)
 * - Relations are set up for easy querying of questions and attempts
 */
@Entity('exam')
export class Exam {
  @PrimaryGeneratedColumn()
  ID: number;

  @Column({ type: 'varchar', length: 255 })
  Title: string;

  @CreateDateColumn({ type: 'datetime' })
  TimeCreate: Date;

  /**
   * Time allowed for this exam in minutes
   * Full Test: 120 minutes
   * Practice by Part: varies based on selected parts
   */
  @Column({ type: 'int' })
  TimeExam: number;

  /**
   * Type field for additional categorization
   * Can be used to distinguish between different test formats
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Type: string;

  /**
   * ID of the user who created this exam (admin or teacher)
   */
  @Column({ type: 'int', nullable: true })
  UserID: number;

  /**
   * Foreign key to ExamType table
   * Defines whether this is a Full Test, Mini Test, etc.
   */
  @Column({ type: 'int' })
  ExamTypeID: number;

  /**
   * Relationship to ExamType
   * ManyToOne because many exams can have the same type
   */
  @ManyToOne(() => ExamType, (examType) => examType.exams, {
    eager: false, // Don't auto-load to avoid performance issues
  })
  @JoinColumn({ name: 'ExamTypeID' })
  examType: ExamType;

  /**
   * Relationship to ExamQuestion (through junction table)
   * OneToMany because one exam has many questions
   */
  @OneToMany(() => ExamQuestion, (examQuestion) => examQuestion.exam, {
    cascade: true, // When we save an exam, save its questions too
  })
  examQuestions: ExamQuestion[];

  /**
   * Relationship to Attempt
   * OneToMany because one exam can have many attempts from different students
   */
  @OneToMany(() => Attempt, (attempt) => attempt.exam)
  attempts: Attempt[];

  /**
   * Relationship to Comment
   * OneToMany because one exam can have many comments
   */
  @OneToMany(() => Comment, (comment) => comment.exam)
  comments: Comment[];
}
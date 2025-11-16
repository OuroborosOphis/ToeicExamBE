import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Exam } from './exam.entity';

/**
 * ExamType Entity for categorizing different types of exams
 * 
 * Examples:
 * - FULL_TEST: Complete 200-question TOEIC test (120 minutes)
 * - MINI_TEST: Shorter practice test
 * - PART_PRACTICE: Practice specific parts (e.g., only Part 5-6)
 * 
 * This allows flexible exam configuration and easy filtering
 */
@Entity('examtype')
export class ExamType {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * Unique code identifier for this exam type
   * Should be uppercase with underscores (e.g., FULL_TEST, MINI_TEST)
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  Code: string;

  /**
   * Human-readable description of this exam type
   * Can be displayed to users when selecting exam type
   */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  Description: string;

  /**
   * Relationship to Exam
   * OneToMany because one exam type can be used by many exams
   */
  @OneToMany(() => Exam, (exam) => exam.examType)
  exams: Exam[];
}
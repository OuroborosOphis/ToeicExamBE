import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';
import { Exam } from './exam.entity';

/**
 * Comment Entity represents user comments on exams
 * 
 * This enables a discussion/Q&A feature where students can:
 * - Ask questions about specific exams or questions
 * - Share insights and tips
 * - Report issues with questions
 * - Reply to other students' comments (via ParentId)
 * 
 * The ParentId field creates a hierarchical comment structure:
 * - ParentId = 0: Top-level comment
 * - ParentId > 0: Reply to another comment
 * This allows threaded discussions similar to Reddit or forums
 */
@Entity('comment')
export class Comment {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * The actual comment text content
   * What the user wrote
   * Max 255 chars for now, could be increased if needed
   */
  @Column({ type: 'varchar', length: 255 })
  Content: string;

  /**
   * Timestamp when comment was created
   * Used for sorting and displaying "X hours ago" style timestamps
   */
  @CreateDateColumn({ type: 'datetime' })
  CreateAt: Date;

  /**
   * Parent comment ID for threaded discussions
   * - 0 or NULL: This is a top-level comment
   * - > 0: This is a reply to comment with that ID
   * 
   * This enables nested conversations:
   * Comment 1
   *   └─ Comment 2 (ParentId = 1)
   *      └─ Comment 3 (ParentId = 2)
   */
  @Column({ type: 'int', default: 0 })
  ParentId: number;

  /**
   * Comment status for moderation
   * Values:
   * - 0: Pending review (new comment)
   * - 1: Approved and visible
   * - 2: Hidden/Deleted by moderator
   * - 3: Reported by users
   * 
   * This allows teachers/admins to moderate discussions
   * and hide inappropriate content
   */
  @Column({ type: 'int', default: 1 })
  Status: number;

  /**
   * Foreign key to StudentProfile
   * Identifies who wrote this comment
   */
  @Column({ type: 'int' })
  StudentProfileID: number;

  /**
   * Foreign key to Exam
   * Identifies which exam this comment is about
   */
  @Column({ type: 'int' })
  ExamID: number;

  /**
   * Relationship to StudentProfile
   * ManyToOne because a student can write many comments
   */
  @ManyToOne(() => StudentProfile, (profile) => profile.comments)
  @JoinColumn({ name: 'StudentProfileID' })
  studentProfile: StudentProfile;

  /**
   * Relationship to Exam
   * ManyToOne because an exam can have many comments
   */
  @ManyToOne(() => Exam, (exam) => exam.comments)
  @JoinColumn({ name: 'ExamID' })
  exam: Exam;
}
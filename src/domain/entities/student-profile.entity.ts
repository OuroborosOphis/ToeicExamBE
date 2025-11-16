import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Attempt } from './attempt.entity';
import { Comment } from './comment.entity';

/**
 * StudentProfile Entity extends User entity with student-specific information
 * 
 * This separation follows the principle of role-based data segregation:
 * - Core user data (email, password, name) in User table
 * - Student-specific data (goals, progress) in StudentProfile table
 * - Similar pattern exists for TeacherProfile
 * 
 * Benefits:
 * - Cleaner data model
 * - Better performance (don't load student data for teachers)
 * - Easier to extend with role-specific features
 */
@Entity('studentprofile')
export class StudentProfile {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * Foreign key to User table
   * OneToOne relationship: each user can have only one student profile
   */
  @Column({ type: 'int' })
  UserID: number;

  /**
   * Student's target TOEIC score (0-990)
   * Used for:
   * - Motivational tracking
   * - Generating appropriate study plans
   * - Recommending suitable exam difficulty
   */
  @Column({ type: 'int', nullable: true })
  TargetScore: number;

  /**
   * Daily study commitment in minutes
   * Used for:
   * - Study plan generation
   * - Progress tracking
   * - Reminder scheduling
   */
  @Column({ type: 'int', nullable: true })
  DailyStudyMinutes: number;

  /**
   * Target date for achieving goal score
   * Used for:
   * - Study plan pacing
   * - Motivational reminders
   * - Progress visualization
   */
  @Column({ type: 'datetime', nullable: true })
  GoalDate: Date;

  /**
   * Level determined by placement test
   * Values could be: 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'
   * Or numeric ranges: '0-300', '300-600', '600+'
   * Used to recommend appropriate courses and exams
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  PlacementLevel: string;

  /**
   * Last time student was active in the system
   * Used for:
   * - Identifying inactive users for reminders
   * - Analytics on user engagement
   * - Study streak calculations
   */
  @Column({ type: 'datetime', nullable: true })
  LastActiveAt: Date;

  /**
   * Relationship to User
   * OneToOne because each student profile belongs to exactly one user
   */
  @OneToOne(() => User, (user) => user.studentProfile)
  @JoinColumn({ name: 'UserID' })
  user: User;

  /**
   * Relationship to Attempt
   * OneToMany because a student can have many test attempts
   * This is crucial for tracking progress over time
   */
  @OneToMany(() => Attempt, (attempt) => attempt.studentProfile)
  attempts: Attempt[];

  /**
   * Relationship to Comment
   * OneToMany because a student can write many comments on exams
   */
  @OneToMany(() => Comment, (comment) => comment.studentProfile)
  comments: Comment[];
}
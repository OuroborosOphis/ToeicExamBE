import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  CreateDateColumn,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';

/**
 * User Entity represents the core user account information
 * 
 * This is the base entity that all users share, regardless of role.
 * It contains authentication and basic profile information.
 * 
 * Role-specific data is stored in separate tables:
 * - StudentProfile for students
 * - TeacherProfile for teachers
 * - Admin users use just this table
 * 
 * Note: The actual password should be hashed (bcrypt) before storing
 * Note: Status field has typo "Satus" in original schema, keeping for consistency
 */
@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * User's email address
   * Used for:
   * - Login authentication
   * - Password recovery
   * - System notifications
   * Should be unique across the system
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  Email: string;

  /**
   * Hashed password
   * NEVER store plain text passwords!
   * Should be hashed using bcrypt with appropriate salt rounds (10-12)
   * Frontend should never receive this field
   */
  @Column({ type: 'varchar', length: 255 })
  Password: string;

  /**
   * User's full name
   * Used for display purposes throughout the application
   */
  @Column({ type: 'varchar', length: 255 })
  FullName: string;

  /**
   * Account status
   * Values: 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'
   * Note: Original schema has typo "Satus", keeping for compatibility
   */
  @Column({ type: 'varchar', length: 255, default: 'ACTIVE' })
  Satus: string;

  /**
   * Account creation timestamp
   * Automatically set when user registers
   */
  @CreateDateColumn({ type: 'datetime' })
  CreateAt: Date;

  /**
   * JWT refresh token or verification token
   * Can be used for:
   * - Email verification
   * - Password reset
   * - Refresh token storage (though Redis is better for this)
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Token: string;

  /**
   * User's phone number
   * Optional field for contact purposes
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Phone: string;

  /**
   * User's address
   * Optional field for profile completeness
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Address: string;

  /**
   * User's gender
   * Values: 'MALE', 'FEMALE', 'OTHER'
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Sex: string;

  /**
   * User's birthday
   * Note: Original schema has typo "Birhday", keeping for compatibility
   */
  @Column({ type: 'datetime', nullable: true })
  Birhday: Date;

  /**
   * Relationship to StudentProfile
   * OneToOne because a user can have at most one student profile
   * Not all users are students (could be teachers or admins)
   */
  @OneToOne(() => StudentProfile, (profile) => profile.user, { nullable: true })
  studentProfile: StudentProfile;

  // Note: TeacherProfile relationship would be added here similarly
  // but we're focusing on exam functionality for now
}
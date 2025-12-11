import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Question } from './question.entity';

/**
 * MediaQuestion Entity stores all media assets associated with questions
 * 
 * Why separate media from questions?
 * - Multiple questions can share the same media (e.g., questions 71-73 share a reading passage)
 * - Keeps Question table clean and focused on question logic
 * - Makes it easier to update media without affecting question data
 * - Allows flexible media types (audio, image, text passages)
 * 
 * TOEIC Structure:
 * Listening (Part 1-4): Requires AudioUrl and sometimes ImageUrl
 * Reading (Part 5-7): May require ImageUrl for passages or documents
 */
@Entity('mediaquestion')
export class MediaQuestion {
  @PrimaryGeneratedColumn()
  ID: number;

  /**
   * Skill category: 'LISTENING' or 'READING'
   * Used for categorization and statistics
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Skill: string;

  /**
   * Type of question within the skill
   * Examples:
   * - PHOTO_DESCRIPTION (Part 1)
   * - QUESTION_RESPONSE (Part 2)
   * - SHORT_CONVERSATION (Part 3)
   * - SHORT_TALK (Part 4)
   * - INCOMPLETE_SENTENCE (Part 5)
   * - TEXT_COMPLETION (Part 6)
   * - READING_COMPREHENSION (Part 7)
   */
  @Column({ type: 'varchar', length: 255 })
  Type: string;

  /**
   * Section/Part number (1-7 for TOEIC)
   * Helps in organizing questions and generating practice by part
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  Section: string;

  /**
   * URL to audio file (stored in Cloudinary or similar)
   * Required for Listening questions (Part 1-4)
   * Format: MP3 or WAV
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  AudioUrl: string;

  /**
   * URL to image file (stored in Cloudinary or similar)
   * Used for:
   * - Part 1: Photo descriptions
   * - Part 7: Documents, charts, forms, etc.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  ImageUrl: string;

  /**
   * Script/transcript of audio or full text passage
   * Used for:
   * - Audio transcripts (for admin reference and explanations)
   * - Reading passages (Part 6-7)
   * - Can be quite long, so using TEXT type (max 65,535 chars)
   */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  Scirpt: string; // Note: Original typo in schema, keeping for consistency

  /**
   * Relationship to Question
   * OneToMany because one media asset can be shared by multiple questions
   * Example: Questions 71-73 all reference the same reading passage
   */
  @OneToMany(() => Question, (question) => question.mediaQuestion)
  questions: Question[];

  // Thêm vào MediaQuestion entity
  @Column({ type: 'varchar', length: 500, nullable: true })
  GroupTitle: string; // Tiêu đề cho nhóm câu hỏi

  @Column({ type: 'text', nullable: true })
  GroupDescription: string; // Mô tả về nhóm

  @Column({ 
    type: 'enum', 
    enum: ['EASY', 'MEDIUM', 'HARD'],
    default: 'MEDIUM',
    nullable: true 
  })
  Difficulty: string; // Độ khó ước lượng

  @Column({ type: 'json', nullable: true })
  Tags: string[]; // Tags để phân loại và tìm kiếm

  @Column({ type: 'int', default: 0 })
  OrderIndex: number; // Thứ tự trong part
}
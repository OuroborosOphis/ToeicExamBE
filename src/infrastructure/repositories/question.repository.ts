import { Repository, Like, In } from 'typeorm';
import { AppDataSource } from '../database/config';
import { Question } from '../../domain/entities/question.entity';
import { MediaQuestion } from '../../domain/entities/media-question.entity';
import { Choice } from '../../domain/entities/choice.entity';

/**
 * QuestionRepository handles all database operations for questions
 * 
 * This repository manages the complex relationship between:
 * - Question (the question text)
 * - MediaQuestion (audio, images, passages)
 * - Choice (answer options)
 * 
 * Operations here often involve transactions to ensure all three
 * pieces are created/updated/deleted together atomically.
 */
export class QuestionRepository {
  private repository: Repository<Question>;
  private mediaRepository: Repository<MediaQuestion>;
  private choiceRepository: Repository<Choice>;

  constructor() {
    this.repository = AppDataSource.getRepository(Question);
    this.mediaRepository = AppDataSource.getRepository(MediaQuestion);
    this.choiceRepository = AppDataSource.getRepository(Choice);
  }

  /**
   * Create a complete question with media and choices
   * 
   * This is a complex transaction that creates:
   * 1. MediaQuestion record (audio/image URLs, script)
   * 2. Question record (linked to media)
   * 3. Multiple Choice records (linked to question)
   * 
   * All three must succeed together. If any fails, entire
   * operation is rolled back to maintain data integrity.
   * 
   * @param questionData - Question text and metadata
   * @param mediaData - Audio/image URLs and passages
   * @param choicesData - Array of answer choices
   * @returns Complete question with all relations
   */
  async create(
    questionData: Partial<Question>,
    mediaData: Partial<MediaQuestion>,
    choicesData: Partial<Choice>[]
  ): Promise<Question> {
    // Use transaction to ensure atomicity
    return await AppDataSource.transaction(async (manager) => {
      // Step 1: Create media record
      const media = manager.create(MediaQuestion, mediaData);
      const savedMedia = await manager.save(media);

      // Step 2: Create question record linked to media
      const question = manager.create(Question, {
        ...questionData,
        MediaQuestionID: savedMedia.ID,
      });
      const savedQuestion = await manager.save(question);

      // Step 3: Create all choices linked to question
      const choices = choicesData.map((choiceData) =>
        manager.create(Choice, {
          ...choiceData,
          QuestionID: savedQuestion.ID,
        })
      );
      await manager.save(choices);

      // Return complete question with all relations loaded
      return await manager.findOne(Question, {
        where: { ID: savedQuestion.ID },
        relations: ['mediaQuestion', 'choices'],
      }) as Question;
    });
  }

  /**
   * Find question by ID with all relations
   * 
   * Loads complete question data including:
   * - Question text
   * - All answer choices
   * - Associated media (audio, images, scripts)
   * 
   * This is what we need when displaying a question to students
   * or when admin needs to edit a question.
   * 
   * @param id - Question ID
   * @returns Complete question data or null
   */
  async findById(id: number): Promise<Question | null> {
    return await this.repository.findOne({
      where: { ID: id },
      relations: ['mediaQuestion', 'choices'],
    });
  }

  /**
   * Find multiple questions by their IDs
   * 
   * Useful when creating an exam from a list of question IDs,
   * or when we need to load several questions at once.
   * 
   * More efficient than calling findById multiple times.
   * 
   * @param ids - Array of question IDs
   * @returns Array of questions with all relations
   */
  async findByIds(ids: number[]): Promise<Question[]> {
    return await this.repository.find({
      where: { ID: In(ids) },
      relations: ['mediaQuestion', 'choices'],
    });
  }

  /**
   * Find questions with advanced filtering
   * 
   * Supports filtering by:
   * - Skill (LISTENING or READING)
   * - Section (Part 1-7)
   * - Type (specific question types)
   * - Search text (searches in question text and script)
   * 
   * With pagination for performance.
   * 
   * This powers the question bank UI where admin/teacher
   * can browse and select questions for exams.
   * 
   * @param filters - Filter criteria
   * @returns Object with questions array and pagination info
   */
  async findWithFilters(filters: {
    Skill?: string;
    Section?: string;
    Type?: string;
    SearchText?: string;
    Page?: number;
    Limit?: number;
  }): Promise<{ questions: Question[]; total: number }> {
    const page = filters.Page || 1;
    const limit = filters.Limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.mediaQuestion', 'media')
      .leftJoinAndSelect('question.choices', 'choices');

    // Apply filters
    if (filters.Skill) {
      queryBuilder.andWhere('media.Skill = :skill', { skill: filters.Skill });
    }

    if (filters.Section) {
      queryBuilder.andWhere('media.Section = :section', {
        section: filters.Section,
      });
    }

    if (filters.Type) {
      queryBuilder.andWhere('media.Type = :type', { type: filters.Type });
    }

    if (filters.SearchText) {
      queryBuilder.andWhere(
        '(question.QuestionText LIKE :searchText OR media.Scirpt LIKE :searchText)',
        { searchText: `%${filters.SearchText}%` }
      );
    }

    // Get total count before pagination
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    const questions = await queryBuilder.getMany();

    return { questions, total };
  }

  /**
   * Update a question and its related data
   * 
   * This allows updating:
   * - Question text
   * - Media (audio/image URLs, script)
   * - Choices (add, update, or remove choices)
   * 
   * Uses transaction to ensure all updates succeed together.
   * 
   * @param id - Question ID to update
   * @param questionData - Updated question data
   * @param mediaData - Updated media data
   * @param choicesData - Updated choices data
   * @returns Updated question with all relations
   */
  async update(
    id: number,
    questionData?: Partial<Question>,
    mediaData?: Partial<MediaQuestion>,
    choicesData?: Partial<Choice>[]
  ): Promise<Question | null> {
    const question = await this.findById(id);
    
    if (!question) {
      return null;
    }

    return await AppDataSource.transaction(async (manager) => {
      // Update question text if provided
      if (questionData) {
        await manager.update(Question, id, questionData);
      }

      // Update media if provided
      if (mediaData && question.MediaQuestionID) {
        await manager.update(MediaQuestion, question.MediaQuestionID, mediaData);
      }

      // Update choices if provided
      if (choicesData) {
        // Delete existing choices
        await manager.delete(Choice, { QuestionID: id });
        
        // Create new choices
        const newChoices = choicesData.map((choiceData) =>
          manager.create(Choice, {
            ...choiceData,
            QuestionID: id,
          })
        );
        await manager.save(newChoices);
      }

      // Return updated question
      return await manager.findOne(Question, {
        where: { ID: id },
        relations: ['mediaQuestion', 'choices'],
      }) as Question;
    });
  }

  /**
   * Delete a question
   * 
   * This cascade deletes:
   * - The question record
   * - All associated choices
   * - MediaQuestion record (if not used by other questions)
   * 
   * Important: This also removes the question from any exams
   * that use it (via ExamQuestion cascade delete).
   * 
   * Consider implementing soft delete instead for production
   * to preserve historical data.
   * 
   * @param id - Question ID to delete
   * @returns True if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const question = await this.findById(id);
    
    if (!question) {
      return false;
    }

    return await AppDataSource.transaction(async (manager) => {
      // Delete choices first (cascade should handle this, but being explicit)
      await manager.delete(Choice, { QuestionID: id });
      
      // Delete question (this removes ExamQuestion associations)
      await manager.delete(Question, id);
      
      // Check if media is used by other questions
      const otherQuestions = await manager.count(Question, {
        where: { MediaQuestionID: question.MediaQuestionID },
      });
      
      // If no other questions use this media, delete it
      if (otherQuestions === 0) {
        await manager.delete(MediaQuestion, question.MediaQuestionID);
      }
      
      return true;
    });
  }

  /**
   * Bulk delete questions
   * 
   * Deletes multiple questions at once. More efficient than
   * calling delete() multiple times.
   * 
   * Useful for admin cleanup operations.
   * 
   * @param ids - Array of question IDs to delete
   * @returns Number of questions deleted
   */
  async bulkDelete(ids: number[]): Promise<number> {
    const result = await this.repository.delete(ids);
    return result.affected || 0;
  }

  /**
   * Get question usage statistics
   * 
   * Shows how many exams use this question and how many
   * students have attempted it.
   * 
   * Useful for admin to decide if a question should be
   * retired or if it's too easy/hard based on statistics.
   * 
   * @param id - Question ID
   * @returns Usage statistics
   */
  async getUsageStats(id: number): Promise<any> {
    const question = await this.repository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.examQuestions', 'eq')
      .leftJoinAndSelect('question.attemptAnswers', 'aa')
      .where('question.ID = :id', { id })
      .getOne();

    if (!question) {
      return null;
    }

    const timesUsed = question.examQuestions?.length || 0;
    const totalAttempts = question.attemptAnswers?.length || 0;
    const correctAttempts = question.attemptAnswers?.filter((aa) => aa.IsCorrect).length || 0;
    const correctPercentage = totalAttempts > 0
      ? Math.round((correctAttempts / totalAttempts) * 100)
      : 0;

    return {
      questionId: id,
      usedInExams: timesUsed,
      totalAttempts,
      correctAttempts,
      correctPercentage,
      difficulty: correctPercentage >= 80 ? 'EASY' : correctPercentage >= 50 ? 'MEDIUM' : 'HARD',
    };
  }

  /**
   * Get questions by section for practice mode
   * 
   * When student wants to practice specific parts (e.g., Part 5),
   * this returns all available questions for those parts.
   * 
   * Can limit the number of questions returned for shorter practice sessions.
   * 
   * @param sections - Array of section/part numbers (e.g., ['5', '6'])
   * @param limit - Maximum number of questions to return
   * @returns Array of questions for the specified sections
   */
  async getQuestionsBySection(sections: string[], limit?: number): Promise<Question[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.mediaQuestion', 'media')
      .leftJoinAndSelect('question.choices', 'choices')
      .where('media.Section IN (:...sections)', { sections });

    if (limit) {
      queryBuilder.take(limit);
    }

    return await queryBuilder.getMany();
  }
}
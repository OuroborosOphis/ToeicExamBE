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
   * IMPORTANT: Choice updates use upsert logic:
   * - Choices with ID in payload: update those choices
   * - Choices without ID in payload: create new choices
   * - Choices in DB but not in payload:
   *   - If not referenced by any attemptanswer: delete
   *   - If referenced by attemptanswer: keep (don't delete FK constraint)
   * 
   * @param id - Question ID to update
   * @param questionData - Updated question data
   * @param mediaData - Updated media data
   * @param choicesData - Updated choices data (with optional IDs)
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

      // Update choices if provided - using upsert logic
      if (choicesData) {
        // Load current choices for this question
        const existingChoices = await manager.find(Choice, {
          where: { QuestionID: id },
        });

        const existingChoiceMap = new Map(existingChoices.map(c => [c.ID, c]));
        const payloadIds = new Set<number>();

        // Process choices from payload
        for (const choicePayload of choicesData) {
          if (choicePayload.ID) {
            // Update existing choice
            payloadIds.add(choicePayload.ID);
            
            // Check if IsCorrect flag changed
            const oldChoice = existingChoiceMap.get(choicePayload.ID);
            const isCorrectChanged = oldChoice && oldChoice.IsCorrect !== choicePayload.IsCorrect;
            
            await manager.update(
              Choice,
              choicePayload.ID,
              {
                Attribute: choicePayload.Attribute,
                Content: choicePayload.Content,
                IsCorrect: choicePayload.IsCorrect,
              }
            );

            // ✅ CẬP NHẬT ATTEMPTANSWER NẾU ISCORRECT THAY ĐỔI
            if (isCorrectChanged) {
              console.log(
                `⚠️ IsCorrect changed for Choice ${choicePayload.ID}. ` +
                `Updating corresponding AttemptAnswers...`
              );
              
              // Cập nhật tất cả AttemptAnswer sử dụng choice này
              await manager.update(
                'AttemptAnswer' as any,
                { ChoiceID: choicePayload.ID },
                { IsCorrect: choicePayload.IsCorrect }
              );
              
              console.log(
                `✅ Updated IsCorrect in AttemptAnswer for Choice ${choicePayload.ID}`
              );
            }
          } else {
            // Create new choice (no ID provided)
            const newChoice = manager.create(Choice, {
              ...choicePayload,
              QuestionID: id,
            });
            await manager.save(newChoice);
          }
        }

        // Handle choices in DB but not in payload
        // Only delete if not referenced by attemptanswer (no FK constraint)
        for (const [choiceId, existingChoice] of existingChoiceMap) {
          if (!payloadIds.has(choiceId)) {
            // Check if this choice is referenced by any attemptanswer
            const referenceCount = await manager.count('AttemptAnswer' as any, {
              where: { ChoiceID: choiceId },
            } as any);

            if (referenceCount === 0) {
              // Safe to delete - not referenced
              await manager.delete(Choice, choiceId);
              console.log(`Deleted unreferenced choice ${
                choiceId}`);
            } else {
              // Keep the choice - it's referenced by attempt answers
              console.warn(
                `⚠️ Keeping choice ${choiceId} because it's referenced by ${referenceCount} attempt answer(s). ` +
                `To fully remove it, delete those attempt answers first.`
              );
            }
          }
        }
      }

      // Return updated question
      return await manager.findOne(Question, {
        where: { ID: id },
        relations: ['mediaQuestion', 'choices'],
      }) as Question;
    });
  }

    /**
   * Recalculate scores for all attempts using this question
   * 
   * When question's correct answer changes, old scores might be wrong.
   * This method recalculates attempt scores based on new correct answers.
   * 
   * Scoring logic depends on attempt type:
   * - FULL_TEST: Use TOEIC conversion tables (0-495 per section)
   * - PRACTICE_BY_PART: Use percentage-based scoring (0-100%)
   * 
   * @param questionId - Question ID that was modified
   */
  async recalculateAttemptScores(questionId: number): Promise<void> {
    // Import TOEIC conversion functions
    const { convertListeningScore, convertReadingScore } = await import('../../utils/toeic-score-conversion');

    return await AppDataSource.transaction(async (manager) => {
      // Find the question to get its skill type (LISTENING or READING)
      const question = await manager.findOne(Question, {
        where: { ID: questionId },
        relations: ['mediaQuestion'],
      });

      if (!question) {
        console.warn(`❌ Question ${questionId} not found for score recalculation`);
        return;
      }

      const skill = question.mediaQuestion?.Skill; // LISTENING or READING
      console.log(`📊 Recalculating scores for ${skill} question ${questionId}`);

      // Find all attempts that used this question
      const affectedAttempts = await manager.query(`
        SELECT DISTINCT a.ID, a.Type, a.ExamID
        FROM attempt a
        INNER JOIN attemptanswer aa ON a.ID = aa.AttemptID
        WHERE aa.QuestionID = ?
      `, [questionId]);

      console.log(
        `⚠️ Found ${affectedAttempts.length} attempts that need score recalculation`
      );

      // For each affected attempt, recalculate scores based on attempt type
      for (const { ID: attemptId, Type: attemptType, ExamID } of affectedAttempts) {
        // Calculate overall correct/total
        const overallResult = await manager.query(`
          SELECT 
            SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END) as correctCount,
            COUNT(*) as totalCount
          FROM attemptanswer
          WHERE AttemptID = ?
        `, [attemptId]);

        const overallCorrectCount = overallResult[0]?.correctCount || 0;
        const overallTotalCount = overallResult[0]?.totalCount || 1;
        const scorePercent = Math.round((overallCorrectCount / overallTotalCount) * 100);

        // Calculate Listening section score
        const listeningResult = await manager.query(`
          SELECT 
            SUM(CASE WHEN aa.IsCorrect = 1 THEN 1 ELSE 0 END) as correctCount,
            COUNT(*) as totalCount
          FROM attemptanswer aa
          INNER JOIN question q ON aa.QuestionID = q.ID
          INNER JOIN mediaquestion mq ON q.MediaQuestionID = mq.ID
          WHERE aa.AttemptID = ? AND mq.Skill = 'LISTENING'
        `, [attemptId]);

        const listeningCorrectCount = listeningResult[0]?.correctCount || 0;
        const listeningTotalCount = listeningResult[0]?.totalCount || 0;

        // Calculate Reading section score
        const readingResult = await manager.query(`
          SELECT 
            SUM(CASE WHEN aa.IsCorrect = 1 THEN 1 ELSE 0 END) as correctCount,
            COUNT(*) as totalCount
          FROM attemptanswer aa
          INNER JOIN question q ON aa.QuestionID = q.ID
          INNER JOIN mediaquestion mq ON q.MediaQuestionID = mq.ID
          WHERE aa.AttemptID = ? AND mq.Skill = 'READING'
        `, [attemptId]);

        const readingCorrectCount = readingResult[0]?.correctCount || 0;
        const readingTotalCount = readingResult[0]?.totalCount || 0;

        let scoreListening: number;
        let scoreReading: number;

        // ✅ LOGIC PHÂN BIỆT FULL_TEST vs PRACTICE_BY_PART
        if (attemptType === 'FULL_TEST') {
          // FULL_TEST: Sử dụng TOEIC conversion table (0-495)
          scoreListening = convertListeningScore(listeningCorrectCount);
          scoreReading = convertReadingScore(readingCorrectCount);
          
          console.log(
            `📘 FULL_TEST Scoring:\n` +
            `   Listening: ${listeningCorrectCount}/100 → ${scoreListening} (TOEIC scale)\n` +
            `   Reading: ${readingCorrectCount}/100 → ${scoreReading} (TOEIC scale)`
          );
        } else {
          // PRACTICE_BY_PART: Sử dụng percentage-based scoring
          // Tính theo % và scale về 0-495 để consistency với UI
          const listeningPercent = listeningTotalCount > 0 
            ? (listeningCorrectCount / listeningTotalCount) 
            : 0;
          const readingPercent = readingTotalCount > 0 
            ? (readingCorrectCount / readingTotalCount) 
            : 0;
          
          // Scale percentage to 0-495 range for display consistency
          scoreListening = Math.round(listeningPercent * 495);
          scoreReading = Math.round(readingPercent * 495);
          
          console.log(
            `📗 PRACTICE_BY_PART Scoring:\n` +
            `   Listening: ${listeningCorrectCount}/${listeningTotalCount} (${Math.round(listeningPercent * 100)}%) → ${scoreListening}\n` +
            `   Reading: ${readingCorrectCount}/${readingTotalCount} (${Math.round(readingPercent * 100)}%) → ${scoreReading}`
          );
        }

        // Update attempt with recalculated scores
        await manager.update(
          'Attempt' as any,
          attemptId,
          { 
            ScorePercent: scorePercent,
            ScoreListening: scoreListening,
            ScoreReading: scoreReading,
          }
        );

        console.log(
          `✅ Updated Attempt ${attemptId} (${attemptType}):\n` +
          `   Overall: ${overallCorrectCount}/${overallTotalCount} (${scorePercent}%)\n` +
          `   ScoreListening: ${scoreListening}\n` +
          `   ScoreReading: ${scoreReading}\n` +
          `   Total TOEIC: ${scoreListening + scoreReading}`
        );
      }
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

  /**
   * Tìm tất cả questions thuộc một media question
   * 
   * Đây là method core để lấy tất cả questions trong một "group".
   * Ví dụ: Lấy 3 câu hỏi của cùng một đoạn văn Part 7.
   * 
   * Questions được sort theo OrderInGroup để maintain thứ tự đúng.
   * 
   * @param mediaQuestionId - ID của media question
   * @param options - Additional options
   * @returns Array of questions sorted by order
   */
  async findByMediaQuestionId(
    mediaQuestionId: number,
    options?: {
      sortByOrder?: boolean;
      includeChoices?: boolean;
    }
  ): Promise<Question[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('question')
      .where('question.MediaQuestionID = :mediaId', { 
        mediaId: mediaQuestionId 
      });

    // Optionally load choices
    if (options?.includeChoices !== false) {
      queryBuilder.leftJoinAndSelect('question.choices', 'choices');
    }

    // Load media question thông tin
    queryBuilder.leftJoinAndSelect('question.mediaQuestion', 'media');

    // Sort by OrderInGroup nếu cần
    if (options?.sortByOrder !== false) {
      queryBuilder.orderBy('question.OrderInGroup', 'ASC');
    }

    return await queryBuilder.getMany();
  }

  /**
   * Đếm số lượng questions của một media
   * 
   * Nhanh hơn findByMediaQuestionId khi chỉ cần count
   * 
   * @param mediaQuestionId - Media question ID
   * @returns Number of questions
   */
  async countByMediaQuestionId(mediaQuestionId: number): Promise<number> {
    return await this.repository.count({
      where: { MediaQuestionID: mediaQuestionId },
    });
  }

  /**
   * Lấy question đầu tiên của một media group
   * 
   * Useful để hiển thị preview của group trên UI.
   * Ví dụ: Show câu hỏi đầu tiên để giáo viên có ý tưởng
   * về nội dung của group.
   * 
   * @param mediaQuestionId - Media question ID
   * @returns First question hoặc null
   */
  async findFirstByMediaQuestionId(
    mediaQuestionId: number
  ): Promise<Question | null> {
    return await this.repository
      .createQueryBuilder('question')
      .where('question.MediaQuestionID = :mediaId', { 
        mediaId: mediaQuestionId 
      })
      .leftJoinAndSelect('question.choices', 'choices')
      .orderBy('question.OrderInGroup', 'ASC')
      .limit(1)
      .getOne();
  }

  /**
   * Lấy tất cả questions thuộc nhiều media IDs
   * 
   * Dùng khi tạo đề thi bằng cách chọn multiple media blocks.
   * Mỗi media có thể chứa 1+ questions.
   * 
   * @param mediaIds - Array of MediaQuestionID
   * @returns All questions từ những media đó
   */
  async findByMediaIds(mediaIds: number[]): Promise<Question[]> {
    if (!mediaIds || mediaIds.length === 0) {
      return [];
    }

    return await this.repository
      .createQueryBuilder('question')
      .where('question.MediaQuestionID IN (:...mediaIds)', { mediaIds })
      .leftJoinAndSelect('question.mediaQuestion', 'media')
      .leftJoinAndSelect('question.choices', 'choices')
      .orderBy('question.MediaQuestionID', 'ASC')
      .addOrderBy('question.OrderInGroup', 'ASC')
      .getMany();
  }

  /**
   * Tạo nhiều questions cùng lúc cho một media group
   * 
   * Khi giáo viên tạo một media group mới với nhiều questions,
   * method này cho phép tạo tất cả questions trong một transaction.
   * 
   * Ví dụ: Tạo Part 7 passage với 3 câu hỏi cùng lúc
   * 
   * @param mediaQuestionId - ID của media chung
   * @param questionsData - Array of question data
   * @param userId - ID của user tạo
   * @returns Array of created questions
   */
  async createMultipleForMedia(
    mediaQuestionId: number,
    questionsData: Array<{
      QuestionText?: string;
      OrderInGroup: number;
      Choices: Array<{
        Content: string;
        Attribute: string;
        IsCorrect: boolean;
      }>;
    }>,
    userId: number
  ): Promise<Question[]> {
    return await AppDataSource.transaction(async (manager) => {
      const createdQuestions: Question[] = [];

      // Tạo từng question với choices
      for (const qData of questionsData) {
        // Create question
        const question = manager.create(Question, {
          QuestionText: qData.QuestionText,
          MediaQuestionID: mediaQuestionId,
          OrderInGroup: qData.OrderInGroup,
          UserID: userId,
        });
        const savedQuestion = await manager.save(question);

        // Create choices cho question này
        const choices = qData.Choices.map(cData =>
          manager.create(Choice, {
            QuestionID: savedQuestion.ID,
            Content: cData.Content,
            Attribute: cData.Attribute,
            IsCorrect: cData.IsCorrect,
          })
        );
        await manager.save(choices);

        // Load lại question với choices để return
        const completeQuestion = await manager.findOne(Question, {
          where: { ID: savedQuestion.ID },
          relations: ['choices', 'mediaQuestion'],
        });

        if (completeQuestion) {
          createdQuestions.push(completeQuestion);
        }
      }

      return createdQuestions;
    });
  }

  /**
   * Update OrderInGroup của một question
   * 
   * Khi giáo viên muốn reorder questions trong một group,
   * method này cho phép update thứ tự.
   * 
   * @param questionId - Question ID
   * @param newOrder - New OrderInGroup value
   * @returns Updated question
   */
  async updateOrderInGroup(
    questionId: number,
    newOrder: number
  ): Promise<Question | null> {
    const question = await this.repository.findOne({
      where: { ID: questionId },
    });

    if (!question) {
      return null;
    }

    question.OrderInGroup = newOrder;
    return await this.repository.save(question);
  }

  /**
   * Bulk update OrderInGroup cho nhiều questions
   * 
   * Khi reorder toàn bộ group, method này update nhiều
   * questions cùng lúc một cách efficient.
   * 
   * @param updates - Array of { questionId, orderInGroup }
   * @returns Number of updated questions
   */
  async bulkUpdateOrderInGroup(
    updates: Array<{ questionId: number; orderInGroup: number }>
  ): Promise<number> {
    let updatedCount = 0;

    await this.repository.manager.transaction(async (manager) => {
      for (const update of updates) {
        const result = await manager.update(
          Question,
          { ID: update.questionId },
          { OrderInGroup: update.orderInGroup }
        );
        updatedCount += result.affected || 0;
      }
    });

    return updatedCount;
  }

  /**
   * Get next available OrderInGroup cho một media
   * 
   * Khi thêm question mới vào một existing media group,
   * method này tìm OrderInGroup tiếp theo có thể dùng.
   * 
   * @param mediaQuestionId - Media question ID
   * @returns Next available order number
   */
  async getNextOrderInGroup(mediaQuestionId: number): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('question')
      .where('question.MediaQuestionID = :mediaId', { 
        mediaId: mediaQuestionId 
      })
      .select('MAX(question.OrderInGroup)', 'maxOrder')
      .getRawOne();

    const maxOrder = result?.maxOrder || 0;
    return maxOrder + 1;
  }

  /**
   * Clone/duplicate questions từ một media sang media khác
   * 
   * Khi giáo viên clone một media group, questions cũng
   * cần được clone. Method này copy tất cả questions và choices.
   * 
   * @param sourceMediaId - Source media question ID
   * @param targetMediaId - Target media question ID
   * @param userId - User ID tạo clone
   * @returns Array of cloned questions
   */
  async cloneQuestionsToMedia(
    sourceMediaId: number,
    targetMediaId: number,
    userId: number
  ): Promise<Question[]> {
    // Get original questions
    const originalQuestions = await this.findByMediaQuestionId(sourceMediaId, {
      includeChoices: true,
    });

    if (originalQuestions.length === 0) {
      return [];
    }

    // Clone each question
    return await AppDataSource.transaction(async (manager) => {
      const clonedQuestions: Question[] = [];

      for (const original of originalQuestions) {
        // Create new question
        const newQuestion = manager.create(Question, {
          QuestionText: original.QuestionText,
          MediaQuestionID: targetMediaId,
          OrderInGroup: original.OrderInGroup,
          UserID: userId,
        });
        const savedQuestion = await manager.save(newQuestion);

        // Clone choices
        const newChoices = original.choices.map(choice =>
          manager.create(Choice, {
            QuestionID: savedQuestion.ID,
            Content: choice.Content,
            Attribute: choice.Attribute,
            IsCorrect: choice.IsCorrect,
          })
        );
        await manager.save(newChoices);

        // Load complete question
        const complete = await manager.findOne(Question, {
          where: { ID: savedQuestion.ID },
          relations: ['choices', 'mediaQuestion'],
        });

        if (complete) {
          clonedQuestions.push(complete);
        }
      }

      return clonedQuestions;
    });
  }

  /**
   * Delete tất cả questions của một media
   * 
   * Khi xóa một media group, cần xóa tất cả questions liên quan.
   * Method này thực hiện cascade delete.
   * 
   * LƯU Ý: Cần check xem questions có đang được sử dụng trong
   * exam nào không trước khi xóa.
   * 
   * @param mediaQuestionId - Media question ID
   * @returns Number of deleted questions
   */
  async deleteByMediaQuestionId(mediaQuestionId: number): Promise<number> {
    // First check if any question is used in exams
    const questions = await this.findByMediaQuestionId(mediaQuestionId);
    
    for (const question of questions) {
      const usageStats = await this.getUsageStats(question.ID);
      if (usageStats && usageStats.usedInExams > 0) {
        throw new Error(
          `Cannot delete questions: Question ${question.ID} is used in ${usageStats.usedInExams} exam(s)`
        );
      }
    }

    // Delete all questions
    const result = await this.repository.delete({
      MediaQuestionID: mediaQuestionId,
    });

    return result.affected || 0;
  }

  /**
   * Validate OrderInGroup uniqueness trong một media
   * 
   * Đảm bảo rằng không có hai questions nào có cùng OrderInGroup
   * trong một media group. Method này check trước khi save.
   * 
   * @param mediaQuestionId - Media question ID
   * @param orderInGroup - Order to check
   * @param excludeQuestionId - Question ID to exclude (khi update)
   * @returns True if order is unique
   */
  async isOrderInGroupUnique(
    mediaQuestionId: number,
    orderInGroup: number,
    excludeQuestionId?: number
  ): Promise<boolean> {
    const queryBuilder = this.repository
      .createQueryBuilder('question')
      .where('question.MediaQuestionID = :mediaId', { 
        mediaId: mediaQuestionId 
      })
      .andWhere('question.OrderInGroup = :order', { 
        order: orderInGroup 
      });

    if (excludeQuestionId) {
      queryBuilder.andWhere('question.ID != :excludeId', { 
        excludeId: excludeQuestionId 
      });
    }

    const count = await queryBuilder.getCount();
    return count === 0;
  }

  /**
   * Get media groups với question counts
   * 
   * Helper method để lấy danh sách media kèm số lượng questions.
   * Useful cho UI browse media groups.
   * 
   * @param filters - Filter options
   * @returns Media groups với counts
   */
  async getMediaGroupsWithCounts(filters?: {
    Skill?: string;
    Section?: string;
  }): Promise<Array<{
    mediaQuestionId: number;
    questionCount: number;
    media: MediaQuestion;
  }>> {
    const queryBuilder = this.repository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.mediaQuestion', 'media')
      .select('question.MediaQuestionID', 'mediaQuestionId')
      .addSelect('COUNT(question.ID)', 'questionCount')
      .groupBy('question.MediaQuestionID');

    if (filters?.Skill) {
      queryBuilder.andWhere('media.Skill = :skill', { skill: filters.Skill });
    }

    if (filters?.Section) {
      queryBuilder.andWhere('media.Section = :section', { 
        section: filters.Section 
      });
    }

    const results = await queryBuilder.getRawMany();

    // Load full media details
    const enriched = await Promise.all(
      results.map(async (result) => {
        const media = await this.mediaRepository.findOne({
          where: { ID: result.mediaQuestionId },
        });

        return {
          mediaQuestionId: result.mediaQuestionId,
          questionCount: parseInt(result.questionCount),
          media: media!,
        };
      })
    );

    return enriched.filter(item => item.media);
  }
}
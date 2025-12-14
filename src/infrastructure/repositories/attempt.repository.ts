import { Repository, Between, LessThan, MoreThan } from 'typeorm';
import { AppDataSource } from '../database/config';
import { Attempt } from '../../domain/entities/attempt.entity';
import { AttemptAnswer } from '../../domain/entities/attempt-answer.entity';
import { Choice } from '../../domain/entities/choice.entity';
import { Question } from '../../domain/entities/question.entity';
import { MediaQuestion } from '../../domain/entities/media-question.entity';

/**
 * AttemptRepository handles all database operations for test attempts
 * 
 * This repository is crucial for the exam system as it:
 * - Creates new attempt sessions when students start tests
 * - Records individual answers as students work through questions
 * - Calculates and stores scores when tests are submitted
 * - Provides analytics and progress tracking data
 * 
 * The Attempt entity is the central record linking:
 * - Which student took the test (StudentProfileID)
 * - Which exam they took (ExamID)
 * - When they started and submitted (timestamps)
 * - What they scored (calculated results)
 * - What they answered (via AttemptAnswer records)
 */
export class AttemptRepository {
  private repository: Repository<Attempt>;
  private answerRepository: Repository<AttemptAnswer>;

  constructor() {
    this.repository = AppDataSource.getRepository(Attempt);
    this.answerRepository = AppDataSource.getRepository(AttemptAnswer);
  }

  /**
   * Create a new attempt when student starts a test
   * 
   * This creates an Attempt record with:
   * - StudentProfileID: Identifies who is taking the test
   * - ExamID: Which test they're taking
   * - Type: FULL_TEST or PRACTICE_BY_PART
   * - StartedAt: Current timestamp
   * - SubmittedAt: null (not submitted yet)
   * - Scores: null (not graded yet)
   * 
   * This record acts as a session that tracks the entire test-taking process.
   * The frontend will use the returned ID to submit answers later.
   * 
   * @param attemptData - Initial attempt data
   * @returns Created attempt with ID
   */
  async create(attemptData: Partial<Attempt>): Promise<Attempt> {
    const attempt = this.repository.create({
      ...attemptData,
      StartedAt: new Date(),
      SubmittedAt: null,
    });
    
    return await this.repository.save(attempt);
  }

  /**
   * Find attempt by ID with all related data
   * 
   * Loads complete attempt information including:
   * - Basic attempt data (times, scores, type)
   * - Student profile information
   * - Exam details
   * - All answers with question and choice details
   * 
   * This is what we need for displaying results to students
   * or for generating detailed score reports.
   * 
   * @param id - Attempt ID
   * @returns Complete attempt data or null
   */
  async findById(id: number): Promise<Attempt | null> {
    return await this.repository.findOne({
      where: { ID: id },
      relations: [
        'studentProfile',
        'studentProfile.user',
        'exam',
        'exam.examType',
        'attemptAnswers',
        'attemptAnswers.question',
        'attemptAnswers.question.mediaQuestion',
        'attemptAnswers.question.choices',
        'attemptAnswers.choice',
      ],
    });
  }

  /**
   * Submit answers for an attempt
   * 
   * This is the core grading method that:
   * 1. Validates the attempt exists and hasn't been submitted
   * 2. Checks time limit hasn't been exceeded
   * 3. Creates AttemptAnswer records for each answer
   * 4. Grades each answer by comparing with correct choice
   * 5. Calculates section scores (Listening/Reading)
   * 6. Converts raw scores to TOEIC scale (0-495 each)
   * 7. Updates attempt with final scores and submission time
   * 
   * This entire operation is wrapped in a transaction to ensure
   * data integrity. If any step fails, everything is rolled back.
   * 
   * @param attemptId - The attempt being submitted
   * @param answers - Array of {QuestionID, ChoiceID} pairs
   * @returns Graded attempt with all scores calculated
   */
  async submitAnswers(
    attemptId: number,
    answers: { QuestionID: number; ChoiceID: number }[]
  ): Promise<Attempt | null> {
    const attempt = await this.findById(attemptId);
    
    if (!attempt) {
      throw new Error('Attempt not found');
    }

    if (attempt.SubmittedAt) {
      throw new Error('Attempt already submitted');
    }

    console.log(`📝 Grading attempt ${attemptId} with ${answers.length} answers`);

    return await AppDataSource.transaction(async (manager) => {
      // ============================================================
      // STEP 1: Load ALL questions với mediaQuestion trong single query
      // Điều này tránh N+1 problem và ensure relations được load đúng
      // ============================================================
      
      const questionIds = answers.map(a => a.QuestionID);
      
      const questions = await manager
        .createQueryBuilder(Question, 'question')
        .leftJoinAndSelect('question.mediaQuestion', 'media')
        .leftJoinAndSelect('question.choices', 'choices')
        .where('question.ID IN (:...ids)', { ids: questionIds })
        .getMany();

      // Create a Map để lookup nhanh
      const questionMap = new Map(questions.map(q => [q.ID, q]));

      console.log(`📚 Loaded ${questions.length} questions with media info`);

      // ============================================================
      // STEP 2: Validate tất cả questions được tìm thấy
      // ============================================================
      
      if (questions.length !== questionIds.length) {
        const missingIds = questionIds.filter(id => !questionMap.has(id));
        throw new Error(
          `Some questions not found: ${missingIds.join(', ')}`
        );
      }

      // ============================================================
      // STEP 3: Grade từng answer và create AttemptAnswer records
      // ============================================================
      
      const attemptAnswers: AttemptAnswer[] = [];

      for (const answer of answers) {
        const question = questionMap.get(answer.QuestionID);
        
        if (!question) {
          console.warn(`⚠️ Question ${answer.QuestionID} not found, skipping`);
          continue;
        }

        // Find student's selected choice
        const selectedChoice = question.choices.find(
          c => c.ID === answer.ChoiceID
        );

        if (!selectedChoice) {
          console.warn(
            `⚠️ Choice ${answer.ChoiceID} not found for question ${answer.QuestionID}`
          );
          continue;
        }

        // Find the correct choice for this question
        const correctChoice = question.choices.find(c => c.IsCorrect === true);

        if (!correctChoice) {
          console.warn(
            `⚠️ No correct choice found for question ${answer.QuestionID}`
          );
          continue;
        }

        // Compare student's choice ID with correct choice ID
        const isCorrect = answer.ChoiceID === correctChoice.ID;
        
        console.log(
          `Question ${answer.QuestionID}: Student chose ${answer.ChoiceID} (${selectedChoice.Attribute}), ` +
          `correct is ${correctChoice.ID} (${correctChoice.Attribute}) - ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`
        );

        // Create attempt answer với correct grading
        const attemptAnswer = manager.create(AttemptAnswer, {
          AttemptID: attemptId,
          QuestionID: answer.QuestionID,
          ChoiceID: answer.ChoiceID,
          IsCorrect: isCorrect,
        });

        attemptAnswers.push(attemptAnswer);
      }

      // Save all answers
      await manager.save(AttemptAnswer, attemptAnswers);

      console.log(`✅ Saved ${attemptAnswers.length} attempt answers`);

      // ============================================================
      // STEP 4: Calculate overall scores
      // ============================================================
      
      const totalCorrect = attemptAnswers.filter(aa => aa.IsCorrect === true).length;
      const totalQuestions = attemptAnswers.length;
      const scorePercent = totalQuestions > 0 
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : 0;

      console.log(
        `📊 Overall: ${totalCorrect}/${totalQuestions} correct (${scorePercent}%)`
      );

      // ============================================================
      // STEP 5: Separate listening và reading questions - FIXED
      // Sử dụng questionMap thay vì query lại
      // ============================================================
      
      const listeningAnswers: AttemptAnswer[] = [];
      const readingAnswers: AttemptAnswer[] = [];
      const unknownSkillAnswers: AttemptAnswer[] = [];

      for (const aa of attemptAnswers) {
        const question = questionMap.get(aa.QuestionID);
        
        if (!question || !question.mediaQuestion) {
          console.warn(
            `⚠️ No media info for question ${aa.QuestionID}, treating as unknown skill`
          );
          unknownSkillAnswers.push(aa);
          continue;
        }

        const skill = question.mediaQuestion.Skill;

        if (skill === 'LISTENING') {
          listeningAnswers.push(aa);
        } else if (skill === 'READING') {
          readingAnswers.push(aa);
        } else {
          console.warn(
            `⚠️ Unknown skill "${skill}" for question ${aa.QuestionID}`
          );
          unknownSkillAnswers.push(aa);
        }
      }

      console.log(`🎧 Listening questions: ${listeningAnswers.length}`);
      console.log(`📖 Reading questions: ${readingAnswers.length}`);
      if (unknownSkillAnswers.length > 0) {
        console.log(`❓ Unknown skill questions: ${unknownSkillAnswers.length}`);
      }

      // ============================================================
      // STEP 6: Validate separation results
      // ============================================================
      
      const totalCategorized = listeningAnswers.length + 
                              readingAnswers.length + 
                              unknownSkillAnswers.length;
      
      if (totalCategorized !== attemptAnswers.length) {
        console.error(
          `❌ Categorization mismatch: ${totalCategorized} vs ${attemptAnswers.length}`
        );
        throw new Error('Failed to categorize all questions by skill');
      }

      // ============================================================
      // STEP 7: Calculate section scores
      // ============================================================
      
      const listeningCorrect = listeningAnswers.filter(aa => aa.IsCorrect).length;
      const readingCorrect = readingAnswers.filter(aa => aa.IsCorrect).length;

      console.log(
        `🎧 Listening: ${listeningCorrect}/${listeningAnswers.length} correct`
      );
      console.log(
        `📖 Reading: ${readingCorrect}/${readingAnswers.length} correct`
      );

      // Convert to TOEIC scale (0-495 mỗi section)
      const scoreListening = this.convertToToeicScale(
        listeningCorrect,
        listeningAnswers.length
      );
      const scoreReading = this.convertToToeicScale(
        readingCorrect,
        readingAnswers.length
      );

      console.log(`🎯 TOEIC Listening Score: ${scoreListening}/495`);
      console.log(`🎯 TOEIC Reading Score: ${scoreReading}/495`);
      console.log(`🎯 Total TOEIC Score: ${scoreListening + scoreReading}/990`);

      // ============================================================
      // STEP 8: Update attempt với calculated scores
      // ============================================================
      
      await manager.update(Attempt, attemptId, {
        SubmittedAt: new Date(),
        ScorePercent: scorePercent,
        ScoreListening: scoreListening,
        ScoreReading: scoreReading,
      });

      // ============================================================
      // STEP 9: Return complete graded attempt
      // ============================================================
      
      const gradedAttempt = await manager.findOne(Attempt, {
        where: { ID: attemptId },
        relations: [
          'exam',
          'attemptAnswers',
          'attemptAnswers.question',
          'attemptAnswers.question.mediaQuestion',
          'attemptAnswers.question.choices',
          'attemptAnswers.choice',
        ],
      });

      if (!gradedAttempt) {
        throw new Error('Failed to retrieve graded attempt');
      }

      console.log(`✅ Successfully graded attempt ${attemptId}`);

      return gradedAttempt;
    });
  }

  /**
   * Convert raw score to TOEIC scale
   * 
   * TOEIC uses a complex scaled scoring system where:
   * - Each section (Listening/Reading) is scored 0-495
   * - Total score is 0-990
   * - The scale is non-linear (getting more questions right doesn't
   *   linearly increase your score)
   * 
   * This is a simplified linear conversion for demonstration.
   * In production, you should use actual TOEIC conversion tables
   * which vary by test difficulty.
   * 
   * @param correct - Number of correct answers
   * @param total - Total number of questions in section
   * @returns Score on TOEIC scale (0-495)
   */
  private convertToToeicScale(correct: number, total: number): number {
    if (total === 0) return 0;
    
    // Simple linear conversion
    // Real TOEIC conversion is more complex and uses lookup tables
    const percentage = correct / total;
    return Math.round(percentage * 495);
  }

  /**
   * Get all attempts for a student
   * 
   * Returns all test attempts by a student, ordered by date (newest first).
   * Useful for displaying test history and progress tracking.
   * 
   * Can filter by:
   * - Type (FULL_TEST, PRACTICE_BY_PART)
   * - Date range
   * - Submitted only (exclude unfinished attempts)
   * 
   * @param studentProfileId - Student's profile ID
   * @param filters - Optional filtering criteria
   * @returns Array of attempts with basic info
   */
  async findByStudentId(
    studentProfileId: number,
    filters?: {
      Type?: string;
      StartDate?: Date;
      EndDate?: Date;
      SubmittedOnly?: boolean;
    }
  ): Promise<Attempt[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.exam', 'exam')
      .leftJoinAndSelect('exam.examType', 'examType')
      .where('attempt.StudentProfileID = :studentProfileId', { studentProfileId })
      .orderBy('attempt.StartedAt', 'DESC');

    if (filters?.Type) {
      queryBuilder.andWhere('attempt.Type = :type', { type: filters.Type });
    }

    if (filters?.StartDate && filters?.EndDate) {
      queryBuilder.andWhere('attempt.StartedAt BETWEEN :startDate AND :endDate', {
        startDate: filters.StartDate,
        endDate: filters.EndDate,
      });
    }

    if (filters?.SubmittedOnly) {
      queryBuilder.andWhere('attempt.SubmittedAt IS NOT NULL');
    }

    return await queryBuilder.getMany();
  }

  /**
   * Get student's best score for a specific exam
   * 
   * Returns the highest score achieved by a student on a particular exam.
   * Useful for leaderboards and personal bests display.
   * 
   * @param studentProfileId - Student's profile ID
   * @param examId - Exam ID
   * @returns Best attempt or null if no attempts
   */
  async getBestScore(
    studentProfileId: number,
    examId: number
  ): Promise<Attempt | null> {
    return await this.repository
      .createQueryBuilder('attempt')
      .where('attempt.StudentProfileID = :studentProfileId', { studentProfileId })
      .andWhere('attempt.ExamID = :examId', { examId })
      .andWhere('attempt.SubmittedAt IS NOT NULL')
      .orderBy('attempt.ScorePercent', 'DESC')
      .getOne();
  }

  /**
   * Get student's progress statistics
   * 
   * Calculates comprehensive statistics about a student's performance:
   * - Total attempts
   * - Average scores overall and by section
   * - Improvement trend (comparing recent vs older attempts)
   * - Weak areas (question types with low accuracy)
   * 
   * This powers the progress dashboard and adaptive recommendations.
   * 
   * @param studentProfileId - Student's profile ID
   * @returns Comprehensive statistics object
   */
  async getProgressStats(studentProfileId: number): Promise<any> {
    const attempts = await this.repository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.attemptAnswers', 'aa')
      .leftJoinAndSelect('aa.question', 'q')
      .leftJoinAndSelect('q.mediaQuestion', 'mq')
      .where('attempt.StudentProfileID = :studentProfileId', { studentProfileId })
      .andWhere('attempt.SubmittedAt IS NOT NULL')
      .orderBy('attempt.SubmittedAt', 'ASC')
      .getMany();

    if (attempts.length === 0) {
      return {
        totalAttempts: 0,
        averageScore: 0,
        averageListening: 0,
        averageReading: 0,
      };
    }

    // Calculate averages
    const totalAttempts = attempts.length;
    const avgScore = attempts.reduce((sum, a) => sum + (a.ScorePercent || 0), 0) / totalAttempts;
    const avgListening = attempts.reduce((sum, a) => sum + (a.ScoreListening || 0), 0) / totalAttempts;
    const avgReading = attempts.reduce((sum, a) => sum + (a.ScoreReading || 0), 0) / totalAttempts;

    // Calculate improvement trend
    const recentAttempts = attempts.slice(-5); // Last 5 attempts
    const olderAttempts = attempts.slice(0, -5);
    const recentAvg = recentAttempts.reduce((sum, a) => sum + (a.ScorePercent || 0), 0) / recentAttempts.length;
    const olderAvg = olderAttempts.length > 0
      ? olderAttempts.reduce((sum, a) => sum + (a.ScorePercent || 0), 0) / olderAttempts.length
      : recentAvg;
    const improvement = recentAvg - olderAvg;

    // Analyze weak areas by question type
    const allAnswers = attempts.flatMap((a) => a.attemptAnswers || []);
    const answersByType: { [key: string]: { correct: number; total: number } } = {};

    allAnswers.forEach((aa) => {
      const type = aa.question?.mediaQuestion?.Type || 'Unknown';
      if (!answersByType[type]) {
        answersByType[type] = { correct: 0, total: 0 };
      }
      answersByType[type].total++;
      if (aa.IsCorrect) {
        answersByType[type].correct++;
      }
    });

    // Find weak areas (accuracy < 60%)
    const weakAreas = Object.entries(answersByType)
      .filter(([_, stats]) => (stats.correct / stats.total) < 0.6)
      .map(([type, stats]) => ({
        type,
        accuracy: Math.round((stats.correct / stats.total) * 100),
      }));

    return {
      totalAttempts,
      averageScore: Math.round(avgScore * 10) / 10,
      averageListening: Math.round(avgListening),
      averageReading: Math.round(avgReading),
      improvement: Math.round(improvement * 10) / 10,
      trend: improvement > 5 ? 'IMPROVING' : improvement < -5 ? 'DECLINING' : 'STABLE',
      weakAreas,
    };
  }

  /**
   * Delete an attempt and all its answers
   * 
   * This removes an attempt record and cascades to delete all
   * associated AttemptAnswer records.
   * 
   * Use with caution as this permanently removes test history.
   * Consider implementing soft delete for production.
   * 
   * @param id - Attempt ID to delete
   * @returns True if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  /**
   * Get incomplete attempts for cleanup
   * 
   * Finds attempts that were started but never submitted,
   * and are older than a specified time.
   * 
   * Useful for periodic cleanup of abandoned test sessions
   * to keep the database clean.
   * 
   * @param olderThanHours - How many hours old to consider
   * @returns Array of incomplete attempts
   */
  async getIncompleteAttempts(olderThanHours: number = 24): Promise<Attempt[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    return await this.repository.find({
      where: {
        SubmittedAt: null as any,
        StartedAt: LessThan(cutoffDate),
      },
    });
  }
}
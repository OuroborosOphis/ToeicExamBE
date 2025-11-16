import { AttemptRepository } from '../../infrastructure/repositories/attempt.repository';
import { ExamRepository } from '../../infrastructure/repositories/exam.repository';
import {
  StartExamDto,
  SubmitExamDto,
  ExamResultResponseDto,
  DetailedAnswerDto,
} from '../dtos/exam.dto';
import { Attempt } from '../../domain/entities/attempt.entity';

/**
 * AttemptService handles all business logic related to test attempts
 * 
 * This is arguably the most critical service in the system as it manages
 * the core user journey:
 * 1. Student starts a test (creates attempt)
 * 2. Student works through questions
 * 3. Student submits answers
 * 4. System grades and returns results
 * 5. Student reviews their performance
 * 
 * Key responsibilities:
 * - Validate students can start/submit tests
 * - Enforce time limits
 * - Calculate scores and statistics
 * - Provide detailed feedback
 * - Track progress over time
 * 
 * Business rules enforced here include preventing double submissions,
 * validating timing, ensuring data integrity, and protecting against
 * cheating attempts.
 */
export class AttemptService {
  private attemptRepository: AttemptRepository;
  private examRepository: ExamRepository;

  constructor() {
    this.attemptRepository = new AttemptRepository();
    this.examRepository = new ExamRepository();
  }

  /**
   * Start a new exam attempt
   * 
   * This method initializes a test-taking session. It creates an Attempt
   * record that tracks the session from start to finish.
   * 
   * The returned attempt ID is critical - the frontend must store this
   * and include it when submitting answers. This ID links all the student's
   * answers to this specific attempt.
   * 
   * Business rules enforced:
   * - Exam must exist and be accessible
   * - Student must be authenticated (studentProfileId required)
   * - For practice by part, valid parts must be specified
   * - Student can have multiple attempts (practice as many times as needed)
   * 
   * Design decision: We allow unlimited attempts because this is a practice
   * system, not a high-stakes test. In a real testing scenario, you might
   * want to limit the number of attempts or time between attempts.
   * 
   * @param startData - Information about which exam/parts to practice
   * @param studentProfileId - ID of student starting the test
   * @returns Created attempt with ID that client must use for submission
   * @throws Error if validation fails
   */
  async startAttempt(
    startData: StartExamDto,
    studentProfileId: number
  ): Promise<Attempt> {
    // Validate the exam exists
    const exam = await this.examRepository.findById(startData.ExamID);

    if (!exam) {
      throw new Error('Exam not found');
    }

    // For PRACTICE_BY_PART, validate that parts are specified
    if (startData.Type === 'PRACTICE_BY_PART') {
      if (!startData.Parts || startData.Parts.length === 0) {
        throw new Error('Parts must be specified for practice by part mode');
      }

      // Validate part numbers are valid (1-7 for TOEIC)
      const invalidParts = startData.Parts.filter((part) => part < 1 || part > 7);
      if (invalidParts.length > 0) {
        throw new Error(`Invalid part numbers: ${invalidParts.join(', ')}`);
      }
    }

    // Create the attempt record
    // StartedAt is set automatically by the repository
    const attempt = await this.attemptRepository.create({
      StudentProfileID: studentProfileId,
      ExamID: startData.ExamID,
      Type: startData.Type,
      // Scores are null until submission
      ScorePercent: null as any,
      ScoreListening: null as any,
      ScoreReading: null as any,
      SubmittedAt: null as any,
    });

    return attempt;
  }

  /**
   * Submit exam answers and get graded results
   * 
   * This is the most complex method in the service. It handles the complete
   * grading workflow:
   * 
   * 1. Validates the attempt exists and belongs to this student
   * 2. Checks that attempt hasn't been submitted already
   * 3. Validates timing (ensures time limit wasn't exceeded)
   * 4. Delegates to repository for grading and score calculation
   * 5. Transforms the graded attempt into detailed results for student
   * 
   * The timing validation is important for maintaining test integrity.
   * We calculate how much time elapsed between StartedAt and now,
   * and ensure it doesn't exceed the exam's time limit.
   * 
   * Security consideration: We verify the attempt belongs to the
   * requesting student to prevent one student from submitting answers
   * for another student's test.
   * 
   * @param submitData - Attempt ID and all answers
   * @param studentProfileId - ID of student submitting (from JWT token)
   * @returns Detailed results including scores and answer review
   * @throws Error if validation fails or grading encounters problems
   */
  async submitAttempt(
    submitData: SubmitExamDto,
    studentProfileId: number
  ): Promise<ExamResultResponseDto> {
    // Retrieve the attempt with all necessary data
    const attempt = await this.attemptRepository.findById(submitData.AttemptID);

    if (!attempt) {
      throw new Error('Attempt not found');
    }

    // Security check: Verify attempt belongs to this student
    if (attempt.StudentProfileID !== studentProfileId) {
      throw new Error('You can only submit your own attempts');
    }

    // Business rule: Cannot submit an already-submitted attempt
    if (attempt.SubmittedAt) {
      throw new Error('This attempt has already been submitted');
    }

    // Validate timing: Check if time limit was exceeded
    const timeElapsed = this.calculateTimeElapsed(attempt.StartedAt);
    const timeLimit = attempt.exam.TimeExam;

    if (timeElapsed > timeLimit + 1) {
      // Allow 1 minute grace period for network delays
      throw new Error(
        `Time limit exceeded. Limit: ${timeLimit} minutes, Actual: ${timeElapsed} minutes`
      );
    }

    // Delegate grading to repository
    // The repository handles the complex transaction of:
    // - Creating AttemptAnswer records
    // - Marking each answer as correct/incorrect
    // - Calculating section scores
    // - Converting to TOEIC scale
    // - Updating the attempt with final scores
    const gradedAttempt = await this.attemptRepository.submitAnswers(
      submitData.AttemptID,
      submitData.answers
    );

    if (!gradedAttempt) {
      throw new Error('Failed to grade attempt');
    }

    // Transform graded attempt to detailed results DTO
    return this.transformToExamResultResponse(gradedAttempt, timeElapsed);
  }

  /**
   * Get attempt results by ID
   * 
   * Allows students to review their past test results.
   * This is essential for learning - students need to see what they
   * got wrong and understand why.
   * 
   * Security: Verifies the attempt belongs to the requesting student
   * to prevent students from viewing each other's results.
   * 
   * @param attemptId - ID of attempt to retrieve
   * @param studentProfileId - ID of student requesting results
   * @returns Detailed results with scores and answer review
   * @throws Error if attempt not found or access denied
   */
  async getAttemptResults(
    attemptId: number,
    studentProfileId: number
  ): Promise<ExamResultResponseDto> {
    const attempt = await this.attemptRepository.findById(attemptId);

    if (!attempt) {
      throw new Error('Attempt not found');
    }

    // Security check
    if (attempt.StudentProfileID !== studentProfileId) {
      throw new Error('You can only view your own attempt results');
    }

    // Business rule: Can only view results of submitted attempts
    if (!attempt.SubmittedAt) {
      throw new Error('This attempt has not been submitted yet');
    }

    const timeElapsed = this.calculateTimeElapsed(
      attempt.StartedAt,
      attempt.SubmittedAt
    );

    return this.transformToExamResultResponse(attempt, timeElapsed);
  }

  /**
   * Get all attempts by a student
   * 
   * Provides a history of all tests a student has taken.
   * This supports the progress tracking feature and allows
   * students to see their improvement over time.
   * 
   * Can filter by:
   * - Test type (full test vs practice by part)
   * - Date range
   * - Submitted only (exclude unfinished attempts)
   * 
   * @param studentProfileId - ID of student whose attempts to retrieve
   * @param filters - Optional filtering criteria
   * @returns Array of attempts with basic info
   */
  async getStudentAttempts(
    studentProfileId: number,
    filters?: {
      Type?: string;
      StartDate?: Date;
      EndDate?: Date;
      SubmittedOnly?: boolean;
    }
  ): Promise<Attempt[]> {
    return await this.attemptRepository.findByStudentId(studentProfileId, filters);
  }

  /**
   * Get student's best score for an exam
   * 
   * Returns the highest score a student has achieved on a specific exam.
   * Useful for displaying personal bests and motivating continued practice.
   * 
   * This can also be used for leaderboards, though we might want to
   * implement a separate method for that with additional filtering.
   * 
   * @param studentProfileId - ID of student
   * @param examId - ID of exam to check
   * @returns Best attempt or null if no attempts
   */
  async getBestScore(
    studentProfileId: number,
    examId: number
  ): Promise<Attempt | null> {
    return await this.attemptRepository.getBestScore(studentProfileId, examId);
  }

  /**
   * Get comprehensive progress statistics
   * 
   * Calculates extensive statistics about a student's performance:
   * - Total attempts taken
   * - Average scores overall and by section
   * - Improvement trend (comparing recent vs older attempts)
   * - Weak areas identified by question type accuracy
   * 
   * This data powers the progress dashboard and helps students
   * understand where they need to focus their practice.
   * 
   * The improvement trend is particularly motivating - it shows
   * whether recent attempts are better than older ones, giving
   * students confidence that their practice is paying off.
   * 
   * @param studentProfileId - ID of student to analyze
   * @returns Comprehensive statistics object
   */
  async getProgressStatistics(studentProfileId: number): Promise<any> {
    return await this.attemptRepository.getProgressStats(studentProfileId);
  }

  /**
   * Delete an attempt
   * 
   * Allows students to remove attempts from their history.
   * This might be used if they accidentally started a test or
   * want to clean up their progress dashboard.
   * 
   * Security: Only the student who created the attempt can delete it.
   * 
   * In production, you might want to implement soft delete or
   * only allow deleting unsubmitted attempts to preserve
   * historical data integrity.
   * 
   * @param attemptId - ID of attempt to delete
   * @param studentProfileId - ID of student requesting deletion
   * @returns True if deleted successfully
   */
  async deleteAttempt(
    attemptId: number,
    studentProfileId: number
  ): Promise<boolean> {
    const attempt = await this.attemptRepository.findById(attemptId);

    if (!attempt) {
      throw new Error('Attempt not found');
    }

    // Security check
    if (attempt.StudentProfileID !== studentProfileId) {
      throw new Error('You can only delete your own attempts');
    }

    return await this.attemptRepository.delete(attemptId);
  }

  /**
   * Calculate time elapsed between two timestamps
   * 
   * Helper method that calculates the difference in minutes between
   * two timestamps. Used for timing validation and display.
   * 
   * If endTime is not provided, uses current time. This allows us
   * to check how much time has elapsed for an ongoing attempt.
   * 
   * @param startTime - When the attempt started
   * @param endTime - When the attempt ended (optional, defaults to now)
   * @returns Time elapsed in minutes
   */
  private calculateTimeElapsed(startTime: Date, endTime?: Date): number {
    const end = endTime || new Date();
    const diffMs = end.getTime() - startTime.getTime();
    return Math.floor(diffMs / 60000); // Convert milliseconds to minutes
  }

  /**
   * Transform graded attempt to result response DTO
   * 
   * This critical method transforms the raw graded attempt entity
   * into a rich, structured response that's perfect for the frontend.
   * 
   * The transformation includes:
   * - Overall scores and section breakdowns
   * - Detailed answer review showing what student chose vs correct answer
   * - Media assets for review (audio scripts, images)
   * - Performance analysis identifying weak areas
   * 
   * Weak areas are identified by analyzing which question types
   * the student got wrong most frequently. This helps students
   * focus their future practice on areas that need improvement.
   * 
   * @param attempt - Graded attempt from database
   * @param timeTaken - How long the student took (in minutes)
   * @returns Formatted result response with complete feedback
   */
  private transformToExamResultResponse(
    attempt: Attempt,
    timeTaken: number
  ): ExamResultResponseDto {
    // Calculate total score (Listening + Reading)
    const totalScore = (attempt.ScoreListening || 0) + (attempt.ScoreReading || 0);

    // Count correct answers for analysis
    const totalQuestions = attempt.attemptAnswers?.length || 0;
    const correctAnswers = attempt.attemptAnswers?.filter((aa) => aa.IsCorrect).length || 0;

    // Count listening and reading correct answers
    const listeningAnswers = attempt.attemptAnswers?.filter(
      (aa) => aa.question.mediaQuestion.Skill === 'LISTENING'
    ) || [];
    const readingAnswers = attempt.attemptAnswers?.filter(
      (aa) => aa.question.mediaQuestion.Skill === 'READING'
    ) || [];

    const listeningCorrect = listeningAnswers.filter((aa) => aa.IsCorrect).length;
    const readingCorrect = readingAnswers.filter((aa) => aa.IsCorrect).length;

    // Identify weak areas by question type
    const weakAreas = this.identifyWeakAreas(attempt.attemptAnswers || []);

    // Transform each answer to detailed answer DTO
    const detailedAnswers: DetailedAnswerDto[] = (attempt.attemptAnswers || []).map((aa) => {
      // Find the correct choice for this question
      const correctChoice = aa.question.choices.find((c) => c.IsCorrect);

      return {
        QuestionID: aa.question.ID,
        QuestionText: aa.question.QuestionText || '',
        QuestionType: aa.question.mediaQuestion.Type,
        Section: aa.question.mediaQuestion.Section || '',

        StudentChoice: {
          ID: aa.choice.ID,
          Attribute: aa.choice.Attribute || '',
          Content: aa.choice.Content || '',
        },

        CorrectChoice: {
          ID: correctChoice?.ID || 0,
          Attribute: correctChoice?.Attribute || '',
          Content: correctChoice?.Content || '',
        },

        IsCorrect: aa.IsCorrect,

        Media: {
          AudioUrl: aa.question.mediaQuestion.AudioUrl,
          ImageUrl: aa.question.mediaQuestion.ImageUrl,
          Script: aa.question.mediaQuestion.Scirpt, // Note: original typo in schema
        },
      };
    });

    // Construct the complete result response
    return {
      AttemptID: attempt.ID,
      ExamTitle: attempt.exam.Title,
      SubmittedAt: attempt.SubmittedAt!,
      TimeTaken: timeTaken,

      Scores: {
        ScorePercent: attempt.ScorePercent || 0,
        ScoreListening: attempt.ScoreListening || 0,
        ScoreReading: attempt.ScoreReading || 0,
        TotalScore: totalScore,
      },

      DetailedAnswers: detailedAnswers,

      Analysis: {
        TotalQuestions: totalQuestions,
        CorrectAnswers: correctAnswers,
        ListeningCorrect: listeningCorrect,
        ReadingCorrect: readingCorrect,
        WeakAreas: weakAreas,
      },
    };
  }

  /**
   * Identify weak areas from attempt answers
   * 
   * Analyzes the student's answers to identify question types where
   * they performed poorly (accuracy below 60%).
   * 
   * This analysis helps students focus their future practice on
   * areas that need the most improvement.
   * 
   * For example, if a student consistently gets Part 3 (short conversations)
   * wrong but does well on Part 1 (photos), they should focus practice
   * on Part 3.
   * 
   * @param answers - Array of attempt answers to analyze
   * @returns Array of weak area descriptions
   */
  private identifyWeakAreas(answers: any[]): string[] {
    // Group answers by question type
    const answersByType: { [key: string]: { correct: number; total: number } } = {};

    answers.forEach((aa) => {
      const type = aa.question.mediaQuestion.Type || 'Unknown';

      if (!answersByType[type]) {
        answersByType[type] = { correct: 0, total: 0 };
      }

      answersByType[type].total++;
      if (aa.IsCorrect) {
        answersByType[type].correct++;
      }
    });

    // Identify types with accuracy below 60%
    const weakAreas: string[] = [];

    Object.entries(answersByType).forEach(([type, stats]) => {
      const accuracy = (stats.correct / stats.total) * 100;

      if (accuracy < 60) {
        weakAreas.push(
          `${type}: ${stats.correct}/${stats.total} correct (${Math.round(accuracy)}%)`
        );
      }
    });

    return weakAreas;
  }
}
import { Response } from 'express';
import { AttemptService } from '../../application/services/attempt.service';
import { AuthenticatedRequest, getStudentProfileId } from '../middlewares/auth.middleware';
import { StartExamDto, SubmitExamDto } from '../../application/dtos/exam.dto';
import { asyncHandler } from '../middlewares/error.middleware';

/**
 * AttemptController handles all HTTP requests related to test attempts
 * 
 * This controller manages the complete student test-taking journey:
 * 1. Starting a test (creating an attempt session)
 * 2. Submitting answers (grading and score calculation)
 * 3. Viewing results (detailed feedback and analysis)
 * 4. Reviewing history (past attempts and progress)
 * 
 * This is arguably the most important controller in the system as it
 * handles the core student experience. Every interaction here should be
 * carefully designed for optimal user experience and security.
 */
export class AttemptController {
  private attemptService: AttemptService;

  constructor() {
    this.attemptService = new AttemptService();
  }

  /**
   * Start a new test attempt
   * 
   * POST /api/exam/attempts/start
   * 
   * Request body: StartExamDto (validated by middleware)
   *   - ExamID: Which exam to take
   *   - Type: FULL_TEST or PRACTICE_BY_PART
   *   - Parts: (optional) for PRACTICE_BY_PART mode
   * Requires: Authentication, Student role
   * 
   * This endpoint initiates a new test session. The response includes
   * an attempt ID that the client must use when submitting answers.
   * 
   * The client should store this attempt ID in state (not localStorage
   * as per Claude.ai restrictions) and include it in the submission.
   * 
   * Workflow:
   * 1. Student clicks "Start Test" on frontend
   * 2. Frontend calls this endpoint
   * 3. Backend creates attempt record with StartedAt timestamp
   * 4. Frontend receives attempt ID and begins test UI
   * 5. Timer starts counting from StartedAt
   * 
   * @param req - Authenticated request with StartExamDto
   * @param res - Response object
   */
  startAttempt = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Extract validated DTO from request body
    const startExamDto: StartExamDto = req.body;

    // Get student profile ID from authenticated user
    // This helper throws error if user is not a student
    const studentProfileId = getStudentProfileId(req);

    // Call service to create attempt
    // Service validates exam exists and handles business rules
    const attempt = await this.attemptService.startAttempt(startExamDto, studentProfileId);

    // Return created attempt with ID
    // Client MUST save this attempt ID for submission
    res.status(201).json({
      success: true,
      message: 'Test attempt started successfully',
      data: {
        attemptId: attempt.ID,
        examId: attempt.ExamID,
        startedAt: attempt.StartedAt,
        timeLimit: attempt.exam?.TimeExam, // Time limit in minutes
      },
    });
  });

  /**
   * Submit test answers for grading
   * 
   * POST /api/exam/attempts/submit
   * 
   * Request body: SubmitExamDto (validated by middleware)
   *   - AttemptID: The attempt session ID from start
   *   - answers: Array of { QuestionID, ChoiceID }
   * Requires: Authentication, Student role
   * 
   * This is the most critical endpoint in the system. It:
   * 1. Validates the submission (timing, ownership, etc.)
   * 2. Grades all answers
   * 3. Calculates scores (percentage, TOEIC scale)
   * 4. Identifies weak areas
   * 5. Returns comprehensive results
   * 
   * Security considerations:
   * - Verifies attempt belongs to the requesting student
   * - Checks time limit wasn't exceeded
   * - Prevents double submission
   * 
   * Performance considerations:
   * - Grading happens in a single database transaction
   * - Score calculation is done efficiently
   * - Response may be large (includes all questions)
   * 
   * @param req - Authenticated request with SubmitExamDto
   * @param res - Response object
   */
  submitAttempt = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const submitExamDto: SubmitExamDto = req.body;
    const studentProfileId = getStudentProfileId(req);

    // Call service to grade and process submission
    // Service handles all validation and score calculation
    const results = await this.attemptService.submitAttempt(
      submitExamDto,
      studentProfileId
    );

    // Return comprehensive results
    // This response contains everything the student needs to review:
    // - Overall scores and section scores
    // - Detailed answer review (what they chose vs correct answer)
    // - Performance analysis and weak areas
    res.status(200).json({
      success: true,
      message: 'Test submitted and graded successfully',
      data: results,
    });
  });

  /**
   * Get attempt results by ID
   * 
   * GET /api/exam/attempts/:attemptId/results
   * 
   * Path params: attemptId
   * Requires: Authentication, Student role, Ownership
   * 
   * This endpoint allows students to review their past test results.
   * The ownership middleware ensures students can only view their own
   * attempts, not other students' results.
   * 
   * The response is identical to the submission response, allowing
   * students to review their performance any time after taking a test.
   * 
   * Use cases:
   * - Student wants to review a test they took yesterday
   * - Student wants to see their improvement over multiple attempts
   * - Student wants to study the explanations again
   * 
   * @param req - Authenticated request with attempt ID
   * @param res - Response object
   */
  getResults = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const attemptId = parseInt(req.params.attemptId);

    if (isNaN(attemptId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid attempt ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const studentProfileId = getStudentProfileId(req);

    // Service verifies ownership and returns results
    const results = await this.attemptService.getAttemptResults(
      attemptId,
      studentProfileId
    );

    res.status(200).json({
      success: true,
      data: results,
    });
  });

  /**
   * Get student's attempt history
   * 
   * GET /api/exam/attempts/history
   * 
   * Query params:
   *   - type: (optional) Filter by attempt type
   *   - startDate: (optional) Filter by date range
   *   - endDate: (optional) Filter by date range
   *   - submittedOnly: (optional) Show only completed attempts
   * Requires: Authentication, Student role
   * 
   * This endpoint returns all test attempts by the authenticated student.
   * It powers the student dashboard showing test history and progress.
   * 
   * The response includes basic attempt info (exam, date, score) without
   * full question details for performance. Students can click on an attempt
   * to get full results via the getResults endpoint.
   * 
   * @param req - Authenticated request with optional query filters
   * @param res - Response object
   */
  getHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const studentProfileId = getStudentProfileId(req);

    // Extract optional filters from query parameters
    const filters = {
      Type: req.query.type as string | undefined,
      StartDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      EndDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      SubmittedOnly: req.query.submittedOnly === 'true',
    };

    const attempts = await this.attemptService.getStudentAttempts(
      studentProfileId,
      filters
    );

    res.status(200).json({
      success: true,
      data: attempts,
      count: attempts.length,
    });
  });

  /**
   * Get student's best score for an exam
   * 
   * GET /api/exam/attempts/best-score/:examId
   * 
   * Path params: examId
   * Requires: Authentication, Student role
   * 
   * This endpoint returns the highest score the student has achieved
   * on a specific exam. Useful for displaying personal bests and
   * motivating continued practice.
   * 
   * Can also be used for leaderboards, though you might want a separate
   * endpoint that gets top scores across all students.
   * 
   * @param req - Authenticated request with exam ID
   * @param res - Response object
   */
  getBestScore = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.examId);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const studentProfileId = getStudentProfileId(req);

    const bestAttempt = await this.attemptService.getBestScore(
      studentProfileId,
      examId
    );

    if (!bestAttempt) {
      res.status(404).json({
        success: false,
        message: 'No attempts found for this exam',
        error: 'NOT_FOUND',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        attemptId: bestAttempt.ID,
        examId: bestAttempt.ExamID,
        scorePercent: bestAttempt.ScorePercent,
        scoreListening: bestAttempt.ScoreListening,
        scoreReading: bestAttempt.ScoreReading,
        submittedAt: bestAttempt.SubmittedAt,
      },
    });
  });

  /**
   * Get comprehensive progress statistics
   * 
   * GET /api/exam/attempts/progress
   * 
   * Requires: Authentication, Student role
   * 
   * This endpoint provides extensive statistics about the student's
   * performance across all their test attempts:
   * - Total attempts taken
   * - Average scores overall and by section
   * - Improvement trend (recent vs older attempts)
   * - Weak areas identified by question type
   * 
   * This data powers the progress dashboard and helps students understand
   * where they need to focus their practice.
   * 
   * The calculation is done by the service, which analyzes all the
   * student's attempts and computes various metrics.
   * 
   * @param req - Authenticated request
   * @param res - Response object
   */
  getProgress = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const studentProfileId = getStudentProfileId(req);

    const progressStats = await this.attemptService.getProgressStatistics(studentProfileId);

    res.status(200).json({
      success: true,
      data: progressStats,
    });
  });

  /**
   * Delete an attempt
   * 
   * DELETE /api/exam/attempts/:attemptId
   * 
   * Path params: attemptId
   * Requires: Authentication, Student role, Ownership
   * 
   * This allows students to remove attempts from their history.
   * Might be used if they accidentally started a test or want to
   * clean up their progress dashboard.
   * 
   * Security: Only the student who created the attempt can delete it.
   * The ownership middleware enforces this at the route level.
   * 
   * Note: In production, you might want to implement soft delete or
   * only allow deleting unsubmitted attempts to preserve data integrity.
   * 
   * @param req - Authenticated request with attempt ID
   * @param res - Response object
   */
  deleteAttempt = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const attemptId = parseInt(req.params.attemptId);

    if (isNaN(attemptId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid attempt ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const studentProfileId = getStudentProfileId(req);

    const deleted = await this.attemptService.deleteAttempt(
      attemptId,
      studentProfileId
    );

    res.status(200).json({
      success: true,
      message: 'Attempt deleted successfully',
      data: { deleted },
    });
  });

  /**
   * Get current active attempt
   * 
   * GET /api/exam/attempts/active
   * 
   * Requires: Authentication, Student role
   * 
   * This endpoint helps handle page refreshes during a test.
   * If a student refreshes the page mid-test, the frontend can call
   * this endpoint to check if there's an active (unsubmitted) attempt
   * and resume from where they left off.
   * 
   * Returns the most recent unsubmitted attempt, if any exists.
   * If no active attempt, returns 404.
   * 
   * This prevents data loss from accidental page refreshes.
   * 
   * @param req - Authenticated request
   * @param res - Response object
   */
  getActiveAttempt = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const studentProfileId = getStudentProfileId(req);

    // Get all unsubmitted attempts
    const attempts = await this.attemptService.getStudentAttempts(
      studentProfileId,
      { SubmittedOnly: false }
    );

    // Filter to only unsubmitted (no SubmittedAt)
    const activeAttempts = attempts.filter(a => !a.SubmittedAt);

    if (activeAttempts.length === 0) {
      res.status(404).json({
        success: false,
        message: 'No active attempt found',
        error: 'NOT_FOUND',
      });
      return;
    }

    // Return the most recent active attempt
    const activeAttempt = activeAttempts.sort((a, b) => 
      b.StartedAt.getTime() - a.StartedAt.getTime()
    )[0];

    res.status(200).json({
      success: true,
      data: {
        attemptId: activeAttempt.ID,
        examId: activeAttempt.ExamID,
        startedAt: activeAttempt.StartedAt,
        examTitle: activeAttempt.exam?.Title,
        timeLimit: activeAttempt.exam?.TimeExam,
      },
    });
  });
}
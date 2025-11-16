import { Router } from 'express';
import { AttemptController } from '../controllers/attempt.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireStudent } from '../middlewares/authorization.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { StartExamDto, SubmitExamDto } from '../../application/dtos/exam.dto';

/**
 * Attempt Routes
 * 
 * These routes handle the complete student test-taking journey:
 * 1. Starting a test (creating attempt session)
 * 2. Submitting answers (grading)
 * 3. Viewing results
 * 4. Reviewing history and progress
 * 
 * Most routes require student role since they're student-specific operations.
 * The service layer enforces additional security like ownership verification.
 */

const router = Router();
const attemptController = new AttemptController();

/**
 * POST /api/exam/attempts/start
 * 
 * Start a new test attempt
 * 
 * Request body: StartExamDto
 *   - ExamID: Which exam to take
 *   - Type: FULL_TEST or PRACTICE_BY_PART
 *   - Parts: (optional) for practice by part
 * 
 * Requires: Authentication, Student role
 * Returns attempt ID that must be used for submission
 */
router.post(
  '/start',
  authMiddleware,
  requireStudent,
  validateBody(StartExamDto),
  attemptController.startAttempt
);

/**
 * POST /api/exam/attempts/submit
 * 
 * Submit test answers for grading
 * 
 * Request body: SubmitExamDto
 *   - AttemptID: The attempt session ID
 *   - answers: Array of {QuestionID, ChoiceID}
 * 
 * Requires: Authentication, Student role
 * Service validates timing and ownership
 * Returns comprehensive results with scores and analysis
 */
router.post(
  '/submit',
  authMiddleware,
  requireStudent,
  validateBody(SubmitExamDto),
  attemptController.submitAttempt
);

/**
 * GET /api/exam/attempts/active
 * 
 * Get current active (unsubmitted) attempt
 * 
 * Requires: Authentication, Student role
 * Helps handle page refreshes during tests
 * Returns 404 if no active attempt exists
 */
router.get(
  '/active',
  authMiddleware,
  requireStudent,
  attemptController.getActiveAttempt
);

/**
 * GET /api/exam/attempts/history
 * 
 * Get student's attempt history
 * 
 * Query params:
 *   - type: Filter by attempt type
 *   - startDate, endDate: Date range filter
 *   - submittedOnly: Show only completed attempts
 * 
 * Requires: Authentication, Student role
 * Returns list of student's past attempts
 */
router.get(
  '/history',
  authMiddleware,
  requireStudent,
  attemptController.getHistory
);

/**
 * GET /api/exam/attempts/progress
 * 
 * Get comprehensive progress statistics
 * 
 * Requires: Authentication, Student role
 * Returns detailed analytics about performance trends
 */
router.get(
  '/progress',
  authMiddleware,
  requireStudent,
  attemptController.getProgress
);

/**
 * GET /api/exam/attempts/best-score/:examId
 * 
 * Get student's best score for a specific exam
 * 
 * Path params:
 *   - examId: Exam ID
 * 
 * Requires: Authentication, Student role
 * Returns highest score achieved on that exam
 */
router.get(
  '/best-score/:examId',
  authMiddleware,
  requireStudent,
  attemptController.getBestScore
);

/**
 * GET /api/exam/attempts/:attemptId/results
 * 
 * Get detailed results for a specific attempt
 * 
 * Path params:
 *   - attemptId: Attempt ID
 * 
 * Requires: Authentication, Student role
 * Service verifies ownership
 * Returns same comprehensive results as submission
 */
router.get(
  '/:attemptId/results',
  authMiddleware,
  requireStudent,
  attemptController.getResults
);

/**
 * DELETE /api/exam/attempts/:attemptId
 * 
 * Delete an attempt
 * 
 * Path params:
 *   - attemptId: Attempt ID
 * 
 * Requires: Authentication, Student role
 * Service verifies ownership
 * Removes attempt and all associated answers
 */
router.delete(
  '/:attemptId',
  authMiddleware,
  requireStudent,
  attemptController.deleteAttempt
);

export default router;
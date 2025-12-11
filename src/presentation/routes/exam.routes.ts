import { Router } from 'express';
import { ExamController } from '../controllers/exam.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireTeacherOrAdmin, requireAdmin } from '../middlewares/authorization.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { CreateExamDto, UpdateExamDto } from '../../application/dtos/exam.dto';

/**
 * Exam Routes
 * 
 * This file defines all routes related to exam management.
 * Routes follow RESTful conventions where possible:
 * 
 * - GET /exams - List all exams
 * - GET /exams/:id - Get specific exam
 * - POST /exams - Create new exam
 * - PUT /exams/:id - Update exam
 * - DELETE /exams/:id - Delete exam
 * 
 * Plus additional routes for specialized operations like adding questions,
 * getting statistics, searching, and duplicating.
 * 
 * Each route specifies:
 * 1. HTTP method (GET, POST, PUT, DELETE)
 * 2. URL path with any parameters
 * 3. Middleware chain (authentication, authorization, validation)
 * 4. Controller method to handle the request
 * 
 * The order of middlewares matters - they execute left to right.
 * Typically: auth → authorization → validation → controller
 */

const router = Router();
const examController = new ExamController();

/**
 * GET /api/exam/exams
 * 
 * List all exams with optional filtering
 * 
 * Query params:
 *   - ExamTypeID: Filter by exam type
 *   - Type: Filter by custom type string
 * 
 * Requires: Authentication
 * Anyone authenticated can view the exam list
 */
router.get(
  '/',
  authMiddleware,
  examController.getAll
);

/**
 * GET /api/exam/exams/search
 * 
 * Search exams by title
 * 
 * Query params:
 *   - q: Search term
 * 
 * Requires: Authentication
 * 
 * Note: This route must come BEFORE /exams/:id route
 * Otherwise Express would interpret "search" as an ID
 */
router.get(
  '/search',
  authMiddleware,
  examController.search
);

/**
 * GET /api/exam/exams/:id
 * 
 * Get specific exam by ID
 * 
 * Path params:
 *   - id: Exam ID
 * 
 * Requires: Authentication
 * Returns exam with all questions but IsCorrect flags removed
 */
router.get(
  '/:id',
  authMiddleware,
  examController.getById
);

/**
 * POST /api/exam/exams
 * 
 * Create a new exam
 * 
 * Request body: CreateExamDto
 *   - Title, TimeExam, ExamTypeID, etc.
 *   - Optionally includes questions to add
 * 
 * Requires: Authentication, Teacher or Admin role
 * Only teachers and admins can create exams
 */
router.post(
  '/',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(CreateExamDto),
  examController.create
);

/**
 * PUT /api/exam/exams/:id
 * 
 * Update an existing exam
 * 
 * Path params:
 *   - id: Exam ID
 * Request body: UpdateExamDto
 * 
 * Requires: Authentication, Teacher or Admin role
 * Service enforces that only creator or admins can update
 */
router.put(
  '/:id',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(UpdateExamDto),
  examController.update
);

/**
 * DELETE /api/exam/exams/:id
 * 
 * Delete an exam
 * 
 * Path params:
 *   - id: Exam ID
 * 
 * Requires: Authentication, Admin role
 * Only admins can delete exams due to destructive nature
 * Service prevents deletion if exam has student attempts
 */
router.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  examController.delete
);

/**
 * POST /api/exam/exams/:id/questions
 * 
 * Add questions to an exam
 * 
 * Path params:
 *   - id: Exam ID
 * Request body:
 *   - questions: Array of {QuestionID, OrderIndex}
 * 
 * Requires: Authentication, Teacher or Admin role
 */
router.post(
  '/:id/questions',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.addQuestions
);

/**
 * DELETE /api/exam/exams/:id/questions
 * 
 * Remove questions from an exam
 * 
 * Path params:
 *   - id: Exam ID
 * Request body:
 *   - questionIds: Array of question IDs
 * 
 * Requires: Authentication, Teacher or Admin role
 */
router.delete(
  '/:id/questions',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.removeQuestions
);

/**
 * POST /api/exam/exams/:id/duplicate
 * 
 * Duplicate an exam with all its questions
 * 
 * Path params:
 *   - id: Exam ID to duplicate
 * 
 * Requires: Authentication, Teacher or Admin role
 * Creates a copy owned by the requesting user
 */
router.post(
  '/:id/duplicate',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.duplicate
);

// ============================================================
// MEDIA GROUP MANAGEMENT (NEW)
// ============================================================

/**
 * POST /api/exam/exams/:examId/media-groups
 * Add media group (multiple questions) to exam
 * 
 * Request body: { mediaGroupId: number, orderIndex: number }
 */
router.post(
  '/:examId/media-groups',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.addMediaGroup
);

/**
 * DELETE /api/exam/exams/:examId/media-groups/:mediaGroupId
 * Remove entire media group from exam
 */
router.delete(
  '/:examId/media-groups/:mediaGroupId',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.removeMediaGroup
);

/**
 * PUT /api/exam/exams/:examId/media-groups/:mediaGroupId/position
 * Move media group to different position
 * 
 * Request body: { newOrderIndex: number }
 */
router.put(
  '/:examId/media-groups/:mediaGroupId/position',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.moveMediaGroup
);

/**
 * GET /api/exam/exams/:examId/content-organized
 * Get exam content organized by media groups
 * 
 * Returns: { mediaGroups: [...], standaloneQuestions: [...] }
 */
router.get(
  '/:examId/content-organized',
  authMiddleware,
  examController.getOrganizedContent
);

/**
 * GET /api/exam/exams/:examId/media-groups-summary
 * Get summary of media groups structure
 */
router.get(
  '/:examId/media-groups-summary',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.getMediaGroupSummary
);

// ============================================================
// UTILITIES & STATISTICS
// ============================================================

/**
 * GET /api/exam/exams/:id/statistics
 * 
 * Get comprehensive statistics about an exam
 * 
 * Path params:
 *   - id: Exam ID
 * 
 * Requires: Authentication, Teacher or Admin role
 * Students shouldn't see detailed statistics
 */
router.get(
  '/:id/statistics',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.getStatistics
);

/**
 * POST /api/exam/exams/:examId/validate-structure
 * Validate exam structure (check for issues)
 */
router.post(
  '/:examId/validate-structure',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.validateStructure
);

/**
 * POST /api/exam/exams/:examId/compact-order
 * Auto-fix OrderIndex gaps
 */
router.post(
  '/:examId/compact-order',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.compactOrder
);

/**
 * GET /api/exam/exams/:examId/next-order-index
 * Get next available OrderIndex
 */
router.get(
  '/:examId/next-order-index',
  authMiddleware,
  requireTeacherOrAdmin,
  examController.getNextOrderIndex
);

export default router;
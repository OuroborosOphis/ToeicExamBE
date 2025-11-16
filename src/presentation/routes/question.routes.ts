import { Router } from 'express';
import { QuestionController } from '../controllers/question.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireTeacherOrAdmin, requireAdmin } from '../middlewares/authorization.middleware';
import { validateBody, validateQuery } from '../middlewares/validation.middleware';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  QuestionFilterDto,
  BulkQuestionOperationDto,
} from '../../application/dtos/question.dto';

/**
 * Question Routes
 * 
 * These routes handle question bank management - CRUD operations
 * for questions that are used to build exams.
 * 
 * Most routes require teacher or admin role since question management
 * is a content creation activity, not something students do.
 */

const router = Router();
const questionController = new QuestionController();

/**
 * GET /api/exam/questions
 * 
 * Search and filter questions
 * 
 * Query params: QuestionFilterDto
 *   - Skill, Section, Type: Filters
 *   - SearchText: Text search
 *   - Page, Limit: Pagination
 * 
 * Requires: Authentication, Teacher or Admin role
 * Returns paginated list with usage statistics
 */
router.get(
  '/',
  authMiddleware,
  requireTeacherOrAdmin,
  validateQuery(QuestionFilterDto),
  questionController.search
);

/**
 * GET /api/exam/questions/by-section
 * 
 * Get questions for specific sections
 * 
 * Query params:
 *   - sections: Comma-separated section numbers
 *   - limit: Max number to return
 * 
 * Requires: Authentication, Teacher or Admin role
 * Used when building exams focused on specific parts
 */
router.get(
  '/by-section',
  authMiddleware,
  requireTeacherOrAdmin,
  questionController.getBySection
);

/**
 * POST /api/exam/questions
 * 
 * Create a new question
 * 
 * Request body: CreateQuestionDto
 *   - QuestionText
 *   - Media (audio/image URLs, scripts)
 *   - Choices (with one marked correct)
 * 
 * Requires: Authentication, Teacher or Admin role
 * Creates question, media, and choices atomically
 */
router.post(
  '/',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(CreateQuestionDto),
  questionController.create
);

/**
 * POST /api/exam/questions/bulk
 * 
 * Perform bulk operations on questions
 * 
 * Request body: BulkQuestionOperationDto
 *   - QuestionIDs: Array of IDs
 *   - Operation: DELETE, ADD_TO_EXAM, etc.
 * 
 * Requires: Authentication, Admin role
 * Only admins due to potentially destructive nature
 */
router.post(
  '/bulk',
  authMiddleware,
  requireAdmin,
  validateBody(BulkQuestionOperationDto),
  questionController.bulkOperation
);

/**
 * GET /api/exam/questions/:id
 * 
 * Get specific question by ID
 * 
 * Path params:
 *   - id: Question ID
 * 
 * Requires: Authentication, Teacher or Admin role
 * Returns complete question including correct answer
 */
router.get(
  '/:id',
  authMiddleware,
  requireTeacherOrAdmin,
  questionController.getById
);

/**
 * PUT /api/exam/questions/:id
 * 
 * Update an existing question
 * 
 * Path params:
 *   - id: Question ID
 * Request body: UpdateQuestionDto
 * 
 * Requires: Authentication, Teacher or Admin role
 * Service warns if question is widely used
 */
router.put(
  '/:id',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(UpdateQuestionDto),
  questionController.update
);

/**
 * DELETE /api/exam/questions/:id
 * 
 * Delete a question
 * 
 * Path params:
 *   - id: Question ID
 * 
 * Requires: Authentication, Admin role
 * Service prevents deletion if still used in exams
 */
router.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  questionController.delete
);

/**
 * GET /api/exam/questions/:id/statistics
 * 
 * Get usage statistics for a question
 * 
 * Path params:
 *   - id: Question ID
 * 
 * Requires: Authentication, Teacher or Admin role
 * Returns usage count, attempts, success rate, difficulty
 */
router.get(
  '/:id/statistics',
  authMiddleware,
  requireTeacherOrAdmin,
  questionController.getStatistics
);

export default router;
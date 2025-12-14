import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireTeacherOrAdmin } from '../middlewares/authorization.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { rateLimitByUser } from '../middlewares/authorization.middleware';
import {
  CreateCommentDto,
  UpdateCommentDto,
  ModerateCommentDto,
} from '../../application/dtos/comment.dto';

/**
 * Comment Routes
 * 
 * These routes enable social learning features through discussions.
 * Students can ask questions, share insights, and help each other.
 * Teachers and admins can moderate to maintain healthy discussions.
 * 
 * Comments are organized hierarchically (parent-child) to support
 * threaded discussions similar to Reddit or forum software.
 */

const router = Router();
const commentController = new CommentController();

/**
 * GET /api/exam/comments/flagged
 * 
 * Get all flagged comments for moderation
 * 
 * Requires: Authentication, Teacher or Admin role
 * Returns comments that have been reported or flagged
 * Used by moderators to review problematic content
 * 
 * Note: This must come before /comments/search and /comments/:commentId
 * to avoid route conflicts
 */
router.get(
  '/flagged',
  authMiddleware,
  requireTeacherOrAdmin,
  commentController.getFlagged
);

/**
 * GET /api/exam/comments/search
 * 
 * Search comments by text content
 * 
 * Query params:
 *   - q: Search term
 *   - examId: (optional) Limit to specific exam
 * 
 * Requires: Authentication
 * Useful for finding discussions about specific topics
 */
router.get(
  '/search',
  authMiddleware,
  commentController.search
);

/**
 * POST /api/exam/comments
 * 
 * Create a new comment or reply
 * 
 * Request body: CreateCommentDto
 *   - Content: Comment text
 *   - ExamID: Which exam
 *   - ParentId: (optional) For replies
 * 
 * Requires: Authentication
 * Rate limited to prevent spam (max 5 comments per minute)
 * StudentProfileId extracted from auth token
 */
router.post(
  '/',
  authMiddleware,
  rateLimitByUser(5, 60000), // Max 5 comments per minute
  validateBody(CreateCommentDto),
  commentController.create
);

/**
 * GET /api/exam/comments
 * 
 * Get all comments with optional filtering and pagination
 * 
 * Query params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20)
 *   - examId: (optional) Filter by exam
 *   - status: (optional) Filter by status (1=approved, 2=hidden, 3=flagged)
 *   - sortBy: (optional) Sort field (createdAt, likes, etc.) - default: createdAt
 *   - order: (optional) ASC or DESC - default: DESC
 * 
 * Requires: Authentication
 * Returns paginated list of comments with pagination metadata
 * 
 * Useful for:
 * - Dashboard showing all recent discussions
 * - Moderation panel for admins
 * - Analytics and reporting
 * 
 * Example: GET /api/exam/comments?page=2&limit=10&examId=5&order=DESC
 */
router.get(
  '/',
  authMiddleware,
  commentController.getAll
);

/**
 * GET /api/exam/comments/:commentId/thread
 * 
 * Get complete comment thread with all nested replies
 * 
 * Path params:
 *   - commentId: Parent comment ID
 * 
 * Requires: Authentication
 * Returns hierarchical structure for threaded display
 */
router.get(
  '/:commentId/thread',
  authMiddleware,
  commentController.getThread
);

/**
 * PUT /api/exam/comments/:commentId
 * 
 * Update a comment
 * 
 * Path params:
 *   - commentId: Comment ID
 * Request body: UpdateCommentDto
 *   - Content: New text
 * 
 * Requires: Authentication
 * Service verifies user is the comment author
 */
router.put(
  '/:commentId',
  authMiddleware,
  validateBody(UpdateCommentDto),
  commentController.update
);

/**
 * DELETE /api/exam/comments/:commentId
 * 
 * Delete a comment and all its replies
 * 
 * Path params:
 *   - commentId: Comment ID
 * 
 * Requires: Authentication
 * Authors can delete their own, teachers/admins can delete any
 * Cascade deletes all nested replies
 */
router.delete(
  '/:commentId',
  authMiddleware,
  commentController.delete
);

/**
 * PATCH /api/exam/comments/:commentId/moderate
 * 
 * Moderate a comment (change status)
 * 
 * Path params:
 *   - commentId: Comment ID
 * Request body: ModerateCommentDto
 *   - Status: 1 (approved), 2 (hidden), 3 (flagged)
 * 
 * Requires: Authentication, Teacher or Admin role
 * Allows moderators to hide inappropriate content
 */
router.patch(
  '/:commentId/moderate',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(ModerateCommentDto),
  commentController.moderate
);

/**
 * GET /api/exam/exams/:examId/comments
 * 
 * Get comments for a specific exam
 * 
 * Path params:
 *   - examId: Exam ID
 * Query params:
 *   - parentId: Filter by parent (0 for top-level)
 *   - status: Filter by status
 *   - page, limit: Pagination
 * 
 * Requires: Authentication
 * Returns paginated comments with reply counts
 */
router.get(
  '/exams/:examId/comments',
  authMiddleware,
  commentController.getExamComments
);

/**
 * GET /api/exam/exams/:examId/comment-count
 * 
 * Get total comment count for an exam
 * 
 * Path params:
 *   - examId: Exam ID
 * 
 * Requires: Authentication
 * Returns count of approved comments
 * Displayed on exam cards to show activity
 */
router.get(
  '/exams/:examId/comment-count',
  authMiddleware,
  commentController.getCount
);

/**
 * GET /api/exam/students/:studentProfileId/comments
 * 
 * Get all comments by a specific student
 * 
 * Path params:
 *   - studentProfileId: Student profile ID
 * Query params:
 *   - limit: Max number to return
 * 
 * Requires: Authentication
 * Students can view own, teachers/admins can view any
 * Used for user profile pages
 */
router.get(
  '/students/:studentProfileId/comments',
  authMiddleware,
  commentController.getStudentComments
);

export default router;
import { Router } from 'express';
import { MediaGroupController } from '../controllers/media-group.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireTeacherOrAdmin, requireAdmin } from '../middlewares/authorization.middleware';
import { validateBody, validateQuery } from '../middlewares/validation.middleware';
import {
  CreateMediaGroupDto,
  UpdateMediaGroupDto,
  MediaGroupFilterDto,
  AddMediaGroupToExamDto,
  AddQuestionToGroupDto,
} from '../../application/dtos/media-group.dto';

/**
 * Media Group Routes
 * 
 * Routes này cung cấp API endpoints cho việc quản lý media groups.
 * Media groups là nhóm câu hỏi có cùng chung một media (audio, passage).
 * 
 * Workflow điển hình:
 * 1. Teacher tạo media group với multiple questions (POST /media-groups)
 * 2. Browse danh sách media groups khi tạo đề (GET /media-groups)
 * 3. Preview chi tiết của một group (GET /media-groups/:id)
 * 4. Add group vào exam (POST /exams/:examId/media-groups)
 * 5. View exam content organized by groups (GET /exams/:examId/content-organized)
 */

const router = Router();
const controller = new MediaGroupController();

/**
 * GET /api/exam/media-groups
 * 
 * Lấy danh sách media groups với filtering
 * 
 * Query params: MediaGroupFilterDto
 *   - Skill, Section, Difficulty, Tags
 *   - SearchText để tìm kiếm
 *   - Page, Limit cho pagination
 * 
 * Returns: Paginated list of media group summaries
 */
router.get(
  '/',
  authMiddleware,
  requireTeacherOrAdmin,
  validateQuery(MediaGroupFilterDto),
  controller.getMediaGroups
);

/**
 * POST /api/exam/media-groups
 * 
 * Tạo media group mới (media + multiple questions)
 * 
 * Request body: CreateMediaGroupDto
 * Requires: Teacher or Admin role
 */
router.post(
  '/',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(CreateMediaGroupDto),
  controller.createMediaGroup
);

/**
 * GET /api/exam/media-groups/:id
 * 
 * Get chi tiết đầy đủ của một media group
 * 
 * Returns: Complete group với questions và choices
 */
router.get(
  '/:id',
  authMiddleware,
  requireTeacherOrAdmin,
  controller.getMediaGroupDetail
);

/**
 * PUT /api/exam/media-groups/:id
 * 
 * Update metadata của media group
 * 
 * Request body: UpdateMediaGroupDto
 */
router.put(
  '/:id',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(UpdateMediaGroupDto),
  controller.updateMediaGroup
);

/**
 * DELETE /api/exam/media-groups/:id
 * 
 * Xóa media group và tất cả questions
 * 
 * Requires: Admin role (destructive operation)
 */
router.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  controller.deleteMediaGroup
);

/**
 * GET /api/exam/media-groups/:id/statistics
 * 
 * Get usage statistics của media group
 */
router.get(
  '/:id/statistics',
  authMiddleware,
  requireTeacherOrAdmin,
  controller.getMediaGroupStatistics
);

/**
 * POST /api/exam/media-groups/:id/clone
 * 
 * Clone/duplicate media group
 * 
 * Request body: { newTitle?: string }
 */
router.post(
  '/:id/clone',
  authMiddleware,
  requireTeacherOrAdmin,
  controller.cloneMediaGroup
);

/**
 * POST /api/exam/media-groups/:id/questions
 * 
 * Add question vào existing media group
 * 
 * Request body: AddQuestionToGroupDto
 */
router.post(
  '/:id/questions',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(AddQuestionToGroupDto),
  controller.addQuestionToGroup
);

/**
 * DELETE /api/exam/media-groups/:id/questions/:questionId
 * 
 * Remove question khỏi media group
 */
router.delete(
  '/:id/questions/:questionId',
  authMiddleware,
  requireTeacherOrAdmin,
  controller.removeQuestionFromGroup
);

// Routes for integrating with exams

/**
 * POST /api/exam/exams/:examId/media-groups
 * 
 * Add media group (tất cả questions) vào exam
 * 
 * Request body: AddMediaGroupToExamDto
 *   - MediaGroupID
 *   - OrderIndex
 */
router.post(
  '/exams/:examId/media-groups',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(AddMediaGroupToExamDto),
  controller.addMediaGroupToExam
);

/**
 * DELETE /api/exam/exams/:examId/media-groups/:mediaGroupId
 * 
 * Remove media group khỏi exam
 */
router.delete(
  '/exams/:examId/media-groups/:mediaGroupId',
  authMiddleware,
  requireTeacherOrAdmin,
  controller.removeMediaGroupFromExam
);

/**
 * GET /api/exam/exams/:examId/content-organized
 * 
 * Get exam content organized by media groups
 * 
 * Returns:
 *   - mediaGroups: Groups với questions
 *   - standaloneQuestions: Questions không thuộc group
 */
router.get(
  '/exams/:examId/content-organized',
  authMiddleware,
  controller.getExamContentOrganized
);

export default router;
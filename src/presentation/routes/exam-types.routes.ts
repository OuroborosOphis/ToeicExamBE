import { Router } from 'express';
import { ExamController } from '../controllers/exam.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireTeacherOrAdmin, requireAdmin } from '../middlewares/authorization.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { CreateExamTypeDto, UpdateExamTypeDto } from '../../application/dtos/exam-type.dto';

const router = Router();
const examController = new ExamController();

// CRUD routes for Exam Types

/**
 * GET /api/exam/exam-types
 * Lấy tất cả exam types
 * Requires: Authentication
 */
router.get('/', authMiddleware, examController.getExamTypes);

/**
 * POST /api/exam/exam-types
 * Tạo exam type mới
 * Requires: Authentication, Teacher or Admin
 */
router.post(
  '/',
  authMiddleware,
  requireTeacherOrAdmin,
  validateBody(CreateExamTypeDto),
  examController.createExamType
);

/**
 * PUT /api/exam/exam-types/:id
 * Update exam type
 * Requires: Authentication, Admin
 */
router.put(
  '/:id',
  authMiddleware,
  requireAdmin,
  validateBody(UpdateExamTypeDto),
  examController.updateExamType
);

/**
 * DELETE /api/exam/exam-types/:id
 * Xóa exam type (chỉ khi không có exam nào dùng)
 * Requires: Authentication, Admin
 */
router.delete(
  '/:id',
  authMiddleware,
  requireAdmin,
  examController.deleteExamType
);

export default router;
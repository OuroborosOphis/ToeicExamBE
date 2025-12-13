import { Response } from 'express';
import { ExamService } from '../../application/services/exam.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { CreateExamDto, UpdateExamDto } from '../../application/dtos/exam.dto';
import { CreateExamTypeDto, UpdateExamTypeDto } from '@/application/dtos/exam-type.dto';
import { asyncHandler } from '../middlewares/error.middleware';

/**
 * ExamController handles all HTTP requests related to exams
 * 
 * This controller is a thin layer that:
 * 1. Extracts data from HTTP requests
 * 2. Calls appropriate service methods
 * 3. Formats responses with proper HTTP status codes
 * 4. Handles any controller-level concerns
 * 
 * Controllers should NOT contain business logic. That belongs in services.
 * Controllers should NOT directly access repositories. That belongs in services.
 * Controllers ONLY translate between HTTP and your application's business layer.
 * 
 * All methods are wrapped with asyncHandler to ensure errors are caught
 * and passed to the error handling middleware.
 */
export class ExamController {
  private examService: ExamService;

  constructor() {
    this.examService = new ExamService();
  }

  /**
   * Create a new exam
   * 
   * POST /api/exam/exams
   * 
   * Request body: CreateExamDto (validated by middleware)
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint allows teachers and admins to create new exams.
   * The request body is validated by validateBody(CreateExamDto) middleware
   * before reaching this controller, so we can trust the data is valid.
   * 
   * The userId is extracted from the authenticated user's token and passed
   * to the service for audit trail purposes.
   * 
   * @param req - Authenticated request with validated CreateExamDto in body
   * @param res - Response object to send HTTP response
   */
  create = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Extract validated DTO from request body
    // The validation middleware has already ensured this is valid
    const createExamDto: CreateExamDto = req.body;

    // Extract userId from authenticated user
    // Auth middleware has already verified the token and attached user info
    const userId = req.user!.userId;

    // Call service to create exam
    // Service handles all business logic and validation
    const exam = await this.examService.createExam(createExamDto, userId);

    // Return success response with created exam
    // 201 status code indicates successful resource creation
    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      data: exam,
    });
  });

  /**
   * Get exam by ID
   * 
   * GET /api/exam/exams/:id
   * 
   * Path params: id (exam ID)
   * Requires: Authentication (student can view, teacher/admin can manage)
   * 
   * This endpoint retrieves complete exam details including all questions
   * and their choices. The service automatically removes the IsCorrect flag
   * from choices to prevent cheating.
   * 
   * Students use this endpoint when starting a test to get all questions.
   * Teachers and admins use it for exam review and management.
   * 
   * @param req - Authenticated request with exam ID in params
   * @param res - Response object
   */
  getById = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Extract and parse exam ID from URL parameters
    const examId = parseInt(req.params.id);

    // Basic validation of ID format
    // More complex validations are in the service layer
    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    // Call service to retrieve exam
    // Service will throw NotFoundError if exam doesn't exist
    const exam = await this.examService.getExamById(examId);

    // Return exam details
    res.status(200).json({
      success: true,
      data: exam,
    });
  });

  /**
   * Get all exams with optional filtering
   * 
   * GET /api/exam/exams
   * 
   * Query params: 
   *   - ExamTypeID (optional): Filter by exam type
   *   - Type (optional): Filter by custom type string
   * Requires: Authentication
   * 
   * This endpoint lists all available exams. Students use it to browse
   * available tests. Teachers and admins use it to manage the exam library.
   * 
   * The response includes basic exam info without full question details
   * for performance. Clients request full details separately when needed.
   * 
   * @param req - Authenticated request with optional query filters
   * @param res - Response object
   */
  getAll = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Extract optional filter parameters from query string
    const filters = {
      ExamTypeID: req.query.ExamTypeID ? parseInt(req.query.ExamTypeID as string) : undefined,
      Type: req.query.Type as string | undefined,
    };

    // Call service with filters
    const exams = await this.examService.getAllExams(filters);

    // Return exam list
    res.status(200).json({
      success: true,
      data: exams,
      count: exams.length,
    });
  });

  /**
   * Update an existing exam
   * 
   * PUT /api/exam/exams/:id
   * 
   * Path params: id (exam ID)
   * Request body: UpdateExamDto (validated by middleware)
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint allows updating exam metadata like title, time limit,
   * or type. It does NOT update questions - use separate endpoints for
   * adding/removing questions.
   * 
   * The service enforces that only the exam creator or admins can update.
   * 
   * @param req - Authenticated request with exam ID and UpdateExamDto
   * @param res - Response object
   */
  update = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.id);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const updateExamDto: UpdateExamDto = req.body;
    const userId = req.user!.userId;

    // Service handles permission checking and validation
    const updatedExam = await this.examService.updateExam(examId, updateExamDto, userId);

    res.status(200).json({
      success: true,
      message: 'Exam updated successfully',
      data: updatedExam,
    });
  });

  /**
   * Delete an exam
   * 
   * DELETE /api/exam/exams/:id
   * 
   * Path params: id (exam ID)
   * Requires: Authentication, Admin role (enforced by middleware)
   * 
   * This is a destructive operation that removes the exam and all
   * associated data including student attempts. The service will
   * reject deletion if the exam has been taken by students.
   * 
   * Only admins should have access to this endpoint. The authorization
   * middleware enforces this at the route level.
   * 
   * @param req - Authenticated request with exam ID
   * @param res - Response object
   */
  delete = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.id);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const userId = req.user!.userId;

    // Service checks if exam has attempts and throws error if so
    const deleted = await this.examService.deleteExam(examId, userId);

    res.status(200).json({
      success: true,
      message: 'Exam deleted successfully',
      data: { deleted },
    });
  });

  /**
   * Add questions to an exam
   * 
   * POST /api/exam/exams/:id/questions
   * 
   * Path params: id (exam ID)
   * Request body: Array of { QuestionID, OrderIndex }
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint allows adding questions to an existing exam.
   * Questions must already exist in the question bank.
   * 
   * The OrderIndex determines the sequence of questions in the exam,
   * which is important for maintaining proper test structure.
   * 
   * @param req - Authenticated request with exam ID and questions array
   * @param res - Response object
   */
  addQuestions = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.id);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    // Expect array of { QuestionID, OrderIndex } objects
    const questions = req.body.questions;

    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Questions array is required and cannot be empty',
        error: 'INVALID_REQUEST',
      });
      return;
    }

    const userId = req.user!.userId;

    // Service validates all questions exist and adds them
    const updatedExam = await this.examService.addQuestionsToExam(
      examId,
      questions,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Questions added to exam successfully',
      data: updatedExam,
    });
  });

  /**
   * Remove questions from an exam
   * 
   * DELETE /api/exam/exams/:id/questions
   * 
   * Path params: id (exam ID)
   * Request body: { questionIds: number[] }
   * Requires: Authentication, Teacher or Admin role
   * 
   * This removes the association between questions and the exam.
   * The questions themselves remain in the database and can be
   * used in other exams.
   * 
   * @param req - Authenticated request with exam ID and question IDs
   * @param res - Response object
   */
  removeQuestions = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.id);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const questionIds = req.body.questionIds;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Question IDs array is required and cannot be empty',
        error: 'INVALID_REQUEST',
      });
      return;
    }

    const userId = req.user!.userId;

    const removedCount = await this.examService.removeQuestionsFromExam(
      examId,
      questionIds,
      userId
    );

    res.status(200).json({
      success: true,
      message: `${removedCount} question(s) removed from exam`,
      data: { removedCount },
    });
  });

  /**
   * Get exam statistics
   * 
   * GET /api/exam/exams/:id/statistics
   * 
   * Path params: id (exam ID)
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint provides comprehensive statistics about an exam:
   * - Number of questions and distribution by section
   * - Number of students who have taken it
   * - Average scores
   * 
   * Teachers and admins use this to evaluate exam difficulty and usage.
   * 
   * @param req - Authenticated request with exam ID
   * @param res - Response object
   */
  getStatistics = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.id);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const statistics = await this.examService.getExamStatistics(examId);

    res.status(200).json({
      success: true,
      data: statistics,
    });
  });

  /**
   * Search exams by title
   * 
   * GET /api/exam/exams/search
   * 
   * Query params: q (search term)
   * Requires: Authentication
   * 
   * This endpoint allows searching for exams by title or partial title.
   * Useful in admin panels for quickly finding specific exams.
   * 
   * @param req - Authenticated request with search query
   * @param res - Response object
   */
  search = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const searchTerm = req.query.q as string;

    if (!searchTerm || searchTerm.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Search term is required',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const exams = await this.examService.searchExams(searchTerm);

    res.status(200).json({
      success: true,
      data: exams,
      count: exams.length,
    });
  });

  /**
   * Duplicate an exam
   * 
   * POST /api/exam/exams/:id/duplicate
   * 
   * Path params: id (exam ID to duplicate)
   * Requires: Authentication, Teacher or Admin role
   * 
   * This creates a copy of an existing exam with all its questions.
   * The duplicate gets a new title (original + " - Copy") and is
   * owned by the user who duplicated it.
   * 
   * This is useful for creating exam variations or templates.
   * 
   * @param req - Authenticated request with exam ID
   * @param res - Response object
   */
  duplicate = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.id);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const userId = req.user!.userId;

    const duplicatedExam = await this.examService.duplicateExam(examId, userId);

    res.status(201).json({
      success: true,
      message: 'Exam duplicated successfully',
      data: duplicatedExam,
    });
  });

  /**
   * POST /api/exam/exams/:examId/media-groups
   * 
   * Add media group (tất cả questions) vào exam
   * 
   * Request body:
   *   - mediaGroupId: ID của media group
   *   - orderIndex: Vị trí bắt đầu trong exam
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Response bao gồm:
   *   - Updated exam
   *   - Số questions đã add
   *   - Start và end OrderIndex
   */
  addMediaGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);

      if (isNaN(examId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const { mediaGroupId, orderIndex } = req.body;

      // Validate request body
      if (!mediaGroupId || !orderIndex) {
        res.status(400).json({
          success: false,
          message: 'Media group ID and order index are required',
          error: 'INVALID_REQUEST',
        });
        return;
      }

      const userId = req.user!.userId;

      // Call service để add media group
      const result = await this.examService.addMediaGroupToExam(
        examId,
        parseInt(mediaGroupId),
        parseInt(orderIndex),
        userId
      );

      res.status(200).json({
        success: true,
        message: `Successfully added media group with ${result.questionsAdded} questions`,
        data: {
          exam: result.exam,
          questionsAdded: result.questionsAdded,
          startOrderIndex: result.startOrderIndex,
          endOrderIndex: result.endOrderIndex,
        },
      });
    }
  );

  /**
   * DELETE /api/exam/exams/:examId/media-groups/:mediaGroupId
   * 
   * Remove media group khỏi exam
   * 
   * Path params:
   *   - examId: Exam ID
   *   - mediaGroupId: Media group ID to remove
   * 
   * Requires: Authentication, Teacher or Admin role
   */
  removeMediaGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);
      const mediaGroupId = parseInt(req.params.mediaGroupId);

      if (isNaN(examId) || isNaN(mediaGroupId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID or media group ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const userId = req.user!.userId;

      const removedCount = await this.examService.removeMediaGroupFromExam(
        examId,
        mediaGroupId,
        userId
      );

      res.status(200).json({
        success: true,
        message: `Removed ${removedCount} question(s) from exam`,
        data: { removedCount },
      });
    }
  );

  /**
   * GET /api/exam/exams/:examId/content-organized
   * 
   * Get exam content organized by media groups
   * 
   * Returns:
   *   - mediaGroups: Groups với questions
   *   - standaloneQuestions: Questions không thuộc group
   * 
   * Requires: Authentication
   * 
   * Use case: UI hiển thị exam content với media được
   * group lại thay vì show riêng lẻ cho mỗi câu
   */
  getOrganizedContent = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);

      if (isNaN(examId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const content = await this.examService.getExamContentOrganized(examId);

      res.status(200).json({
        success: true,
        data: content,
      });
    }
  );

  /**
   * PUT /api/exam/exams/:examId/media-groups/:mediaGroupId/position
   * 
   * Move media group to different position trong exam
   * 
   * Request body:
   *   - newOrderIndex: New starting position
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Use case: Giáo viên drag-drop media group để
   * reorder trong exam builder UI
   */
  moveMediaGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);
      const mediaGroupId = parseInt(req.params.mediaGroupId);

      if (isNaN(examId) || isNaN(mediaGroupId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID or media group ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const { newOrderIndex } = req.body;

      if (!newOrderIndex || isNaN(parseInt(newOrderIndex))) {
        res.status(400).json({
          success: false,
          message: 'New order index is required',
          error: 'INVALID_REQUEST',
        });
        return;
      }

      const userId = req.user!.userId;

      const movedCount = await this.examService.moveMediaGroupInExam(
        examId,
        mediaGroupId,
        parseInt(newOrderIndex),
        userId
      );

      res.status(200).json({
        success: true,
        message: `Moved ${movedCount} question(s) to new position`,
        data: { movedCount, newStartOrderIndex: newOrderIndex },
      });
    }
  );

  /**
   * GET /api/exam/exams/:examId/media-groups-summary
   * 
   * Get quick summary của media groups trong exam
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Response includes:
   *   - Total questions và breakdown
   *   - Media groups list với question counts
   *   - Section distribution
   * 
   * Use case: Dashboard hoặc exam list cần show
   * quick overview của exam structure
   */
  getMediaGroupSummary = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);

      if (isNaN(examId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const summary = await this.examService.getExamMediaGroupSummary(examId);

      res.status(200).json({
        success: true,
        data: summary,
      });
    }
  );

  /**
   * POST /api/exam/exams/:examId/validate-structure
   * 
   * Validate exam structure
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Returns:
   *   - isValid: Boolean
   *   - issues: Array of issue descriptions
   * 
   * Use case: Trước khi publish exam, check xem
   * có structural issues không (gaps, duplicates, etc.)
   */
  validateStructure = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);

      if (isNaN(examId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const validation = await this.examService.validateExamStructure(examId);

      const statusCode = validation.isValid ? 200 : 422;

      res.status(statusCode).json({
        success: validation.isValid,
        message: validation.isValid 
          ? 'Exam structure is valid' 
          : 'Exam structure has issues',
        data: validation,
      });
    }
  );

  /**
   * POST /api/exam/exams/:examId/compact-order
   * 
   * Auto-fix OrderIndex gaps trong exam
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Response includes số questions được reorder
   * 
   * Use case: Sau khi xóa nhiều questions/groups,
   * OrderIndex có gaps. Method này compact lại thành
   * sequence liên tục (1, 2, 3, 4...)
   */
  compactOrder = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);

      if (isNaN(examId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const userId = req.user!.userId;

      const reorderedCount = await this.examService.compactExamOrder(
        examId,
        userId
      );

      res.status(200).json({
        success: true,
        message: `Compacted order for ${reorderedCount} question(s)`,
        data: { reorderedCount },
      });
    }
  );

  /**
   * PUT /api/exam/exams/:examId/questions/:oldQuestionId/replace
   * 
   * Replace một question bằng question khác
   * 
   * Request body:
   *   - newQuestionId: ID của question mới
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Use case: Giáo viên muốn swap một câu hỏi
   * mà không phải remove và re-add
   */
  replaceQuestion = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);
      const oldQuestionId = parseInt(req.params.oldQuestionId);

      if (isNaN(examId) || isNaN(oldQuestionId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID or question ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const { newQuestionId } = req.body;

      if (!newQuestionId || isNaN(parseInt(newQuestionId))) {
        res.status(400).json({
          success: false,
          message: 'New question ID is required',
          error: 'INVALID_REQUEST',
        });
        return;
      }

      const userId = req.user!.userId;

      const success = await this.examService.replaceQuestionInExam(
        examId,
        oldQuestionId,
        parseInt(newQuestionId),
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Question replaced successfully',
        data: { success },
      });
    }
  );

  /**
   * GET /api/exam/exams/:examId/next-order-index
   * 
   * Get next available OrderIndex trong exam
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Response: { nextOrderIndex: number }
   * 
   * Use case: UI tạo đề cần biết OrderIndex tiếp theo
   * available khi add questions/groups
   */
  getNextOrderIndex = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const examId = parseInt(req.params.examId);

      if (isNaN(examId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid exam ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const nextIndex = await this.examService
        .getNextOrderIndex(examId);

      res.status(200).json({
        success: true,
        data: { nextOrderIndex: nextIndex },
      });
    }
  );

  // ================ Exam Type Management ================= //

  getExamTypes = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examTypes = await this.examService.getExamTypes();
    
    res.status(200).json({
      success: true,
      data: examTypes,
    });
  });

  createExamType = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const createDto: CreateExamTypeDto = req.body;
    const examType = await this.examService.createExamType(createDto);
    
    res.status(201).json({
      success: true,
      message: 'Exam type created successfully',
      data: examType,
    });
  });

  updateExamType = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam type ID',
      });
      return;
    }

    const updateDto: UpdateExamTypeDto = req.body;
    const examType = await this.examService.updateExamType(id, updateDto);
    
    res.status(200).json({
      success: true,
      message: 'Exam type updated successfully',
      data: examType,
    });
  });

  deleteExamType = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam type ID',
      });
      return;
    }

    const deleted = await this.examService.deleteExamType(id);
    
    res.status(200).json({
      success: true,
      message: 'Exam type deleted successfully',
      data: { deleted },
    });
  });
}
import { Response } from 'express';
import { QuestionService } from '../../application/services/question.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  QuestionFilterDto,
  BulkQuestionOperationDto,
} from '../../application/dtos/question.dto';
import { asyncHandler } from '../middlewares/error.middleware';

/**
 * QuestionController handles all HTTP requests related to question management
 * 
 * This controller is primarily used by administrators and teachers for
 * managing the question bank. It provides CRUD operations plus search
 * and analytics functionality.
 * 
 * Questions are the building blocks of exams. A well-managed question
 * bank allows quick creation of high-quality exams.
 */
export class QuestionController {
  private questionService: QuestionService;

  constructor() {
    this.questionService = new QuestionService();
  }

  /**
   * Create a new question
   * 
   * POST /api/exam/questions
   * 
   * Request body: CreateQuestionDto (validated by middleware)
   *   - QuestionText: The question stem
   *   - Media: Audio/image URLs, scripts
   *   - Choices: Array of answer options with one marked correct
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint creates a complete question with all its components
   * (question text, media, and choices) in a single transaction.
   * 
   * The validation middleware ensures all required data is present and
   * properly formatted before reaching this controller.
   * 
   * @param req - Authenticated request with CreateQuestionDto
   * @param res - Response object
   */
  create = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const createQuestionDto: CreateQuestionDto = req.body;
    const userId = req.user!.userId;

    // Service handles complex transaction of creating question, media, and choices
    const question = await this.questionService.createQuestion(
      createQuestionDto,
      userId
    );

    res.status(201).json({
      success: true,
      message: 'Question created successfully',
      data: question,
    });
  });

  /**
   * Get question by ID
   * 
   * GET /api/exam/questions/:id
   * 
   * Path params: id (question ID)
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint retrieves complete question details including the
   * correct answer. It should only be accessible to teachers and admins,
   * not students (who see questions through exams with IsCorrect hidden).
   * 
   * @param req - Authenticated request with question ID
   * @param res - Response object
   */
  getById = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const questionId = parseInt(req.params.id);

    if (isNaN(questionId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid question ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const question = await this.questionService.getQuestionById(questionId);

    res.status(200).json({
      success: true,
      data: question,
    });
  });

  /**
   * Search and filter questions
   * 
   * GET /api/exam/questions
   * 
   * Query params: QuestionFilterDto (validated by middleware)
   *   - Skill: LISTENING or READING
   *   - Section: Part 1-7
   *   - Type: Question type
   *   - SearchText: Text search in question or script
   *   - Page, Limit: Pagination
   * Requires: Authentication, Teacher or Admin role
   * 
   * This is the core endpoint for the question bank UI. It allows
   * teachers and admins to browse, search, and filter questions when
   * building exams or managing content.
   * 
   * Results are paginated for performance with potentially thousands
   * of questions in the database.
   * 
   * @param req - Authenticated request with query filters
   * @param res - Response object
   */
  search = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Query params are validated and transformed by validateQuery middleware
    const filters: QuestionFilterDto = req.query as any;

    const result = await this.questionService.searchQuestions(filters);

    res.status(200).json({
      success: true,
      data: result.Questions,
      pagination: result.Pagination,
    });
  });

  /**
   * Update an existing question
   * 
   * PUT /api/exam/questions/:id
   * 
   * Path params: id (question ID)
   * Request body: UpdateQuestionDto (validated by middleware)
   * Requires: Authentication, Teacher or Admin role
   * 
   * This allows updating any aspect of a question: text, media, or choices.
   * 
   * Important: Updating a question affects all exams that use it. The
   * service logs a warning if the question is widely used, but in
   * production you might want stricter controls.
   * 
   * @param req - Authenticated request with question ID and UpdateQuestionDto
   * @param res - Response object
   */
  update = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const questionId = parseInt(req.params.id);

    if (isNaN(questionId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid question ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const updateQuestionDto: UpdateQuestionDto = req.body;
    const userId = req.user!.userId;

    const updatedQuestion = await this.questionService.updateQuestion(
      questionId,
      updateQuestionDto,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Question updated successfully',
      data: updatedQuestion,
    });
  });

  /**
   * Delete a question
   * 
   * DELETE /api/exam/questions/:id
   * 
   * Path params: id (question ID)
   * Requires: Authentication, Admin role
   * 
   * This removes a question from the system. The service will reject
   * deletion if the question is still used in any exams, preventing
   * broken exam content.
   * 
   * Only admins should be able to delete questions. The authorization
   * middleware enforces this at the route level.
   * 
   * @param req - Authenticated request with question ID
   * @param res - Response object
   */
  delete = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const questionId = parseInt(req.params.id);

    if (isNaN(questionId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid question ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const userId = req.user!.userId;

    const deleted = await this.questionService.deleteQuestion(questionId, userId);

    res.status(200).json({
      success: true,
      message: 'Question deleted successfully',
      data: { deleted },
    });
  });

  /**
   * Get question usage statistics
   * 
   * GET /api/exam/questions/:id/statistics
   * 
   * Path params: id (question ID)
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint provides insights into how a question is being used:
   * - How many exams include it
   * - How many students have attempted it
   * - Success rate (percentage who got it correct)
   * - Estimated difficulty
   * 
   * Teachers and admins use this to evaluate question quality.
   * 
   * @param req - Authenticated request with question ID
   * @param res - Response object
   */
  getStatistics = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const questionId = parseInt(req.params.id);

    if (isNaN(questionId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid question ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const statistics = await this.questionService.getQuestionStatistics(questionId);

    res.status(200).json({
      success: true,
      data: statistics,
    });
  });

  /**
   * Get questions by section
   * 
   * GET /api/exam/questions/by-section
   * 
   * Query params:
   *   - sections: Comma-separated section numbers (e.g., "5,6,7")
   *   - limit: (optional) Maximum number of questions
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint is used when building exams or creating practice
   * sessions focused on specific parts of the TOEIC test.
   * 
   * @param req - Authenticated request with section query params
   * @param res - Response object
   */
  getBySection = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const sectionsParam = req.query.sections as string;
    const limitParam = req.query.limit as string;

    if (!sectionsParam) {
      res.status(400).json({
        success: false,
        message: 'Sections parameter is required',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    // Parse comma-separated sections
    const sections = sectionsParam.split(',').map(s => s.trim());
    const limit = limitParam ? parseInt(limitParam) : undefined;

    const questions = await this.questionService.getQuestionsBySection(
      sections,
      limit
    );

    res.status(200).json({
      success: true,
      data: questions,
      count: questions.length,
    });
  });

  /**
   * Perform bulk operations on questions
   * 
   * POST /api/exam/questions/bulk
   * 
   * Request body: BulkQuestionOperationDto
   *   - QuestionIDs: Array of question IDs
   *   - Operation: DELETE, ADD_TO_EXAM, etc.
   *   - TargetExamID: (for ADD_TO_EXAM operation)
   * Requires: Authentication, Admin role
   * 
   * This endpoint allows efficient operations on multiple questions
   * at once, such as bulk deletion or adding many questions to an exam.
   * 
   * Only admins should have access to bulk operations due to their
   * potentially destructive nature.
   * 
   * @param req - Authenticated request with BulkQuestionOperationDto
   * @param res - Response object
   */
  bulkOperation = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const operationDto: BulkQuestionOperationDto = req.body;
    const userId = req.user!.userId;

    const result = await this.questionService.performBulkOperation(
      operationDto,
      userId
    );

    res.status(200).json({
      success: true,
      message: `Bulk operation completed: ${result.success} succeeded, ${result.failed} failed`,
      data: result,
    });
  });
}
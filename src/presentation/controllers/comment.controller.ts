import { Response } from 'express';
import { CommentService } from '../../application/services/comment.service';
import { AuthenticatedRequest, getStudentProfileId } from '../middlewares/auth.middleware';
import {
  CreateCommentDto,
  UpdateCommentDto,
  ModerateCommentDto,
  CommentFilterDto,
} from '../../application/dtos/comment.dto';
import { asyncHandler } from '../middlewares/error.middleware';

/**
 * CommentController handles all HTTP requests related to comment/discussion features
 * 
 * This controller enables social learning by allowing students to:
 * - Post questions and comments on exams
 * - Reply to others' comments (threaded discussions)
 * - Search for specific topics
 * 
 * It also provides moderation features for teachers and admins to maintain
 * healthy discussions and remove inappropriate content.
 */
export class CommentController {
  private commentService: CommentService;

  constructor() {
    this.commentService = new CommentService();
  }

  /**
   * Create a new comment or reply
   * 
   * POST /api/exam/comments
   * 
   * Request body: CreateCommentDto (validated by middleware)
   *   - Content: The comment text
   *   - ExamID: Which exam this comment is about
   *   - ParentId: (optional) For replies, the parent comment ID
   * Requires: Authentication
   * 
   * This endpoint handles both top-level comments (new discussions) and
   * replies to existing comments (continuing a discussion thread).
   * 
   * The distinction is made through ParentId:
   * - ParentId = 0 or omitted: New top-level comment
   * - ParentId > 0: Reply to that comment
   * 
   * The studentProfileId is extracted from the authenticated user's token,
   * not from the request body. This prevents users from impersonating
   * other students.
   * 
   * @param req - Authenticated request with CreateCommentDto
   * @param res - Response object
   */
  create = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const createCommentDto: CreateCommentDto = req.body;
    const studentProfileId = getStudentProfileId(req);

    // Service handles validation and creation
    const comment = await this.commentService.createComment(
      createCommentDto,
      studentProfileId
    );

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: comment,
    });
  });

  /**
   * Get comments for an exam
   * 
   * GET /api/exam/exams/:examId/comments
   * 
   * Path params: examId
   * Query params: CommentFilterDto (optional)
   *   - ParentId: Get top-level (0) or replies to specific comment
   *   - Status: Filter by approval status
   *   - Page, Limit: Pagination
   * Requires: Authentication
   * 
   * This endpoint retrieves comments for display on the exam page.
   * By default, it returns only approved top-level comments, paginated.
   * 
   * The frontend can then load replies on-demand when users expand
   * a discussion thread by calling this endpoint with ParentId set
   * to the comment they want to see replies for.
   * 
   * @param req - Authenticated request with exam ID and optional filters
   * @param res - Response object
   */
  getExamComments = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.examId);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    // Extract optional filters from query parameters
    const filters: CommentFilterDto = {
      ExamID: examId,
      Status: req.query.status ? parseInt(req.query.status as string) : undefined,
      ParentId: req.query.parentId ? parseInt(req.query.parentId as string) : undefined,
      Page: req.query.page ? parseInt(req.query.page as string) : undefined,
      Limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };

    const result = await this.commentService.getExamComments(examId, filters);

    res.status(200).json({
      success: true,
      data: result.Comments,
      pagination: result.Pagination,
    });
  });

  /**
   * Get complete comment thread
   * 
   * GET /api/exam/comments/:commentId/thread
   * 
   * Path params: commentId
   * Requires: Authentication
   * 
   * This endpoint retrieves a comment and all its nested replies
   * recursively, building a complete discussion tree.
   * 
   * The response includes the parent comment with a 'replies' array,
   * and each reply can have its own 'replies' array, creating a
   * tree structure perfect for rendering threaded discussions.
   * 
   * @param req - Authenticated request with comment ID
   * @param res - Response object
   */
  getThread = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const commentId = parseInt(req.params.commentId);

    if (isNaN(commentId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const thread = await this.commentService.getCommentThread(commentId);

    res.status(200).json({
      success: true,
      data: thread,
    });
  });

  /**
   * Update a comment
   * 
   * PUT /api/exam/comments/:commentId
   * 
   * Path params: commentId
   * Request body: UpdateCommentDto
   *   - Content: New comment text
   * Requires: Authentication, Ownership
   * 
   * This allows users to edit their own comments. The service verifies
   * that the authenticated user is the original comment author before
   * allowing the update.
   * 
   * Only the content can be updated - users can't change which exam
   * or parent comment the comment is attached to.
   * 
   * @param req - Authenticated request with comment ID and UpdateCommentDto
   * @param res - Response object
   */
  update = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const commentId = parseInt(req.params.commentId);

    if (isNaN(commentId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const updateCommentDto: UpdateCommentDto = req.body;
    const studentProfileId = getStudentProfileId(req);

    // Service verifies ownership before updating
    const updatedComment = await this.commentService.updateComment(
      commentId,
      updateCommentDto,
      studentProfileId
    );

    res.status(200).json({
      success: true,
      message: 'Comment updated successfully',
      data: updatedComment,
    });
  });

  /**
   * Delete a comment
   * 
   * DELETE /api/exam/comments/:commentId
   * 
   * Path params: commentId
   * Requires: Authentication, Ownership or Admin role
   * 
   * This removes a comment and all its nested replies recursively.
   * 
   * Security rules:
   * - Authors can delete their own comments
   * - Admins and teachers can delete any comment (moderation)
   * 
   * The authorization middleware checks the role, and the service
   * checks ownership if not admin.
   * 
   * @param req - Authenticated request with comment ID
   * @param res - Response object
   */
  delete = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const commentId = parseInt(req.params.commentId);

    if (isNaN(commentId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const studentProfileId = getStudentProfileId(req);
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'TEACHER';

    const deleted = await this.commentService.deleteComment(
      commentId,
      studentProfileId,
      isAdmin
    );

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
      data: { deleted },
    });
  });

  /**
   * Moderate comment (admin/teacher only)
   * 
   * PATCH /api/exam/comments/:commentId/moderate
   * 
   * Path params: commentId
   * Request body: ModerateCommentDto
   *   - Status: 1 (approved), 2 (hidden), or 3 (flagged)
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint allows moderators to change comment status:
   * - Approve pending comments (0 → 1)
   * - Hide inappropriate content (any → 2)
   * - Flag for further review (any → 3)
   * 
   * The authorization middleware ensures only teachers and admins
   * can access this endpoint.
   * 
   * @param req - Authenticated request with comment ID and ModerateCommentDto
   * @param res - Response object
   */
  moderate = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const commentId = parseInt(req.params.commentId);

    if (isNaN(commentId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const moderateCommentDto: ModerateCommentDto = req.body;

    const updatedComment = await this.commentService.moderateComment(
      commentId,
      moderateCommentDto
    );

    res.status(200).json({
      success: true,
      message: 'Comment moderation applied successfully',
      data: updatedComment,
    });
  });

  /**
   * Get student's comments
   * 
   * GET /api/exam/students/:studentProfileId/comments
   * 
   * Path params: studentProfileId
   * Query params: limit (optional)
   * Requires: Authentication
   * 
   * This endpoint retrieves all comments by a specific student.
   * Useful for user profile pages showing their activity.
   * 
   * Students can view their own comments. Teachers and admins can
   * view any student's comments for moderation purposes.
   * 
   * @param req - Authenticated request with student profile ID
   * @param res - Response object
   */
  getStudentComments = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const studentProfileId = parseInt(req.params.studentProfileId);

    if (isNaN(studentProfileId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid student profile ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    // Check authorization: can view own comments or must be teacher/admin
    const isOwn = req.user?.studentProfileId === studentProfileId;
    const isModerator = req.user?.role === 'ADMIN' || req.user?.role === 'TEACHER';

    if (!isOwn && !isModerator) {
      res.status(403).json({
        success: false,
        message: 'You can only view your own comments',
        error: 'FORBIDDEN',
      });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const comments = await this.commentService.getStudentComments(
      studentProfileId,
      limit
    );

    res.status(200).json({
      success: true,
      data: comments,
      count: comments.length,
    });
  });

  /**
   * Get flagged comments for moderation
   * 
   * GET /api/exam/comments/flagged
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * This endpoint returns all comments that have been flagged for
   * review (Status = 3), creating a moderation queue.
   * 
   * Teachers and admins use this to review potentially problematic
   * content and decide whether to approve, hide, or leave flagged.
   * 
   * @param req - Authenticated request
   * @param res - Response object
   */
  getFlagged = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const flaggedComments = await this.commentService.getFlaggedComments();

    res.status(200).json({
      success: true,
      data: flaggedComments,
      count: flaggedComments.length,
    });
  });

  /**
   * Search comments
   * 
   * GET /api/exam/comments/search
   * 
   * Query params:
   *   - q: Search term (required)
   *   - examId: (optional) Limit search to specific exam
   * Requires: Authentication
   * 
   * This endpoint searches for comments containing specific text.
   * Useful for finding discussions about particular topics or problems.
   * 
   * @param req - Authenticated request with search query
   * @param res - Response object
   */
  search = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const searchText = req.query.q as string;
    const examId = req.query.examId ? parseInt(req.query.examId as string) : undefined;

    if (!searchText || searchText.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Search term (q) is required',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const comments = await this.commentService.searchComments(searchText, examId);

    res.status(200).json({
      success: true,
      data: comments,
      count: comments.length,
    });
  });

  /**
   * Get comment count for an exam
   * 
   * GET /api/exam/exams/:examId/comment-count
   * 
   * Path params: examId
   * Requires: Authentication
   * 
   * This endpoint returns the total number of approved comments
   * for a specific exam. Displayed on exam cards to show activity level.
   * 
   * @param req - Authenticated request with exam ID
   * @param res - Response object
   */
  getCount = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const examId = parseInt(req.params.examId);

    if (isNaN(examId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid exam ID',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    const count = await this.commentService.getExamCommentCount(examId);

    res.status(200).json({
      success: true,
      data: { count },
    });
  });

  /**
   * Get all comments with optional filtering and pagination
   * 
   * GET /api/exam/comments
   * 
   * Query params:
   *   - page: Page number (default: 1)
   *   - limit: Items per page (default: 20)
   *   - examId: (optional) Filter by specific exam
   *   - status: (optional) Filter by approval status (1=approved, 2=hidden, 3=flagged)
   *   - sortBy: (optional) Sort field (createdAt, updatedAt, likes) - default: createdAt
   *   - order: (optional) ASC or DESC - default: DESC
   * Requires: Authentication
   * 
   * This endpoint retrieves all comments across the entire system with
   * powerful filtering and pagination capabilities.
   * 
   * Use cases:
   * - Dashboard showing all recent comments
   * - Moderation panel showing all comments for review
   * - Admin analytics on discussion activity
   * - Search results integration
   * 
   * By default, only approved comments (Status = 1) are returned.
   * Admins/Teachers can use status filter to see hidden or flagged comments.
   * 
   * The response includes pagination metadata to help frontend handle
   * large result sets:
   * - page: Current page number
   * - limit: Items per page
   * - total: Total count of matching comments
   * - totalPages: Number of pages
   * - hasMore: Whether there are more pages to load
   * 
   * This is useful for lazy loading or infinite scroll implementations.
   * 
   * @param req - Authenticated request with optional query parameters
   * @param res - Response object
   */
  getAll = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // Extract and validate pagination parameters
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    if (isNaN(page) || page < 1) {
      res.status(400).json({
        success: false,
        message: 'Page must be a positive integer',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    // Extract optional filter parameters
    const examId = req.query.examId ? parseInt(req.query.examId as string) : undefined;
    const status = req.query.status ? parseInt(req.query.status as string) : undefined;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const order = (req.query.order as string) || 'DESC';

    // Validate sort order
    if (!['ASC', 'DESC'].includes(order.toUpperCase())) {
      res.status(400).json({
        success: false,
        message: 'Order must be ASC or DESC',
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    // Validate sort field
    const allowedSortFields = ['createdAt', 'updatedAt', 'likes'];
    if (!allowedSortFields.includes(sortBy)) {
      res.status(400).json({
        success: false,
        message: `SortBy must be one of: ${allowedSortFields.join(', ')}`,
        error: 'INVALID_PARAMETER',
      });
      return;
    }

    // Call service with all parameters
    const result = await this.commentService.getAllComments({
      page,
      limit,
      examId,
      status,
      sortBy,
      order: order.toUpperCase() as 'ASC' | 'DESC',
    });

    res.status(200).json({
      success: true,
      message: 'Comments retrieved successfully',
      data: result.comments,
      pagination: result.pagination,
    });
  });
}
import { Response } from 'express';
import { ExamService } from '../../application/services/exam.service';
import { MediaGroupService } from '../../application/services/media-group.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';
import {
  CreateMediaGroupDto,
  UpdateMediaGroupDto,
  MediaGroupFilterDto,
  AddMediaGroupToExamDto,
} from '../../application/dtos/media-group.dto';

/**
 * MediaGroupController xử lý tất cả HTTP requests liên quan đến media groups
 * 
 * Controller này cung cấp API endpoints để:
 * 1. Browse và search media groups (cho UI tạo đề)
 * 2. Tạo media groups mới (tạo nhóm câu hỏi)
 * 3. View chi tiết của một group (preview trước khi add)
 * 4. Add media groups vào exams (thay vì add từng câu)
 * 5. Quản lý metadata của groups
 * 
 * Workflow điển hình:
 * - Giáo viên browse danh sách media groups với filters
 * - Click vào một group để xem detail/preview
 * - Quyết định add group vào exam
 * - System tự động add tất cả questions trong group
 */
export class MediaGroupController {
  private examService: ExamService;
  private mediaGroupService: MediaGroupService;

  constructor() {
    this.examService = new ExamService();
    this.mediaGroupService = new MediaGroupService();
  }

  /**
   * GET /api/exam/media-groups
   * 
   * Lấy danh sách media groups với filtering và pagination
   * 
   * Query params: MediaGroupFilterDto
   *   - Skill: LISTENING hoặc READING
   *   - Section: Part 1-7
   *   - Difficulty: EASY, MEDIUM, HARD
   *   - Tags: Array of tags để filter
   *   - SearchText: Tìm trong title/description
   *   - Page, Limit: Pagination
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Response trả về list của media groups với:
   * - Thông tin cơ bản (title, skill, section)
   * - Số lượng questions trong group
   * - Preview text của câu đầu tiên
   * - Usage statistics
   * 
   * Use case: UI tạo đề thi cần list các media groups
   * có thể add vào exam
   */
  getMediaGroups = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      // Extract filters từ query params
      // Middleware đã validate và transform sang correct types
      const filters: MediaGroupFilterDto = req.query as any;

      // Call service để get media groups
      const result = await this.mediaGroupService.getMediaGroupsForBrowsing(
        filters
      );

      res.status(200).json({
        success: true,
        data: result.groups,
        pagination: result.pagination,
        total: result.total,
      });
    }
  );

  /**
   * GET /api/exam/media-groups/:id
   * 
   * Lấy chi tiết đầy đủ của một media group
   * 
   * Path params:
   *   - id: Media question ID
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Response bao gồm:
   * - Full media content (audio URL, script, image)
   * - Tất cả questions trong group với choices
   * - Metadata (difficulty, tags, description)
   * 
   * Use case: Giáo viên click vào một group để preview
   * toàn bộ nội dung trước khi add vào exam
   */
  getMediaGroupDetail = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const mediaGroupId = parseInt(req.params.id);

      if (isNaN(mediaGroupId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid media group ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const detail = await this.mediaGroupService.getMediaGroupDetail(
        mediaGroupId
      );

      res.status(200).json({
        success: true,
        data: detail,
      });
    }
  );

  /**
   * POST /api/exam/media-groups
   * 
   * Tạo một media group mới (media + multiple questions)
   * 
   * Request body: CreateMediaGroupDto
   *   - Title: Tiêu đề cho group
   *   - Description: Mô tả chi tiết
   *   - Media: Audio/image/script content
   *   - Questions: Array of questions với choices
   *   - Difficulty: EASY/MEDIUM/HARD
   *   - Tags: Array of tags
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Workflow:
   * 1. Create MediaQuestion với media content
   * 2. Create tất cả Questions liên kết với media
   * 3. Create Choices cho mỗi question
   * 4. Return complete media group
   * 
   * Use case: Giáo viên tạo một Part 7 passage với 3 câu hỏi.
   * Thay vì tạo riêng lẻ, họ tạo tất cả cùng lúc trong một form.
   */
  createMediaGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const createDto: CreateMediaGroupDto = req.body;
      const userId = req.user!.userId;

      // Validate rằng có ít nhất 1 question
      if (!createDto.Questions || createDto.Questions.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Media group must have at least one question',
          error: 'VALIDATION_ERROR',
        });
        return;
      }

      // Call service để tạo complete media group
      const mediaGroup = await this.mediaGroupService.createMediaGroup(
        createDto,
        userId
      );

      res.status(201).json({
        success: true,
        message: `Media group created successfully with ${mediaGroup.Questions.length} questions`,
        data: mediaGroup,
      });
    }
  );

  /**
   * PUT /api/exam/media-groups/:id
   * 
   * Update metadata của một media group
   * 
   * Path params:
   *   - id: Media question ID
   * 
   * Request body: UpdateMediaGroupDto
   *   - Title, Description (optional)
   *   - Difficulty, Tags (optional)
   *   - Media content (optional)
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Note: Để update questions, sử dụng separate endpoints
   * cho add/remove/update questions
   */
  updateMediaGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const mediaGroupId = parseInt(req.params.id);

      if (isNaN(mediaGroupId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid media group ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const updateDto: UpdateMediaGroupDto = req.body;

      const updated = await this.mediaGroupService.updateMediaGroupMetadata(
        mediaGroupId,
        updateDto
      );

      res.status(200).json({
        success: true,
        message: 'Media group updated successfully',
        data: updated,
      });
    }
  );

  /**
   * DELETE /api/exam/media-groups/:id
   * 
   * Xóa một media group và tất cả questions của nó
   * 
   * Path params:
   *   - id: Media question ID
   * 
   * Requires: Authentication, Admin role
   * 
   * LƯU Ý: Operation này sẽ xóa:
   * - MediaQuestion record
   * - Tất cả Question records liên kết
   * - Tất cả Choice records
   * - ExamQuestion associations
   * 
   * Nếu media group đang được sử dụng trong exams,
   * operation sẽ fail với error message.
   */
  deleteMediaGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const mediaGroupId = parseInt(req.params.id);

      if (isNaN(mediaGroupId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid media group ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const deleted = await this.mediaGroupService.deleteMediaGroup(
        mediaGroupId
      );

      res.status(200).json({
        success: true,
        message: 'Media group deleted successfully',
        data: { deleted },
      });
    }
  );

  /**
   * POST /api/exam/exams/:examId/media-groups
   * 
   * Add một media group (và tất cả questions) vào exam
   * 
   * Path params:
   *   - examId: Exam ID
   * 
   * Request body: AddMediaGroupToExamDto
   *   - MediaGroupID: ID của media group muốn add
   *   - OrderIndex: Vị trí bắt đầu trong exam
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Workflow:
   * 1. Validate exam exists và user có permission
   * 2. Validate media group exists và có questions
   * 3. Lấy tất cả questions trong group
   * 4. Sort questions theo OrderInGroup
   * 5. Tạo ExamQuestion records với OrderIndex tuần tự
   * 6. Return updated exam
   * 
   * Use case: Giáo viên đang tạo đề, browse media groups,
   * chọn một Part 7 passage, click "Add to Exam".
   * System tự động add cả 3 câu hỏi vào đề.
   */
  addMediaGroupToExam = asyncHandler(
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

      const addDto: AddMediaGroupToExamDto = req.body;
      const userId = req.user!.userId;

      // Call service để add media group
      const result = await this.examService.addMediaGroupToExam(
        examId,
        addDto.MediaGroupID,
        addDto.OrderIndex,
        userId
      );

      res.status(200).json({
        success: true,
        message: `Media group added to exam successfully with ${result.questionsAdded} questions`,
        data: result.exam,
      });
    }
  );

  /**
   * DELETE /api/exam/exams/:examId/media-groups/:mediaGroupId
   * 
   * Remove một media group khỏi exam
   * 
   * Path params:
   *   - examId: Exam ID
   *   - mediaGroupId: Media group ID
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Operation này sẽ tìm tất cả ExamQuestion records
   * có MediaQuestionID = mediaGroupId và xóa chúng.
   * 
   * Đảm bảo rằng khi xóa, toàn bộ group được xóa,
   * không để lại câu hỏi "mồ côi".
   */
  removeMediaGroupFromExam = asyncHandler(
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
   * Get nội dung exam được organize theo media groups
   * 
   * Path params:
   *   - examId: Exam ID
   * 
   * Requires: Authentication
   * 
   * Response structure:
   * - mediaGroups: Array of groups với questions
   * - standaloneQuestions: Questions không thuộc group nào
   * 
   * Use case: UI hiển thị exam content một cách organized.
   * Media được show một lần cho cả group thay vì lặp lại.
   */
  getExamContentOrganized = asyncHandler(
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
   * GET /api/exam/media-groups/:id/statistics
   * 
   * Get usage statistics của một media group
   * 
   * Path params:
   *   - id: Media question ID
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Response includes:
   * - Số lượng questions trong group
   * - Số lượng exams sử dụng group này
   * - Số lần group được attempt bởi students
   * - Average success rate
   * 
   * Use case: Giáo viên muốn biết media group nào
   * popular và được sử dụng nhiều
   */
  getMediaGroupStatistics = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const mediaGroupId = parseInt(req.params.id);

      if (isNaN(mediaGroupId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid media group ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const stats = await this.mediaGroupService.getMediaGroupStatistics(
        mediaGroupId
      );

      res.status(200).json({
        success: true,
        data: stats,
      });
    }
  );

  /**
   * POST /api/exam/media-groups/:id/clone
   * 
   * Clone/duplicate một media group
   * 
   * Path params:
   *   - id: Media question ID to clone
   * 
   * Request body:
   *   - newTitle: Title cho cloned group (optional)
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Operation này tạo:
   * - Copy của MediaQuestion
   * - Copy của tất cả Questions
   * - Copy của tất cả Choices
   * 
   * Use case: Giáo viên muốn tạo variation của một
   * existing group (ví dụ: cùng passage nhưng câu hỏi khác)
   */
  cloneMediaGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const mediaGroupId = parseInt(req.params.id);

      if (isNaN(mediaGroupId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid media group ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const { newTitle } = req.body;
      const userId = req.user!.userId;

      const cloned = await this.mediaGroupService.cloneMediaGroup(
        mediaGroupId,
        userId,
        newTitle
      );

      res.status(201).json({
        success: true,
        message: 'Media group cloned successfully',
        data: cloned,
      });
    }
  );

  /**
   * POST /api/exam/media-groups/:id/questions
   * 
   * Add thêm question vào một existing media group
   * 
   * Path params:
   *   - id: Media question ID
   * 
   * Request body:
   *   - QuestionText, OrderInGroup, Choices
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * Use case: Giáo viên muốn thêm thêm câu hỏi vào
   * một passage hiện có
   */
  addQuestionToGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const mediaGroupId = parseInt(req.params.id);

      if (isNaN(mediaGroupId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid media group ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const questionData = req.body;
      const userId = req.user!.userId;

      const question = await this.mediaGroupService.addQuestionToGroup(
        mediaGroupId,
        questionData,
        userId
      );

      res.status(201).json({
        success: true,
        message: 'Question added to media group successfully',
        data: question,
      });
    }
  );

  /**
   * DELETE /api/exam/media-groups/:id/questions/:questionId
   * 
   * Remove một question khỏi media group
   * 
   * Path params:
   *   - id: Media question ID
   *   - questionId: Question ID to remove
   * 
   * Requires: Authentication, Teacher or Admin role
   * 
   * LƯU Ý: Nếu question đang được sử dụng trong exams,
   * operation có thể fail hoặc cần confirmation
   */
  removeQuestionFromGroup = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const mediaGroupId = parseInt(req.params.id);
      const questionId = parseInt(req.params.questionId);

      if (isNaN(mediaGroupId) || isNaN(questionId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid media group ID or question ID',
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      const deleted = await this.mediaGroupService.removeQuestionFromGroup(
        mediaGroupId,
        questionId
      );

      res.status(200).json({
        success: true,
        message: 'Question removed from media group successfully',
        data: { deleted },
      });
    }
  );
}
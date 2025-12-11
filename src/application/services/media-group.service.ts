import { MediaQuestionRepository } from '../../infrastructure/repositories/media-question.repository';
import { QuestionRepository } from '../../infrastructure/repositories/question.repository';
import {
  CreateMediaGroupDto,
  UpdateMediaGroupDto,
  MediaGroupFilterDto,
} from '../dtos/media-group.dto';

/**
 * MediaGroupService handles business logic for media groups
 * 
 * Service này là layer trung gian giữa controllers và repositories,
 * thực hiện các business rules và data transformations.
 * 
 * Key responsibilities:
 * - Validate business rules khi tạo/update media groups
 * - Coordinate giữa MediaQuestion và Question repositories
 * - Transform entities sang DTOs cho client
 * - Enforce permissions và data integrity
 */
export class MediaGroupService {
  private mediaQuestionRepository: MediaQuestionRepository;
  private questionRepository: QuestionRepository;

  constructor() {
    this.mediaQuestionRepository = new MediaQuestionRepository();
    this.questionRepository = new QuestionRepository();
  }

  /**
   * Get danh sách media groups cho UI browsing
   * 
   * Method này được optimize cho use case browse và select
   * media groups khi tạo đề thi. Trả về summary information
   * đủ để UI hiển thị cards/list mà không quá nặng.
   * 
   * @param filters - Criteria để filter và paginate
   * @returns Paginated media groups với summary info
   */
  async getMediaGroupsForBrowsing(filters?: MediaGroupFilterDto): Promise<{
    groups: MediaGroupSummary[];
    total: number;
    pagination: PaginationInfo;
  }> {
    // Query media questions với filters
    // MinQuestions = 1 để chỉ lấy media có ít nhất 1 question
    const { mediaQuestions, total } = await this.mediaQuestionRepository
      .findWithFilters({
        ...filters,
        MinQuestions: 1,
      });

    // Transform mỗi media question thành summary format
    const groups = await Promise.all(
      mediaQuestions.map(async (media) => {
        // Count questions (có thể đã được load từ relation)
        const questionCount = media.questions?.length || 
          await this.questionRepository.countByMediaQuestionId(media.ID);

        // Get first question cho preview
        const firstQuestion = media.questions?.[0] ||
          await this.questionRepository.findFirstByMediaQuestionId(media.ID);

        // Get usage stats
        const usageStats = await this.mediaQuestionRepository
          .getUsageStats(media.ID);

        return {
          MediaQuestionID: media.ID,
          Title: media.GroupTitle || this.generateDefaultTitle(media),
          Description: media.GroupDescription,
          Skill: media.Skill,
          Type: media.Type,
          Section: media.Section,
          Difficulty: media.Difficulty || 'MEDIUM',
          Tags: media.Tags || [],
          QuestionCount: questionCount,
          PreviewText: this.createPreviewText(firstQuestion),
          HasAudio: !!media.AudioUrl,
          HasImage: !!media.ImageUrl,
          HasScript: !!media.Scirpt,
          UsageCount: usageStats?.usedInExams || 0,
          TotalAttempts: usageStats?.totalAttempts || 0,
          OrderIndex: media.OrderIndex,
        } as MediaGroupSummary;
      })
    );

    const page = filters?.Page || 1;
    const limit = filters?.Limit || 20;

    return {
      groups,
      total,
      pagination: {
        CurrentPage: page,
        TotalPages: Math.ceil(total / limit),
        Limit: limit,
      },
    };
  }

  /**
   * Get chi tiết đầy đủ của một media group
   * 
   * Method này trả về toàn bộ thông tin cần thiết để
   * giáo viên preview một group trước khi add vào exam:
   * - Full media content (script, audio URL, etc.)
   * - Tất cả questions với choices
   * - Metadata và statistics
   * 
   * @param mediaQuestionId - ID của media group
   * @returns Complete detail của group
   */
  async getMediaGroupDetail(mediaQuestionId: number): Promise<MediaGroupDetail> {
    const media = await this.mediaQuestionRepository.findById(
      mediaQuestionId,
      true // Include questions
    );

    if (!media) {
      throw new Error('Media group not found');
    }

    // Sort questions by OrderInGroup
    const sortedQuestions = (media.questions || [])
      .sort((a, b) => a.OrderInGroup - b.OrderInGroup);

    // Get usage stats
    const usageStats = await this.mediaQuestionRepository
      .getUsageStats(mediaQuestionId);

    return {
      MediaQuestionID: media.ID,
      Title: media.GroupTitle || this.generateDefaultTitle(media),
      Description: media.GroupDescription,
      
      Media: {
        Skill: media.Skill,
        Type: media.Type,
        Section: media.Section,
        AudioUrl: media.AudioUrl,
        ImageUrl: media.ImageUrl,
        Script: media.Scirpt,
      },

      Difficulty: media.Difficulty || 'MEDIUM',
      Tags: media.Tags || [],
      OrderIndex: media.OrderIndex,

      Questions: sortedQuestions.map(q => ({
        ID: q.ID,
        QuestionText: q.QuestionText || '',
        OrderInGroup: q.OrderInGroup,
        Choices: (q.choices || []).map(c => ({
          ID: c.ID,
          Attribute: c.Attribute || '',
          Content: c.Content || '',
          IsCorrect: c.IsCorrect,
        })),
      })),

      TotalQuestions: sortedQuestions.length,
      UsageStatistics: {
        UsedInExams: usageStats?.usedInExams || 0,
        TotalAttempts: usageStats?.totalAttempts || 0,
      },
    };
  }

  /**
   * Tạo một media group mới hoàn chỉnh
   * 
   * Method này thực hiện transaction để tạo:
   * 1. MediaQuestion với media content
   * 2. Tất cả Questions trong group
   * 3. Choices cho mỗi question
   * 
   * Nếu bất kỳ bước nào fail, toàn bộ operation được rollback.
   * 
   * @param createDto - Data để tạo media group
   * @param userId - ID của user tạo
   * @returns Created media group detail
   */
  async createMediaGroup(
    createDto: CreateMediaGroupDto,
    userId: number
  ): Promise<MediaGroupDetail> {
    // Validate business rules
    this.validateMediaGroupData(createDto);

    // Step 1: Create MediaQuestion
    const mediaQuestion = await this.mediaQuestionRepository.create({
      GroupTitle: createDto.Title,
      GroupDescription: createDto.Description,
      Skill: createDto.Media.Skill,
      Type: createDto.Media.Type,
      Section: createDto.Media.Section,
      AudioUrl: createDto.Media.AudioUrl,
      ImageUrl: createDto.Media.ImageUrl,
      Scirpt: createDto.Media.Script,
      Difficulty: createDto.Difficulty || 'MEDIUM',
      Tags: createDto.Tags || [],
      OrderIndex: createDto.OrderIndex || 0,
    });

    // Step 2: Create all Questions với Choices
    const questions = await this.questionRepository.createMultipleForMedia(
      mediaQuestion.ID,
      createDto.Questions.map(q => ({
        QuestionText: q.QuestionText,
        OrderInGroup: q.OrderInGroup,
        Choices: q.Choices,
      })),
      userId
    );

    // Return complete detail
    return await this.getMediaGroupDetail(mediaQuestion.ID);
  }

  /**
   * Update metadata của media group
   * 
   * Cho phép update title, description, difficulty, tags
   * và media content mà không ảnh hưởng đến questions.
   * 
   * @param mediaQuestionId - ID của media group
   * @param updateDto - Fields to update
   * @returns Updated media group
   */
  async updateMediaGroupMetadata(
    mediaQuestionId: number,
    updateDto: UpdateMediaGroupDto
  ): Promise<MediaGroupDetail> {
    const media = await this.mediaQuestionRepository.findById(mediaQuestionId);

    if (!media) {
      throw new Error('Media group not found');
    }

    // Prepare update data
    const updates: any = {};

    if (updateDto.Title !== undefined) {
      updates.GroupTitle = updateDto.Title;
    }
    if (updateDto.Description !== undefined) {
      updates.GroupDescription = updateDto.Description;
    }
    if (updateDto.Difficulty !== undefined) {
      updates.Difficulty = updateDto.Difficulty;
    }
    if (updateDto.Tags !== undefined) {
      updates.Tags = updateDto.Tags;
    }

    // Update media content nếu có
    if (updateDto.Media) {
      if (updateDto.Media.AudioUrl !== undefined) {
        updates.AudioUrl = updateDto.Media.AudioUrl;
      }
      if (updateDto.Media.ImageUrl !== undefined) {
        updates.ImageUrl = updateDto.Media.ImageUrl;
      }
      if (updateDto.Media.Script !== undefined) {
        updates.Scirpt = updateDto.Media.Script;
      }
    }

    // Perform update
    await this.mediaQuestionRepository.update(mediaQuestionId, updates);

    // Return updated detail
    return await this.getMediaGroupDetail(mediaQuestionId);
  }

  /**
   * Delete một media group
   * 
   * Xóa media question và tất cả questions liên quan.
   * Check trước xem có đang được sử dụng trong exams không.
   * 
   * @param mediaQuestionId - ID của media group
   * @returns True if deleted successfully
   */
  async deleteMediaGroup(mediaQuestionId: number): Promise<boolean> {
    const media = await this.mediaQuestionRepository.findById(mediaQuestionId);

    if (!media) {
      throw new Error('Media group not found');
    }

    // Check usage
    const usageStats = await this.mediaQuestionRepository
      .getUsageStats(mediaQuestionId);

    if (usageStats && usageStats.usedInExams > 0) {
      throw new Error(
        `Cannot delete media group: It is used in ${usageStats.usedInExams} exam(s)`
      );
    }

    // Delete questions first
    await this.questionRepository.deleteByMediaQuestionId(mediaQuestionId);

    // Then delete media
    return await this.mediaQuestionRepository.delete(mediaQuestionId);
  }

  /**
   * Get usage statistics của media group
   * 
   * @param mediaQuestionId - ID của media group
   * @returns Statistics object
   */
  async getMediaGroupStatistics(mediaQuestionId: number): Promise<{
    mediaGroupId: number;
    questionCount: number;
    usedInExams: number;
    totalAttempts: number;
    averageSuccessRate?: number;
  }> {
    const media = await this.mediaQuestionRepository.findById(
      mediaQuestionId,
      true
    );

    if (!media) {
      throw new Error('Media group not found');
    }

    const usageStats = await this.mediaQuestionRepository
      .getUsageStats(mediaQuestionId);

    // Calculate average success rate nếu có attempts
    let averageSuccessRate: number | undefined;
    if (media.questions && media.questions.length > 0) {
      const totalCorrect = media.questions.reduce((sum, q) => {
        const correct = q.attemptAnswers?.filter(aa => aa.IsCorrect).length || 0;
        return sum + correct;
      }, 0);

      const totalAttempts = usageStats?.totalAttempts || 0;
      if (totalAttempts > 0) {
        averageSuccessRate = Math.round((totalCorrect / totalAttempts) * 100);
      }
    }

    return {
      mediaGroupId: mediaQuestionId,
      questionCount: usageStats?.questionCount || 0,
      usedInExams: usageStats?.usedInExams || 0,
      totalAttempts: usageStats?.totalAttempts || 0,
      averageSuccessRate,
    };
  }

  /**
   * Clone một media group
   * 
   * @param mediaQuestionId - ID của media group to clone
   * @param userId - ID của user tạo clone
   * @param newTitle - Title cho cloned group
   * @returns Cloned media group detail
   */
  async cloneMediaGroup(
    mediaQuestionId: number,
    userId: number,
    newTitle?: string
  ): Promise<MediaGroupDetail> {
    const original = await this.mediaQuestionRepository.findById(
      mediaQuestionId,
      true
    );

    if (!original) {
      throw new Error('Media group not found');
    }

    // Clone media question
    const clonedMedia = await this.mediaQuestionRepository.clone(
      mediaQuestionId,
      newTitle
    );

    if (!clonedMedia) {
      throw new Error('Failed to clone media question');
    }

    // Clone questions
    await this.questionRepository.cloneQuestionsToMedia(
      mediaQuestionId,
      clonedMedia.ID,
      userId
    );

    // Return cloned detail
    return await this.getMediaGroupDetail(clonedMedia.ID);
  }

  /**
   * Add thêm question vào existing media group
   * 
   * @param mediaQuestionId - ID của media group
   * @param questionData - Data cho question mới
   * @param userId - ID của user
   * @returns Created question
   */
  async addQuestionToGroup(
    mediaQuestionId: number,
    questionData: {
      QuestionText?: string;
      OrderInGroup: number;
      Choices: Array<{
        Content: string;
        Attribute: string;
        IsCorrect: boolean;
      }>;
    },
    userId: number
  ): Promise<any> {
    const media = await this.mediaQuestionRepository.findById(mediaQuestionId);

    if (!media) {
      throw new Error('Media group not found');
    }

    // Auto-assign OrderInGroup nếu không được provide
    if (!questionData.OrderInGroup) {
      questionData.OrderInGroup = await this.questionRepository
        .getNextOrderInGroup(mediaQuestionId);
    }

    // Validate OrderInGroup uniqueness
    const isUnique = await this.questionRepository.isOrderInGroupUnique(
      mediaQuestionId,
      questionData.OrderInGroup
    );

    if (!isUnique) {
      throw new Error(
        `OrderInGroup ${questionData.OrderInGroup} is already used in this media group`
      );
    }

    // Create question
    const questions = await this.questionRepository.createMultipleForMedia(
      mediaQuestionId,
      [questionData],
      userId
    );

    return questions[0];
  }

  /**
   * Remove question khỏi media group
   * 
   * @param mediaQuestionId - ID của media group
   * @param questionId - ID của question to remove
   * @returns True if removed
   */
  async removeQuestionFromGroup(
    mediaQuestionId: number,
    questionId: number
  ): Promise<boolean> {
    const question = await this.questionRepository.findById(questionId);

    if (!question || question.MediaQuestionID !== mediaQuestionId) {
      throw new Error('Question not found in this media group');
    }

    // Check if question is used in exams
    const usageStats = await this.questionRepository.getUsageStats(questionId);
    if (usageStats && usageStats.usedInExams > 0) {
      throw new Error(
        `Cannot remove question: It is used in ${usageStats.usedInExams} exam(s)`
      );
    }

    return await this.questionRepository.delete(questionId);
  }

  // Private helper methods

  /**
   * Validate media group data trước khi create
   */
  private validateMediaGroupData(data: CreateMediaGroupDto): void {
    // Validate có ít nhất 1 question
    if (!data.Questions || data.Questions.length === 0) {
      throw new Error('Media group must have at least one question');
    }

    // Validate OrderInGroup uniqueness
    const orderNumbers = data.Questions.map(q => q.OrderInGroup);
    const uniqueOrders = new Set(orderNumbers);
    if (orderNumbers.length !== uniqueOrders.size) {
      throw new Error('OrderInGroup values must be unique within the group');
    }

    // Validate mỗi question có ít nhất 2 choices
    data.Questions.forEach((q, index) => {
      if (!q.Choices || q.Choices.length < 2) {
        throw new Error(
          `Question at position ${index + 1} must have at least 2 choices`
        );
      }

      // Validate có đúng 1 correct answer
      const correctCount = q.Choices.filter(c => c.IsCorrect).length;
      if (correctCount !== 1) {
        throw new Error(
          `Question at position ${index + 1} must have exactly one correct answer`
        );
      }
    });

    // Validate media requirements
    if (data.Media.Skill === 'LISTENING' && !data.Media.AudioUrl) {
      console.warn('Listening media group without audio URL');
    }
  }

  /**
   * Generate default title cho media nếu không có GroupTitle
   */
  private generateDefaultTitle(media: any): string {
    return `${media.Type || 'Question'} - Part ${media.Section || '?'}`;
  }

  /**
   * Create preview text từ first question
   */
  private createPreviewText(question: any): string {
    if (!question) return '';
    
    const text = question.QuestionText || '';
    const maxLength = 100;
    
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength) + '...';
  }
}

// Type definitions
interface MediaGroupSummary {
  MediaQuestionID: number;
  Title: string;
  Description?: string;
  Skill: string;
  Type: string;
  Section: string;
  Difficulty: string;
  Tags: string[];
  QuestionCount: number;
  PreviewText: string;
  HasAudio: boolean;
  HasImage: boolean;
  HasScript: boolean;
  UsageCount: number;
  TotalAttempts: number;
  OrderIndex: number;
}

interface MediaGroupDetail {
  MediaQuestionID: number;
  Title: string;
  Description?: string;
  Media: {
    Skill: string;
    Type: string;
    Section: string;
    AudioUrl?: string;
    ImageUrl?: string;
    Script?: string;
  };
  Difficulty: string;
  Tags: string[];
  OrderIndex: number;
  Questions: Array<{
    ID: number;
    QuestionText: string;
    OrderInGroup: number;
    Choices: Array<{
      ID: number;
      Attribute: string;
      Content: string;
      IsCorrect: boolean;
    }>;
  }>;
  TotalQuestions: number;
  UsageStatistics: {
    UsedInExams: number;
    TotalAttempts: number;
  };
}

interface PaginationInfo {
  CurrentPage: number;
  TotalPages: number;
  Limit: number;
}
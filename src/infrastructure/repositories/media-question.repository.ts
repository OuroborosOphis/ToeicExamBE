import { Repository, Like, In } from 'typeorm';
import { AppDataSource } from '../database/config';
import { MediaQuestion } from '../../domain/entities/media-question.entity';

/**
 * MediaQuestionRepository quản lý tất cả database operations cho MediaQuestion
 * 
 * Repository này đặc biệt quan trọng trong thiết kế mới vì MediaQuestion
 * đóng vai trò kép:
 * 1. Lưu trữ media content (audio, images, passages)
 * 2. Đại diện cho "group" của các câu hỏi liên quan
 * 
 * Các methods ở đây được thiết kế để hỗ trợ cả hai use cases này,
 * đặc biệt là việc browse và filter media groups khi tạo đề thi.
 */
export class MediaQuestionRepository {
  private repository: Repository<MediaQuestion>;

  constructor() {
    this.repository = AppDataSource.getRepository(MediaQuestion);
  }

  /**
   * Tạo một MediaQuestion mới
   * 
   * MediaQuestion này sẽ đại diện cho một "group" của questions.
   * Ví dụ: Một passage Part 7 với GroupTitle, Difficulty, Tags
   * 
   * @param mediaData - Data cho media question
   * @returns Created media question với ID
   */
  async create(mediaData: Partial<MediaQuestion>): Promise<MediaQuestion> {
    const media = this.repository.create(mediaData);
    return await this.repository.save(media);
  }

  /**
   * Tìm media question by ID
   * 
   * Eager load relationships nếu cần (ví dụ: questions)
   * 
   * @param id - Media question ID
   * @param includeQuestions - Có load questions hay không
   * @returns Media question hoặc null
   */
  async findById(
    id: number,
    includeQuestions: boolean = false
  ): Promise<MediaQuestion | null> {
    const queryBuilder = this.repository
      .createQueryBuilder('media')
      .where('media.ID = :id', { id });

    if (includeQuestions) {
      queryBuilder
        .leftJoinAndSelect('media.questions', 'questions')
        .leftJoinAndSelect('questions.choices', 'choices')
        .orderBy('questions.OrderInGroup', 'ASC');
    }

    return await queryBuilder.getOne();
  }

  /**
   * Tìm nhiều media questions by IDs
   * 
   * Useful khi cần load multiple media groups cùng lúc
   * 
   * @param ids - Array of media question IDs
   * @returns Array of media questions
   */
  async findByIds(ids: number[]): Promise<MediaQuestion[]> {
    return await this.repository.find({
      where: { ID: In(ids) },
      relations: ['questions'],
      order: {
        OrderIndex: 'ASC',
      },
    });
  }

  /**
   * Tìm media questions với advanced filtering
   * 
   * Method này là core của UI browse media groups.
   * Nó hỗ trợ filtering theo:
   * - Skill (Listening/Reading)
   * - Section (Part 1-7)
   * - Type (question type)
   * - Difficulty (Easy/Medium/Hard)
   * - Tags (multiple tags với OR logic)
   * - Search text trong title hoặc description
   * 
   * Kết quả được paginate và sort để UI dễ hiển thị.
   * 
   * @param filters - Filter criteria
   * @returns Object với mediaQuestions array và total count
   */
  async findWithFilters(filters?: {
    Skill?: string;
    Section?: string;
    Type?: string;
    Difficulty?: string;
    Tags?: string[];
    SearchText?: string;
    Page?: number;
    Limit?: number;
    MinQuestions?: number; // Filter chỉ lấy media có ít nhất X questions
  }): Promise<{ mediaQuestions: MediaQuestion[]; total: number }> {
    const page = filters?.Page || 1;
    const limit = filters?.Limit || 20;
    const skip = (page - 1) * limit;

    // Build query với QueryBuilder để có nhiều flexibility
    const queryBuilder = this.repository
      .createQueryBuilder('media')
    //   .leftJoinAndSelect('media.questions', 'questions');

    // Filter theo Skill
    if (filters?.Skill) {
      queryBuilder.andWhere('media.Skill = :skill', { skill: filters.Skill });
    }

    // Filter theo Section
    if (filters?.Section) {
      queryBuilder.andWhere('media.Section = :section', {
        section: filters.Section,
      });
    }

    // Filter theo Type
    if (filters?.Type) {
      queryBuilder.andWhere('media.Type = :type', { type: filters.Type });
    }

    // Filter theo Difficulty
    if (filters?.Difficulty) {
      queryBuilder.andWhere('media.Difficulty = :difficulty', {
        difficulty: filters.Difficulty,
      });
    }

    // Filter theo Tags
    // Tags được lưu dạng JSON array, cần xử lý đặc biệt
    if (filters?.Tags && filters.Tags.length > 0) {
      // MySQL JSON_CONTAINS hoặc simple LIKE check
      const tagConditions = filters.Tags.map(
        (tag, index) => `media.Tags LIKE :tag${index}`
      );
      queryBuilder.andWhere(`(${tagConditions.join(' OR ')})`, 
        Object.fromEntries(
          filters.Tags.map((tag, index) => [`tag${index}`, `%${tag}%`])
        )
      );
    }

    // Search text trong GroupTitle hoặc GroupDescription
    if (filters?.SearchText) {
      queryBuilder.andWhere(
        '(media.GroupTitle LIKE :searchText OR media.GroupDescription LIKE :searchText)',
        { searchText: `%${filters.SearchText}%` }
      );
    }

    // Filter chỉ lấy media có questions (group thực sự)
    // if (filters?.MinQuestions && filters.MinQuestions > 0) {
    //   queryBuilder
    //     .groupBy('media.ID')
    //     .having('COUNT(questions.ID) >= :minQuestions', {
    //       minQuestions: filters.MinQuestions,
    //     });
    // }

    /** MinQuestions filter — dùng subquery để tránh GROUP BY lỗi */
    if (filters?.MinQuestions && filters.MinQuestions > 0) {
        queryBuilder.andWhere(qb2 => {
    const sub = qb2.subQuery()
      .select('COUNT(q.ID)')
      .from('question', 'q')
      .where('q.MediaQuestionID = media.ID')
      .getQuery();

    return `(${sub}) >= :minQ`;
        }, { minQ: filters.MinQuestions });
    }

    // Count total trước khi pagination
    const total = await queryBuilder.getCount();

    // Apply pagination và ordering
    const ids = await queryBuilder
    .orderBy('media.OrderIndex', 'ASC')
    .addOrderBy('media.ID', 'DESC')
    .skip(skip)
    .take(limit)
    .select('media.ID')
    .getRawMany();

  const mediaIds = ids.map(row => row.media_ID);

  if (mediaIds.length === 0) {
    return { mediaQuestions: [], total };
  }

  /** -------------------------------------
   * 2️⃣ Query thứ hai: load đầy đủ với relations
   --------------------------------------*/
  const mediaQuestions = await this.repository.find({
    where: { ID: In(mediaIds) },
    relations: ['questions'],
    order: {
      OrderIndex: 'ASC',
      ID: 'DESC',
    },
  });

  return { mediaQuestions, total };
  }

  /**
   * Tìm tất cả media questions có ít nhất một question
   * 
   * Method này trả về danh sách các "groups" thực sự - tức là
   * các media có questions liên kết. Dùng để populate dropdown
   * hoặc list trong UI tạo đề thi.
   * 
   * @param filters - Optional filters
   * @returns Array of media questions có questions
   */
  async findMediaGroups(filters?: {
    Skill?: string;
    Section?: string;
    Limit?: number;
  }): Promise<MediaQuestion[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('media')
      .leftJoinAndSelect('media.questions', 'questions')
      .where('questions.ID IS NOT NULL'); // Chỉ lấy media có questions

    if (filters?.Skill) {
      queryBuilder.andWhere('media.Skill = :skill', { skill: filters.Skill });
    }

    if (filters?.Section) {
      queryBuilder.andWhere('media.Section = :section', {
        section: filters.Section,
      });
    }

    queryBuilder
      .orderBy('media.OrderIndex', 'ASC')
      .addOrderBy('media.ID', 'DESC');

    if (filters?.Limit) {
      queryBuilder.take(filters.Limit);
    }

    return await queryBuilder.getMany();
  }

  /**
   * Update media question
   * 
   * Cho phép update metadata của group như:
   * - GroupTitle, GroupDescription
   * - Difficulty, Tags
   * - Media content (AudioUrl, Script, etc.)
   * 
   * @param id - Media question ID
   * @param updates - Fields to update
   * @returns Updated media question
   */
  async update(
    id: number,
    updates: Partial<MediaQuestion>
  ): Promise<MediaQuestion | null> {
    const media = await this.repository.findOne({ where: { ID: id } });

    if (!media) {
      return null;
    }

    // Merge updates vào existing media
    Object.assign(media, updates);

    return await this.repository.save(media);
  }

  /**
   * Delete media question
   * 
   * LƯU Ý: Việc xóa media question sẽ ảnh hưởng đến tất cả
   * questions liên kết với nó. Cần check xem có questions nào
   * đang sử dụng hay không trước khi xóa.
   * 
   * Trong thực tế, bạn có thể implement soft delete hoặc
   * prevent deletion nếu có questions liên kết.
   * 
   * @param id - Media question ID to delete
   * @returns True if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  /**
   * Đếm số lượng questions của một media
   * 
   * Useful để hiển thị "X questions" badge trên UI
   * mà không cần load toàn bộ questions
   * 
   * @param mediaQuestionId - Media question ID
   * @returns Number of questions
   */
  async countQuestions(mediaQuestionId: number): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('media')
      .leftJoin('media.questions', 'questions')
      .where('media.ID = :id', { id: mediaQuestionId })
      .select('COUNT(questions.ID)', 'count')
      .getRawOne();

    return parseInt(result?.count || '0');
  }

  /**
   * Get usage statistics cho một media question
   * 
   * Trả về thông tin về:
   * - Số lượng questions trong group
   * - Số lượng exams sử dụng media này
   * - Số lần media này được attempt bởi students
   * 
   * Thông tin này giúp giáo viên biết media nào popular
   * và được sử dụng nhiều.
   * 
   * @param mediaQuestionId - Media question ID
   * @returns Usage statistics
   */
  async getUsageStats(mediaQuestionId: number): Promise<{
    questionCount: number;
    usedInExams: number;
    totalAttempts: number;
  } | null> {
    const media = await this.repository
      .createQueryBuilder('media')
      .leftJoinAndSelect('media.questions', 'questions')
      .leftJoinAndSelect('questions.examQuestions', 'examQuestions')
      .leftJoinAndSelect('questions.attemptAnswers', 'attemptAnswers')
      .where('media.ID = :id', { id: mediaQuestionId })
      .getOne();

    if (!media) {
      return null;
    }

    // Count unique exams
    const uniqueExams = new Set(
      media.questions?.flatMap(q => 
        q.examQuestions?.map(eq => eq.ExamID) || []
      ) || []
    );

    // Count total attempts
    const totalAttempts = media.questions?.reduce(
      (sum, q) => sum + (q.attemptAnswers?.length || 0),
      0
    ) || 0;

    return {
      questionCount: media.questions?.length || 0,
      usedInExams: uniqueExams.size,
      totalAttempts,
    };
  }

  /**
   * Search media questions by text
   * 
   * Tìm kiếm trong GroupTitle, GroupDescription, và Script
   * để giáo viên có thể tìm media theo nội dung.
   * 
   * @param searchText - Text to search for
   * @param filters - Additional filters
   * @returns Array of matching media questions
   */
  async searchByText(
    searchText: string,
    filters?: {
      Skill?: string;
      Section?: string;
      Limit?: number;
    }
  ): Promise<MediaQuestion[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('media')
      .leftJoinAndSelect('media.questions', 'questions')
      .where(
        '(media.GroupTitle LIKE :text OR media.GroupDescription LIKE :text OR media.Scirpt LIKE :text)',
        { text: `%${searchText}%` }
      );

    if (filters?.Skill) {
      queryBuilder.andWhere('media.Skill = :skill', { skill: filters.Skill });
    }

    if (filters?.Section) {
      queryBuilder.andWhere('media.Section = :section', {
        section: filters.Section,
      });
    }

    queryBuilder.orderBy('media.OrderIndex', 'ASC');

    if (filters?.Limit) {
      queryBuilder.take(filters.Limit);
    }

    return await queryBuilder.getMany();
  }

  /**
   * Get media questions by section
   * 
   * Trả về tất cả media groups của một section cụ thể.
   * Ví dụ: Lấy tất cả Part 7 passages để tạo đề focused practice.
   * 
   * @param section - Section number (1-7)
   * @param includeQuestions - Load questions hay không
   * @returns Array of media questions
   */
  async findBySection(
    section: string,
    includeQuestions: boolean = false
  ): Promise<MediaQuestion[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('media')
      .where('media.Section = :section', { section });

    if (includeQuestions) {
      queryBuilder
        .leftJoinAndSelect('media.questions', 'questions')
        .leftJoinAndSelect('questions.choices', 'choices')
        .orderBy('questions.OrderInGroup', 'ASC');
    }

    return await queryBuilder
      .orderBy('media.OrderIndex', 'ASC')
      .getMany();
  }

  /**
   * Bulk update OrderIndex cho media questions
   * 
   * Khi giáo viên muốn reorder các media groups trong một section,
   * method này cho phép update nhiều OrderIndex cùng lúc.
   * 
   * @param updates - Array of { id, orderIndex } pairs
   * @returns Number of updated records
   */
  async bulkUpdateOrder(
    updates: Array<{ id: number; orderIndex: number }>
  ): Promise<number> {
    let updatedCount = 0;

    // Use transaction để ensure atomicity
    await this.repository.manager.transaction(async (manager) => {
      for (const update of updates) {
        const result = await manager.update(
          MediaQuestion,
          { ID: update.id },
          { OrderIndex: update.orderIndex }
        );
        updatedCount += result.affected || 0;
      }
    });

    return updatedCount;
  }

  /**
   * Clone/duplicate một media question
   * 
   * Tạo một bản copy của media question và tất cả questions của nó.
   * Useful khi giáo viên muốn tạo variation của một group hiện có.
   * 
   * @param mediaQuestionId - ID of media to clone
   * @param newTitle - Title cho clone mới
   * @returns Cloned media question với questions
   */
  async clone(
    mediaQuestionId: number,
    newTitle?: string
  ): Promise<MediaQuestion | null> {
    const original = await this.findById(mediaQuestionId, true);
    
    if (!original) {
      return null;
    }

    // Create new media question
    const cloned = this.repository.create({
      ...original,
      ID: undefined, // Clear ID để tạo mới
      GroupTitle: newTitle || `${original.GroupTitle} (Copy)`,
      // Questions sẽ được clone riêng bởi QuestionRepository
    });

    return await this.repository.save(cloned);
  }
}
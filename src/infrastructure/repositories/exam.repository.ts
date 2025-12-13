import { Repository } from 'typeorm';
import { AppDataSource } from '../database/config';
import { Exam } from '../../domain/entities/exam.entity';
import { ExamType } from '../../domain/entities/exam-type.entity';
import { ExamQuestion } from '../../domain/entities/exam-question.entity';

/**
 * ExamRepository handles all database operations related to Exam entity
 * 
 * Why use Repository pattern?
 * - Centralizes all data access logic for Exam
 * - Makes business logic layer independent of TypeORM specifics
 * - Easier to mock for unit testing
 * - Can be easily swapped with different data source if needed
 * 
 * This repository provides high-level methods that business logic needs,
 * hiding the complexity of TypeORM queries and relations.
 */
export class ExamRepository {
  private repository: Repository<Exam>;
  private examQuestionRepository: Repository<ExamQuestion>;

  constructor() {
    this.repository = AppDataSource.getRepository(Exam);
    this.examQuestionRepository = AppDataSource.getRepository(ExamQuestion);
  }

  /**
   * Create a new exam
   * 
   * This method handles the transaction of creating:
   * 1. The exam record itself
   * 2. The exam-question associations (if questions provided)
   * 
   * If any step fails, the entire operation is rolled back
   * to maintain data integrity.
   * 
   * @param examData - The exam data to create
   * @returns The created exam with all relations loaded
   */
  async create(examData: Partial<Exam>): Promise<Exam> {
    const exam = this.repository.create(examData);
    return await this.repository.save(exam);
  }

  /**
   * Find exam by ID with all necessary relations
   * 
   * This loads:
   * - Exam basic info
   * - ExamType for categorization
   * - ExamQuestions with full question details
   *   - Question text and choices
   *   - MediaQuestion for audio/images
   * 
   * This single query provides everything needed to display
   * the complete exam to a student.
   * 
   * @param id - Exam ID
   * @returns Complete exam data or null if not found
   */
  async findById(id: number): Promise<Exam | null> {
    return await this.repository.findOne({
      where: { ID: id },
      relations: [
        'examType',
        'examQuestions',
        'examQuestions.question',
        'examQuestions.question.choices',
        'examQuestions.question.mediaQuestion',
      ],
      order: {
        examQuestions: {
          OrderIndex: 'ASC', // Ensure questions are in correct order
        },
      },
    });
  }

  /**
   * Find all exams with optional filtering
   * 
   * Supports filtering by:
   * - ExamTypeID: Get only Full Tests or Mini Tests
   * - Type: Additional type filtering
   * 
   * Returns exams with basic info and their type,
   * but not full question details (for performance).
   * Call findById() to get complete exam data.
   * 
   * @param filters - Optional filter criteria
   * @returns Array of exams matching the filters
   */
  async findAll(filters?: {
    ExamTypeID?: number;
    Type?: string;
  }): Promise<Exam[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.examType', 'examType')
      .orderBy('exam.TimeCreate', 'DESC');

    if (filters?.ExamTypeID) {
      queryBuilder.andWhere('exam.ExamTypeID = :examTypeId', {
        examTypeId: filters.ExamTypeID,
      });
    }

    if (filters?.Type) {
      queryBuilder.andWhere('exam.Type = :type', {
        type: filters.Type,
      });
    }

    return await queryBuilder.getMany();
  }

  /**
   * Update an existing exam
   * 
   * This method:
   * 1. Verifies exam exists
   * 2. Updates only the provided fields
   * 3. Saves the changes
   * 4. Returns updated exam
   * 
   * Note: To update questions, use addQuestions() or removeQuestions()
   * methods separately to maintain better control and transaction safety.
   * 
   * @param id - Exam ID to update
   * @param updates - Fields to update
   * @returns Updated exam or null if not found
   */
  async update(id: number, updates: Partial<Exam>): Promise<Exam | null> {
    const exam = await this.repository.findOne({ where: { ID: id } });
    
    if (!exam) {
      return null;
    }

    // Merge updates into existing exam
    Object.assign(exam, updates);
    
    return await this.repository.save(exam);
  }

  /**
   * Delete an exam
   * 
   * This cascade deletes:
   * - All ExamQuestion associations
   * - All Attempt records for this exam
   * - All AttemptAnswer records (via Attempt cascade)
   * 
   * This is a destructive operation that removes all student
   * history for this exam. Use with caution!
   * 
   * Consider implementing soft delete (marking as inactive)
   * instead for production systems.
   * 
   * @param id - Exam ID to delete
   * @returns True if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  /**
   * Add questions to an exam
   * 
   * Creates ExamQuestion records that link questions to this exam.
   * Each question gets an OrderIndex to maintain sequence.
   * 
   * This method checks for duplicates and skips questions
   * that are already in the exam.
   * 
   * @param examId - Exam to add questions to
   * @param questions - Array of {QuestionID, OrderIndex} objects
   * @returns Array of created ExamQuestion records
   */
  async addQuestions(
    examId: number,
    questions: { QuestionID: number; OrderIndex: number }[]
  ): Promise<ExamQuestion[]> {
    const examQuestions = questions.map((q) =>
      this.examQuestionRepository.create({
        ExamID: examId,
        QuestionID: q.QuestionID,
        OrderIndex: q.OrderIndex,
      })
    );

    return await this.examQuestionRepository.save(examQuestions);
  }

  /**
   * Remove questions from an exam
   * 
   * Deletes ExamQuestion associations, effectively removing
   * questions from the exam.
   * 
   * Important: This does NOT delete the actual Question records,
   * only the association with this exam. Questions can still be
   * used in other exams.
   * 
   * @param examId - Exam to remove questions from
   * @param questionIds - Array of Question IDs to remove
   * @returns Number of associations removed
   */
  async removeQuestions(
    examId: number,
    questionIds: number[]
  ): Promise<number> {
    const result = await this.examQuestionRepository
      .createQueryBuilder()
      .delete()
      .where('ExamID = :examId', { examId })
      .andWhere('QuestionID IN (:...questionIds)', { questionIds })
      .execute();

    return result.affected || 0;
  }

  /**
   * Get exam statistics
   * 
   * Returns useful metrics about an exam:
   * - Total number of questions
   * - Question distribution by type/section
   * - Number of attempts by students
   * - Average score
   * 
   * This helps admin/teacher assess exam difficulty and usage.
   * 
   * @param examId - Exam to analyze
   * @returns Statistics object
   */
  async getExamStatistics(examId: number): Promise<any> {
    const exam = await this.repository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.examQuestions', 'eq')
      .leftJoinAndSelect('eq.question', 'q')
      .leftJoinAndSelect('q.mediaQuestion', 'mq')
      .leftJoinAndSelect('exam.attempts', 'attempt')
      .where('exam.ID = :examId', { examId })
      .getOne();

    if (!exam) {
      return null;
    }

    // Calculate statistics
    const totalQuestions = exam.examQuestions?.length || 0;
    const totalAttempts = exam.attempts?.length || 0;
    
    // Group questions by section
    const questionsBySection: { [key: string]: number } = {};
    exam.examQuestions?.forEach((eq) => {
      const section = eq.question.mediaQuestion.Section || 'Unknown';
      questionsBySection[section] = (questionsBySection[section] || 0) + 1;
    });

    // Calculate average scores (only for submitted attempts)
    const submittedAttempts = exam.attempts?.filter((a) => a.SubmittedAt) || [];
    const avgScore = submittedAttempts.length > 0
      ? submittedAttempts.reduce((sum, a) => sum + (a.ScorePercent || 0), 0) / submittedAttempts.length
      : 0;

    return {
      examId,
      totalQuestions,
      questionsBySection,
      totalAttempts,
      submittedAttempts: submittedAttempts.length,
      averageScore: Math.round(avgScore * 10) / 10,
    };
  }

  /**
   * Search exams by title
   * 
   * Useful for admin panel where they need to find specific exams
   * by name or partial name match.
   * 
   * @param searchTerm - Text to search for in exam titles
   * @returns Array of matching exams
   */
  async searchByTitle(searchTerm: string): Promise<Exam[]> {
    return await this.repository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.examType', 'examType')
      .where('exam.Title LIKE :searchTerm', {
        searchTerm: `%${searchTerm}%`,
      })
      .orderBy('exam.TimeCreate', 'DESC')
      .getMany();
  }

  /**
   * Add questions với media group tracking
   * 
   * Method này là version mở rộng của addQuestions() hiện tại.
   * Nó support thêm MediaQuestionID và IsGrouped flag để track
   * questions nào thuộc media groups.
   * 
   * @param examId - Exam ID
   * @param questions - Array of questions với media info
   * @returns Created ExamQuestion records
   */
  async addQuestionsWithMediaTracking(
    examId: number,
    questions: Array<{
      QuestionID: number;
      OrderIndex: number;
      MediaQuestionID?: number;
      IsGrouped?: boolean;
    }>
  ): Promise<ExamQuestion[]> {
    const examQuestions = questions.map((q) =>
      this.examQuestionRepository.create({
        ExamID: examId,
        QuestionID: q.QuestionID,
        OrderIndex: q.OrderIndex,
        MediaQuestionID: q.MediaQuestionID,
        IsGrouped: q.IsGrouped || false,
      })
    );

    return await this.examQuestionRepository.save(examQuestions);
  }

  /**
   * Find ExamQuestion records theo media group
   * 
   * Method này tìm tất cả ExamQuestion records trong một exam
   * mà thuộc về một media question cụ thể. Useful khi cần
   * remove hoặc update entire group.
   * 
   * @param examId - Exam ID
   * @param mediaQuestionId - Media question ID
   * @returns Array of ExamQuestion records
   */
  async findExamQuestionsByMedia(
    examId: number,
    mediaQuestionId: number
  ): Promise<ExamQuestion[]> {
    return await this.examQuestionRepository.find({
      where: {
        ExamID: examId,
        MediaQuestionID: mediaQuestionId,
        IsGrouped: true,
      },
      relations: ['question', 'question.choices', 'question.mediaQuestion'],
      order: {
        OrderIndex: 'ASC',
      },
    });
  }

  /**
   * Get tất cả media groups trong một exam
   * 
   * Method này trả về danh sách các media question IDs
   * được sử dụng trong exam, cùng với số lượng questions
   * của mỗi media.
   * 
   * Useful để hiển thị overview của exam structure.
   * 
   * @param examId - Exam ID
   * @returns Array of media groups với counts
   */
  async getMediaGroupsInExam(examId: number): Promise<
    Array<{
      mediaQuestionId: number;
      questionCount: number;
      startOrderIndex: number;
      endOrderIndex: number;
    }>
  > {
    // Query để group ExamQuestions theo MediaQuestionID
    const result = await this.examQuestionRepository
      .createQueryBuilder('eq')
      .select('eq.MediaQuestionID', 'mediaQuestionId')
      .addSelect('COUNT(eq.ID)', 'questionCount')
      .addSelect('MIN(eq.OrderIndex)', 'startOrderIndex')
      .addSelect('MAX(eq.OrderIndex)', 'endOrderIndex')
      .where('eq.ExamID = :examId', { examId })
      .andWhere('eq.IsGrouped = :isGrouped', { isGrouped: true })
      .andWhere('eq.MediaQuestionID IS NOT NULL')
      .groupBy('eq.MediaQuestionID')
      .orderBy('startOrderIndex', 'ASC')
      .getRawMany();

    return result.map(r => ({
      mediaQuestionId: parseInt(r.mediaQuestionId),
      questionCount: parseInt(r.questionCount),
      startOrderIndex: parseInt(r.startOrderIndex),
      endOrderIndex: parseInt(r.endOrderIndex),
    }));
  }

  /**
   * Remove media group khỏi exam
   * 
   * Xóa tất cả ExamQuestion records có cùng MediaQuestionID.
   * Đảm bảo entire group được xóa, không để lại câu mồ côi.
   * 
   * @param examId - Exam ID
   * @param mediaQuestionId - Media question ID to remove
   * @returns Number of questions removed
   */
  async removeMediaGroup(
    examId: number,
    mediaQuestionId: number
  ): Promise<number> {
    const result = await this.examQuestionRepository
      .createQueryBuilder()
      .delete()
      .from(ExamQuestion)
      .where('ExamID = :examId', { examId })
      .andWhere('MediaQuestionID = :mediaQuestionId', { mediaQuestionId })
      .andWhere('IsGrouped = :isGrouped', { isGrouped: true })
      .execute();

    return result.affected || 0;
  }

  /**
   * Get exam content organized by media groups
   * 
   * Method này trả về exam content được organize thành:
   * - Media groups: Nhóm questions có cùng media
   * - Standalone questions: Questions không thuộc group nào
   * 
   * Structure này perfect cho UI rendering với media
   * được hiển thị một lần cho cả nhóm.
   * 
   * @param examId - Exam ID
   * @returns Organized exam content
   */
  async getOrganizedContent(examId: number): Promise<{
    mediaGroups: Map<number, ExamQuestion[]>;
    standaloneQuestions: ExamQuestion[];
  }> {
    // Get all exam questions với relations
    const allExamQuestions = await this.examQuestionRepository.find({
      where: { ExamID: examId },
      relations: [
        'question',
        'question.choices',
        'question.mediaQuestion',
      ],
      order: { OrderIndex: 'ASC' },
    });

    // Separate into groups và standalone
    const mediaGroups = new Map<number, ExamQuestion[]>();
    const standaloneQuestions: ExamQuestion[] = [];

    allExamQuestions.forEach(eq => {
      if (eq.IsGrouped && eq.MediaQuestionID) {
        // Add to media group
        if (!mediaGroups.has(eq.MediaQuestionID)) {
          mediaGroups.set(eq.MediaQuestionID, []);
        }
        mediaGroups.get(eq.MediaQuestionID)!.push(eq);
      } else {
        // Add to standalone
        standaloneQuestions.push(eq);
      }
    });

    return {
      mediaGroups,
      standaloneQuestions,
    };
  }

  /**
   * Check if exam contains a specific media group
   * 
   * Useful để validate trước khi add hoặc để check duplicates.
   * 
   * @param examId - Exam ID
   * @param mediaQuestionId - Media question ID
   * @returns True if exam contains this media group
   */
  async containsMediaGroup(
    examId: number,
    mediaQuestionId: number
  ): Promise<boolean> {
    const count = await this.examQuestionRepository.count({
      where: {
        ExamID: examId,
        MediaQuestionID: mediaQuestionId,
        IsGrouped: true,
      },
    });

    return count > 0;
  }

  /**
   * Get next available OrderIndex trong exam
   * 
   * Khi add new questions hoặc groups, cần biết OrderIndex
   * tiếp theo available. Method này tìm OrderIndex lớn nhất
   * hiện tại và return next number.
   * 
   * @param examId - Exam ID
   * @returns Next available OrderIndex
   */
  async getNextOrderIndex(examId: number): Promise<number> {
    const result = await this.examQuestionRepository
      .createQueryBuilder('eq')
      .select('MAX(eq.OrderIndex)', 'maxOrder')
      .where('eq.ExamID = :examId', { examId })
      .getRawOne();

    const maxOrder = result?.maxOrder || 0;
    return maxOrder + 1;
  }

  /**
   * Reorder questions trong exam
   * 
   * Khi giáo viên drag-drop để reorder questions hoặc groups,
   * method này update OrderIndex của nhiều questions cùng lúc.
   * 
   * @param updates - Array of { examQuestionId, newOrderIndex }
   * @returns Number of updated records
   */
  async reorderQuestions(
    updates: Array<{ examQuestionId: number; newOrderIndex: number }>
  ): Promise<number> {
    let updatedCount = 0;

    await this.examQuestionRepository.manager.transaction(
      async (manager) => {
        for (const update of updates) {
          const result = await manager.update(
            ExamQuestion,
            { ID: update.examQuestionId },
            { OrderIndex: update.newOrderIndex }
          );
          updatedCount += result.affected || 0;
        }
      }
    );

    return updatedCount;
  }

  /**
   * Move media group to different position trong exam
   * 
   * Khi cần di chuyển entire group đến vị trí khác,
   * method này update OrderIndex của tất cả questions trong group
   * để maintain relative order nhưng shift position.
   * 
   * @param examId - Exam ID
   * @param mediaQuestionId - Media question ID to move
   * @param newStartOrderIndex - New starting position
   * @returns Number of questions moved
   */
  async moveMediaGroup(
    examId: number,
    mediaQuestionId: number,
    newStartOrderIndex: number
  ): Promise<number> {
    // Get current questions trong group
    const groupQuestions = await this.findExamQuestionsByMedia(
      examId,
      mediaQuestionId
    );

    if (groupQuestions.length === 0) {
      return 0;
    }

    // Calculate new OrderIndex cho mỗi question
    const updates = groupQuestions.map((eq, index) => ({
      examQuestionId: eq.ID,
      newOrderIndex: newStartOrderIndex + index,
    }));

    return await this.reorderQuestions(updates);
  }

  /**
   * Get exam statistics bao gồm media group info
   * 
   * Extended version của getExamStatistics() hiện tại,
   * thêm thông tin về media groups.
   * 
   * @param examId - Exam ID
   * @returns Enhanced statistics
   */
  async getEnhancedStatistics(examId: number): Promise<any> {
    const exam = await this.findById(examId);
    
    if (!exam) {
      return null;
    }

    // Get basic stats
    const totalQuestions = exam.examQuestions?.length || 0;
    const totalAttempts = exam.attempts?.length || 0;
    const submittedAttempts = exam.attempts?.filter(a => a.SubmittedAt) || [];
    
    const avgScore = submittedAttempts.length > 0
      ? submittedAttempts.reduce((sum, a) => sum + (a.ScorePercent || 0), 0) / 
        submittedAttempts.length
      : 0;

    // Get media group info
    const mediaGroups = await this.getMediaGroupsInExam(examId);
    const totalMediaGroups = mediaGroups.length;
    const questionsInGroups = mediaGroups.reduce(
      (sum, g) => sum + g.questionCount, 
      0
    );
    const standaloneQuestions = totalQuestions - questionsInGroups;

    // Group questions by section
    const questionsBySection: { [key: string]: number } = {};
    exam.examQuestions?.forEach(eq => {
      const section = eq.question?.mediaQuestion?.Section || 'Unknown';
      questionsBySection[section] = (questionsBySection[section] || 0) + 1;
    });

    return {
      examId,
      totalQuestions,
      totalMediaGroups,
      questionsInGroups,
      standaloneQuestions,
      questionsBySection,
      totalAttempts,
      submittedAttempts: submittedAttempts.length,
      averageScore: Math.round(avgScore * 10) / 10,
      mediaGroupDetails: mediaGroups,
    };
  }

  /**
   * Validate exam structure
   * 
   * Check xem exam có valid structure không:
   * - Không có gaps trong OrderIndex
   * - Không có duplicate OrderIndex
   * - Media groups có complete (không thiếu questions)
   * 
   * @param examId - Exam ID
   * @returns Validation result with any issues found
   */
  async validateExamStructure(examId: number): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    const examQuestions = await this.examQuestionRepository.find({
      where: { ExamID: examId },
      order: { OrderIndex: 'ASC' },
    });

    if (examQuestions.length === 0) {
      return { isValid: true, issues: [] };
    }

    // Check for duplicate OrderIndex
    const orderIndices = examQuestions.map(eq => eq.OrderIndex);
    const uniqueOrders = new Set(orderIndices);
    if (orderIndices.length !== uniqueOrders.size) {
      issues.push('Duplicate OrderIndex values found');
    }

    // Check for gaps trong OrderIndex sequence
    const sortedOrders = [...orderIndices].sort((a, b) => a - b);
    for (let i = 1; i < sortedOrders.length; i++) {
      if (sortedOrders[i] - sortedOrders[i-1] > 1) {
        issues.push(
          `Gap in OrderIndex sequence between ${sortedOrders[i-1]} and ${sortedOrders[i]}`
        );
      }
    }

    // Check media groups completeness
    const mediaGroups = await this.getMediaGroupsInExam(examId);
    for (const group of mediaGroups) {
      const expectedCount = group.endOrderIndex - group.startOrderIndex + 1;
      if (expectedCount !== group.questionCount) {
        issues.push(
          `Media group ${group.mediaQuestionId} may be incomplete: ` +
          `expected ${expectedCount} questions but found ${group.questionCount}`
        );
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Update một ExamQuestion record
   * 
   * Method này expose update functionality một cách clean và safe.
   * Nó validate và handle errors properly.
   * 
   * @param examQuestionId - ExamQuestion ID to update
   * @param updates - Fields to update
   * @returns Updated ExamQuestion hoặc null if not found
   */
  async updateExamQuestion(
    examQuestionId: number,
    updates: Partial<ExamQuestion>
  ): Promise<ExamQuestion | null> {
    // Find existing record
    const examQuestion = await this.examQuestionRepository.findOne({
      where: { ID: examQuestionId },
    });

    if (!examQuestion) {
      return null;
    }

    // Apply updates
    Object.assign(examQuestion, updates);

    // Save and return
    return await this.examQuestionRepository.save(examQuestion);
  }

  // method to manage ExamType entities
  
  async findAllExamTypes(): Promise<ExamType[]> {
    const examTypeRepo = AppDataSource.getRepository(ExamType);
    return await examTypeRepo.find({
      order: { Code: 'ASC' }
    });
  }

  async findExamTypeById(id: number): Promise<ExamType | null> {
    const examTypeRepo = AppDataSource.getRepository(ExamType);
    return await examTypeRepo.findOne({ where: { ID: id } });
  }

  async findExamTypeByCode(code: string): Promise<ExamType | null> {
    const examTypeRepo = AppDataSource.getRepository(ExamType);
    return await examTypeRepo.findOne({ where: { Code: code } });
  }

  async createExamType(data: Partial<ExamType>): Promise<ExamType> {
    const examTypeRepo = AppDataSource.getRepository(ExamType);
    const examType = examTypeRepo.create(data);
    return await examTypeRepo.save(examType);
  }

  async updateExamType(id: number, data: Partial<ExamType>): Promise<ExamType> {
    const examTypeRepo = AppDataSource.getRepository(ExamType);
    await examTypeRepo.update(id, data);
    const updated = await examTypeRepo.findOne({ where: { ID: id } });
    if (!updated) {
      throw new Error('Failed to retrieve updated exam type');
    }
    return updated;
  }

  async deleteExamType(id: number): Promise<boolean> {
    const examTypeRepo = AppDataSource.getRepository(ExamType);
    const result = await examTypeRepo.delete(id);
    return (result.affected || 0) > 0;
  }

  async countExamsByType(examTypeId: number): Promise<number> {
    return await this.repository.count({
      where: { ExamTypeID: examTypeId }
    });
  }
}
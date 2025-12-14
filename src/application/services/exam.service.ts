import { ExamRepository } from '../../infrastructure/repositories/exam.repository';
import { QuestionRepository } from '../../infrastructure/repositories/question.repository';
import { MediaQuestionRepository } from '../../infrastructure/repositories/media-question.repository';
import {
  CreateExamDto,
  UpdateExamDto,
  ExamDetailResponseDto,
  QuestionDetailDto,
  ChoiceDetailDto,
} from '../dtos/exam.dto';
import {
  CreateExamTypeDto,
  UpdateExamTypeDto,
} from '../dtos/exam-type.dto';
import { Exam } from '../../domain/entities/exam.entity';
import { ExamType } from '../../domain/entities/exam-type.entity';

/**
 * ExamService handles all business logic related to exam management
 * 
 * This service orchestrates operations between multiple repositories,
 * enforces business rules, and transforms data between entities and DTOs.
 * 
 * Key responsibilities:
 * - Validate business rules before creating/updating exams
 * - Coordinate exam and question operations
 * - Transform entities to response DTOs (hiding sensitive data)
 * - Enforce authorization rules
 * - Handle complex operations like exam duplication
 * 
 * Services should NEVER directly access database or TypeORM.
 * All data access goes through repositories to maintain clean separation.
 */
export class ExamService {
  private examRepository: ExamRepository;
  private questionRepository: QuestionRepository;
  private mediaQuestionRepository: MediaQuestionRepository;

  /**
   * Constructor initializes the repositories this service depends on.
   * 
   * In a more advanced setup, we might use dependency injection
   * frameworks like InversifyJS or TypeDI to automatically inject
   * these dependencies. For now, we manually instantiate them.
   * 
   * This pattern makes the service easy to test - in unit tests,
   * you can pass in mock repositories instead of real ones.
   */
  constructor() {
    this.examRepository = new ExamRepository();
    this.questionRepository = new QuestionRepository();
    this.mediaQuestionRepository = new MediaQuestionRepository();
  }

  /**
   * Create a new exam
   * 
   * This method handles the complete process of exam creation:
   * 1. Validates that the exam type exists
   * 2. Creates the exam record
   * 3. If questions or media blocks are provided, validates and adds them
   * 4. Returns the complete exam data
   * 
   * Supports two modes:
   * - questions: Directly add specific question IDs
   * - MediaQuestionIDs: Select entire media blocks (e.g., Reading passage with 3 questions)
   * 
   * Business rules enforced:
   * - Exam must have a valid title
   * - Time limit must be reasonable (1-240 minutes)
   * - All referenced questions/media must exist in the database
   * - Questions must be added in proper order
   * 
   * @param examData - Data for creating the exam
   * @param userId - ID of user creating the exam (for audit trail)
   * @returns Created exam with all relations
   * @throws Error if validation fails
   */
  async createExam(examData: CreateExamDto, userId: number): Promise<Exam> {
    // Validate business rules
    if (!examData.Title || examData.Title.trim().length === 0) {
      throw new Error('Exam title cannot be empty');
    }

    if (examData.TimeExam < 1 || examData.TimeExam > 240) {
      throw new Error('Exam time must be between 1 and 240 minutes');
    }

    // Create the exam entity
    const exam = await this.examRepository.create({
      Title: examData.Title,
      TimeExam: examData.TimeExam,
      Type: examData.Type,
      ExamTypeID: examData.ExamTypeID,
      UserID: userId,
    });

    // Collect all questions from both explicit questions and media blocks
    const questionsToAdd: Array<{
      QuestionID: number;
      OrderIndex: number;
      MediaQuestionID?: number;
      IsGrouped?: boolean;
    }> = [];

    // Process explicitly provided questions
    if (examData.questions && examData.questions.length > 0) {
      const questionIds = examData.questions.map((q) => q.QuestionID);
      const existingQuestions = await this.questionRepository.findByIds(questionIds);

      if (existingQuestions.length !== questionIds.length) {
        throw new Error('Some questions do not exist');
      }

      // Add explicit questions with their order indices
      examData.questions.forEach((q) => {
        questionsToAdd.push({
          QuestionID: q.QuestionID,
          OrderIndex: q.OrderIndex,
        });
      });
    }

    // Process media blocks
    if (examData.MediaQuestionIDs && examData.MediaQuestionIDs.length > 0) {
      // Fetch all questions from selected media blocks
      const mediaQuestions = await this.questionRepository.findByMediaIds(
        examData.MediaQuestionIDs
      );

      if (mediaQuestions.length === 0) {
        throw new Error('No questions found for selected media blocks');
      }

      // Determine starting order index
      let startOrder = 1;
      if (questionsToAdd.length > 0) {
        startOrder = Math.max(...questionsToAdd.map((q) => q.OrderIndex)) + 1;
      }

      // Add media-derived questions with auto-incremented order
      mediaQuestions.forEach((q, idx) => {
        // Skip if already added explicitly
        if (!questionsToAdd.some((eq) => eq.QuestionID === q.ID)) {
          questionsToAdd.push({
            QuestionID: q.ID,
            OrderIndex: startOrder + idx,
            MediaQuestionID: q.MediaQuestionID,
            IsGrouped: true, // Mark as part of media group
          });
        }
      });
    }

    // Add all questions to exam
    if (questionsToAdd.length > 0) {
      await this.examRepository.addQuestions(exam.ID, questionsToAdd);
    }

    // Reload exam with all relations to return complete data
    const completeExam = await this.examRepository.findById(exam.ID);
    
    if (!completeExam) {
      throw new Error('Failed to retrieve created exam');
    }

    return completeExam;
  }

  /**
   * Get exam by ID with complete details
   * 
   * This method retrieves an exam and transforms it into a response DTO
   * that's safe to send to clients. Critically, it removes the IsCorrect
   * flag from choices to prevent cheating.
   * 
   * The transformation from Entity to DTO is an important security boundary.
   * We never send raw entities to clients because they might contain
   * sensitive data or implementation details we don't want to expose.
   * 
   * @param examId - ID of exam to retrieve
   * @returns Exam details formatted for client consumption
   * @throws Error if exam not found
   */
  async getExamById(examId: number): Promise<ExamDetailResponseDto> {
    const exam = await this.examRepository.findById(examId);

    if (!exam) {
      throw new Error('Exam not found');
    }

    // Transform entity to response DTO
    // This is where we control exactly what data clients receive
    return this.transformToExamDetailResponse(exam);
  }

  /**
   * Get all exams with optional filtering
   * 
   * This method supports filtering by exam type, which is useful
   * for the UI to show different categories of exams:
   * - Full Tests: Complete 200-question tests
   * - Mini Tests: Shorter practice tests
   * - Part Practice: Focused practice on specific parts
   * 
   * Returns basic exam information without full question details
   * for performance. Clients can request full details separately
   * when a user selects a specific exam.
   * 
   * @param filters - Optional filtering criteria
   * @returns Array of exams matching filters
   */
  async getAllExams(filters?: {
    ExamTypeID?: number;
    Type?: string;
  }): Promise<Exam[]> {
    return await this.examRepository.findAll(filters);
  }

  /**
   * Update an existing exam
   * 
   * This method handles partial updates to exam metadata.
   * Note that updating exam questions is handled by separate methods
   * (addQuestionsToExam, removeQuestionsFromExam) for better control
   * and clearer intent.
   * 
   * Business rules enforced:
   * - Only the creator (or admin) should be able to update exams
   * - Cannot update an exam that has already been taken by students
   *   (or at least should warn about implications)
   * 
   * @param examId - ID of exam to update
   * @param updateData - Fields to update
   * @param userId - ID of user making the update
   * @returns Updated exam
   * @throws Error if exam not found or user lacks permission
   */
  async updateExam(
    examId: number,
    updateData: UpdateExamDto,
    userId: number
  ): Promise<Exam> {
    // First verify exam exists
    const existingExam = await this.examRepository.findById(examId);

    if (!existingExam) {
      throw new Error('Exam not found');
    }

    // Business rule: Only creator can update (will be enhanced with role checking)
    // In production, you'd also check if user is admin
    if (existingExam.UserID !== userId) {
      throw new Error('You do not have permission to update this exam');
    }

    // Validate updated values if provided
    if (updateData.TimeExam !== undefined) {
      if (updateData.TimeExam < 1 || updateData.TimeExam > 240) {
        throw new Error('Exam time must be between 1 and 240 minutes');
      }
    }

    // Perform the update
    const updatedExam = await this.examRepository.update(examId, updateData);

    if (!updatedExam) {
      throw new Error('Failed to update exam');
    }

    return updatedExam;
  }

  /**
   * Delete an exam
   * 
   * This is a destructive operation that removes the exam and all
   * associated data including student attempts and answers.
   * 
   * Important business considerations:
   * - Should we allow deleting exams that students have taken?
   * - Should we implement soft delete instead?
   * - Should we archive the data rather than delete it?
   * 
   * For now, this is a hard delete, but in production you'd want
   * to implement safeguards and possibly soft delete.
   * 
   * @param examId - ID of exam to delete
   * @param userId - ID of user requesting deletion
   * @returns True if deleted successfully
   * @throws Error if exam not found or user lacks permission
   */
  async deleteExam(examId: number, userId: number): Promise<boolean> {
    // Verify exam exists and check permissions
    const exam = await this.examRepository.findById(examId);

    if (!exam) {
      throw new Error('Exam not found');
    }

    // Only creator (or admin) can delete
    if (exam.UserID !== userId) {
      throw new Error('You do not have permission to delete this exam');
    }

    // Check if exam has been taken by students
    // If yes, maybe we should prevent deletion or require confirmation
    if (exam.attempts && exam.attempts.length > 0) {
      throw new Error(
        'Cannot delete exam that has been taken by students. Consider archiving instead.'
      );
    }

    return await this.examRepository.delete(examId);
  }

  /**
   * Add questions to an exam
   * 
   * This method allows adding questions to an existing exam.
   * Questions must exist in the database and will be added with
   * the specified order indices.
   * 
   * Use cases:
   * - Building an exam incrementally by adding questions one by one
   * - Adding new questions to an existing exam template
   * - Creating exam variations by adding different questions
   * 
   * Business rules:
   * - Questions must exist before they can be added
   * - Order indices must be unique within the exam
   * - Cannot add duplicate questions to the same exam
   * 
   * @param examId - ID of exam to add questions to
   * @param questions - Array of question IDs and their order indices
   * @param userId - ID of user making the change
   * @returns Updated exam with new questions
   */
  async addQuestionsToExam(
    examId: number,
    questions: { QuestionID: number; OrderIndex: number }[],
    userId: number
  ): Promise<Exam> {
    // Verify exam exists and user has permission
    const exam = await this.examRepository.findById(examId);

    if (!exam) {
      throw new Error('Exam not found');
    }

    if (exam.UserID !== userId) {
      throw new Error('You do not have permission to modify this exam');
    }

    // Validate all questions exist
    const questionIds = questions.map((q) => q.QuestionID);
    const existingQuestions = await this.questionRepository.findByIds(questionIds);

    if (existingQuestions.length !== questionIds.length) {
      throw new Error('Some questions do not exist');
    }

    // Check for duplicate questions already in exam
    const existingQuestionIds = exam.examQuestions?.map((eq) => eq.QuestionID) || [];
    const duplicates = questionIds.filter((id) => existingQuestionIds.includes(id));

    if (duplicates.length > 0) {
      throw new Error(`Questions ${duplicates.join(', ')} are already in this exam`);
    }

    // Add the questions
    await this.examRepository.addQuestions(examId, questions);

    // Return updated exam
    const updatedExam = await this.examRepository.findById(examId);

    if (!updatedExam) {
      throw new Error('Failed to retrieve updated exam');
    }

    return updatedExam;
  }

  /**
   * Remove questions from an exam
   * 
   * Removes the association between questions and an exam.
   * Note: This does NOT delete the questions themselves, only
   * removes them from this specific exam. The questions remain
   * in the database and can be used in other exams.
   * 
   * @param examId - ID of exam to remove questions from
   * @param questionIds - IDs of questions to remove
   * @param userId - ID of user making the change
   * @returns Number of questions removed
   */
  async removeQuestionsFromExam(
    examId: number,
    questionIds: number[],
    userId: number
  ): Promise<number> {
    // Verify exam exists and user has permission
    const exam = await this.examRepository.findById(examId);

    if (!exam) {
      throw new Error('Exam not found');
    }

    if (exam.UserID !== userId) {
      throw new Error('You do not have permission to modify this exam');
    }

    // Remove the questions
    return await this.examRepository.removeQuestions(examId, questionIds);
  }

  /**
   * Get exam statistics
   * 
   * Provides comprehensive statistics about an exam:
   * - Total number of questions and their distribution by section
   * - Number of students who have taken the exam
   * - Average scores
   * 
   * This information helps administrators and teachers evaluate
   * exam difficulty and effectiveness.
   * 
   * @param examId - ID of exam to analyze
   * @returns Statistics object
   */
  async getExamStatistics(examId: number): Promise<any> {
    const exam = await this.examRepository.findById(examId);

    if (!exam) {
      throw new Error('Exam not found');
    }

    return await this.examRepository.getEnhancedStatistics(examId);
  }

  /**
   * Search exams by title
   * 
   * Allows administrators to search for exams by title or
   * partial title match. Useful in admin panel for finding
   * specific exams quickly.
   * 
   * @param searchTerm - Text to search for in exam titles
   * @returns Array of matching exams
   */
  async searchExams(searchTerm: string): Promise<Exam[]> {
    if (!searchTerm || searchTerm.trim().length === 0) {
      throw new Error('Search term cannot be empty');
    }

    return await this.examRepository.searchByTitle(searchTerm);
  }

  /**
   * Duplicate an exam
   * 
   * Creates a copy of an existing exam with all its questions.
   * Useful for creating exam variations or templates.
   * 
   * The duplicated exam gets a new title (original + " - Copy")
   * and is owned by the user who duplicated it.
   * 
   * @param examId - ID of exam to duplicate
   * @param userId - ID of user creating the duplicate
   * @returns Newly created exam
   */
  // async duplicateExam(examId: number, userId: number): Promise<Exam> {
  //   // Get the original exam
  //   const originalExam = await this.examRepository.findById(examId);

  //   if (!originalExam) {
  //     throw new Error('Exam not found');
  //   }

  //   // Create a new exam with same properties but new title
  //   const duplicatedExam = await this.examRepository.create({
  //     Title: `${originalExam.Title} - Copy`,
  //     TimeExam: originalExam.TimeExam,
  //     Type: originalExam.Type,
  //     ExamTypeID: originalExam.ExamTypeID,
  //     UserID: userId,
  //   });

  //   // Copy all questions with their order indices
  //   if (originalExam.examQuestions && originalExam.examQuestions.length > 0) {
  //     const questionsToAdd = originalExam.examQuestions.map((eq) => ({
  //       QuestionID: eq.QuestionID,
  //       OrderIndex: eq.OrderIndex,
  //     }));

  //     await this.examRepository.addQuestions(duplicatedExam.ID, questionsToAdd);
  //   }

  //   // Return the complete duplicated exam
  //   const completeExam = await this.examRepository.findById(duplicatedExam.ID);

  //   if (!completeExam) {
  //     throw new Error('Failed to retrieve duplicated exam');
  //   }

  //   return completeExam;
  // }

  /**
   * Clone exam bao gồm media groups
   * 
   * Extended version của duplicateExam() để properly handle
   * media group tracking khi clone.
   * 
   * @param examId - Exam ID to clone
   * @param userId - User tạo clone
   * @returns Cloned exam
   */
  async duplicateExam(examId: number, userId: number): Promise<Exam> {
    // Get original exam
    const originalExam = await this.examRepository.findById(examId);
    if (!originalExam) {
      throw new Error('Exam not found');
    }

    // Create new exam
    const duplicatedExam = await this.examRepository.create({
      Title: `${originalExam.Title} - Copy`,
      TimeExam: originalExam.TimeExam,
      Type: originalExam.Type,
      ExamTypeID: originalExam.ExamTypeID,
      UserID: userId,
    });

    // Copy questions với media tracking
    if (originalExam.examQuestions && originalExam.examQuestions.length > 0) {
      const questionsToAdd = originalExam.examQuestions.map(eq => ({
        QuestionID: eq.QuestionID,
        OrderIndex: eq.OrderIndex,
        MediaQuestionID: eq.MediaQuestionID,
        IsGrouped: eq.IsGrouped,
      }));

      await this.examRepository.addQuestionsWithMediaTracking(
        duplicatedExam.ID,
        questionsToAdd
      );
    }

    // Return complete duplicated exam
    const completeExam = await this.examRepository.findById(duplicatedExam.ID);
    if (!completeExam) {
      throw new Error('Failed to retrieve duplicated exam');
    }

    return completeExam;
  }


  /**
   * Add media group vào exam (core new method)
   * 
   * Method này là feature chính của media group functionality.
   * Nó tự động tìm tất cả questions của một media, sort chúng,
   * và add tất cả vào exam với OrderIndex tuần tự.
   * 
   * Workflow:
   * 1. Validate exam và media group tồn tại
   * 2. Check permissions
   * 3. Check xem media group đã có trong exam chưa
   * 4. Get all questions từ media group
   * 5. Determine OrderIndex cho mỗi question
   * 6. Create ExamQuestion records với media tracking
   * 
   * @param examId - ID của exam
   * @param mediaQuestionId - ID của media group
   * @param startingOrderIndex - Vị trí bắt đầu trong exam
   * @param userId - User thực hiện action
   * @returns Result object với exam và số questions added
   */
  async addMediaGroupToExam(
    examId: number,
    mediaQuestionId: number,
    startingOrderIndex: number,
    userId: number
  ): Promise<{
    exam: Exam;
    questionsAdded: number;
    startOrderIndex: number;
    endOrderIndex: number;
  }> {
    // Step 1: Validate exam
    const exam = await this.examRepository.findById(examId);
    if (!exam) {
      throw new Error('Exam not found');
    }

    // Step 2: Check permissions
    if (exam.UserID !== userId) {
      throw new Error('You do not have permission to modify this exam');
    }

    // Step 3: Validate media question
    const media = await this.mediaQuestionRepository.findById(
      mediaQuestionId,
      false // Don't need questions yet
    );
    if (!media) {
      throw new Error('Media group not found');
    }

    // Step 4: Check if already exists trong exam
    const alreadyExists = await this.examRepository.containsMediaGroup(
      examId,
      mediaQuestionId
    );
    if (alreadyExists) {
      throw new Error('This media group is already in the exam');
    }

    // Step 5: Get all questions from media group
    const questions = await this.questionRepository.findByMediaQuestionId(
      mediaQuestionId,
      { sortByOrder: true }
    );

    if (questions.length === 0) {
      throw new Error('Media group has no questions');
    }

    console.log(
      `Adding media group "${media.GroupTitle || 'Untitled'}" ` +
      `with ${questions.length} questions to exam`
    );

    // Step 6: Prepare ExamQuestion data
    const questionsToAdd = questions.map((question, index) => ({
      QuestionID: question.ID,
      OrderIndex: startingOrderIndex + index,
      MediaQuestionID: mediaQuestionId,
      IsGrouped: true,
    }));

    // Step 7: Add all questions
    await this.examRepository.addQuestionsWithMediaTracking(
      examId,
      questionsToAdd
    );

    // Step 8: Return result
    const updatedExam = await this.examRepository.findById(examId);
    if (!updatedExam) {
      throw new Error('Failed to retrieve updated exam');
    }

    return {
      exam: updatedExam,
      questionsAdded: questions.length,
      startOrderIndex: startingOrderIndex,
      endOrderIndex: startingOrderIndex + questions.length - 1,
    };
  }

  /**
   * Remove media group khỏi exam
   * 
   * Xóa tất cả questions của một media group từ exam.
   * Đảm bảo entire group được xóa, không để lại câu mồ côi.
   * 
   * @param examId - Exam ID
   * @param mediaQuestionId - Media group ID to remove
   * @param userId - User thực hiện action
   * @returns Number of questions removed
   */
  async removeMediaGroupFromExam(
    examId: number,
    mediaQuestionId: number,
    userId: number
  ): Promise<number> {
    // Validate exam và permissions
    const exam = await this.examRepository.findById(examId);
    if (!exam) {
      throw new Error('Exam not found');
    }

    if (exam.UserID !== userId) {
      throw new Error('You do not have permission to modify this exam');
    }

    // Check if media group exists trong exam
    const exists = await this.examRepository.containsMediaGroup(
      examId,
      mediaQuestionId
    );
    if (!exists) {
      throw new Error('Media group not found in this exam');
    }

    // Remove the group
    const removedCount = await this.examRepository.removeMediaGroup(
      examId,
      mediaQuestionId
    );

    console.log(
      `Removed media group ${mediaQuestionId} with ${removedCount} questions from exam ${examId}`
    );

    return removedCount;
  }

  /**
   * Get exam content organized by media groups
   * 
   * Method này transform exam content thành structure organized:
   * - Media groups: Nhóm questions có cùng media
   * - Standalone questions: Questions không thuộc group
   * 
   * Perfect cho UI rendering với media được hiển thị một lần
   * cho cả nhóm thay vì lặp lại cho mỗi câu.
   * 
   * @param examId - Exam ID
   * @returns Organized content structure
   */
  async getExamContentOrganized(examId: number): Promise<{
    mediaGroups: Array<{
      mediaQuestionId: number;
      title: string;
      startOrderIndex: number;
      media: {
        skill: string;
        type: string;
        section: string;
        audioUrl?: string;
        imageUrl?: string;
        script?: string;
      };
      questions: Array<{
        id: number;
        questionText: string;
        orderIndex: number;
        orderInGroup: number;
        choices: Array<{
          id: number;
          attribute: string;
          content: string;
        }>;
      }>;
    }>;
    standaloneQuestions: Array<{
      id: number;
      questionText: string;
      orderIndex: number;
      media: {
        skill: string;
        type: string;
        section: string;
      };
      choices: Array<{
        id: number;
        attribute: string;
        content: string;
      }>;
    }>;
  }> {
    // Get organized content từ repository
    const { mediaGroups, standaloneQuestions } = 
      await this.examRepository.getOrganizedContent(examId);

    // Transform media groups
    const transformedGroups = await Promise.all(
      Array.from(mediaGroups.entries()).map(async ([mediaId, examQuestions]) => {
        // Get media info
        const media = await this.mediaQuestionRepository.findById(mediaId);
        
        if (!media) {
          throw new Error(`Media question ${mediaId} not found`);
        }

        // Sort questions by OrderIndex
        const sortedQuestions = examQuestions.sort(
          (a, b) => a.OrderIndex - b.OrderIndex
        );

        return {
          mediaQuestionId: mediaId,
          title: media.GroupTitle || `${media.Type} - Part ${media.Section}`,
          startOrderIndex: sortedQuestions[0].OrderIndex,
          
          media: {
            skill: media.Skill || '',
            type: media.Type,
            section: media.Section || '',
            audioUrl: media.AudioUrl,
            imageUrl: media.ImageUrl,
            script: media.Scirpt,
          },

          questions: sortedQuestions.map(eq => ({
            id: eq.question.ID,
            questionText: eq.question.QuestionText || '',
            orderIndex: eq.OrderIndex,
            orderInGroup: eq.question.OrderInGroup,
            choices: eq.question.choices.map(c => ({
              id: c.ID,
              attribute: c.Attribute || '',
              content: c.Content || '',
              // IsCorrect intentionally omitted for students
            })),
          })),
        };
      })
    );

    // Sort groups by starting order
    transformedGroups.sort((a, b) => a.startOrderIndex - b.startOrderIndex);

    // Transform standalone questions
    const transformedStandalone = standaloneQuestions
      .sort((a, b) => a.OrderIndex - b.OrderIndex)
      .map(eq => ({
        id: eq.question.ID,
        questionText: eq.question.QuestionText || '',
        orderIndex: eq.OrderIndex,
        media: {
          skill: eq.question.mediaQuestion.Skill || '',
          type: eq.question.mediaQuestion.Type,
          section: eq.question.mediaQuestion.Section || '',
        },
        choices: eq.question.choices.map(c => ({
          id: c.ID,
          attribute: c.Attribute || '',
          content: c.Content || '',
        })),
      }));

    return {
      mediaGroups: transformedGroups,
      standaloneQuestions: transformedStandalone,
    };
  }

  /**
   * Move media group to different position
   * 
   * Khi giáo viên muốn reorder groups trong exam, method này
   * di chuyển entire group đến vị trí mới mà maintain relative
   * order của questions trong group.
   * 
   * @param examId - Exam ID
   * @param mediaQuestionId - Media group to move
   * @param newStartOrderIndex - New starting position
   * @param userId - User thực hiện action
   * @returns Number of questions moved
   */
  async moveMediaGroupInExam(
    examId: number,
    mediaQuestionId: number,
    newStartOrderIndex: number,
    userId: number
  ): Promise<number> {
    // Validate permissions
    const exam = await this.examRepository.findById(examId);
    if (!exam) {
      throw new Error('Exam not found');
    }

    if (exam.UserID !== userId) {
      throw new Error('You do not have permission to modify this exam');
    }

    // Perform the move
    return await this.examRepository.moveMediaGroup(
      examId,
      mediaQuestionId,
      newStartOrderIndex
    );
  }

  /**
   * Validate exam structure
   * 
   * Check xem exam có structure hợp lệ không.
   * Useful trước khi publish exam hoặc khi troubleshooting issues.
   * 
   * @param examId - Exam ID
   * @returns Validation result
   */
  async validateExamStructure(examId: number): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const exam = await this.examRepository.findById(examId);
    if (!exam) {
      throw new Error('Exam not found');
    }

    return await this.examRepository.validateExamStructure(examId);
  }

  /**
   * Auto-fix exam OrderIndex gaps
   * 
   * Nếu exam có gaps trong OrderIndex sequence (ví dụ: 1, 2, 5, 6),
   * method này tự động compact lại thành sequence liên tục (1, 2, 3, 4).
   * 
   * Useful sau khi xóa questions/groups khỏi exam.
   * 
   * @param examId - Exam ID
   * @param userId - User thực hiện action
   * @returns Number of questions reordered
   */
  async compactExamOrder(
    examId: number,
    userId: number
  ): Promise<number> {
    // Validate permissions
    const exam = await this.examRepository.findById(examId);
    if (!exam) {
      throw new Error('Exam not found');
    }

    if (exam.UserID !== userId) {
      throw new Error('You do not have permission to modify this exam');
    }

    // Get all exam questions sorted by current order
    const examQuestions = (exam.examQuestions || [])
      .sort((a, b) => a.OrderIndex - b.OrderIndex);

    // Create updates để compact sequence
    const updates = examQuestions.map((eq, index) => ({
      examQuestionId: eq.ID,
      newOrderIndex: index + 1, // Start from 1
    }));

    return await this.examRepository.reorderQuestions(updates);
  }

  /**
   * Get summary of media groups trong exam
   * 
   * Quick overview của exam structure để hiển thị
   * trong exam list hoặc dashboard.
   * 
   * @param examId - Exam ID
   * @returns Summary object
   */
  async getExamMediaGroupSummary(examId: number): Promise<{
    totalQuestions: number;
    totalMediaGroups: number;
    questionsInGroups: number;
    standaloneQuestions: number;
    groupBreakdown: Array<{
      mediaQuestionId: number;
      title: string;
      questionCount: number;
      section: string;
    }>;
  }> {
    const stats = await this.examRepository.getEnhancedStatistics(examId);
    
    if (!stats) {
      throw new Error('Exam not found');
    }

    // Get details của mỗi media group
    const groupBreakdown = await Promise.all(
      (stats.mediaGroupDetails || []).map(async (g: any) => {
        const media = await this.mediaQuestionRepository.findById(
          g.mediaQuestionId
        );

        return {
          mediaQuestionId: g.mediaQuestionId,
          title: media?.GroupTitle || `Part ${media?.Section || '?'}`,
          questionCount: g.questionCount,
          section: media?.Section || 'Unknown',
        };
      })
    );

    return {
      totalQuestions: stats.totalQuestions,
      totalMediaGroups: stats.totalMediaGroups,
      questionsInGroups: stats.questionsInGroups,
      standaloneQuestions: stats.standaloneQuestions,
      groupBreakdown,
    };
  }

  /**
   * Replace question trong exam
   * 
   * Thay thế một question bằng question khác trong exam,
   * maintain OrderIndex và media group tracking.
   * 
   * Useful khi giáo viên muốn swap một câu hỏi mà không
   * phải remove và re-add.
   * 
   * @param examId - Exam ID
   * @param oldQuestionId - Question ID to replace
   * @param newQuestionId - New question ID
   * @param userId - User thực hiện action
   * @returns Success boolean
   */
  async replaceQuestionInExam(
    examId: number,
    oldQuestionId: number,
    newQuestionId: number,
    userId: number
  ): Promise<boolean> {
    // Validate permissions
    const exam = await this.examRepository.findById(examId);
    if (!exam) {
      throw new Error('Exam not found');
    }

    if (exam.UserID !== userId) {
      throw new Error('You do not have permission to modify this exam');
    }

    // Find ExamQuestion record
    const examQuestion = exam.examQuestions?.find(
      eq => eq.QuestionID === oldQuestionId
    );

    if (!examQuestion) {
      throw new Error('Question not found in exam');
    }

    // Validate new question exists
    const newQuestion = await this.questionRepository.findById(newQuestionId);
    if (!newQuestion) {
      throw new Error('New question not found');
    }

    // If replacing trong media group, validate new question
    // cũng thuộc cùng media
    if (examQuestion.IsGrouped && examQuestion.MediaQuestionID) {
      if (newQuestion.MediaQuestionID !== examQuestion.MediaQuestionID) {
        throw new Error(
          'Cannot replace with question from different media group'
        );
      }
    }

    // Update ExamQuestion record thông qua repository method
    const updated = await this.examRepository.updateExamQuestion(
      examQuestion.ID,
      { QuestionID: newQuestionId }
    );

    if (!updated) {
      throw new Error('Failed to update exam question');
    }
    
    return true;
  }

  // ================ Exam Type Management ================= //

  async getExamTypes(): Promise<ExamType[]> {
    return await this.examRepository.findAllExamTypes();
  }

  async createExamType(data: CreateExamTypeDto): Promise<ExamType> {
    // Check duplicate Code
    const existing = await this.examRepository.findExamTypeByCode(data.Code);
    if (existing) {
      throw new Error(`Exam type with code "${data.Code}" already exists`);
    }

    return await this.examRepository.createExamType(data);
  }

  async updateExamType(id: number, data: UpdateExamTypeDto): Promise<ExamType> {
    const examType = await this.examRepository.findExamTypeById(id);
    if (!examType) {
      throw new Error('Exam type not found');
    }

    // Check duplicate Code if updating
    if (data.Code && data.Code !== examType.Code) {
      const duplicate = await this.examRepository.findExamTypeByCode(data.Code);
      if (duplicate) {
        throw new Error(`Exam type code "${data.Code}" is already in use`);
      }
    }

    return await this.examRepository.updateExamType(id, data);
  }

  async deleteExamType(id: number): Promise<boolean> {
    // Check if any exam uses this type
    const examsUsingType = await this.examRepository.countExamsByType(id);
    if (examsUsingType > 0) {
      throw new Error(
        `Cannot delete exam type: ${examsUsingType} exam(s) are using it`
      );
    }

    return await this.examRepository.deleteExamType(id);
  }

  /**
   * Get next available OrderIndex cho exam
   * 
   * Method này expose functionality từ repository một cách clean.
   * Controller không cần biết về repository implementation details,
   * chỉ cần call service method này.
   * 
   * @param examId - Exam ID
   * @returns Next available OrderIndex
   */
  async getNextOrderIndex(examId: number): Promise<number> {
    // Validate exam exists trước
    const exam = await this.examRepository.findById(examId);
    if (!exam) {
      throw new Error('Exam not found');
    }

    // Delegate to repository
    return await this.examRepository.getNextOrderIndex(examId);
  }

  /**
   * Transform exam entity to response DTO
   * 
   * This private helper method performs the crucial transformation
   * from internal entity representation to client-safe DTO.
   * 
   * Key transformations:
   * - Remove IsCorrect flag from choices (security)
   * - Organize questions in order
   * - Include only necessary media information
   * - Structure data for easy frontend consumption
   * 
   * This is an example of the Adapter pattern - we adapt our
   * internal representation to the format clients expect.
   * 
   * @param exam - Exam entity from database
   * @returns Formatted response DTO safe for client
   */
  private transformToExamDetailResponse(exam: Exam): ExamDetailResponseDto {
    return {
      ID: exam.ID,
      Title: exam.Title,
      TimeExam: exam.TimeExam,
      Type: exam.Type || '',
      ExamType: {
        ID: exam.examType.ID,
        Code: exam.examType.Code,
        Description: exam.examType.Description || '',
      },
      Questions: exam.examQuestions
        ? exam.examQuestions
            .sort((a, b) => a.OrderIndex - b.OrderIndex)
            .map((eq): QuestionDetailDto => ({
              ID: eq.question.ID,
              OrderIndex: eq.OrderIndex,
              QuestionText: eq.question.QuestionText || '',
              Choices: eq.question.choices.map((choice): ChoiceDetailDto => ({
                ID: choice.ID,
                Attribute: choice.Attribute || '',
                Content: choice.Content || '',
                // Deliberately exclude IsCorrect for security
              })),
              Media: {
                ID: eq.question.mediaQuestion.ID,
                Skill: eq.question.mediaQuestion.Skill || '',
                Type: eq.question.mediaQuestion.Type,
                Section: eq.question.mediaQuestion.Section || '',
                AudioUrl: eq.question.mediaQuestion.AudioUrl,
                ImageUrl: eq.question.mediaQuestion.ImageUrl,
                Script: eq.question.mediaQuestion.Scirpt || '',
              },
            }))
        : [],
    };
  }
}
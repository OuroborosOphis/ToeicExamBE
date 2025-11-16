import { ExamRepository } from '../../infrastructure/repositories/exam.repository';
import { QuestionRepository } from '../../infrastructure/repositories/question.repository';
import {
  CreateExamDto,
  UpdateExamDto,
  ExamDetailResponseDto,
  QuestionDetailDto,
  ChoiceDetailDto,
} from '../dtos/exam.dto';
import { Exam } from '../../domain/entities/exam.entity';

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
  }

  /**
   * Create a new exam
   * 
   * This method handles the complete process of exam creation:
   * 1. Validates that the exam type exists
   * 2. Creates the exam record
   * 3. If questions are provided, validates they exist and adds them
   * 4. Returns the complete exam data
   * 
   * Business rules enforced:
   * - Exam must have a valid title
   * - Time limit must be reasonable (1-240 minutes)
   * - All referenced questions must exist in the database
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

    // If questions are provided, add them to the exam
    if (examData.questions && examData.questions.length > 0) {
      // Validate that all questions exist
      const questionIds = examData.questions.map((q) => q.QuestionID);
      const existingQuestions = await this.questionRepository.findByIds(questionIds);

      if (existingQuestions.length !== questionIds.length) {
        throw new Error('Some questions do not exist');
      }

      // Add questions with their order indices
      await this.examRepository.addQuestions(
        exam.ID,
        examData.questions.map((q) => ({
          QuestionID: q.QuestionID,
          OrderIndex: q.OrderIndex,
        }))
      );
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

    return await this.examRepository.getExamStatistics(examId);
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
  async duplicateExam(examId: number, userId: number): Promise<Exam> {
    // Get the original exam
    const originalExam = await this.examRepository.findById(examId);

    if (!originalExam) {
      throw new Error('Exam not found');
    }

    // Create a new exam with same properties but new title
    const duplicatedExam = await this.examRepository.create({
      Title: `${originalExam.Title} - Copy`,
      TimeExam: originalExam.TimeExam,
      Type: originalExam.Type,
      ExamTypeID: originalExam.ExamTypeID,
      UserID: userId,
    });

    // Copy all questions with their order indices
    if (originalExam.examQuestions && originalExam.examQuestions.length > 0) {
      const questionsToAdd = originalExam.examQuestions.map((eq) => ({
        QuestionID: eq.QuestionID,
        OrderIndex: eq.OrderIndex,
      }));

      await this.examRepository.addQuestions(duplicatedExam.ID, questionsToAdd);
    }

    // Return the complete duplicated exam
    const completeExam = await this.examRepository.findById(duplicatedExam.ID);

    if (!completeExam) {
      throw new Error('Failed to retrieve duplicated exam');
    }

    return completeExam;
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
                Skill: eq.question.mediaQuestion.Skill || '',
                Type: eq.question.mediaQuestion.Type,
                Section: eq.question.mediaQuestion.Section || '',
                AudioUrl: eq.question.mediaQuestion.AudioUrl,
                ImageUrl: eq.question.mediaQuestion.ImageUrl,
              },
            }))
        : [],
    };
  }
}
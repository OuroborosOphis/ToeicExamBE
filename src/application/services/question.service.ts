import { QuestionRepository } from '../../infrastructure/repositories/question.repository';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  QuestionFilterDto,
  PaginatedQuestionsResponseDto,
  QuestionListResponseDto,
  BulkQuestionOperationDto,
} from '../dtos/question.dto';
import { Question } from '../../domain/entities/question.entity';

/**
 * QuestionService handles business logic for question management
 * 
 * This service is primarily used by administrators and teachers for
 * managing the question bank. It handles:
 * - Creating questions with media and choices
 * - Updating existing questions
 * - Searching and filtering questions
 * - Getting usage statistics
 * - Bulk operations on multiple questions
 * 
 * Questions are the building blocks of exams. A well-organized
 * question bank allows quick creation of new exams by selecting
 * and reusing existing quality questions.
 */
export class QuestionService {
  private questionRepository: QuestionRepository;

  constructor() {
    this.questionRepository = new QuestionRepository();
  }

  /**
   * Create a new question with media and choices
   * 
   * This method orchestrates the complex process of creating a complete
   * question. A TOEIC question consists of three parts:
   * 1. Media: audio file, image, or text passage
   * 2. Question: the actual question text or stem
   * 3. Choices: multiple answer options (typically 4 for TOEIC)
   * 
   * All three parts must be created together atomically. If any part
   * fails, the entire operation is rolled back.
   * 
   * Business rules enforced:
   * - Question must have at least 2 choices (typically 4)
   * - Exactly one choice must be marked as correct
   * - Choice attributes must be unique (can't have two "A" choices)
   * - Media URLs must be valid (or will be once uploaded)
   * - For listening questions, audio URL is required
   * 
   * @param questionData - Complete question data including media and choices
   * @param userId - ID of user creating the question (admin or teacher)
   * @returns Created question with all relations
   * @throws Error if validation fails
   */
  async createQuestion(
    questionData: CreateQuestionDto,
    userId: number
  ): Promise<Question> {
    // Validate choices
    this.validateChoices(questionData.Choices);

    // Validate media requirements based on skill type
    this.validateMediaRequirements(questionData.Media);

    // Create the complete question through repository
    const question = await this.questionRepository.create(
      {
        QuestionText: questionData.QuestionText,
        UserID: userId,
      },
      {
        Skill: questionData.Media.Skill,
        Type: questionData.Media.Type,
        Section: questionData.Media.Section,
        AudioUrl: questionData.Media.AudioUrl,
        ImageUrl: questionData.Media.ImageUrl,
        Scirpt: questionData.Media.Script, // Note: original schema typo
      },
      questionData.Choices.map((choice) => ({
        Content: choice.Content,
        Attribute: choice.Attribute,
        IsCorrect: choice.IsCorrect,
      }))
    );

    return question;
  }

  /**
   * Get question by ID
   * 
   * Retrieves complete question data including media and all choices.
   * Note: This includes the IsCorrect flag, so this method should only
   * be called by administrators and teachers, not students.
   * 
   * Students see questions through the ExamService which strips out
   * the correct answer information.
   * 
   * @param questionId - ID of question to retrieve
   * @returns Complete question data
   * @throws Error if question not found
   */
  async getQuestionById(questionId: number): Promise<Question> {
    const question = await this.questionRepository.findById(questionId);

    if (!question) {
      throw new Error('Question not found');
    }

    return question;
  }

  /**
   * Search and filter questions
   * 
   * This is the core method for the question bank UI. It allows
   * administrators and teachers to search for questions by:
   * - Skill (Listening or Reading)
   * - Section (Part 1-7)
   * - Question type
   * - Text search (searches in question text and scripts)
   * 
   * Results are paginated for performance. With potentially thousands
   * of questions, loading them all at once would be slow.
   * 
   * Use cases:
   * - Building a new exam by browsing questions
   * - Finding questions that need updating
   * - Analyzing question distribution across types
   * 
   * @param filters - Search and filter criteria
   * @returns Paginated list of questions with metadata
   */
  async searchQuestions(
    filters: QuestionFilterDto
  ): Promise<PaginatedQuestionsResponseDto> {
    const { questions, total } = await this.questionRepository.findWithFilters({
      Skill: filters.Skill,
      Section: filters.Section,
      Type: filters.Type,
      SearchText: filters.SearchText,
      Page: filters.Page,
      Limit: filters.Limit,
    });

    // Transform to response DTOs with usage information
    const questionDtos = await Promise.all(
      questions.map(async (q) => {
        const usage = await this.questionRepository.getUsageStats(q.ID);

        return this.transformToQuestionListResponse(q, usage?.usedInExams || 0);
      })
    );

    const currentPage = filters.Page || 1;
    const limit = filters.Limit || 20;
    const totalPages = Math.ceil(total / limit);

    return {
      Questions: questionDtos,
      Pagination: {
        CurrentPage: currentPage,
        TotalPages: totalPages,
        TotalQuestions: total,
        Limit: limit,
      },
    };
  }

  /**
   * Update an existing question
   * 
   * Allows updating any aspect of a question: the text, media URLs,
   * or the answer choices.
   * 
   * Important consideration: Updating a question affects all exams
   * that use it. This is both a feature and a risk:
   * - Feature: Fix a typo once and it's fixed everywhere
   * - Risk: Change answer key and it affects all historical attempts
   * 
   * In production, you might want to:
   * - Version questions (keep old version when updating)
   * - Only allow updates if question hasn't been used in submitted exams
   * - Require approval for changes to widely-used questions
   * 
   * @param questionId - ID of question to update
   * @param updateData - Fields to update
   * @param userId - ID of user making the update
   * @returns Updated question
   * @throws Error if question not found or validation fails
   */
  async updateQuestion(
    questionId: number,
    updateData: UpdateQuestionDto,
    userId: number
  ): Promise<Question> {
    const existingQuestion = await this.questionRepository.findById(questionId);

    if (!existingQuestion) {
      throw new Error('Question not found');
    }

    // Check if this is a widely-used question
    const usage = await this.questionRepository.getUsageStats(questionId);
    if (usage && usage.usedInExams > 5) {
      console.warn(
        `Warning: Updating question ${questionId} which is used in ${usage.usedInExams} exams`
      );
      // In production, might require special permission or create new version
    }

    // Validate updated choices if provided
    if (updateData.Choices) {
      this.validateChoices(updateData.Choices);
    }

    // Validate updated media if provided
    if (updateData.Media) {
      this.validateMediaRequirements(updateData.Media);
    }

    const updatedQuestion = await this.questionRepository.update(
      questionId,
      updateData.QuestionText ? { QuestionText: updateData.QuestionText } : undefined,
      updateData.Media
        ? {
            Skill: updateData.Media.Skill,
            Type: updateData.Media.Type,
            Section: updateData.Media.Section,
            AudioUrl: updateData.Media.AudioUrl,
            ImageUrl: updateData.Media.ImageUrl,
            Scirpt: updateData.Media.Script,
          }
        : undefined,
      updateData.Choices?.map((choice) => ({
        Content: choice.Content,
        Attribute: choice.Attribute,
        IsCorrect: choice.IsCorrect,
      }))
    );

    if (!updatedQuestion) {
      throw new Error('Failed to update question');
    }

    return updatedQuestion;
  }

  /**
   * Delete a question
   * 
   * Removes a question from the system.
   * 
   * Important: This also removes the question from any exams that use it.
   * This could break exams if not careful.
   * 
   * Business rules to consider:
   * - Should we allow deleting questions used in exams?
   * - Should we only allow deletion if no student attempts exist?
   * - Should we implement soft delete instead?
   * 
   * Current implementation allows deletion but warns if question is
   * widely used. In production, you'd want stricter controls.
   * 
   * @param questionId - ID of question to delete
   * @param userId - ID of user requesting deletion
   * @returns True if deleted successfully
   * @throws Error if question not found or has usage constraints
   */
  async deleteQuestion(questionId: number, userId: number): Promise<boolean> {
    const question = await this.questionRepository.findById(questionId);

    if (!question) {
      throw new Error('Question not found');
    }

    // Check usage
    const usage = await this.questionRepository.getUsageStats(questionId);

    if (usage && usage.usedInExams > 0) {
      throw new Error(
        `Cannot delete question that is used in ${usage.usedInExams} exam(s). ` +
        `Remove it from all exams first.`
      );
    }

    return await this.questionRepository.delete(questionId);
  }

  /**
   * Get question usage statistics
   * 
   * Provides insights into how a question is being used:
   * - How many exams include this question
   * - How many students have attempted it
   * - What percentage got it correct
   * - Estimated difficulty based on success rate
   * 
   * This information helps evaluate question quality.
   * Questions with very high or very low success rates might need review.
   * 
   * @param questionId - ID of question to analyze
   * @returns Usage statistics
   */
  async getQuestionStatistics(questionId: number): Promise<any> {
    const question = await this.questionRepository.findById(questionId);

    if (!question) {
      throw new Error('Question not found');
    }

    return await this.questionRepository.getUsageStats(questionId);
  }

  /**
   * Get questions by section for practice mode
   * 
   * When students want to practice specific parts (e.g., "I want to
   * practice Part 5 - Incomplete Sentences"), this method retrieves
   * relevant questions.
   * 
   * The limit parameter allows controlling practice session length.
   * For example, a quick practice might use 10 questions while a
   * thorough review might use 30.
   * 
   * @param sections - Array of section numbers to practice
   * @param limit - Maximum number of questions to return
   * @returns Questions for the specified sections
   */
  async getQuestionsBySection(
    sections: string[],
    limit?: number
  ): Promise<Question[]> {
    if (!sections || sections.length === 0) {
      throw new Error('At least one section must be specified');
    }

    return await this.questionRepository.getQuestionsBySection(sections, limit);
  }

  /**
   * Perform bulk operations on multiple questions
   * 
   * Allows efficient operations on many questions at once:
   * - Bulk delete: Remove multiple questions (e.g., cleanup)
   * - Add to exam: Add many questions to an exam at once
   * 
   * This is much more efficient than performing operations one by one.
   * 
   * @param operation - Operation details and question IDs
   * @param userId - ID of user performing operation
   * @returns Result summary of the operation
   */
  async performBulkOperation(
    operation: BulkQuestionOperationDto,
    userId: number
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    switch (operation.Operation) {
      case 'DELETE':
        try {
          const deletedCount = await this.questionRepository.bulkDelete(
            operation.QuestionIDs
          );
          result.success = deletedCount;
        } catch (error) {
          result.failed = operation.QuestionIDs.length;
          result.errors.push(`Bulk delete failed: ${(error as Error).message}`);
        }
        break;

      case 'ADD_TO_EXAM':
        // This would require exam repository access
        // For now, return not implemented
        result.failed = operation.QuestionIDs.length;
        result.errors.push('ADD_TO_EXAM operation should be handled by ExamService');
        break;

      default:
        result.failed = operation.QuestionIDs.length;
        result.errors.push(`Unknown operation: ${operation.Operation}`);
    }

    return result;
  }

  /**
   * Validate choice configuration
   * 
   * Ensures that choices meet business rules:
   * - At least 2 choices required
   * - Exactly one choice must be correct
   * - Choice attributes must be unique
   * - All choices must have content
   * 
   * These validations ensure question integrity.
   * A question with two correct answers or no correct answer
   * would be unfair to students.
   * 
   * @param choices - Array of choices to validate
   * @throws Error if validation fails
   */
  private validateChoices(choices: any[]): void {
    if (choices.length < 2) {
      throw new Error('Question must have at least 2 choices');
    }

    // Check exactly one correct answer
    const correctChoices = choices.filter((c) => c.IsCorrect);
    if (correctChoices.length !== 1) {
      throw new Error('Question must have exactly one correct answer');
    }

    // Check unique attributes
    const attributes = choices.map((c) => c.Attribute);
    const uniqueAttributes = new Set(attributes);
    if (attributes.length !== uniqueAttributes.size) {
      throw new Error('Choice attributes must be unique');
    }

    // Check all choices have content
    const emptyChoices = choices.filter((c) => !c.Content || c.Content.trim() === '');
    if (emptyChoices.length > 0) {
      throw new Error('All choices must have content');
    }
  }

  /**
   * Validate media requirements
   * 
   * Different question types have different media requirements:
   * - Listening questions need audio URL
   * - Some questions need images (Part 1, Part 7 documents)
   * - Reading passages need script text
   * 
   * This validation ensures questions have the necessary assets
   * to be displayed correctly.
   * 
   * @param media - Media data to validate
   * @throws Error if validation fails
   */
  private validateMediaRequirements(media: any): void {
    // Listening questions require audio
    if (media.Skill === 'LISTENING' && !media.AudioUrl) {
      throw new Error('Listening questions must have audio URL');
    }

    // Part 1 (Photo description) requires image
    if (media.Section === '1' && !media.ImageUrl) {
      throw new Error('Part 1 questions must have an image');
    }

    // Validate URLs if provided
    if (media.AudioUrl && !this.isValidUrl(media.AudioUrl)) {
      throw new Error('Invalid audio URL format');
    }

    if (media.ImageUrl && !this.isValidUrl(media.ImageUrl)) {
      throw new Error('Invalid image URL format');
    }
  }

  /**
   * Check if string is a valid URL
   * 
   * Simple URL validation. For local development, we accept
   * paths like '/uploads/audio/file.mp3'. In production with
   * Cloudinary, these would be full HTTPS URLs.
   * 
   * @param url - URL string to validate
   * @returns True if valid URL format
   */
  private isValidUrl(url: string): boolean {
    // Accept both full URLs and relative paths
    return url.startsWith('http://') || 
           url.startsWith('https://') || 
           url.startsWith('/');
  }

  /**
   * Transform question entity to list response DTO
   * 
   * Formats question data for display in lists (like question bank).
   * Includes usage count so administrators can see which questions
   * are popular and which are unused.
   * 
   * @param question - Question entity from database
   * @param usageCount - Number of exams using this question
   * @returns Formatted response DTO
   */
  private transformToQuestionListResponse(
    question: Question,
    usageCount: number
  ): QuestionListResponseDto {
    return {
      ID: question.ID,
      QuestionText: question.QuestionText || '',
      Media: {
        Skill: question.mediaQuestion.Skill || '',
        Type: question.mediaQuestion.Type,
        Section: question.mediaQuestion.Section || '',
        AudioUrl: question.mediaQuestion.AudioUrl,
        ImageUrl: question.mediaQuestion.ImageUrl,
        Script: question.mediaQuestion.Scirpt,
      },
      Choices: question.choices.map((choice) => ({
        ID: choice.ID,
        Attribute: choice.Attribute || '',
        Content: choice.Content || '',
        IsCorrect: choice.IsCorrect,
      })),
      UsageCount: usageCount,
      CreatedBy: question.UserID || 0,
    };
  }
}
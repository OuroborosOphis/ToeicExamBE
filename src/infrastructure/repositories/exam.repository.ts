import { Repository } from 'typeorm';
import { AppDataSource } from '../database/config';
import { Exam } from '../../domain/entities/exam.entity';
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
}
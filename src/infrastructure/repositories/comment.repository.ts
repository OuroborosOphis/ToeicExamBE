import { Repository } from 'typeorm';
import { AppDataSource } from '../database/config';
import { Comment } from '../../domain/entities/comment.entity';

/**
 * CommentRepository handles all database operations for comments
 * 
 * Comments enable discussion and Q&A features on exams, allowing:
 * - Students to ask questions about specific problems
 * - Students to share insights and strategies
 * - Teachers to provide clarification
 * - Threaded discussions via parent-child relationships
 * 
 * The hierarchical structure (ParentId) allows nested comments
 * similar to Reddit or forum-style discussions.
 */
export class CommentRepository {
  private repository: Repository<Comment>;

  constructor() {
    this.repository = AppDataSource.getRepository(Comment);
  }

  /**
   * Create a new comment
   * 
   * Creates a comment record with:
   * - Content: The actual comment text
   * - ExamID: Which exam this comment is about
   * - StudentProfileID: Who wrote it
   * - ParentId: 0 for top-level, or ID of parent comment for replies
   * - Status: Default to 1 (approved) or 0 (pending) based on policy
   * - CreateAt: Timestamp set automatically
   * 
   * @param commentData - Comment data to create
   * @returns Created comment with ID
   */
  async create(commentData: Partial<Comment>): Promise<Comment> {
    const comment = this.repository.create({
      ...commentData,
      CreateAt: new Date(),
      Status: commentData.Status || 1, // Default to approved
    });
    
    return await this.repository.save(comment);
  }

  /**
   * Find comment by ID with author information
   * 
   * Loads:
   * - Comment content and metadata
   * - Author's profile and user info (name, but not sensitive data)
   * - Associated exam information
   * 
   * This gives us everything needed to display a comment properly.
   * 
   * @param id - Comment ID
   * @returns Comment with author and exam info or null
   */
  async findById(id: number): Promise<Comment | null> {
    return await this.repository.findOne({
      where: { ID: id },
      relations: ['studentProfile', 'studentProfile.user', 'exam'],
    });
  }

  /**
   * Find all comments with filtering and pagination
   * 
   * @param options - Filtering and pagination options
   * @returns Object with comments array and total count
   */
  async findAll(options: {
    page: number;
    limit: number;
    examId?: number;
    status?: number;
    sortBy?: string;
    order?: 'ASC' | 'DESC';
  }): Promise<{ comments: Comment[]; total: number }> {
    const {
      page,
      limit,
      examId,
      status = 1,
      sortBy = 'CreateAt', // ⚠️ Use correct entity field name
      order = 'DESC',
    } = options;

    const skip = (page - 1) * limit;

    // Map sortBy to valid entity fields
    const validSortFields: { [key: string]: string } = {
      createdAt: 'comment.CreateAt',
      updatedAt: 'comment.UpdateAt',
      likes: 'comment.Likes', // If exists in entity
    };

    // Get the column name, default to CreateAt if invalid
    const orderByColumn = validSortFields[sortBy] || 'comment.CreateAt';

    // Build query builder
    const queryBuilder = this.repository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.studentProfile', 'studentProfile')
      .leftJoinAndSelect('studentProfile.user', 'user')
      .leftJoinAndSelect('comment.exam', 'exam');

    // Apply filters
    if (examId) {
      queryBuilder.andWhere('comment.ExamID = :examId', { examId });
    }

    if (status !== undefined) {
      queryBuilder.andWhere('comment.Status = :status', { status });
    }

    // Apply sorting - use mapped column name with full alias
    queryBuilder.orderBy(orderByColumn, order);

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    // Get comments and total count
    const [comments, total] = await queryBuilder.getManyAndCount();

    return { comments, total };
  }

  /**
   * Find all comments for an exam with filtering
   * 
   * Returns comments for a specific exam, with options to:
   * - Filter by status (approved, hidden, flagged)
   * - Get only top-level comments (ParentId = 0)
   * - Paginate results
   * 
   * Ordered by creation time (newest first by default).
   * 
   * This powers the comment section display on exam pages.
   * 
   * @param examId - Exam ID to get comments for
   * @param filters - Optional filtering criteria
   * @returns Object with comments array and total count
   */
  async findByExamId(
    examId: number,
    filters?: {
      Status?: number;
      ParentId?: number;
      Page?: number;
      Limit?: number;
    }
  ): Promise<{ comments: Comment[]; total: number }> {
    const page = filters?.Page || 1;
    const limit = filters?.Limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.studentProfile', 'profile')
      .leftJoinAndSelect('profile.user', 'user')
      .where('comment.ExamID = :examId', { examId });

    // Filter by status (default to approved comments only)
    if (filters?.Status !== undefined) {
      queryBuilder.andWhere('comment.Status = :status', {
        status: filters.Status,
      });
    } else {
      queryBuilder.andWhere('comment.Status = 1'); // Show only approved by default
    }

    // Filter by ParentId (for getting top-level or specific thread)
    if (filters?.ParentId !== undefined) {
      queryBuilder.andWhere('comment.ParentId = :parentId', {
        parentId: filters.ParentId,
      });
    }

    // Get total count before pagination
    const total = await queryBuilder.getCount();

    // Apply pagination and ordering
    queryBuilder
      .orderBy('comment.CreateAt', 'DESC')
      .skip(skip)
      .take(limit);

    const comments = await queryBuilder.getMany();

    return { comments, total };
  }

  /**
   * Get comment thread (parent and all replies)
   * 
   * Given a comment ID, this returns:
   * - The parent comment
   * - All direct replies to that comment
   * - Nested replies (replies to replies)
   * 
   * This builds a complete discussion thread for display.
   * More efficient than making multiple queries.
   * 
   * @param commentId - Parent comment ID
   * @returns Complete thread with nested replies
   */
  async getCommentThread(commentId: number): Promise<Comment | null> {
    // Get the parent comment
    const parentComment = await this.findById(commentId);
    
    if (!parentComment) {
      return null;
    }

    // Get all replies recursively
    const replies = await this.getReplies(commentId);
    
    // Attach replies to parent
    (parentComment as any).replies = replies;
    
    return parentComment;
  }

  /**
   * Get all replies to a comment (recursive)
   * 
   * This is a helper method that builds a tree of replies.
   * For each reply, it recursively gets its replies too,
   * creating a nested structure.
   * 
   * @param parentId - Parent comment ID
   * @returns Array of replies with nested replies
   */
  private async getReplies(parentId: number): Promise<Comment[]> {
    const directReplies = await this.repository.find({
      where: {
        ParentId: parentId,
        Status: 1, // Only approved replies
      },
      relations: ['studentProfile', 'studentProfile.user'],
      order: {
        CreateAt: 'ASC', // Older replies first for better reading flow
      },
    });

    // For each reply, get its replies recursively
    const repliesWithNested = await Promise.all(
      directReplies.map(async (reply) => {
        const nestedReplies = await this.getReplies(reply.ID);
        (reply as any).replies = nestedReplies;
        return reply;
      })
    );

    return repliesWithNested;
  }

  /**
   * Update a comment
   * 
   * Allows editing comment content.
   * 
   * Important: Should verify that the user making the update
   * is the original author (this check happens in service layer).
   * 
   * @param id - Comment ID to update
   * @param updates - Fields to update (typically just Content)
   * @returns Updated comment or null if not found
   */
  async update(id: number, updates: Partial<Comment>): Promise<Comment | null> {
    const comment = await this.findById(id);
    
    if (!comment) {
      return null;
    }

    Object.assign(comment, updates);
    return await this.repository.save(comment);
  }

  /**
   * Change comment status (moderation)
   * 
   * Allows moderators to:
   * - Approve pending comments (0 → 1)
   * - Hide inappropriate comments (any → 2)
   * - Flag comments for review (any → 3)
   * 
   * This is key for content moderation.
   * 
   * @param id - Comment ID
   * @param status - New status (1: approved, 2: hidden, 3: flagged)
   * @returns Updated comment or null if not found
   */
  async updateStatus(id: number, status: number): Promise<Comment | null> {
    const comment = await this.findById(id);
    
    if (!comment) {
      return null;
    }

    comment.Status = status;
    return await this.repository.save(comment);
  }

  /**
   * Delete a comment and all its replies
   * 
   * This is a cascade delete that removes:
   * - The comment itself
   * - All direct replies to it
   * - All nested replies (replies to replies)
   * 
   * This ensures no orphaned comments remain.
   * 
   * Use with caution as this permanently removes discussion history.
   * Consider soft delete (Status = 2) instead for production.
   * 
   * @param id - Comment ID to delete
   * @returns True if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const comment = await this.findById(id);
    
    if (!comment) {
      return false;
    }

    // First, recursively delete all replies
    await this.deleteReplies(id);
    
    // Then delete the comment itself
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  /**
   * Recursively delete all replies to a comment
   * 
   * Helper method for delete() that ensures all nested
   * replies are removed before deleting parent.
   * 
   * @param parentId - Parent comment ID
   */
  private async deleteReplies(parentId: number): Promise<void> {
    const replies = await this.repository.find({
      where: { ParentId: parentId },
    });

    for (const reply of replies) {
      // Recursively delete this reply's replies
      await this.deleteReplies(reply.ID);
      // Then delete the reply itself
      await this.repository.delete(reply.ID);
    }
  }

  /**
   * Get comment count for an exam
   * 
   * Returns the total number of comments (approved only)
   * for a specific exam.
   * 
   * Useful for displaying "X comments" on exam cards.
   * 
   * @param examId - Exam ID
   * @returns Number of comments
   */
  async getCountByExamId(examId: number): Promise<number> {
    return await this.repository.count({
      where: {
        ExamID: examId,
        Status: 1, // Only count approved comments
      },
    });
  }

  /**
   * Get reply count for a comment
   * 
   * Returns how many direct replies a comment has.
   * 
   * Used to show "X replies" and implement "Load more replies"
   * functionality in the UI.
   * 
   * @param commentId - Comment ID
   * @returns Number of replies
   */
  async getReplyCount(commentId: number): Promise<number> {
    return await this.repository.count({
      where: {
        ParentId: commentId,
        Status: 1,
      },
    });
  }

  /**
   * Get comments by student
   * 
   * Returns all comments made by a specific student,
   * ordered by most recent first.
   * 
   * Useful for user profile pages showing their activity.
   * 
   * @param studentProfileId - Student's profile ID
   * @param limit - Maximum number of comments to return
   * @returns Array of comments with exam info
   */
  async findByStudentId(
    studentProfileId: number,
    limit?: number
  ): Promise<Comment[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.exam', 'exam')
      .where('comment.StudentProfileID = :studentProfileId', { studentProfileId })
      .andWhere('comment.Status = 1')
      .orderBy('comment.CreateAt', 'DESC');

    if (limit) {
      queryBuilder.take(limit);
    }

    return await queryBuilder.getMany();
  }

  /**
   * Get flagged comments for moderation
   * 
   * Returns comments that have been reported by users
   * or flagged by the system, ordered by most recent first.
   * 
   * This helps moderators review potentially problematic content.
   * 
   * @returns Array of flagged comments with context
   */
  async getFlaggedComments(): Promise<Comment[]> {
    return await this.repository.find({
      where: { Status: 3 },
      relations: ['studentProfile', 'studentProfile.user', 'exam'],
      order: { CreateAt: 'DESC' },
    });
  }

  /**
   * Search comments by content
   * 
   * Finds comments containing specific text.
   * Useful for moderation and finding discussions on specific topics.
   * 
   * @param searchText - Text to search for
   * @param examId - Optional: limit search to specific exam
   * @returns Array of matching comments
   */
  async searchComments(
    searchText: string,
    examId?: number
  ): Promise<Comment[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.studentProfile', 'profile')
      .leftJoinAndSelect('profile.user', 'user')
      .leftJoinAndSelect('comment.exam', 'exam')
      .where('comment.Content LIKE :searchText', {
        searchText: `%${searchText}%`,
      })
      .andWhere('comment.Status = 1');

    if (examId) {
      queryBuilder.andWhere('comment.ExamID = :examId', { examId });
    }

    return await queryBuilder
      .orderBy('comment.CreateAt', 'DESC')
      .getMany();
  }
}
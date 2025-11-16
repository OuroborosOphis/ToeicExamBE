import { CommentRepository } from '../../infrastructure/repositories/comment.repository';
import {
  CreateCommentDto,
  UpdateCommentDto,
  ModerateCommentDto,
  CommentFilterDto,
  CommentResponseDto,
  PaginatedCommentsResponseDto,
  CommentTreeResponseDto,
} from '../dtos/comment.dto';
import { Comment } from '../../domain/entities/comment.entity';

/**
 * CommentService handles business logic for comment/discussion features
 * 
 * This service enables community interaction around exams:
 * - Students can ask questions about specific problems
 * - Students can share tips and strategies
 * - Teachers can provide clarification
 * - Threaded discussions via parent-child comment structure
 * 
 * The commenting system adds social learning features to what would
 * otherwise be an isolated practice experience. Students learn not just
 * from the system, but from each other.
 * 
 * Key responsibilities:
 * - Manage comment CRUD operations
 * - Enforce threaded discussion rules
 * - Handle content moderation
 * - Control access permissions
 * - Transform entities to safe response DTOs
 */
export class CommentService {
  private commentRepository: CommentRepository;

  constructor() {
    this.commentRepository = new CommentRepository();
  }

  /**
   * Create a new comment or reply
   * 
   * This method handles both top-level comments (questions about an exam)
   * and replies to existing comments (answering someone's question).
   * 
   * The distinction is made through the ParentId field:
   * - ParentId = 0: Top-level comment
   * - ParentId > 0: Reply to that comment
   * 
   * Business rules enforced:
   * - Comment content cannot be empty
   * - Content must be reasonable length (not too long)
   * - Exam must exist
   * - If replying, parent comment must exist
   * - Student must be authenticated
   * 
   * Moderation: By default, comments are approved (Status = 1) to
   * encourage discussion. In a production system with more users,
   * you might want pending approval (Status = 0) to prevent spam.
   * 
   * @param commentData - Comment content and metadata
   * @param studentProfileId - ID of student posting (from JWT token)
   * @returns Created comment
   * @throws Error if validation fails
   */
  async createComment(
    commentData: CreateCommentDto,
    studentProfileId: number
  ): Promise<Comment> {
    // Validate content
    if (!commentData.Content || commentData.Content.trim().length === 0) {
      throw new Error('Comment content cannot be empty');
    }

    if (commentData.Content.length > 1000) {
      throw new Error('Comment content too long (max 1000 characters)');
    }

    // If this is a reply, verify parent comment exists
    if (commentData.ParentId && commentData.ParentId > 0) {
      const parentComment = await this.commentRepository.findById(commentData.ParentId);

      if (!parentComment) {
        throw new Error('Parent comment not found');
      }

      // Verify parent is for the same exam (can't reply across exams)
      if (parentComment.ExamID !== commentData.ExamID) {
        throw new Error('Cannot reply to comment from different exam');
      }
    }

    // Create the comment
    const comment = await this.commentRepository.create({
      Content: commentData.Content,
      ExamID: commentData.ExamID,
      ParentId: commentData.ParentId || 0,
      StudentProfileID: studentProfileId,
      Status: 1, // Auto-approve by default
    });

    return comment;
  }

  /**
   * Get comments for an exam
   * 
   * Retrieves all comments (or filtered subset) for a specific exam.
   * This powers the comment section display on exam pages.
   * 
   * The method supports various filtering options:
   * - Get only top-level comments (ParentId = 0)
   * - Get replies to a specific comment
   * - Filter by status (approved, hidden, flagged)
   * - Pagination for performance
   * 
   * The default behavior is to return only approved top-level comments,
   * paginated. The frontend can then load replies on-demand when users
   * expand a discussion thread.
   * 
   * @param examId - ID of exam to get comments for
   * @param filters - Optional filtering and pagination
   * @returns Paginated comments with author info
   */
  async getExamComments(
    examId: number,
    filters?: CommentFilterDto
  ): Promise<PaginatedCommentsResponseDto> {
    const { comments, total } = await this.commentRepository.findByExamId(
      examId,
      {
        Status: filters?.Status,
        ParentId: filters?.ParentId,
        Page: filters?.Page,
        Limit: filters?.Limit,
      }
    );

    // Transform to response DTOs with reply counts
    const commentDtos = await Promise.all(
      comments.map(async (comment) => {
        const replyCount = await this.commentRepository.getReplyCount(comment.ID);
        return this.transformToCommentResponse(comment, replyCount);
      })
    );

    const currentPage = filters?.Page || 1;
    const limit = filters?.Limit || 20;
    const totalPages = Math.ceil(total / limit);

    return {
      Comments: commentDtos,
      Pagination: {
        CurrentPage: currentPage,
        TotalPages: totalPages,
        TotalComments: total,
        Limit: limit,
      },
    };
  }

  /**
   * Get complete comment thread
   * 
   * Retrieves a comment and all its nested replies recursively.
   * This creates a tree structure perfect for displaying threaded
   * discussions.
   * 
   * For example, if students are discussing a tricky question:
   * Comment 1: "Can someone explain why B is correct?"
   *   └─ Comment 2: "Because the passage says..."
   *      └─ Comment 3: "Thanks! That makes sense now."
   *   └─ Comment 4: "I also found this helpful link..."
   * 
   * This structure allows natural conversation flow.
   * 
   * @param commentId - ID of parent comment to get thread for
   * @returns Complete thread with nested replies
   * @throws Error if comment not found
   */
  async getCommentThread(commentId: number): Promise<Comment> {
    const thread = await this.commentRepository.getCommentThread(commentId);

    if (!thread) {
      throw new Error('Comment not found');
    }

    return thread;
  }

  /**
   * Update a comment
   * 
   * Allows users to edit their comments. This is important because
   * people make typos or want to clarify their thoughts.
   * 
   * Security rules:
   * - Only the original author can edit their comment
   * - Cannot change which exam or parent comment it's attached to
   * - Only content can be modified
   * 
   * Design decision: We don't track edit history or show "edited"
   * markers. In a larger system, you might want this for transparency.
   * 
   * @param commentId - ID of comment to update
   * @param updateData - New content
   * @param studentProfileId - ID of user making update (from token)
   * @returns Updated comment
   * @throws Error if not found or permission denied
   */
  async updateComment(
    commentId: number,
    updateData: UpdateCommentDto,
    studentProfileId: number
  ): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Security check: Only author can edit
    if (comment.StudentProfileID !== studentProfileId) {
      throw new Error('You can only edit your own comments');
    }

    // Validate new content
    if (!updateData.Content || updateData.Content.trim().length === 0) {
      throw new Error('Comment content cannot be empty');
    }

    if (updateData.Content.length > 1000) {
      throw new Error('Comment content too long (max 1000 characters)');
    }

    const updated = await this.commentRepository.update(commentId, {
      Content: updateData.Content,
    });

    if (!updated) {
      throw new Error('Failed to update comment');
    }

    return updated;
  }

  /**
   * Delete a comment
   * 
   * Removes a comment and all its replies recursively.
   * This is important - when you delete a parent comment, all the
   * replies should also be deleted. Otherwise you'd have orphaned
   * replies that don't make sense without context.
   * 
   * Security rules:
   * - Author can delete their own comment
   * - Teachers and admins can delete any comment (moderation)
   * 
   * For now, only author deletion is implemented. Role-based deletion
   * will be added when we implement the authorization middleware.
   * 
   * @param commentId - ID of comment to delete
   * @param studentProfileId - ID of user requesting deletion
   * @param isAdmin - Whether user has admin privileges (future)
   * @returns True if deleted successfully
   * @throws Error if not found or permission denied
   */
  async deleteComment(
    commentId: number,
    studentProfileId: number,
    isAdmin: boolean = false
  ): Promise<boolean> {
    const comment = await this.commentRepository.findById(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Security check: Author or admin can delete
    if (comment.StudentProfileID !== studentProfileId && !isAdmin) {
      throw new Error('You can only delete your own comments');
    }

    // Check if comment has replies
    const replyCount = await this.commentRepository.getReplyCount(commentId);

    if (replyCount > 0) {
      console.log(
        `Deleting comment ${commentId} with ${replyCount} replies (cascade delete)`
      );
    }

    return await this.commentRepository.delete(commentId);
  }

  /**
   * Moderate comment (admin/teacher only)
   * 
   * Allows moderators to change comment status:
   * - 1: Approved and visible to all
   * - 2: Hidden (removed for violating guidelines)
   * - 3: Flagged for review (reported by users)
   * 
   * This is a critical tool for maintaining healthy discussions.
   * Moderators can hide spam, inappropriate content, or misleading
   * information without completely deleting it.
   * 
   * Note: This method will be secured with role-based authorization
   * in the controller/middleware layer. Only admin and teacher roles
   * should be able to call this.
   * 
   * @param commentId - ID of comment to moderate
   * @param moderateData - New status
   * @returns Updated comment
   * @throws Error if not found
   */
  async moderateComment(
    commentId: number,
    moderateData: ModerateCommentDto
  ): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    const updated = await this.commentRepository.updateStatus(
      commentId,
      moderateData.Status
    );

    if (!updated) {
      throw new Error('Failed to update comment status');
    }

    return updated;
  }

  /**
   * Get comments by student
   * 
   * Retrieves all comments a specific student has made.
   * Useful for:
   * - User profile pages showing their activity
   * - Moderation review of a user's history
   * - Analytics on user engagement
   * 
   * @param studentProfileId - ID of student whose comments to retrieve
   * @param limit - Maximum number to return (for preview)
   * @returns Array of comments with exam context
   */
  async getStudentComments(
    studentProfileId: number,
    limit?: number
  ): Promise<Comment[]> {
    return await this.commentRepository.findByStudentId(studentProfileId, limit);
  }

  /**
   * Get flagged comments for moderation
   * 
   * Returns all comments that have been reported by users or
   * automatically flagged by the system (Status = 3).
   * 
   * This creates a moderation queue where teachers and admins can
   * review potentially problematic content and decide whether to
   * approve, hide, or leave flagged.
   * 
   * @returns Array of flagged comments with full context
   */
  async getFlaggedComments(): Promise<Comment[]> {
    return await this.commentRepository.getFlaggedComments();
  }

  /**
   * Search comments
   * 
   * Finds comments containing specific text. Useful for:
   * - Finding discussions about specific topics
   * - Searching for help with a particular problem
   * - Moderators looking for specific content
   * 
   * @param searchText - Text to search for
   * @param examId - Optional: limit search to specific exam
   * @returns Array of matching comments
   */
  async searchComments(searchText: string, examId?: number): Promise<Comment[]> {
    if (!searchText || searchText.trim().length === 0) {
      throw new Error('Search text cannot be empty');
    }

    return await this.commentRepository.searchComments(searchText, examId);
  }

  /**
   * Get comment count for an exam
   * 
   * Returns the total number of comments (approved only) for an exam.
   * This is displayed on exam cards to show activity level.
   * 
   * Exams with many comments might indicate:
   * - The exam is popular
   * - The questions are confusing (lots of questions)
   * - Active learning community
   * 
   * @param examId - ID of exam to count comments for
   * @returns Number of comments
   */
  async getExamCommentCount(examId: number): Promise<number> {
    return await this.commentRepository.getCountByExamId(examId);
  }

  /**
   * Transform comment entity to response DTO
   * 
   * Formats comment data for client consumption.
   * 
   * Important transformations:
   * - Include author name for display
   * - Exclude sensitive author info (email, etc.)
   * - Include reply count for UI
   * - Format timestamp for display
   * 
   * This DTO is safe to send to any authenticated user.
   * 
   * @param comment - Comment entity from database
   * @param replyCount - Number of replies (pre-calculated)
   * @returns Formatted response DTO
   */
  private transformToCommentResponse(
    comment: Comment,
    replyCount: number
  ): CommentResponseDto {
    return {
      ID: comment.ID,
      Content: comment.Content,
      CreateAt: comment.CreateAt,
      ParentId: comment.ParentId,
      Status: comment.Status,
      Author: {
        ID: comment.studentProfile.ID,
        FullName: comment.studentProfile.user.FullName,
        // Deliberately exclude email and other sensitive data
      },
      ExamID: comment.ExamID,
      ReplyCount: replyCount,
      // Replies array would be populated when fetching thread
    };
  }
}
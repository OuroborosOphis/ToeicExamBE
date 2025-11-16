import {
  IsString,
  IsInt,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsEnum,
} from 'class-validator';

/**
 * DTO for creating a new comment
 * 
 * When a student posts a comment on an exam, this DTO captures:
 * - The comment content
 * - Which exam it's about
 * - Whether it's a top-level comment or a reply (ParentId)
 * 
 * The StudentProfileID will be extracted from JWT token,
 * so it's not included in this DTO (security measure).
 */
export class CreateCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'Comment content cannot be empty' })
  @MaxLength(1000, { message: 'Comment cannot exceed 1000 characters' })
  Content: string;

  @IsInt()
  @IsNotEmpty({ message: 'Exam ID is required' })
  ExamID: number;

  /**
   * ParentId for threaded comments
   * - 0 or null: Top-level comment
   * - > 0: Reply to comment with that ID
   * 
   * This enables nested discussion threads
   */
  @IsInt()
  @IsOptional()
  ParentId?: number = 0;
}

/**
 * DTO for updating an existing comment
 * 
 * Users should only be able to edit their own comments.
 * Only the content can be updated - can't change which exam
 * or which comment this is replying to.
 * 
 * Authorization check: StudentProfileID from token must match
 * the comment's original author.
 */
export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'Comment content cannot be empty' })
  @MaxLength(1000, { message: 'Comment cannot exceed 1000 characters' })
  Content: string;
}

/**
 * DTO for moderating comments (admin/teacher only)
 * 
 * Allows moderators to change comment status:
 * - 1: Approved and visible
 * - 2: Hidden/Deleted
 * - 3: Flagged for review
 * 
 * This helps maintain healthy discussions and prevent abuse.
 */
export class ModerateCommentDto {
  @IsInt()
  @IsEnum([1, 2, 3], {
    message: 'Status must be 1 (approved), 2 (hidden), or 3 (flagged)',
  })
  Status: number;
}

/**
 * DTO for filtering/listing comments
 * 
 * Allows querying comments by various criteria:
 * - ExamID: Get all comments for a specific exam
 * - StudentProfileID: Get all comments by a specific user
 * - Status: Filter by approval status
 * - ParentId: Get top-level comments (0) or replies to a specific comment
 */
export class CommentFilterDto {
  @IsInt()
  @IsOptional()
  ExamID?: number;

  @IsInt()
  @IsOptional()
  StudentProfileID?: number;

  @IsInt()
  @IsOptional()
  Status?: number = 1; // Default: only show approved comments

  @IsInt()
  @IsOptional()
  ParentId?: number;

  @IsInt()
  @IsOptional()
  Page?: number = 1;

  @IsInt()
  @IsOptional()
  Limit?: number = 20;
}

/**
 * Response DTO for a single comment
 * 
 * Includes:
 * - Comment content and metadata
 * - Author information (name, but not sensitive data)
 * - Reply count for threaded discussions
 * - Timestamp for display
 */
export class CommentResponseDto {
  ID: number;
  Content: string;
  CreateAt: Date;
  ParentId: number;
  Status: number;
  
  Author: {
    ID: number;
    FullName: string;
    // Don't include email or other sensitive information
  };
  
  ExamID: number;
  
  /**
   * Number of replies to this comment
   * Used to show "X replies" and implement "Load more replies" functionality
   */
  ReplyCount: number;
  
  /**
   * For nested display, we might include replies directly
   * This makes it easier for frontend to render threaded discussions
   */
  Replies?: CommentResponseDto[];
}

/**
 * Response DTO for paginated comment list
 * 
 * Provides pagination metadata along with comments.
 * Essential for implementing infinite scroll or pagination UI.
 */
export class PaginatedCommentsResponseDto {
  Comments: CommentResponseDto[];
  Pagination: {
    CurrentPage: number;
    TotalPages: number;
    TotalComments: number;
    Limit: number;
  };
}

/**
 * Response DTO for comment tree structure
 * 
 * When frontend needs to display a complete discussion thread,
 * this DTO provides comments in a hierarchical structure:
 * 
 * Top-level comments → Their replies → Nested replies → etc.
 * 
 * This is more efficient than making multiple API calls
 * to fetch each level of replies separately.
 */
export class CommentTreeResponseDto {
  TopLevelComments: CommentResponseDto[];
  TotalComments: number;
  TotalReplies: number;
}
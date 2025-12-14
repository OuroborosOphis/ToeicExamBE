import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  ArrayMinSize,
  IsNotEmpty,
  IsBoolean,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTOs for Media Group management
 * 
 * Các DTOs này define structure cho requests và responses
 * liên quan đến media groups - nhóm câu hỏi có cùng media.
 */

/**
 * DTO cho media content
 */
export class MediaDto {
  @IsString()
  @IsEnum(['LISTENING', 'READING'])
  Skill: string;

  @IsString()
  @IsNotEmpty()
  Type: string;

  @IsString()
  @IsNotEmpty()
  Section: string;

  @IsString()
  @IsOptional()
  // @IsUrl()
  @IsUrl({ require_tld: false })
  AudioUrl?: string;

  @IsString()
  @IsOptional()
  // @IsUrl()
  @IsUrl({ require_tld: false })
  ImageUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  Script?: string;
}

// ============================================================
// CREATE DTOs
// ============================================================

/**
 * DTO cho việc tạo media group mới
 * 
 * Một media group bao gồm:
 * - Media content (audio, image, hoặc passage)
 * - Metadata (title, description, difficulty, tags)
 * - Multiple questions với choices
 */
export class CreateMediaGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  Title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  Description?: string;

  @IsNotEmpty({ message: 'Media information is required' })
  @ValidateNested()
  @Type(() => MediaDto)
  Media: MediaDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionInGroupDto)
  @ArrayMinSize(1, { message: 'Group must have at least 1 question' })
  Questions: QuestionInGroupDto[];

  @IsEnum(['EASY', 'MEDIUM', 'HARD'])
  @IsOptional()
  Difficulty?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  Tags?: string[];

  @IsInt()
  @IsOptional()
  @Min(0)
  OrderIndex?: number;
}

/**
 * DTO cho một question trong group
 */
export class QuestionInGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  QuestionText?: string;

  @IsInt()
  @IsNotEmpty()
  @Min(1)
  OrderInGroup: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChoiceDto)
  @ArrayMinSize(2, { message: 'Question must have at least 2 choices' })
  Choices: ChoiceDto[];
}

/**
 * DTO cho một choice
 */
export class ChoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  Content: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  Attribute: string;

  @IsBoolean()
  IsCorrect: boolean;
}

// ============================================================
// UPDATE DTOs
// ============================================================

/**
 * DTO cho việc update media group metadata
 * 
 * Tất cả fields đều optional để support partial updates
 */
export class UpdateMediaGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  Title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  Description?: string;

  @IsEnum(['EASY', 'MEDIUM', 'HARD'])
  @IsOptional()
  Difficulty?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  Tags?: string[];

  @ValidateNested()
  @Type(() => MediaDto)
  @IsOptional()
  Media?: MediaDto;

  @IsInt()
  @IsOptional()
  @Min(0)
  OrderIndex?: number;
}

// ============================================================
// FILTER/QUERY DTOs
// ============================================================

/**
 * DTO cho filtering và searching media groups
 */
export class MediaGroupFilterDto {
  @IsString()
  @IsOptional()
  @IsEnum(['LISTENING', 'READING'])
  Skill?: string;

  @IsString()
  @IsOptional()
  Section?: string;

  @IsString()
  @IsOptional()
  Type?: string;

  @IsEnum(['EASY', 'MEDIUM', 'HARD'])
  @IsOptional()
  Difficulty?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  Tags?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(200)
  SearchText?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  Page?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  Limit?: number;
}

// ============================================================
// EXAM INTEGRATION DTOs
// ============================================================

/**
 * DTO cho việc add media group vào exam
 */
export class AddMediaGroupToExamDto {
  @IsInt()
  @IsNotEmpty({ message: 'Media group ID is required' })
  MediaGroupID: number;

  @IsInt()
  @IsNotEmpty({ message: 'Order index is required' })
  @Min(1)
  OrderIndex: number;
}

/**
 * DTO cho việc add question vào existing group
 */
export class AddQuestionToGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  QuestionText?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  OrderInGroup?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChoiceDto)
  @ArrayMinSize(2)
  Choices: ChoiceDto[];
}

// ============================================================
// RESPONSE DTOs
// ============================================================

/**
 * Response DTO cho media group summary (trong list)
 */
export class MediaGroupSummaryResponseDto {
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

/**
 * Response DTO cho media group detail (chi tiết đầy đủ)
 */
export class MediaGroupDetailResponseDto {
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

/**
 * Response DTO cho exam content organized by groups
 */
export class ExamContentOrganizedResponseDto {
  MediaGroups: MediaGroupInExamDto[];
  StandaloneQuestions: StandaloneQuestionDto[];
}

/**
 * DTO cho media group trong exam
 */
export class MediaGroupInExamDto {
  MediaQuestionID: number;
  Title: string;
  StartOrderIndex: number;
  
  Media: {
    Skill: string;
    Type: string;
    Section: string;
    AudioUrl?: string;
    ImageUrl?: string;
    Script?: string;
  };

  Questions: Array<{
    ID: number;
    QuestionText: string;
    OrderIndex: number;
    OrderInGroup: number;
    Choices: Array<{
      ID: number;
      Attribute: string;
      Content: string;
      // IsCorrect omitted cho students
    }>;
  }>;
}

/**
 * DTO cho standalone question trong exam
 */
export class StandaloneQuestionDto {
  ID: number;
  QuestionText: string;
  OrderIndex: number;
  
  Choices: Array<{
    ID: number;
    Attribute: string;
    Content: string;
  }>;
}

/**
 * Response DTO cho pagination info
 */
export class PaginationResponseDto {
  CurrentPage: number;
  TotalPages: number;
  TotalItems: number;
  Limit: number;
}

/**
 * Response DTO cho paginated media groups
 */
export class PaginatedMediaGroupsResponseDto {
  Groups: MediaGroupSummaryResponseDto[];
  Pagination: PaginationResponseDto;
  Total: number;
}

/**
 * Response DTO cho media group statistics
 */
export class MediaGroupStatisticsResponseDto {
  MediaGroupID: number;
  QuestionCount: number;
  UsedInExams: number;
  TotalAttempts: number;
  AverageSuccessRate?: number;
}

/**
 * Response DTO khi add media group vào exam
 */
export class AddMediaGroupToExamResponseDto {
  ExamID: number;
  MediaGroupID: number;
  QuestionsAdded: number;
  StartingOrderIndex: number;
  Message: string;
}
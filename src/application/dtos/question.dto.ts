import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsEnum,
  ArrayMinSize,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for media associated with a question
 * 
 * This captures all the metadata and URLs for question media:
 * - Skill: LISTENING or READING
 * - Type: Specific question type (PHOTO_DESCRIPTION, SHORT_CONVERSATION, etc.)
 * - Section: Part number (1-7)
 * - URLs: Links to audio/image files (stored in Cloudinary)
 * - Script: Audio transcript or reading passage text
 */
export class MediaQuestionDto {
  @IsString()
  @IsEnum(['LISTENING', 'READING'], {
    message: 'Skill must be either LISTENING or READING',
  })
  Skill: string;

  @IsString()
  @IsNotEmpty({ message: 'Question type is required' })
  Type: string;

  @IsString()
  @IsNotEmpty({ message: 'Section/Part number is required' })
  Section: string;

  @IsUrl({}, { message: 'Audio URL must be a valid URL' })
  @IsOptional()
  AudioUrl?: string;

  @IsUrl({}, { message: 'Image URL must be a valid URL' })
  @IsOptional()
  ImageUrl?: string;

  @IsString()
  @IsOptional()
  Script?: string;
}

/**
 * DTO for answer choice
 * 
 * Each choice needs:
 * - Attribute: The choice letter (A, B, C, or D)
 * - Content: The actual answer text
 * - IsCorrect: Boolean flag marking the correct answer
 * 
 * Validation ensures:
 * - Exactly one choice per question has IsCorrect = true
 * - All choices have valid attributes (A-D)
 * - Content is not empty
 */
export class ChoiceDto {
  @IsString()
  @IsNotEmpty({ message: 'Choice attribute is required' })
  Attribute: string;

  @IsString()
  @IsNotEmpty({ message: 'Choice content is required' })
  Content: string;

  @IsBoolean()
  IsCorrect: boolean;
}

/**
 * DTO for creating a new question
 * 
 * This DTO handles the complex process of creating a question which involves:
 * 1. Creating the question text
 * 2. Creating associated media (audio/image/text)
 * 3. Creating answer choices
 * 
 * All of these are bundled together to ensure atomicity.
 * If any part fails, the entire question creation should be rolled back.
 */
export class CreateQuestionDto {
  @IsString()
  @IsOptional()
  QuestionText?: string;

  @IsNotEmpty({ message: 'Media information is required' })
  @ValidateNested()
  @Type(() => MediaQuestionDto)
  Media: MediaQuestionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChoiceDto)
  @ArrayMinSize(2, { message: 'Question must have at least 2 choices' })
  Choices: ChoiceDto[];
}

/**
 * DTO for updating an existing question
 * 
 * All fields are optional to allow partial updates.
 * For example, admin might want to:
 * - Fix a typo in question text without touching choices
 * - Update audio URL without changing anything else
 * - Add or modify choices
 */
export class UpdateQuestionDto {
  @IsString()
  @IsOptional()
  QuestionText?: string;

  @ValidateNested()
  @Type(() => MediaQuestionDto)
  @IsOptional()
  Media?: MediaQuestionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChoiceDto)
  @IsOptional()
  Choices?: ChoiceDto[];
}

/**
 * DTO for filtering/searching questions
 * 
 * This enables the admin/teacher to find questions by various criteria:
 * - Skill (Listening/Reading)
 * - Section (Part 1-7)
 * - Type (specific question types)
 * - Search text (search in question text or script)
 * 
 * Used for:
 * - Building new exams by selecting appropriate questions
 * - Managing question bank
 * - Finding questions that need updates
 */
export class QuestionFilterDto {
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

  @IsString()
  @IsOptional()
  SearchText?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  Page?: number = 1;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  Limit?: number = 20;
}

/**
 * Response DTO for question list (for admin/teacher)
 * 
 * This includes the correct answer information because it's for
 * content management, not for students taking tests.
 * 
 * Includes:
 * - Full question details
 * - All choices with correct answer marked
 * - Media information
 * - Usage statistics (how many exams use this question)
 */
export class QuestionListResponseDto {
  ID: number;
  QuestionText: string;
  Media: {
    Skill: string;
    Type: string;
    Section: string;
    AudioUrl?: string;
    ImageUrl?: string;
    Script?: string;
  };
  Choices: {
    ID: number;
    Attribute: string;
    Content: string;
    IsCorrect: boolean;
  }[];
  UsageCount: number; // How many exams use this question
  CreatedBy: number; // UserID of creator
}

/**
 * Response DTO for paginated question list
 * 
 * Provides pagination metadata along with the actual question data.
 * This is essential for frontend to implement infinite scroll or
 * page-based navigation.
 */
export class PaginatedQuestionsResponseDto {
  Questions: QuestionListResponseDto[];
  Pagination: {
    CurrentPage: number;
    TotalPages: number;
    TotalQuestions: number;
    Limit: number;
  };
}

/**
 * DTO for bulk operations on questions
 * 
 * Allows admin/teacher to perform actions on multiple questions at once:
 * - Bulk delete
 * - Bulk update (e.g., change all questions from Part 5 to inactive)
 * - Add multiple questions to an exam
 */
export class BulkQuestionOperationDto {
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1, { message: 'At least one question ID is required' })
  QuestionIDs: number[];

  @IsString()
  @IsEnum(['DELETE', 'ADD_TO_EXAM', 'UPDATE_STATUS'], {
    message: 'Invalid operation type',
  })
  Operation: string;

  @IsInt()
  @IsOptional()
  TargetExamID?: number; // For ADD_TO_EXAM operation
}
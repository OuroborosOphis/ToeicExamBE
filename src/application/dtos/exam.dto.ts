import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new exam
 * 
 * This DTO ensures that all required fields are present and valid
 * before we attempt to create an exam in the database.
 * 
 * Validation rules reflect business requirements:
 * - Title is required for identification
 * - TimeExam must be positive (minimum 1 minute)
 * - ExamTypeID must reference valid exam type
 */
export class CreateExamDto {
  @IsString()
  @IsNotEmpty({ message: 'Exam title is required' })
  Title: string;

  @IsInt()
  @Min(1, { message: 'Exam time must be at least 1 minute' })
  @Max(240, { message: 'Exam time cannot exceed 240 minutes' })
  TimeExam: number;

  @IsString()
  @IsOptional()
  Type?: string;

  @IsInt()
  @IsNotEmpty({ message: 'Exam type is required' })
  ExamTypeID: number;

  @IsArray()
  @IsOptional()
  @IsInt({ each: true })
  MediaQuestionIDs?: number[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionDto)
  questions?: ExamQuestionDto[];
}

/**
 * DTO for adding questions to an exam
 * 
 * This DTO is used when creating an exam with questions
 * or when updating an exam's question list.
 * 
 * QuestionID: References existing question in database
 * OrderIndex: Determines question sequence in the exam
 */
export class ExamQuestionDto {
  @IsInt()
  @IsNotEmpty({ message: 'Question ID is required' })
  QuestionID: number;

  @IsInt()
  @Min(1, { message: 'Order index must start from 1' })
  OrderIndex: number;
}

/**
 * DTO for updating an existing exam
 * 
 * All fields are optional because partial updates should be allowed.
 * For example, admin might just want to change the title without
 * affecting the questions or time limit.
 */
export class UpdateExamDto {
  @IsString()
  @IsOptional()
  Title?: string;

  @IsInt()
  @Min(1)
  @Max(240)
  @IsOptional()
  TimeExam?: number;

  @IsString()
  @IsOptional()
  Type?: string;

  @IsInt()
  @IsOptional()
  ExamTypeID?: number;
}

/**
 * DTO for starting an exam attempt
 * 
 * When a student clicks "Start Test", this DTO captures the necessary info.
 * The system will create an Attempt record and return an attemptId.
 */
export class StartExamDto {
  @IsInt()
  @IsNotEmpty({ message: 'Exam ID is required' })
  ExamID: number;

  @IsEnum(['FULL_TEST', 'PRACTICE_BY_PART'], {
    message: 'Type must be FULL_TEST or PRACTICE_BY_PART',
  })
  Type: string;

  /**
   * For PRACTICE_BY_PART, specify which parts to practice
   * Example: [1, 2, 3] for Parts 1-3 (Listening)
   * Example: [5, 6] for Parts 5-6 (Grammar and Reading)
   */
  @IsArray()
  @IsOptional()
  @IsInt({ each: true })
  Parts?: number[];
}

/**
 * DTO for submitting exam answers
 * 
 * When a student submits their test, this DTO contains all their answers.
 * The system will:
 * 1. Validate timing (ensure they didn't exceed time limit)
 * 2. Grade each answer
 * 3. Calculate scores
 * 4. Store results in database
 */
export class SubmitExamDto {
  @IsInt()
  @IsNotEmpty({ message: 'Attempt ID is required' })
  AttemptID: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

/**
 * DTO for individual answer within a submission
 * 
 * Each answer links:
 * - QuestionID: Which question was answered
 * - ChoiceID: Which choice the student selected
 */
export class AnswerDto {
  @IsInt()
  @IsNotEmpty({ message: 'Question ID is required' })
  QuestionID: number;

  @IsInt()
  @IsNotEmpty({ message: 'Choice ID is required' })
  ChoiceID: number;
}

/**
 * Response DTO for exam details
 * 
 * This is what we send back to the frontend when they request exam info.
 * It includes everything needed to display the exam:
 * - Basic info (title, time, type)
 * - All questions with their choices
 * - Media assets (audio, images)
 * 
 * Note: We DON'T include which choice is correct (IsCorrect flag)
 * in the response - that would enable cheating!
 */
export class ExamDetailResponseDto {
  ID: number;
  Title: string;
  TimeExam: number;
  Type: string;
  ExamType: {
    ID: number;
    Code: string;
    Description: string;
  };
  Questions: QuestionDetailDto[];
}

/**
 * DTO for question details in exam response
 * 
 * Includes everything needed to display a question:
 * - Question text and order
 * - All answer choices (but NOT the correct answer flag)
 * - Associated media (audio/images)
 */
export class QuestionDetailDto {
  ID: number;
  OrderIndex: number;
  QuestionText: string;
  Choices: ChoiceDetailDto[];
  Media: {
    ID: number;        
    Skill: string;
    Type: string;
    Section: string;
    AudioUrl?: string;
    ImageUrl?: string;
    Script?: string;
  };
}

/**
 * DTO for choice details in question response
 * 
 * Note: IsCorrect is intentionally omitted to prevent cheating
 * The correct answer is only revealed after submission or in review mode
 */
export class ChoiceDetailDto {
  ID: number;
  Attribute: string; // A, B, C, or D
  Content: string;
}

/**
 * Response DTO for exam results after submission
 * 
 * This is what students see after completing a test.
 * It includes:
 * - Overall scores (percentage and TOEIC scaled scores)
 * - Breakdown by section (Listening/Reading)
 * - Detailed answer review (what they chose vs. correct answer)
 * - Performance analysis by question type
 */
export class ExamResultResponseDto {
  AttemptID: number;
  ExamTitle: string;
  SubmittedAt: Date;
  TimeTaken: number; // in minutes
  
  Scores: {
    ScorePercent: number;
    ScoreListening: number;
    ScoreReading: number;
    TotalScore: number; // Listening + Reading
  };
  
  DetailedAnswers: DetailedAnswerDto[];
  
  Analysis: {
    TotalQuestions: number;
    CorrectAnswers: number;
    ListeningCorrect: number;
    ReadingCorrect: number;
    WeakAreas: string[]; // Question types where student performed poorly
  };
}

/**
 * DTO for individual answer in result review
 * 
 * Shows for each question:
 * - What the student answered
 * - What the correct answer is
 * - Whether they got it right
 * - Explanation (if available)
 */
export class DetailedAnswerDto {
  QuestionID: number;
  QuestionText: string;
  QuestionType: string;
  Section: string;
  
  StudentChoice: {
    ID: number;
    Attribute: string;
    Content: string;
  };
  
  CorrectChoice: {
    ID: number;
    Attribute: string;
    Content: string;
  };
  
  IsCorrect: boolean;
  
  Media?: {
    AudioUrl?: string;
    ImageUrl?: string;
    Script?: string;
  };
}
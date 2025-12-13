import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateExamTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Exam type code is required' })
  @MaxLength(255)
  Code: string;  // VD: "PRACTICE_PART_5_6"

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  Description?: string;  // VD: "Luyện tập Part 5-6 Grammar"
}

export class UpdateExamTypeDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  Code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  Description?: string;
}
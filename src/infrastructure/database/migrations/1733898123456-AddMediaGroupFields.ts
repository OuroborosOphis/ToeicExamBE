import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMediaGroupFields1733898123456 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add fields to MediaQuestion table
    await queryRunner.query(`
      ALTER TABLE mediaquestion 
      ADD COLUMN GroupTitle VARCHAR(500) NULL,
      ADD COLUMN GroupDescription TEXT NULL,
      ADD COLUMN Difficulty ENUM('EASY', 'MEDIUM', 'HARD') DEFAULT 'MEDIUM',
      ADD COLUMN Tags JSON NULL,
      ADD COLUMN OrderIndex INT DEFAULT 0
    `);

    // Add field to Question table
    await queryRunner.query(`
      ALTER TABLE question 
      ADD COLUMN OrderInGroup INT DEFAULT 1
    `);

    // Add fields to ExamQuestion table
    await queryRunner.query(`
      ALTER TABLE exam_question 
      ADD COLUMN MediaQuestionID INT NULL,
      ADD COLUMN IsGrouped BOOLEAN DEFAULT FALSE,
      ADD INDEX idx_media_question (MediaQuestionID)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mediaquestion 
      DROP COLUMN GroupTitle,
      DROP COLUMN GroupDescription,
      DROP COLUMN Difficulty,
      DROP COLUMN Tags,
      DROP COLUMN OrderIndex
    `);

    await queryRunner.query(`
      ALTER TABLE question 
      DROP COLUMN OrderInGroup
    `);

    await queryRunner.query(`
      ALTER TABLE exam_question 
      DROP INDEX idx_media_question,
      DROP COLUMN MediaQuestionID,
      DROP COLUMN IsGrouped
    `);
  }
}
import 'reflect-metadata';
import { initializeDatabase, closeDatabase, AppDataSource } from './infrastructure/database/config';
import { ExamType } from './domain/entities/exam-type.entity';
import { Exam } from './domain/entities/exam.entity';
import { MediaQuestion } from './domain/entities/media-question.entity';
import { Question } from './domain/entities/question.entity';
import { Choice } from './domain/entities/choice.entity';
import { ExamQuestion } from './domain/entities/exam-question.entity';

async function seedDatabase() {
  try {
    console.log('🔄 Initializing database connection...');
    await initializeDatabase();
    
    // Create repositories
    const examTypeRepo = AppDataSource.getRepository(ExamType);
    const examRepo = AppDataSource.getRepository(Exam);
    const mediaRepo = AppDataSource.getRepository(MediaQuestion);
    const questionRepo = AppDataSource.getRepository(Question);
    const choiceRepo = AppDataSource.getRepository(Choice);
    const examQuestionRepo = AppDataSource.getRepository(ExamQuestion);
    
    // Step 1: Create Exam Types
    console.log('🔄 Creating exam types...');
    const fullTestType = examTypeRepo.create({
      Code: 'FULL_TEST',
      Description: 'Complete 200-question TOEIC test (120 minutes)',
    });
    const miniTestType = examTypeRepo.create({
      Code: 'MINI_TEST',
      Description: 'Shorter practice test (50-100 questions)',
    });
    await examTypeRepo.save([fullTestType, miniTestType]);
    console.log('✅ Exam types created');
    
    // Step 2: Create a sample exam
    console.log('🔄 Creating sample exam...');
    const sampleExam = examRepo.create({
      Title: 'TOEIC Practice Test 1',
      TimeExam: 120,
      Type: 'PRACTICE',
      ExamTypeID: fullTestType.ID,
      UserID: 1, // Assuming admin user with ID 1
    });
    await examRepo.save(sampleExam);
    console.log('✅ Sample exam created');
    
    // Step 3: Create sample questions
    console.log('🔄 Creating sample questions...');
    
    // Listening Part 1 question
    const media1 = mediaRepo.create({
      Skill: 'LISTENING',
      Type: 'PHOTO_DESCRIPTION',
      Section: '1',
      AudioUrl: '/uploads/audio/part1_sample.mp3',
      ImageUrl: '/uploads/images/part1_sample.jpg',
      Scirpt: 'Sample audio script for Part 1',
    });
    await mediaRepo.save(media1);
    
    const question1 = questionRepo.create({
      QuestionText: 'Look at the picture and listen to the audio.',
      MediaQuestionID: media1.ID,
      UserID: 1,
    });
    await questionRepo.save(question1);
    
    const choices1 = [
      choiceRepo.create({ QuestionID: question1.ID, Attribute: 'A', Content: 'They are working on computers.', IsCorrect: true }),
      choiceRepo.create({ QuestionID: question1.ID, Attribute: 'B', Content: 'They are leaving the office.', IsCorrect: false }),
      choiceRepo.create({ QuestionID: question1.ID, Attribute: 'C', Content: 'They are having a meeting.', IsCorrect: false }),
      choiceRepo.create({ QuestionID: question1.ID, Attribute: 'D', Content: 'They are eating lunch.', IsCorrect: false }),
    ];
    await choiceRepo.save(choices1);
    
    // Reading Part 5 question
    const media2 = mediaRepo.create({
      Skill: 'READING',
      Type: 'INCOMPLETE_SENTENCE',
      Section: '5',
    });
    await mediaRepo.save(media2);
    
    const question2 = questionRepo.create({
      QuestionText: 'The conference will be held _____ March 15th.',
      MediaQuestionID: media2.ID,
      UserID: 1,
    });
    await questionRepo.save(question2);
    
    const choices2 = [
      choiceRepo.create({ QuestionID: question2.ID, Attribute: 'A', Content: 'in', IsCorrect: false }),
      choiceRepo.create({ QuestionID: question2.ID, Attribute: 'B', Content: 'on', IsCorrect: true }),
      choiceRepo.create({ QuestionID: question2.ID, Attribute: 'C', Content: 'at', IsCorrect: false }),
      choiceRepo.create({ QuestionID: question2.ID, Attribute: 'D', Content: 'for', IsCorrect: false }),
    ];
    await choiceRepo.save(choices2);
    
    console.log('✅ Sample questions created');
    
    // Step 4: Link questions to exam
    console.log('🔄 Linking questions to exam...');
    const examQuestion1 = examQuestionRepo.create({
      ExamID: sampleExam.ID,
      QuestionID: question1.ID,
      OrderIndex: 1,
    });
    const examQuestion2 = examQuestionRepo.create({
      ExamID: sampleExam.ID,
      QuestionID: question2.ID,
      OrderIndex: 2,
    });
    await examQuestionRepo.save([examQuestion1, examQuestion2]);
    console.log('✅ Questions linked to exam');
    
    console.log('\n🎉 Database seeded successfully!');
    console.log(`Created: ${sampleExam.Title} with 2 sample questions`);
    
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    await closeDatabase();
    process.exit(1);
  }
}

seedDatabase();
import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from './infrastructure/database/config';
import { ExamService } from './application/services/exam.service';
import { AttemptService } from './application/services/attempt.service';

async function testServices() {
  await initializeDatabase();
  
  const examService = new ExamService();
  const attemptService = new AttemptService();
  
  // Test getting an exam
  const exam = await examService.getExamById(1);
  console.log('Exam:', exam.Title);
  
  // Test starting an attempt
  const attempt = await attemptService.startAttempt(
    { ExamID: 1, Type: 'FULL_TEST' },
    1 // assuming student profile ID 1
  );
  console.log('Attempt created:', attempt.ID);
  
  await closeDatabase();
}

testServices().catch(console.error);
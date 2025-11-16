import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from './infrastructure/database/config';
import { ExamRepository } from './infrastructure/repositories/exam.repository';

async function testDatabaseConnection() {
  try {
    console.log('🔄 Initializing database connection...');
    await initializeDatabase();
    
    console.log('✅ Database connected successfully!');
    
    // Test repository
    console.log('🔄 Testing ExamRepository...');
    const examRepo = new ExamRepository();
    const exams = await examRepo.findAll();
    
    console.log(`✅ Found ${exams.length} exams in database`);
    
    await closeDatabase();
    console.log('✅ Database connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testDatabaseConnection();
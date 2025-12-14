// src/scripts/test-grading.ts
/**
 * Script để test và debug grading logic
 * 
 * Usage:
 * npx ts-node src/scripts/test-grading.ts
 */

import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from '../infrastructure/database/config';
import { AttemptService } from '../application/services/attempt.service';
import { ExamRepository } from '../infrastructure/repositories/exam.repository';
import { AppDataSource } from '../infrastructure/database/config';

async function testGradingLogic() {
  try {
    console.log('='.repeat(70));
    console.log('🧪 GRADING LOGIC TEST');
    console.log('='.repeat(70));
    console.log('');

    await initializeDatabase();
    console.log('✅ Database connected\n');

    const attemptService = new AttemptService();
    const examRepo = new ExamRepository();

    // ============================================================
    // TEST 1: Get một exam để test
    // ============================================================
    
    console.log('📚 Step 1: Getting test exam...');
    const exams = await examRepo.findAll();
    
    if (exams.length === 0) {
      console.error('❌ No exams found in database');
      console.log('Please create an exam first using the seed script');
      return;
    }

    const testExam = exams[1];
    console.log(`✅ Using exam: ${testExam.Title} (ID: ${testExam.ID})`);
    
    // Load full exam details với questions
    const fullExam = await examRepo.findById(testExam.ID);
    
    if (!fullExam || !fullExam.examQuestions || fullExam.examQuestions.length === 0) {
      console.error('❌ Exam has no questions');
      return;
    }

    console.log(`   - Total questions: ${fullExam.examQuestions.length}`);
    console.log('');

    // ============================================================
    // TEST 2: Phân tích question distribution
    // ============================================================
    
    console.log('📊 Step 2: Analyzing question distribution...');
    
    let listeningCount = 0;
    let readingCount = 0;
    let unknownCount = 0;

    fullExam.examQuestions.forEach(eq => {
      const skill = eq.question?.mediaQuestion?.Skill;
      if (skill === 'LISTENING') {
        listeningCount++;
      } else if (skill === 'READING') {
        readingCount++;
      } else {
        unknownCount++;
        console.warn(
          `   ⚠️ Question ${eq.QuestionID} has unknown skill: "${skill}"`
        );
      }
    });

    console.log(`   - Listening questions: ${listeningCount}`);
    console.log(`   - Reading questions: ${readingCount}`);
    if (unknownCount > 0) {
      console.log(`   - Unknown skill: ${unknownCount}`);
    }
    console.log('');

    // ============================================================
    // TEST 3: Tạo test data với một số đáp án đúng, một số sai
    // ============================================================
    
    console.log('🎲 Step 3: Creating test submission...');
    console.log('   Strategy: Answer first 50% correct, last 50% wrong');
    console.log('');

    const answers = fullExam.examQuestions.map((eq, index) => {
      const question = eq.question;
      const correctChoice = question.choices.find(c => c.IsCorrect);
      const wrongChoice = question.choices.find(c => !c.IsCorrect);

      // First 50% correct, last 50% wrong
      const isFirstHalf = index < fullExam.examQuestions!.length / 2;
      const selectedChoice = isFirstHalf ? correctChoice : wrongChoice;

      if (!selectedChoice) {
        console.error(`❌ No ${isFirstHalf ? 'correct' : 'wrong'} choice for question ${question.ID}`);
        return null;
      }

      return {
        QuestionID: question.ID,
        ChoiceID: selectedChoice.ID,
      };
    }).filter(a => a !== null) as { QuestionID: number; ChoiceID: number }[];

    console.log(`✅ Created ${answers.length} test answers`);
    console.log('');

    // ============================================================
    // TEST 4: Start attempt
    // ============================================================
    
    console.log('🚀 Step 4: Starting test attempt...');
    
    const attempt = await attemptService.startAttempt(
      {
        ExamID: testExam.ID,
        Type: 'FULL_TEST',
      },
      1 // Test student profile ID
    );

    console.log(`✅ Attempt started: ID ${attempt.ID}`);
    console.log(`   - Started at: ${attempt.StartedAt}`);
    console.log('');

    // ============================================================
    // TEST 5: Submit và grade
    // ============================================================
    
    console.log('📝 Step 5: Submitting answers for grading...');
    console.log('='.repeat(70));
    console.log('');

    const results = await attemptService.submitAttempt(
      {
        AttemptID: attempt.ID,
        answers: answers,
      },
      1 // Test student profile ID
    );

    console.log('');
    console.log('='.repeat(70));
    console.log('');

    // ============================================================
    // TEST 6: Verify results
    // ============================================================
    
    console.log('✅ Step 6: GRADING RESULTS');
    console.log('='.repeat(70));
    console.log('');

    console.log('📊 Overall Performance:');
    console.log(`   - Total Questions: ${results.Analysis.TotalQuestions}`);
    console.log(`   - Correct Answers: ${results.Analysis.CorrectAnswers}`);
    console.log(`   - Score Percentage: ${results.Scores.ScorePercent}%`);
    console.log('');

    console.log('🎯 Section Breakdown:');
    console.log(`   - Listening Correct: ${results.Analysis.ListeningCorrect}`);
    console.log(`   - Listening Score: ${results.Scores.ScoreListening}/495`);
    console.log(`   - Reading Correct: ${results.Analysis.ReadingCorrect}`);
    console.log(`   - Reading Score: ${results.Scores.ScoreReading}/495`);
    console.log(`   - Total TOEIC Score: ${results.Scores.TotalScore}/990`);
    console.log('');

    // ============================================================
    // TEST 7: Validate expected vs actual
    // ============================================================
    
    console.log('🔍 Step 7: Validation Check');
    console.log('='.repeat(70));
    console.log('');

    const expectedCorrect = Math.floor(fullExam.examQuestions.length / 2);
    const expectedPercent = 50; // Since we answered first 50% correct

    console.log('Expected Results:');
    console.log(`   - Correct answers: ~${expectedCorrect}`);
    console.log(`   - Score percentage: ~${expectedPercent}%`);
    console.log('');

    console.log('Actual Results:');
    console.log(`   - Correct answers: ${results.Analysis.CorrectAnswers}`);
    console.log(`   - Score percentage: ${results.Scores.ScorePercent}%`);
    console.log('');

    // Validation
    const correctDiff = Math.abs(results.Analysis.CorrectAnswers - expectedCorrect);
    const percentDiff = Math.abs(results.Scores.ScorePercent - expectedPercent);

    if (correctDiff <= 1 && percentDiff <= 2) {
      console.log('✅ VALIDATION PASSED: Scores match expected values');
    } else {
      console.log('❌ VALIDATION FAILED: Scores differ from expected');
      console.log(`   - Correct answers diff: ${correctDiff}`);
      console.log(`   - Percentage diff: ${percentDiff}%`);
    }
    console.log('');

    // ============================================================
    // TEST 8: Check individual answers
    // ============================================================
    
    console.log('🔬 Step 8: Sample Answer Check');
    console.log('='.repeat(70));
    console.log('');

    const sampleSize = Math.min(5, results.DetailedAnswers.length);
    console.log(`Checking first ${sampleSize} answers...`);
    console.log('');

    for (let i = 0; i < sampleSize; i++) {
      const answer = results.DetailedAnswers[i];
      console.log(`Question ${i + 1} (ID: ${answer.QuestionID}):`);
      console.log(`   - Section: ${answer.Section}`);
      console.log(`   - Student chose: ${answer.StudentChoice.Attribute}`);
      console.log(`   - Correct answer: ${answer.CorrectChoice.Attribute}`);
      console.log(`   - Result: ${answer.IsCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
      console.log('');
    }

    // ============================================================
    // TEST 9: Database verification
    // ============================================================
    
    console.log('💾 Step 9: Database Verification');
    console.log('='.repeat(70));
    console.log('');

    // 🔥 FIX: Query với proper boolean handling
    const dbCheck = await AppDataSource.getRepository('AttemptAnswer')
    .createQueryBuilder('aa')
    .select('COUNT(aa.ID)', 'total')
    .addSelect('SUM(CASE WHEN aa.IsCorrect = 1 THEN 1 ELSE 0 END)', 'correct')
    .addSelect('SUM(CASE WHEN aa.IsCorrect = 0 THEN 1 ELSE 0 END)', 'wrong')
    .where('aa.AttemptID = :attemptId', { attemptId: attempt.ID })
    .getRawOne();

    console.log('Database Statistics:');
    console.log(`   - Total answers in DB: ${dbCheck.total}`);
    console.log(`   - Correct in DB: ${dbCheck.correct}`);
    console.log(`   - Wrong in DB: ${dbCheck.wrong}`);
    console.log('');

    // 🔥 FIX: Also check individual records để debug
    const sampleRecords = await AppDataSource.query(`
    SELECT 
        aa.ID,
        aa.QuestionID,
        aa.ChoiceID,
        aa.IsCorrect,
        CAST(aa.IsCorrect AS UNSIGNED) as IsCorrectInt
    FROM attemptanswer aa
    WHERE aa.AttemptID = ?
    LIMIT 5
    `, [attempt.ID]);

    console.log('📋 Sample AttemptAnswer Records:');
    sampleRecords.forEach((record: any, index: number) => {
    console.log(`   Record ${index + 1}:`);
    console.log(`      - Question ID: ${record.QuestionID}`);
    console.log(`      - Choice ID: ${record.ChoiceID}`);
    console.log(`      - IsCorrect (raw): ${record.IsCorrect}`);
    console.log(`      - IsCorrect (int): ${record.IsCorrectInt}`);
    });
    console.log('');

    if (parseInt(dbCheck.correct) === results.Analysis.CorrectAnswers) {
    console.log('✅ Database records match API response');
    } else {
    console.log('❌ Database mismatch detected!');
    console.log(`   DB shows: ${dbCheck.correct} correct`);
    console.log(`   API shows: ${results.Analysis.CorrectAnswers} correct`);
    }
    console.log('');

    console.log('='.repeat(70));
    console.log('🎉 TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(70));
    console.error('');
    console.error('Error:', error);
    
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  } finally {
    await closeDatabase();
    console.log('');
    console.log('Database connection closed');
  }
}

// Run test
testGradingLogic();

/**
 * EXPECTED OUTPUT:
 * 
 * Nếu grading logic hoạt động đúng, bạn sẽ thấy:
 * - Score percentage: ~50% (vì chúng ta answer đúng 50% đầu)
 * - Listening và Reading scores tương ứng
 * - Database records match với API response
 * - Validation PASSED
 * 
 * Nếu có bug:
 * - Score might be 100% even với wrong answers
 * - Or score might be 0% even với correct answers
 * - Database mismatch với API response
 * - Validation FAILED
 */
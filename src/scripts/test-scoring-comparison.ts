// src/scripts/test-scoring-comparison.ts
/**
 * Script để demo và so sánh cách tính điểm giữa FULL_TEST và PRACTICE_BY_PART
 * 
 * Usage: npx ts-node src/scripts/test-scoring-comparison.ts
 */

import 'reflect-metadata';
import { convertListeningScore, convertReadingScore } from '../utils/toeic-score-conversion';

console.log('='.repeat(80));
console.log('🧪 DEMO: SO SÁNH CÁCH TÍNH ĐIỂM FULL_TEST vs PRACTICE_BY_PART');
console.log('='.repeat(80));
console.log('');

/**
 * Hàm tính điểm theo công thức tỷ lệ (dùng cho Practice)
 */
function calculatePercentageScore(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

/**
 * Test cases với số câu đúng khác nhau
 */
const testCases = [
  { listening: 100, reading: 100, description: 'Perfect Score (100/100)' },
  { listening: 90, reading: 85, description: 'High Score (90/100, 85/100)' },
  { listening: 75, reading: 70, description: 'Good Score (75/100, 70/100)' },
  { listening: 60, reading: 55, description: 'Average Score (60/100, 55/100)' },
  { listening: 45, reading: 40, description: 'Below Average (45/100, 40/100)' },
  { listening: 25, reading: 20, description: 'Low Score (25/100, 20/100)' },
  
  // Test cases cho practice với số câu ít hơn
  { listening: 25, reading: 30, description: 'Practice: Part 1-4 & Part 5-7 (25/25, 30/30)', 
    listeningTotal: 25, readingTotal: 30 },
  { listening: 15, reading: 20, description: 'Practice: Part 3-4 & Part 6-7 (15/20, 20/25)',
    listeningTotal: 20, readingTotal: 25 },
];

console.log('📊 FULL_TEST (200 câu chuẩn TOEIC) - Dùng Bảng Conversion');
console.log('-'.repeat(80));
console.log('');

testCases.forEach((test, index) => {
  // Nếu không có total, mặc định là 100 (full test)
  const listeningTotal = test.listeningTotal || 100;
  const readingTotal = test.readingTotal || 100;
  
  // Chỉ show full test cases (100 câu)
  if (listeningTotal === 100 && readingTotal === 100) {
    // FULL_TEST: Dùng bảng conversion
    const listeningScore = convertListeningScore(test.listening);
    const readingScore = convertReadingScore(test.reading);
    const totalScore = listeningScore + readingScore;
    
    console.log(`${index + 1}. ${test.description}`);
    console.log(`   Listening: ${test.listening}/100 correct → ${listeningScore}/495 điểm`);
    console.log(`   Reading:   ${test.reading}/100 correct → ${readingScore}/495 điểm`);
    console.log(`   TOTAL: ${totalScore}/990 điểm`);
    console.log('');
  }
});

console.log('='.repeat(80));
console.log('📚 PRACTICE_BY_PART - Dùng Công Thức Tỷ Lệ');
console.log('-'.repeat(80));
console.log('');

testCases.forEach((test, index) => {
  const listeningTotal = test.listeningTotal || 100;
  const readingTotal = test.readingTotal || 100;
  
  // Show all practice cases
  if (listeningTotal !== 100 || readingTotal !== 100) {
    // PRACTICE: Dùng công thức tỷ lệ
    const listeningScore = calculatePercentageScore(test.listening, listeningTotal);
    const readingScore = calculatePercentageScore(test.reading, readingTotal);
    const totalScore = listeningScore + readingScore;
    
    console.log(`${index + 1}. ${test.description}`);
    console.log(`   Listening: ${test.listening}/${listeningTotal} correct (${Math.round(test.listening/listeningTotal*100)}%) → ${listeningScore}/495 điểm`);
    console.log(`   Reading:   ${test.reading}/${readingTotal} correct (${Math.round(test.reading/readingTotal*100)}%) → ${readingScore}/495 điểm`);
    console.log(`   TOTAL: ${totalScore}/990 điểm`);
    console.log('');
  }
});

console.log('='.repeat(80));
console.log('🔍 SO SÁNH: Full Test vs Practice với cùng tỷ lệ đúng');
console.log('-'.repeat(80));
console.log('');

// So sánh với cùng 75% đúng
const perfectPercentage = 0.75;

console.log('Ví dụ: Học sinh làm đúng 75% cả hai phần');
console.log('');

// FULL_TEST: 75/100 và 75/100
const fullTestL = convertListeningScore(75);
const fullTestR = convertReadingScore(75);
console.log('📊 FULL_TEST (75/100, 75/100):');
console.log(`   Listening: 75/100 → ${fullTestL}/495`);
console.log(`   Reading:   75/100 → ${fullTestR}/495`);
console.log(`   Total: ${fullTestL + fullTestR}/990`);
console.log('');

// PRACTICE: 15/20 và 20/27 (cũng ~75%)
const practiceL = calculatePercentageScore(15, 20);
const practiceR = calculatePercentageScore(20, 27);
console.log('📚 PRACTICE_BY_PART (15/20, 20/27):');
console.log(`   Listening: 15/20 (75%) → ${practiceL}/495`);
console.log(`   Reading:   20/27 (74%) → ${practiceR}/495`);
console.log(`   Total: ${practiceL + practiceR}/990`);
console.log('');

console.log('💡 NHẬN XÉT:');
console.log('   - Full Test dùng bảng conversion phi tuyến → phản ánh chính xác độ khó');
console.log('   - Practice dùng tỷ lệ tuyến tính → dễ hiểu, phù hợp luyện tập');
console.log('   - Điểm có thể khác nhau dù cùng tỷ lệ đúng');
console.log('');

console.log('='.repeat(80));
console.log('✅ Test hoàn tất!');
console.log('='.repeat(80));
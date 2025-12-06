// tests/manual-api-tests.ts
/**
 * Manual API Test Scripts
 * 
 * Đây là script để test thủ công các API endpoints.
 * Chạy script này để verify toàn bộ flow của hệ thống.
 * 
 * Setup:
 * 1. Đảm bảo server đang chạy (npm run dev)
 * 2. Có database với data mẫu (npm run seed)
 * 3. Cài đặt: npm install --save-dev axios
 * 4. Chạy: npx ts-node tests/manual-api-tests.ts
 */

import axios, { AxiosInstance } from 'axios';

// Cấu hình API client
const API_BASE_URL = 'http://localhost:3001/api/exam';
let authToken = '';
let studentProfileId = 0;
let createdExamId = 0;
let createdQuestionId = 0;
let attemptId = 0;

// Tạo axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor để tự động thêm auth token
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

/**
 * Helper functions để log kết quả test
 */
function logSuccess(testName: string, data?: any) {
  console.log(`\n✅ ${testName}`);
  if (data) {
    console.log('Response:', JSON.stringify(data, null, 2));
  }
}

function logError(testName: string, error: any) {
  console.error(`\n❌ ${testName}`);
  console.error('Error:', error.response?.data || error.message);
}

/**
 * Test 1: Health Check
 * Kiểm tra server có đang chạy không
 */
async function testHealthCheck() {
  try {
    const response = await api.get('/health');
    logSuccess('Health Check', response.data);
    return true;
  } catch (error) {
    logError('Health Check', error);
    return false;
  }
}

/**
 * Test 2: Authentication
 * 
 * LƯU Ý: Backend này không có registration/login endpoint
 * vì authentication được xử lý bởi Spring Boot backend.
 * 
 * Để test, bạn cần:
 * 1. Lấy JWT token từ Spring Boot backend
 * 2. Set token vào biến authToken ở đây
 * 3. Hoặc tạo mock token cho testing
 */
async function setupAuthentication() {
  console.log('\n📝 Setup Authentication');
  console.log('Lưu ý: Backend này sử dụng JWT từ Spring Boot');
  console.log('Để test, bạn cần có JWT token hợp lệ');
  
  // Ví dụ: Mock token cho development testing
  // Trong production, lấy token từ Spring Boot login
  authToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjb20ubXhoaWV1Iiwic3ViIjoibWFpeHVhbmhpZXV5dHRAZ21haWwuY29tIiwidXNlcklkIjoxLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoiQURNSU4iLCJ0eXBlIjoiYWNjZXNzIiwic3R1ZGVudFByb2ZpbGVJZCI6MSwiZXhwIjoxNzY1MTI2ODg0fQ.OrmkJr3ARZgmiJbIfVaKAG9ZmTTON3KI8JnHDAeTmWc';
  studentProfileId = 1; // ID của student profile trong database
  
  console.log('Token set:', authToken ? 'Yes' : 'No');
}

/**
 * Test 3: Get All Exams
 * API: GET /exams
 */
async function testGetAllExams() {
  try {
    const response = await api.get('/exams');
    logSuccess('Get All Exams', {
      count: response.data.count,
      exams: response.data.data?.slice(0, 2), // Show first 2 exams
    });
    
    // Lưu exam ID để test sau
    if (response.data.data && response.data.data.length > 0) {
      createdExamId = response.data.data[0].ID;
    }
    
    return true;
  } catch (error) {
    logError('Get All Exams', error);
    return false;
  }
}

/**
 * Test 4: Get Exam by ID
 * API: GET /exams/:id
 */
async function testGetExamById() {
  if (!createdExamId) {
    console.log('\n⚠️  Skip Get Exam by ID - No exam ID available');
    return false;
  }
  
  try {
    const response = await api.get(`/exams/${createdExamId}`);
    logSuccess('Get Exam by ID', {
      examId: createdExamId,
      title: response.data.data.Title,
      questionCount: response.data.data.Questions?.length,
    });
    return true;
  } catch (error) {
    logError('Get Exam by ID', error);
    return false;
  }
}

/**
 * Test 5: Create Question
 * API: POST /questions
 * 
 * Chỉ teacher/admin mới có thể tạo câu hỏi
 */
async function testCreateQuestion() {
  try {
    const questionData = {
      QuestionText: 'The meeting will be held _____ the conference room.',
      Media: {
        Skill: 'READING',
        Type: 'INCOMPLETE_SENTENCE',
        Section: '5',
      },
      Choices: [
        { Attribute: 'A', Content: 'at', IsCorrect: false },
        { Attribute: 'B', Content: 'in', IsCorrect: true },
        { Attribute: 'C', Content: 'on', IsCorrect: false },
        { Attribute: 'D', Content: 'for', IsCorrect: false },
      ],
    };
    
    const response = await api.post('/questions', questionData);
    createdQuestionId = response.data.data.ID;
    
    logSuccess('Create Question', {
      questionId: createdQuestionId,
      text: response.data.data.QuestionText,
    });
    return true;
  } catch (error) {
    logError('Create Question', error);
    return false;
  }
}

/**
 * Test 6: Search Questions
 * API: GET /questions
 */
async function testSearchQuestions() {
  try {
    const response = await api.get('/questions', {
      params: {
        Skill: 'READING',
        Section: '5',
        Page: 1,
        Limit: 10,
      },
    });
    
    logSuccess('Search Questions', {
      totalQuestions: response.data.pagination.TotalQuestions,
      currentPage: response.data.pagination.CurrentPage,
    });
    return true;
  } catch (error) {
    logError('Search Questions', error);
    return false;
  }
}

/**
 * Test 7: Create Exam
 * API: POST /exams
 * 
 * Chỉ teacher/admin mới có thể tạo exam
 */
async function testCreateExam() {
  try {
    const examData = {
      Title: 'Test Exam - Created by API Test',
      TimeExam: 60,
      ExamTypeID: 1, // Giả sử ID 1 tồn tại trong database
      questions: [
        { QuestionID: createdQuestionId || 1, OrderIndex: 1 },
      ],
    };
    
    const response = await api.post('/exams', examData);
    const newExamId = response.data.data.ID;
    
    logSuccess('Create Exam', {
      examId: newExamId,
      title: response.data.data.Title,
    });
    
    // Cập nhật exam ID cho các test sau
    if (newExamId) {
      createdExamId = newExamId;
    }
    
    return true;
  } catch (error) {
    logError('Create Exam', error);
    return false;
  }
}

/**
 * Test 8: Start Attempt
 * API: POST /attempts/start
 * 
 * Học viên bắt đầu làm bài thi
 */
async function testStartAttempt() {
  if (!createdExamId) {
    console.log('\n⚠️  Skip Start Attempt - No exam ID available');
    return false;
  }
  
  try {
    const attemptData = {
      ExamID: createdExamId,
      Type: 'FULL_TEST',
    };
    
    const response = await api.post('/attempts/start', attemptData);
    attemptId = response.data.data.attemptId;
    
    logSuccess('Start Attempt', {
      attemptId: attemptId,
      examId: response.data.data.examId,
      startedAt: response.data.data.startedAt,
    });
    return true;
  } catch (error) {
    logError('Start Attempt', error);
    return false;
  }
}

/**
 * Test 9: Submit Attempt
 * API: POST /attempts/submit
 * 
 * Học viên submit bài làm để chấm điểm
 */
async function testSubmitAttempt() {
  if (!attemptId) {
    console.log('\n⚠️  Skip Submit Attempt - No attempt ID available');
    return false;
  }
  
  try {
    // Giả sử câu hỏi ID 1 có choices với ID 1,2,3,4
    const submitData = {
      AttemptID: attemptId,
      answers: [
        { QuestionID: 1, ChoiceID: 2 }, // Chọn đáp án B
      ],
    };
    
    const response = await api.post('/attempts/submit', submitData);
    
    logSuccess('Submit Attempt', {
      attemptId: response.data.data.AttemptID,
      scores: response.data.data.Scores,
      analysis: response.data.data.Analysis,
    });
    return true;
  } catch (error) {
    logError('Submit Attempt', error);
    return false;
  }
}

/**
 * Test 10: Get Attempt Results
 * API: GET /attempts/:attemptId/results
 */
async function testGetAttemptResults() {
  if (!attemptId) {
    console.log('\n⚠️  Skip Get Attempt Results - No attempt ID available');
    return false;
  }
  
  try {
    const response = await api.get(`/attempts/${attemptId}/results`);
    
    logSuccess('Get Attempt Results', {
      attemptId: response.data.data.AttemptID,
      totalScore: response.data.data.Scores.TotalScore,
    });
    return true;
  } catch (error) {
    logError('Get Attempt Results', error);
    return false;
  }
}

/**
 * Test 11: Get Student Progress
 * API: GET /attempts/progress
 */
async function testGetProgress() {
  try {
    const response = await api.get('/attempts/progress');
    
    logSuccess('Get Student Progress', response.data.data);
    return true;
  } catch (error) {
    logError('Get Student Progress', error);
    return false;
  }
}

/**
 * Test 12: Create Comment
 * API: POST /comments
 */
async function testCreateComment() {
  if (!createdExamId) {
    console.log('\n⚠️  Skip Create Comment - No exam ID available');
    return false;
  }
  
  try {
    const commentData = {
      Content: 'This is a test comment from API testing',
      ExamID: createdExamId,
      ParentId: 0, // Top-level comment
    };
    
    const response = await api.post('/comments', commentData);
    
    logSuccess('Create Comment', {
      commentId: response.data.data.ID,
      content: response.data.data.Content,
    });
    return true;
  } catch (error) {
    logError('Create Comment', error);
    return false;
  }
}

/**
 * Test 13: Get Exam Comments
 * API: GET /exams/:examId/comments
 */
async function testGetExamComments() {
  if (!createdExamId) {
    console.log('\n⚠️  Skip Get Exam Comments - No exam ID available');
    return false;
  }
  
  try {
    const response = await api.get(`/comments/exams/${createdExamId}/comments`);
    
    logSuccess('Get Exam Comments', {
      totalComments: response.data.pagination?.TotalComments,
      comments: response.data.data?.length,
    });
    return true;
  } catch (error) {
    logError('Get Exam Comments', error);
    return false;
  }
}

/**
 * Test 14: Update Exam
 * API: PUT /exams/:id
 */
async function testUpdateExam() {
  if (!createdExamId) {
    console.log('\n⚠️  Skip Update Exam - No exam ID available');
    return false;
  }
  
  try {
    const updateData = {
      Title: 'Updated Test Exam - Modified by API Test',
      TimeExam: 90,
    };
    
    const response = await api.put(`/exams/${createdExamId}`, updateData);
    
    logSuccess('Update Exam', {
      examId: response.data.data.ID,
      newTitle: response.data.data.Title,
    });
    return true;
  } catch (error) {
    logError('Update Exam', error);
    return false;
  }
}

/**
 * Test 15: Get Exam Statistics
 * API: GET /exams/:id/statistics
 */
async function testGetExamStatistics() {
  if (!createdExamId) {
    console.log('\n⚠️  Skip Get Exam Statistics - No exam ID available');
    return false;
  }
  
  try {
    const response = await api.get(`/exams/${createdExamId}/statistics`);
    
    logSuccess('Get Exam Statistics', response.data.data);
    return true;
  } catch (error) {
    logError('Get Exam Statistics', error);
    return false;
  }
}

/**
 * Main test runner
 * Chạy tất cả các tests theo thứ tự
 */
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('🧪 BẮT ĐẦU API TESTING');
  console.log('='.repeat(60));
  
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
  };
  
  // Chạy từng test
  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Setup Auth', fn: setupAuthentication },
    { name: 'Get All Exams', fn: testGetAllExams },
    { name: 'Get Exam by ID', fn: testGetExamById },
    { name: 'Create Question', fn: testCreateQuestion },
    { name: 'Search Questions', fn: testSearchQuestions },
    { name: 'Create Exam', fn: testCreateExam },
    { name: 'Start Attempt', fn: testStartAttempt },
    { name: 'Submit Attempt', fn: testSubmitAttempt },
    { name: 'Get Attempt Results', fn: testGetAttemptResults },
    { name: 'Get Progress', fn: testGetProgress },
    { name: 'Create Comment', fn: testCreateComment },
    { name: 'Get Exam Comments', fn: testGetExamComments },
    { name: 'Update Exam', fn: testUpdateExam },
    { name: 'Get Exam Statistics', fn: testGetExamStatistics },
  ];
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result === true) {
        results.passed++;
      } else if (result === false) {
        results.failed++;
      }
    } catch (error) {
      console.error(`\n💥 Unexpected error in ${test.name}:`, error);
      results.failed++;
    }
    
    // Đợi một chút giữa các tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Hiển thị kết quả tổng hợp
  console.log('\n' + '='.repeat(60));
  console.log('📊 KẾT QUẢ TEST');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Skipped: ${results.skipped}`);
  console.log('='.repeat(60));
  
  const totalTests = results.passed + results.failed;
  const successRate = totalTests > 0 
    ? ((results.passed / totalTests) * 100).toFixed(1) 
    : 0;
  console.log(`\n🎯 Success Rate: ${successRate}%`);
}

// Chạy tests
runAllTests().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
# TOEIC Exam Practice Backend

Backend API cho hệ thống luyện thi TOEIC trực tuyến, cung cấp đầy đủ chức năng quản lý đề thi, câu hỏi, làm bài thi, và theo dõi tiến độ học tập.

## 📋 Mục Lục

- [Tổng Quan](#tổng-quan)
- [Kiến Trúc](#kiến-trúc)
- [Tính Năng](#tính-năng)
- [Công Nghệ Sử Dụng](#công-nghệ-sử-dụng)
- [Yêu Cầu Hệ Thống](#yêu-cầu-hệ-thống)
- [Cài Đặt](#cài-đặt)
- [Cấu Hình](#cấu-hình)
- [Chạy Ứng Dụng](#chạy-ứng-dụng)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Authentication & Authorization](#authentication--authorization)
- [Testing](#testing)
- [Development Guide](#development-guide)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Team](#team)

---

## 🎯 Tổng Quan

Đây là backend API cho module **Thi TOEIC** trong hệ thống học và luyện thi TOEIC trực tuyến. Backend này xử lý toàn bộ business logic liên quan đến việc quản lý đề thi, ngân hàng câu hỏi, cho phép học viên làm bài thi, chấm điểm tự động, và theo dõi tiến độ học tập.

### Bối cảnh dự án

Hệ thống hoàn chỉnh bao gồm hai phần chính được phát triển bởi hai teams độc lập. Phần học và authentication được xây dựng bằng Spring Boot, trong khi phần thi này được xây dựng bằng Node.js với TypeScript. Hai backends chia sẻ cùng một JWT secret key để đảm bảo tokens có thể được sử dụng xuyên suốt toàn bộ hệ thống.

### Vai trò trong hệ thống

Backend này đóng vai trò là service chuyên biệt xử lý tất cả các operations liên quan đến exam module. Nó được thiết kế để hoạt động độc lập nhưng vẫn tích hợp liền mạch với Spring Boot backend thông qua shared authentication mechanism. Frontend có thể gọi APIs từ cả hai backends một cách trong suốt miễn là có valid JWT token.

---

## 🏗️ Kiến Trúc

Backend được xây dựng theo **Clean Architecture** với sự phân tách rõ ràng giữa các layers, đảm bảo code dễ maintain, test, và scale. Kiến trúc này giúp tách biệt business logic khỏi implementation details, làm cho code linh hoạt và dễ thay đổi.

### Các layers trong kiến trúc

```
src/
├── domain/              # Domain Layer - Core business logic
│   └── entities/        # Database entities với TypeORM
│
├── application/         # Application Layer - Use cases
│   ├── dtos/           # Data Transfer Objects với validation
│   └── services/       # Business logic services
│
├── infrastructure/      # Infrastructure Layer - External concerns
│   ├── database/       # Database configuration và migrations
│   └── repositories/   # Data access layer
│
└── presentation/        # Presentation Layer - HTTP interface
    ├── controllers/    # Request handlers
    ├── routes/         # Route definitions
    └── middlewares/    # Express middlewares
```

### Luồng xử lý request

Khi một HTTP request đến server, nó sẽ đi qua một chuỗi các layers theo thứ tự rất rõ ràng. Đầu tiên, request đi qua các global middlewares như CORS, body parser, và request logging để setup môi trường xử lý. Tiếp theo, nó đến authentication middleware để verify JWT token và extract user information. Sau đó, authorization middleware kiểm tra xem user có quyền thực hiện action này không dựa trên role của họ. Validation middleware đảm bảo request data hợp lệ theo DTO schema trước khi cho phép data vào sâu hơn trong hệ thống.

Một khi request đã pass qua tất cả các guards này, nó đến controller layer nơi request được parse và delegate xuống service layer. Service layer là nơi chứa toàn bộ business logic, nơi các decisions được đưa ra và các business rules được enforce. Services gọi repositories để interact với database khi cần thiết. Repositories abstract away tất cả database operations, cung cấp một clean interface cho services để work với data mà không cần biết underlying database implementation.

Cuối cùng, response được format và return ngược lại thông qua các layers, với error handling middleware ở cuối cùng catch bất kỳ errors nào và format chúng thành consistent error responses.

### Nguyên tắc thiết kế

Kiến trúc này tuân theo một số nguyên tắc quan trọng để đảm bảo code quality. Dependency Inversion Principle đảm bảo các layers cao cấp không phụ thuộc vào details của layers thấp hơn. Services không biết TypeORM hay MySQL đang được sử dụng, chúng chỉ biết repository interface. Điều này cho phép bạn swap out database hoặc ORM mà không ảnh hưởng đến business logic.

Single Responsibility Principle được áp dụng nghiêm ngặt với mỗi class và function chỉ có một lý do để thay đổi. Controllers chỉ handle HTTP concerns, services chỉ chứa business logic, repositories chỉ handle data access. Sự tách biệt này làm cho code rất dễ hiểu và maintain.

Separation of Concerns đảm bảo validation logic tách biệt khỏi business logic, authentication tách biệt khỏi authorization, và error handling được centralized. Điều này giúp mỗi phần của code tập trung vào một việc và làm tốt việc đó.

---

## ✨ Tính Năng

### Quản lý Exam (Đề thi)

Hệ thống cung cấp đầy đủ CRUD operations cho exams với các tính năng advanced. Teachers và admins có thể tạo mới đề thi với title, time limit, và exam type tùy chỉnh. Họ có thể add hoặc remove questions từ exam, reorder questions để tạo structure phù hợp, và update exam metadata bất cứ lúc nào. Search và filter functionality cho phép tìm kiếm exams theo title, type, hoặc creator.

Hệ thống cũng cung cấp duplicate exam feature để nhanh chóng tạo variants của exams hiện có, rất hữu ích khi muốn tạo nhiều versions cho testing purposes. Exam statistics cho teachers thấy overview về exam performance, bao gồm số lượng students đã làm, average scores, và question distribution.

### Quản lý Questions (Câu hỏi)

Question bank được quản lý một cách chuyên nghiệp với full CRUD operations. Mỗi question bao gồm question text, multiple choices với một correct answer, và associated media như audio files cho listening questions hoặc images cho reading comprehension. Questions được categorize theo skill type là listening hay reading, section number từ một đến bảy theo chuẩn TOEIC, và specific question type.

Advanced search và filtering cho phép teachers tìm questions theo skill, section, type, hoặc text content để dễ dàng build exams. Bulk operations enable efficient management khi cần update hoặc delete nhiều questions cùng lúc. Usage statistics cho mỗi question show có bao nhiêu exams đang sử dụng nó và student success rate, giúp identify questions quá dễ hoặc quá khó cần adjustment.

### Test-taking Flow (Làm bài thi)

Student test-taking experience được design để smooth và user-friendly. Khi student clicks start test, system tạo một attempt record với timestamp và returns một unique attempt ID. Frontend uses ID này để track session và submit answers sau này. Students có thể làm full test với all hai trăm questions hoặc practice by specific parts để focus vào weak areas.

Time tracking được enforce strictly với server-side validation để ensure fairness. System checks rằng time elapsed không vượt quá time limit khi student submits answers. Nếu vượt quá, submission sẽ bị reject để prevent cheating. Active attempt management cho phép students resume test nếu họ accidentally refresh page, preventing data loss và frustration.

### Automatic Grading (Chấm điểm tự động)

Khi student submits answers, system performs comprehensive automatic grading trong một database transaction để ensure data consistency. Mỗi answer được check against correct choice và marked as correct hay incorrect. Scores được calculated theo hai metrics là raw percentage score showing số câu đúng trên tổng số câu, và scaled TOEIC scores từ zero đến bốn chín năm cho mỗi section.

Detailed results include answer-by-answer breakdown showing what student chose versus correct answer cho mỗi question. Performance analysis identifies weak areas bằng cách analyze accuracy by question type, cho students actionable insights về where to focus future practice. All results được stored persistently để students có thể review bất cứ lúc nào.

### Progress Tracking (Theo dõi tiến độ)

Comprehensive progress tracking cho students detailed view của learning journey. System tracks all attempts với timestamps, scores, và exam types để build complete history. Statistics include average scores overall và by section để show strengths và weaknesses, improvement trends comparing recent versus older attempts để demonstrate progress, và identification of weak question types based on accuracy patterns.

Best score tracking cho mỗi exam motivates students để improve personal records. Attempt history với filtering by date range hay exam type helps students review past performance. All data được visualized trong progress dashboard để make insights easily digestible.

### Discussion & Comments

Social learning features enable students để ask questions và share insights. Students có thể post comments trên exams để ask for clarification hoặc share strategies. Threaded discussions với parent-child comment structure allow natural conversation flow giống forums. Teachers có thể chime in để provide expert guidance khi needed.

Comment moderation system cho teachers và admins ability để approve, hide, hoặc flag comments để maintain healthy discussions. Search comments functionality helps find specific topics được discussed previously. Activity indicators show số comments per exam để highlight popular discussions.

### Role-based Access Control

Comprehensive authorization system với three main roles được implemented carefully. Admin role có full access đến all resources including ability để delete exams và perform bulk operations. Teacher role có permissions để create và manage content như exams và questions nhưng not delete major resources. Student role limited đến taking tests, viewing own results, và participating trong discussions.

Resource ownership checks ensure students chỉ có thể access own attempts và results, không thể view other students' data. Fine-grained permissions cho different operations prevent unauthorized actions. Rate limiting prevents abuse của comment và other creation endpoints.

---

## 🛠️ Công Nghệ Sử Dụng

### Backend Framework & Runtime

Toàn bộ backend được xây dựng trên Node.js version eighteen, một runtime environment cho phép chạy JavaScript server-side với performance cao nhờ V8 engine. Express.js version bốn được chọn làm web framework vì nó lightweight, flexible, và có ecosystem mạnh mẽ với thousands of middleware packages available.

TypeScript được sử dụng throughout entire codebase để provide type safety và better developer experience. Type system của TypeScript helps catch bugs at compile time rather than runtime, making code more robust và maintainable. Strict mode được enable để enforce best practices và prevent common pitfalls.

### Database & ORM

MySQL được chọn làm relational database vì nó reliable, proven, và có excellent support cho complex queries needed cho this application. TypeORM version zero point three serves as ORM layer, providing elegant way để work với database using TypeScript classes và decorators thay vì raw SQL.

TypeORM entities map directly to database tables với relationships được define declaratively using decorators. Migrations system allows tracking database schema changes over time và applying them consistently across environments. Query builder provides type-safe way để construct complex queries khi needed.

### Authentication & Security

JWT (JSON Web Tokens) được implement using jsonwebtoken library version chín để enable stateless authentication. Tokens contain user information và are signed using secret key shared với Spring Boot backend, allowing seamless integration between services. Bcrypt version năm provides secure password hashing with configurable salt rounds khi needed for future user registration features.

CORS middleware được configure carefully để allow requests only from trusted frontend origins while blocking others. Helmet middleware adds various HTTP security headers để protect against common web vulnerabilities. Rate limiting prevents abuse của public endpoints.

### Validation & Data Transfer

Class-validator version zero point fourteen provides decorator-based validation cho DTOs, ensuring all incoming data meets requirements before reaching business logic. Class-transformer works alongside để transform plain JSON objects into typed class instances, enabling proper validation và type safety.

Custom validation rules có thể được define easily using decorator syntax, making validation logic readable và maintainable. Error messages are clear và actionable, helping frontend developers understand exactly what went wrong.

### Development Tools

Nodemon provides automatic server restart during development khi files change, dramatically improving developer experience. TS-Node allows running TypeScript files directly without separate compilation step, speeding up development workflow. Dotenv manages environment variables securely, keeping sensitive config out of codebase.

ESLint với TypeScript plugin enforces code style và catches potential issues. Prettier ensures consistent formatting across entire codebase. These tools together maintain high code quality standards.

---

## 💻 Yêu Cầu Hệ Thống

Để chạy project này successfully, máy tính của bạn cần đáp ứng một số requirements về software versions và available resources.

### Software Requirements

Node.js version eighteen point zero trở lên là absolutely required vì code uses modern JavaScript features chỉ available trong recent versions. Bạn có thể check version hiện tại bằng command `node --version` trong terminal. Nếu version cũ hơn, download latest LTS version từ nodejs.org.

MySQL version tám point zero trở lên needed để run database server locally. MySQL cung cấp reliable storage cho all application data. Nếu chưa có, download từ mysql.com và follow installation instructions cho operating system của bạn.

npm version chín trở lên hoặc yarn version một point twenty two được dùng để manage dependencies. npm comes bundled với Node.js nên thường không cần install riêng. Yarn là alternative package manager có thể install if preferred.

Git version control system cần thiết để clone repository và track changes. Most developers đã có installed nhưng if not, download từ git-scm.com.

### Recommended Development Environment

Visual Studio Code là highly recommended IDE vì excellent TypeScript support và rich extension ecosystem. Install TypeScript extension và ESLint extension để get best development experience với syntax highlighting, auto-completion, và real-time error checking.

Postman hoặc similar API testing tool useful để test endpoints during development without needing frontend. MySQL Workbench provides graphical interface để manage database nếu prefer GUI over command line.

### Hardware Requirements

Minimum bốn GB RAM recommended để run Node.js server, MySQL database, và IDE comfortably. Eight GB or more ideal cho smooth development experience đặc biệt when running multiple services simultaneously.

Free disk space ít nhất hai GB needed cho application code, dependencies, và database storage. SSD preferred over HDD cho faster application startup và database operations.

---

## 📦 Cài Đặt

Quá trình cài đặt được chia thành các bước rõ ràng để đảm bảo bạn setup project correctly ngay từ đầu.

### Bước 1: Clone Repository

Đầu tiên, tạo một folder cho project trên máy của bạn và navigate vào folder đó trong terminal. Sau đó run git clone command để download toàn bộ source code:

```bash
git clone <repository-url>
cd toeic-exam-backend
```

Command này creates a local copy của repository trên máy bạn với all files, history, và branches.

### Bước 2: Install Dependencies

Node modules cần được install trước khi có thể run application. Navigate vào project directory và run npm install:

```bash
npm install
```

Command này reads package.json file và downloads all required dependencies vào node_modules folder. Process này có thể take a few minutes depending on internet speed vì có quite a few packages cần download. Bạn sẽ thấy progress bar showing download status.

Nếu encounter any errors during installation, try clearing npm cache với `npm cache clean --force` và run install again. Sometimes network issues hay corrupted cache có thể cause problems.

### Bước 3: Setup Database

MySQL database cần được create và configure trước khi application có thể connect. Open MySQL command line hoặc MySQL Workbench và create new database:

```sql
CREATE DATABASE db_doantotnghiep CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Character set utf8mb4 important để properly store Vietnamese characters và emoji nếu needed. Collation utf8mb4_unicode_ci ensures proper sorting và comparison của text data.

Create database user với appropriate permissions if needed:

```sql
CREATE USER 'your_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON db_doantotnghiep.* TO 'your_user'@'localhost';
FLUSH PRIVILEGES;
```

Điều này creates dedicated user cho application thay vì using root user, improving security.

### Bước 4: Configure Environment Variables

Create file `.env` trong root directory của project bằng cách copy từ example file:

```bash
cp .env.example .env
```

Open `.env` file trong text editor và fill in actual values cho environment. File này contains sensitive configuration không nên commit vào git.

### Bước 5: Initialize Database Schema

Application uses TypeORM synchronize feature trong development để automatically create tables based on entities. Khi run application lần đầu, TypeORM sẽ analyze entities và create corresponding database schema automatically. Điều này very convenient during development nhưng should not be used trong production.

Alternatively, bạn có thể run migrations manually nếu có migration files:

```bash
npm run migration:run
```

### Bước 6: Seed Initial Data

Để có test data trong database, run seed script:

```bash
npm run seed
```

Script này creates sample exam types, exams, questions, và choices để bạn có data to work with immediately. Rất useful để test features without manually creating everything.

---

## ⚙️ Cấu Hình

File `.env` chứa tất cả configuration variables mà application needs. Understanding each variable giúp bạn configure system correctly.

### Database Configuration

Các biến này control connection đến MySQL database:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_DATABASE=db_doantotnghiep
```

DB_HOST specifies where database server đang chạy. Use localhost nếu MySQL running trên same machine, hoặc IP address nếu remote server. DB_PORT là port number mà MySQL listening on, default là ba ba không sáu. DB_USERNAME và DB_PASSWORD là credentials được create trong setup step. DB_DATABASE là tên của database created earlier.

### Server Configuration

Các biến này control how application server runs:

```env
PORT=3001
NODE_ENV=development
API_PREFIX=/api/exam
```

PORT determines which port server listens on. Three zero zero one chosen để avoid conflict với common frontend port three thousand. NODE_ENV controls behavior như logging verbosity và error detail level. Set to development trong local development và production khi deploy. API_PREFIX adds namespace prefix đến all routes, helping organize APIs khi multiple services exist.

### CORS Configuration

Cross-Origin Resource Sharing configuration controls which domains can make requests:

```env
CORS_ORIGIN=http://localhost:3000
```

Set this to actual frontend URL. Trong development, frontend typically runs trên localhost:3000. Multiple origins có thể được specify bằng comma separation nếu needed. Trong production, set to actual production domain like https://yourdomain.com.

### JWT Configuration

JWT secret key absolutely critical cho authentication security:

```env
JWT_SECRET=your-super-secret-key-here
```

Secret key này MUST match với Spring Boot backend secret để tokens work across both services. Choose strong, random string với good length, mix of characters, numbers, và symbols. Never commit actual secret vào git repository. In production, use environment variable hoặc secrets management service.

---

## 🚀 Chạy Ứng Dụng

Có several commands available để run application trong different modes, each serving different purposes trong development workflow.

### Development Mode

Run server trong development mode với hot reload enabled:

```bash
npm run dev
```

Command này starts server using nodemon which automatically restarts server whenever bạn save changes to any TypeScript file. Rất convenient vì không cần manually restart mỗi lần edit code. Server starts trên configured port và you should see message indicating successful startup với available endpoints listed.

Console logs show all incoming requests với method, URL, và timestamp, helping debug issues và understand application flow. TypeScript compilation errors sẽ show ngay trong console nếu có syntax issues.

### Production Mode

Build và run production-optimized version:

```bash
npm run build
npm start
```

Build command compiles TypeScript code thành JavaScript trong dist folder với optimizations applied. Start command runs compiled JavaScript using node directly, providing better performance compared to development mode. No hot reload trong production mode để ensure stability.

Production mode disables verbose logging và detailed error messages được sent to clients, improving security bằng cách not exposing internal details.

### Testing Database Connection

Verify database connection working properly:

```bash
npm run test:connection
```

Script này attempts to connect to database và fetch some test data, confirming that all database configuration correct. Useful để quickly check if database issues exist before starting main application.

### Generate JWT Tokens

Create test tokens cho development:

```bash
npm run generate:token
# Or với quick script:
node quick-token.js student
```

Scripts này generate valid JWT tokens với proper payload structure để frontend developers có thể test APIs without needing Spring Boot backend running. Supports generating tokens cho admin, teacher, và student roles.

---

## 📚 API Documentation

API follows RESTful conventions với consistent patterns across all endpoints, making it intuitive để understand và use.

### Base URL

All API requests should be made to:

```
http://localhost:3001/api/exam
```

Trong production, base URL sẽ be actual server domain như https://api.yourdomain.com/api/exam.

### Authentication

Most endpoints require authentication. Include JWT token trong Authorization header của every request:

```
Authorization: Bearer <your-jwt-token>
```

Token này obtained from either Spring Boot login endpoint trong production hoặc token generator scripts trong development. Backend validates token signature, checks expiration, và extracts user information để authorize request.

### Standard Response Format

All successful responses follow consistent structure:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { /* actual response data */ },
  "count": 10  // included for list endpoints
}
```

Success field indicates whether operation completed successfully. Message provides human-readable description của what happened. Data contains actual response payload structure varies by endpoint. Count included when returning lists để help với pagination.

### Error Response Format

Errors also follow standard structure:

```json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE",
  "details": { /* optional additional info */ }
}
```

Success always false cho errors. Message explains what went wrong trong clear language. Error code provides machine-readable identifier useful cho frontend error handling. Details includes additional information like validation errors showing exactly which fields failed.

### Exam Endpoints

Exam management endpoints handle all operations related to creating, reading, updating, và deleting exams.

**GET /exams** retrieves list of all available exams với optional filtering by exam type. Returns array of exam objects với basic information excluding full question details for performance. Useful cho displaying exam list trong UI.

**GET /exams/:id** fetches complete details of specific exam including all questions with their choices. Note that IsCorrect flag removed from choices để prevent students from seeing answers. Teachers và admins use this để review exam content.

**POST /exams** creates new exam. Requires teacher hoặc admin role. Request body includes exam title, time limit, exam type ID, và optionally array of questions to add immediately. Returns created exam with generated ID.

**PUT /exams/:id** updates existing exam metadata. Only creator hoặc admin can update. Can modify title, time limit, hoặc exam type. Questions managed separately through dedicated endpoints.

**DELETE /exams/:id** removes exam from system. Admin only operation. Service prevents deletion if exam has student attempts để preserve historical data. Use with extreme caution.

**POST /exams/:id/questions** adds questions to exam. Requires array of question IDs with order indices specifying sequence. Questions must exist trong question bank trước. Service validates all questions exist before adding.

**DELETE /exams/:id/questions** removes questions from exam. Doesn't delete actual questions, chỉ removes association với this specific exam. Questions remain available cho other exams.

**GET /exams/:id/statistics** provides comprehensive statistics including question count, distribution by section, number of attempts, và average scores. Teacher và admin only để analyze exam performance.

### Attempt Endpoints

Attempt endpoints handle student test-taking flow from starting test đến viewing results.

**POST /attempts/start** initiates new test session. Student provides exam ID và type là full test hay practice by parts. If practice by parts, must specify which parts to include. Returns attempt ID that must be saved và used for submission.

**POST /attempts/submit** submits student answers for grading. Requires attempt ID và array of answers linking question IDs to chosen choice IDs. Server validates timing, grades all answers, calculates scores, identifies weak areas, và returns comprehensive results. This endpoint performs heavy lifting của grading logic.

**GET /attempts/:attemptId/results** retrieves results for previously submitted attempt. Students can review their performance any time after submission. Shows same detailed breakdown như submission response including scores, answer review, và analysis.

**GET /attempts/history** fetches list of all attempts by authenticated student. Supports filtering by date range, exam type, và whether submitted. Useful cho progress dashboard showing test history.

**GET /attempts/progress** returns comprehensive statistics about student performance across all attempts. Includes averages by section, improvement trends, và identified weak areas. Powers progress tracking features trong UI.

**GET /attempts/active** checks if student has any unsubmitted attempts. Helps recover from page refreshes during test by detecting và resuming active session. Returns most recent unsubmitted attempt if exists.

**DELETE /attempts/:attemptId** removes attempt from history. Student can delete own attempts; intended cho cleaning up accidentally started tests. Consider carefully whether to allow deleting submitted attempts.

### Question Endpoints

Question bank management endpoints cho teachers và admins.

**GET /questions** searches và filters questions trong question bank. Supports filtering by skill type, section number, question type, và text search. Returns paginated results với usage statistics showing how many exams use each question.

**POST /questions** creates new question with media và choices. Requires complete question definition including text, media URLs cho audio/images, và at least two choices with exactly one marked correct. Service validates business rules như ensuring unique choice attributes.

**PUT /questions/:id** updates existing question. Service warns if question widely used since changes affect all exams using it. Consider creating new version instead of modifying popular questions.

**DELETE /questions/:id** removes question from system. Admin only operation. Service prevents deletion if question still used trong any exams để avoid breaking existing exams. Must remove from all exams trước.

**GET /questions/:id/statistics** provides insights about question usage including how many exams include it, student success rate, và derived difficulty level. Helps identify questions needing adjustment.

### Comment Endpoints

Discussion features enabling social learning through comments.

**POST /comments** creates new comment or reply on exam. Requires comment content, exam ID, và optional parent comment ID for threaded discussions. Rate limited để prevent spam. Returns created comment with ID.

**GET /exams/:examId/comments** fetches comments for specific exam. Supports filtering by parent ID để get top-level comments hoặc replies to specific comment. Pagination included for performance với large discussion threads.

**PUT /comments/:commentId** allows editing own comment content. Students can fix typos hoặc clarify thoughts. Only original author can edit unless admin/teacher moderating.

**DELETE /comments/:commentId** removes comment và all its nested replies recursively. Authors can delete own comments. Teachers và admins can delete any comment for moderation purposes.

**PATCH /comments/:commentId/moderate** changes comment status cho moderation. Teacher/admin only. Can approve pending comments, hide inappropriate content, hoặc flag for further review.

Detailed API documentation với request/response examples available trong separate API_DOCS.md file.

---

## 🗄️ Database Schema

Database được thiết kế cẩn thận để support all features với proper relationships và constraints ensuring data integrity.

### Core Entities

**User table** stores basic account information cho tất cả users regardless of role. Contains essential fields như email which must be unique, hashed password for authentication, full name for display, status indicating account state, và timestamps tracking when account created. Phone, address, sex, và birthday fields optional để enrich profile information.

**StudentProfile table** extends User với student-specific data through one-to-one relationship. Each student profile linked to exactly one user account. Fields include target score cho motivation, daily study minutes for habit tracking, goal date để pace learning, placement level determined by initial assessment, và last active timestamp for engagement metrics. Foreign key UserID establishes relationship với User table.

**ExamType table** categorizes different kinds of exams. Contains code field with unique constraint ensuring no duplicate types, và description explaining what type represents. Examples include FULL_TEST cho complete two hundred question tests và MINI_TEST cho shorter practice sessions. This design allows flexible exam categorization.

**Exam table** represents actual test instances. Title field names the exam for students. TimeCreate automatically set when created. TimeExam specifies duration trong minutes. Type field allows additional categorization. UserID tracks who created exam for permission checks. ExamTypeID foreign key links to ExamType defining category. Multiple exams can share same type allowing grouping.

**MediaQuestion table** stores all media assets associated với questions. Skill field indicates listening hay reading. Type describes specific question format. Section maps to TOEIC part number one through seven. AudioUrl points to stored audio file cho listening questions. ImageUrl references images for photo description hay reading passages. Script field holds text content like transcripts hay reading passages. Design allows media reuse across multiple questions needing same asset.

**Question table** represents individual test questions. QuestionText contains the question stem or prompt. UserID tracks creator for management. MediaQuestionID foreign key links to associated media asset. Many questions might reference same media for question groups. Choices defined trong separate table for normalization.

**Choice table** stores answer options for each question. Content field holds answer text student sees. Attribute field labels the choice typically A, B, C, hay D. IsCorrect boolean flag marks the correct answer exactly one per question. QuestionID foreign key links choice to its question. Cascade delete ensures orphaned choices cleaned up when parent question deleted.

**ExamQuestion junction table** creates many-to-many relationship between exams và questions. Single question can appear trong multiple exams while exam contains many questions. ExamID và QuestionID foreign keys establish relationships. OrderIndex field critical for maintaining question sequence ensuring consistent test experience. This design enables flexible exam creation through question reuse.

**Attempt table** tracks each test-taking session. StudentProfileID links attempt to student who took test. ExamID indicates which exam attempted. Type field specifies full test hay practice by parts. StartedAt timestamp records when began. SubmittedAt null until student finishes indicating incomplete attempts. ScorePercent stores percentage correct. ScoreListening và ScoreReading hold TOEIC-scaled scores for respective sections. Design supports multiple attempts per student per exam allowing unlimited practice.

**AttemptAnswer junction table** records individual answers within attempt. AttemptID links to parent attempt session. QuestionID identifies which question answered. ChoiceID specifies selected answer. IsCorrect computed by comparing choice's IsCorrect flag stored for quick queries và immutability if questions later modified. This granular tracking enables detailed analysis và feedback.

**Comment table** enables discussion features. Content holds comment text. CreateAt timestamp for sorting. ParentId creates hierarchical structure zero for top-level comments higher values for replies enabling threaded discussions. Status field supports moderation one for approved two for hidden three for flagged. StudentProfileID identifies commenter. ExamID associates comment với specific exam. Design supports nested conversations.

**Relationships**

Entity relationships carefully designed to represent domain accurately. User has one StudentProfile through one-to-one relationship extending user entity with role-specific data. StudentProfile has many Attempts since students take multiple tests over time. StudentProfile also has many Comments enabling participation trong discussions.

Exam belongs to one ExamType for categorization. Exam has many ExamQuestion associations through junction table. ExamType has many Exams allowing grouping by type. Exam has many Attempts tracking all times students took this exam. Exam has many Comments collecting all discussions about exam.

Question has one MediaQuestion containing associated assets. Question has many Choices typically four for TOEIC format. Question has many ExamQuestion associations appearing trong multiple exams. Question has many AttemptAnswers recording all times answered by students.

Attempt belongs to one StudentProfile và one Exam. Attempt has many AttemptAnswers one per question trong exam. This structure allows complete reconstruction of what student answered versus correct answers.
Comment belongs to one StudentProfile who wrote it và one Exam discussed. Comments self-reference through ParentId enabling tree structure for nested replies.

**Indexes**

Strategic indexes improve query performance. Email trong User table indexed for fast login lookups. StudentProfileID trong Attempt table indexed since frequently filtered by student. ExamID trong multiple tables indexed for exam-specific queries. CreateAt timestamps indexed enabling efficient date range filters. Compound indexes on frequently joined columns optimize complex queries.

## 🔐 Authentication & Authorization
Security implementation critical to protect user data và ensure proper access control.

**JWT Authentication**

System uses JWT tokens for stateless authentication meaning server doesn't maintain session state. Tokens self-contained with user information encoded within signed payload. This design enables scalability since any server instance can validate tokens independently without shared session storage.

Token structure includes header specifying algorithm HS256 used, payload containing user claims, và signature verifying authenticity. Payload includes userId identifying user account, email for display, role determining permissions, studentProfileId when applicable linking to profile data, iat issued at timestamp, exp expiration timestamp, và iss issuer claim.

Auth middleware intercepts requests extracting token from Authorization header. Bearer scheme required with format "Bearer token". Middleware verifies signature using shared secret key rejecting tampered tokens. Expiration checked refusing expired tokens. Decoded payload attached to request object making user information available to downstream handlers.

Shared secret coordination critical between Node.js backend và Spring Boot backend. Both must use identical JWT_SECRET environment variable to generate và verify tokens interchangeably. This enables single sign-on experience where login through Spring Boot produces token valid for both backends.

**Authorization Levels**

Three main roles implemented với different permission sets. Admin role highest privilege managing system với abilities including creating/updating/deleting any resource, viewing all user data và statistics, performing bulk operations, và moderating all content. Use sparingly given broad permissions.

Teacher role focused on content management với permissions to create và update exams và questions, view exam statistics và analytics, moderate comments discussing their content, but cannot delete exams preserving data integrity. Designed for instructors creating course content.

Student role most restricted appropriate for learners với abilities limited to viewing available exams without answers, starting và submitting test attempts, viewing own results và progress only, creating và editing own comments. Cannot access other students' data ensuring privacy.

**Ownership Validation**

Beyond role-based checks ownership validation ensures users only access own resources. Implemented through checks comparing resource owner IDs với authenticated user ID. For example students viewing attempt results service verifies attempt's StudentProfileID matches requesting user's studentProfileId from token. Admins bypass ownership checks given oversight responsibilities.

Comments checked similarly users edit hay delete only own comments unless admin/teacher moderating. Exams checked where only creator hay admin updates. This granular control prevents unauthorized access even within same role.

**Rate Limiting**

Abuse prevention through rate limiting controls request frequency. Implemented via middleware tracking requests per user per time window. Comment creation limited to prevent spam five per minute reasonable for legitimate use. Failed login attempts limited preventing brute force attacks though currently handled by Spring Boot. API calls overall limited preventing DOS attacks.

In-memory tracking suitable for single server development. Production with multiple servers should use Redis for distributed rate limiting ensuring limits apply across all instances consistently.

## 🧪 Testing
Comprehensive testing strategy ensures code quality và catches bugs early.

**Manual API Testing**

Manual testing script provided trong tests/manual-api-tests.ts covers all major endpoints với realistic scenarios. Script generates tokens, calls each endpoint in logical sequence, validates responses, và reports results. Run via npx ts-node tests/manual-api-tests.ts providing quick smoke test after changes.

Script tests complete flows like creating exam with questions, student starting attempt, submitting answers, viewing results. Useful for integration testing ensuring components work together properly beyond unit test isolation.

**Token Generation**

Utility scripts trong src/utils/ enable generating test tokens for various roles. Generate-token.ts provides comprehensive TypeScript implementation with validation và verification functions. Quick-token.js offers simple JavaScript alternative anyone can run. Both produce valid tokens matching production structure enabling realistic testing.

Frontend developers use these extensively during development eliminating dependency on Spring Boot backend. Tokens valid for configured duration typically twenty four hours for testing convenience versus shorter production expiry.

**Database Testing**

Test-connection.ts script verifies database connectivity và basic operations. Useful for debugging configuration issues before running full application. Attempts connection then performs simple query confirming successful communication.

Seed-data.ts populates database with sample data enabling immediate testing without manual data entry. Creates exam types, sample exams with questions, và complete choice sets. Run via npm run seed after database initialization.

**Recommended Testing Workflow**

During feature development follow workflow of writing service method implementing business logic, creating manual test scenario in manual-api-tests.ts, running script verifying expected behavior, testing error cases ensuring proper error handling, và documenting any special cases.

Before committing run full manual test suite confirming no regressions, verify database seeds still work, test with different user roles ensuring authorization correct, và check error responses are helpful.
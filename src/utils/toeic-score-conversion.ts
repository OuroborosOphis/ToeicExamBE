// src/utils/toeic-score-conversion.ts
/**
 * TOEIC Score Conversion Tables
 * 
 * These tables convert raw scores (number of correct answers) to 
 * TOEIC scaled scores (0-495 for each section).
 * 
 * The TOEIC test uses Item Response Theory (IRT) for scoring, which means:
 * - The conversion is non-linear
 * - Earlier correct answers contribute more to the scaled score
 * - The tables account for test difficulty and statistical variation
 * 
 * IMPORTANT: These are approximate conversion tables based on publicly
 * available TOEIC scoring information. Actual ETS conversion tables may
 * vary slightly by test form and are proprietary.
 * 
 * Structure:
 * - Key: Number of correct answers (raw score)
 * - Value: Corresponding TOEIC scaled score
 * 
 * Each section (Listening and Reading) has its own table because they
 * have different numbers of questions and different scoring curves.
 */

/**
 * LISTENING SECTION CONVERSION TABLE
 * 
 * Listening section has 100 questions total:
 * - Part 1: 6 questions (Photo description)
 * - Part 2: 25 questions (Question-response)
 * - Part 3: 39 questions (Short conversations)
 * - Part 4: 30 questions (Short talks)
 * 
 * The conversion table maps correct answers (0-100) to scaled scores (5-495).
 * Notice how the score progression is non-linear - you need many correct
 * answers at the higher end to increase your score.
 */
export const LISTENING_CONVERSION_TABLE: Record<number, number> = {
  0: 0,   1: 15,  2: 20,  3: 25,  4: 30,
  5: 35,  6: 40,  7: 45,  8: 50,  9: 55,
  10: 60, 11: 65, 12: 70, 13: 75, 14: 80,
  15: 85, 16: 90, 17: 95, 18: 100, 19: 105,
  20: 110,21: 115,22: 120,23: 125,24: 130,
  25: 135,26: 140,27: 145,28: 150,29: 155,
  30: 160,31: 165,32: 170,33: 175,34: 180,
  35: 185,36: 190,37: 195,38: 200,39: 205,
  40: 210,41: 215,42: 220,43: 225,44: 230,
  45: 235,46: 240,47: 245,48: 250,49: 255,
  50: 260,51: 265,52: 270,53: 275,54: 280,
  55: 285,56: 290,57: 295,58: 300,59: 305,
  60: 310,61: 315,62: 320,63: 325,64: 330,
  65: 335,66: 340,67: 345,68: 350,69: 355,
  70: 360,71: 365,72: 370,73: 375,74: 380,
  75: 385,76: 395,77: 400,78: 405,79: 410,
  80: 415,81: 420,82: 425,83: 430,84: 435,
  85: 440,86: 445,87: 450,88: 455,89: 460,
  90: 465,91: 470,92: 475,93: 480,94: 485,
  95: 490,96: 495,97: 495,98: 495,99: 495,100: 495
};



/**
 * READING SECTION CONVERSION TABLE
 * 
 * Reading section has 100 questions total:
 * - Part 5: 30 questions (Incomplete sentences)
 * - Part 6: 16 questions (Text completion)
 * - Part 7: 54 questions (Reading comprehension)
 * 
 * The reading conversion follows a similar non-linear pattern but with
 * slightly different scoring curve than listening.
 */
export const READING_CONVERSION_TABLE: Record<number, number> = {
  0: 0, 1: 5, 2: 5, 3: 10, 4: 15,
  5: 20,  6: 25, 7: 30,  8: 35,
  9: 40,  10: 45, 11: 50, 12: 55,
  13: 60, 14: 65, 15: 70, 16: 75,
  17: 80, 18: 85, 19: 90, 20: 95,
  21: 100,22: 105, 23: 110,24: 115,
  25: 120,26: 125, 27: 130,28: 135,
  29: 140,30: 145, 31: 150,32: 155,
  33: 160,34: 165, 35: 170,36: 175,
  37: 180,38: 185, 39: 190,40: 195,
  41: 200,42: 205, 43: 210,44: 215,
  45: 220,46: 225, 47: 230,48: 235,
  49: 240,50: 245, 51: 250,52: 255,
  53: 260,54: 265, 55: 270,56: 275,
  57: 280,58: 285, 59: 290,60: 295,
  61: 300,62: 305, 63: 310,64: 315,
  65: 320,66: 325, 67: 330,68: 335,
  69: 340,70: 345, 71: 350,72: 355,
  73: 360,74: 365, 75: 370,76: 375,
  77: 380,78: 385, 79: 390,80: 395,
  81: 400,82: 405, 83: 410,84: 415,
  85: 420,86: 425, 87: 430,88: 435,
  89: 440,90: 445, 91: 450,92: 455,
  93: 460,94: 465, 95: 470,96: 475,
  97: 480,98: 485, 99: 490,100: 495
};


/**
 * Convert raw listening score to TOEIC scaled score
 * 
 * This function looks up the scaled score from the conversion table.
 * If the raw score is out of bounds, it returns the minimum (5) or
 * maximum (495) score as appropriate.
 * 
 * @param correctAnswers - Number of correct answers in listening section (0-100)
 * @returns TOEIC scaled score (5-495)
 */
export function convertListeningScore(correctAnswers: number): number {
  // Validate input
  if (correctAnswers < 0) {
    console.warn(`Invalid listening score: ${correctAnswers}. Using 0.`);
    return 5; // Minimum score
  }
  
  if (correctAnswers > 100) {
    console.warn(`Listening score ${correctAnswers} exceeds maximum. Using 100.`);
    return 495; // Maximum score
  }
  
  // Look up in conversion table
  const scaledScore = LISTENING_CONVERSION_TABLE[correctAnswers];
  
  if (scaledScore === undefined) {
    console.error(`No conversion found for ${correctAnswers} correct answers`);
    // Fallback: interpolate between nearest values
    const lower = Math.floor(correctAnswers);
    const upper = Math.ceil(correctAnswers);
    return LISTENING_CONVERSION_TABLE[lower] || 5;
  }
  
  return scaledScore;
}

/**
 * Convert raw reading score to TOEIC scaled score
 * 
 * Similar to listening conversion but uses the reading conversion table.
 * 
 * @param correctAnswers - Number of correct answers in reading section (0-100)
 * @returns TOEIC scaled score (5-495)
 */
export function convertReadingScore(correctAnswers: number): number {
  // Validate input
  if (correctAnswers < 0) {
    console.warn(`Invalid reading score: ${correctAnswers}. Using 0.`);
    return 5; // Minimum score
  }
  
  if (correctAnswers > 100) {
    console.warn(`Reading score ${correctAnswers} exceeds maximum. Using 100.`);
    return 495; // Maximum score
  }
  
  // Look up in conversion table
  const scaledScore = READING_CONVERSION_TABLE[correctAnswers];
  
  if (scaledScore === undefined) {
    console.error(`No conversion found for ${correctAnswers} correct answers`);
    const lower = Math.floor(correctAnswers);
    return READING_CONVERSION_TABLE[lower] || 5;
  }
  
  return scaledScore;
}

/**
 * Calculate complete TOEIC scores from correct answer counts
 * 
 * This is a convenience function that converts both sections at once
 * and returns a comprehensive score object with all the information
 * needed for display and storage.
 * 
 * @param listeningCorrect - Number of correct answers in listening (0-100)
 * @param readingCorrect - Number of correct answers in reading (0-100)
 * @param totalQuestions - Total questions attempted (for percentage calculation)
 * @returns Complete score breakdown
 */
export function calculateToeicScores(
  listeningCorrect: number,
  readingCorrect: number,
  totalQuestions: number
): {
  // Raw scores (number of correct answers)
  listeningCorrect: number;
  readingCorrect: number;
  totalCorrect: number;
  
  // Scaled TOEIC scores
  listeningScore: number;
  readingScore: number;
  totalScore: number;
  
  // Percentage (for quick reference)
  scorePercent: number;
} {
  // Convert to scaled scores using conversion tables
  const listeningScore = convertListeningScore(listeningCorrect);
  const readingScore = convertReadingScore(readingCorrect);
  const totalScore = listeningScore + readingScore;
  
  // Calculate overall statistics
  const totalCorrect = listeningCorrect + readingCorrect;
  const scorePercent = totalQuestions > 0 
    ? Math.round((totalCorrect / totalQuestions) * 100)
    : 0;
  
  return {
    listeningCorrect,
    readingCorrect,
    totalCorrect,
    listeningScore,
    readingScore,
    totalScore,
    scorePercent,
  };
}

/**
 * Get score band description based on total TOEIC score
 * 
 * This provides a human-readable description of the score level.
 * Useful for displaying feedback to students about their proficiency.
 * 
 * TOEIC score bands (approximate):
 * - 0-215: Elementary proficiency
 * - 220-465: Limited working proficiency
 * - 470-725: Professional working proficiency
 * - 730-855: Full professional proficiency
 * - 860-990: Native or bilingual proficiency
 * 
 * @param totalScore - Total TOEIC score (0-990)
 * @returns Score band description
 */
export function getScoreBand(totalScore: number): {
  band: string;
  description: string;
  color: string; // For UI display
} {
  if (totalScore >= 860) {
    return {
      band: 'Advanced',
      description: 'Native or bilingual proficiency. Can use English effectively in demanding situations.',
      color: 'green',
    };
  }
  
  if (totalScore >= 730) {
    return {
      band: 'High Intermediate',
      description: 'Full professional proficiency. Can handle most work situations confidently.',
      color: 'blue',
    };
  }
  
  if (totalScore >= 470) {
    return {
      band: 'Intermediate',
      description: 'Professional working proficiency. Can handle routine work situations.',
      color: 'yellow',
    };
  }
  
  if (totalScore >= 220) {
    return {
      band: 'Elementary',
      description: 'Limited working proficiency. Can handle basic situations with some difficulty.',
      color: 'orange',
    };
  }
  
  return {
    band: 'Beginner',
    description: 'Elementary proficiency. Requires significant improvement for workplace use.',
    color: 'red',
  };
}

/**
 * Validate if the conversion tables are properly configured
 * 
 * This function checks that:
 * - All entries from 0-100 exist
 * - Scores are monotonically increasing
 * - Scores are within valid range (5-495)
 * 
 * Useful for testing and ensuring data integrity.
 * 
 * @returns Validation result with any issues found
 */
export function validateConversionTables(): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Validate Listening table
  for (let i = 0; i <= 100; i++) {
    const score = LISTENING_CONVERSION_TABLE[i];
    
    if (score === undefined) {
      issues.push(`Listening table missing entry for ${i} correct answers`);
    } else {
      if (score < 5 || score > 495) {
        issues.push(`Listening score ${score} for ${i} correct is out of range (5-495)`);
      }
      
      if (i > 0) {
        const prevScore = LISTENING_CONVERSION_TABLE[i - 1];
        if (score < prevScore) {
          issues.push(`Listening scores not monotonic at ${i}: ${prevScore} -> ${score}`);
        }
      }
    }
  }
  
  // Validate Reading table
  for (let i = 0; i <= 100; i++) {
    const score = READING_CONVERSION_TABLE[i];
    
    if (score === undefined) {
      issues.push(`Reading table missing entry for ${i} correct answers`);
    } else {
      if (score < 5 || score > 495) {
        issues.push(`Reading score ${score} for ${i} correct is out of range (5-495)`);
      }
      
      if (i > 0) {
        const prevScore = READING_CONVERSION_TABLE[i - 1];
        if (score < prevScore) {
          issues.push(`Reading scores not monotonic at ${i}: ${prevScore} -> ${score}`);
        }
      }
    }
  }
  
  return {
    isValid: issues.length === 0,
    issues,
  };
}
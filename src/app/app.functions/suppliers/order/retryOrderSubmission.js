/**
 * Shape Language: Input → Filter → Transform → Store → Output → Loop
 * 
 * Input: Order function, context, retry configuration
 * Filter: Check if error is retriable based on config patterns
 * Transform: Execute order function with retry logic and exponential backoff
 * Store: Track retry attempts and results
 * Output: Best result after retries exhausted or success
 * Loop: Self-healing retry mechanism - automatically retries transient failures
 */

/**
 * Sleep/delay utility for exponential backoff
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error message indicates a retriable error
 * @param {string} errorMessage - Error message to check
 * @param {string[]} retriablePatterns - Patterns that indicate retriable errors
 * @param {string[]} nonRetriablePatterns - Patterns that indicate non-retriable errors
 * @returns {boolean} True if error is retriable
 */
function isErrorRetriable(errorMessage, retriablePatterns = [], nonRetriablePatterns = []) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return false;
  }
  
  const lowerError = errorMessage.toLowerCase();
  
  // Check non-retriable patterns first (higher priority)
  for (const pattern of nonRetriablePatterns) {
    if (lowerError.includes(pattern.toLowerCase())) {
      return false;
    }
  }
  
  // Check retriable patterns
  for (const pattern of retriablePatterns) {
    if (lowerError.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  
  // Default: retry (assume transient failure)
  return true;
}

/**
 * Retry order submission with exponential backoff
 * @param {Function} orderFunction - Supplier order function to call
 * @param {Object} context - Context object to pass to order function
 * @param {Object} retryConfig - Retry configuration
 * @param {number} retryConfig.maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} retryConfig.initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @param {number} retryConfig.maxDelayMs - Maximum delay in milliseconds (default: 5000)
 * @param {number} retryConfig.backoffMultiplier - Backoff multiplier (default: 2)
 * @param {string[]} retryConfig.retriableErrorPatterns - Patterns indicating retriable errors
 * @param {string[]} retryConfig.nonRetriableErrorPatterns - Patterns indicating non-retriable errors
 * @returns {Promise<Object>} Order submission result with retry metadata
 */
async function retryOrderSubmission(orderFunction, context, retryConfig = {}) {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
    retriableErrorPatterns = [],
    nonRetriableErrorPatterns = []
  } = retryConfig;
  
  let lastResult = null;
  let lastError = null;
  let attempt = 0;
  
  for (attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🔄 Retry attempt ${attempt}/${maxAttempts} for order submission`);
      
      const result = await orderFunction.main(context);
      
      if (result.success) {
        if (attempt > 1) {
          console.log(`✅ Order submission succeeded on retry attempt ${attempt}`);
        }
        return {
          ...result,
          retryAttempt: attempt,
          retrySucceeded: attempt > 1
        };
      }
      
      // Check if error is retriable
      const errorMessage = result.error || result.message || '';
      const isRetriable = isErrorRetriable(errorMessage, retriableErrorPatterns, nonRetriableErrorPatterns);
      
      console.log(`❌ Order submission failed (attempt ${attempt}/${maxAttempts}):`, {
        error: errorMessage,
        isRetriable,
        willRetry: isRetriable && attempt < maxAttempts
      });
      
      if (!isRetriable) {
        console.log(`⛔ Error is non-retriable, stopping retries`);
        return {
          ...result,
          retryAttempt: attempt,
          retriesExhausted: false,
          retryStopped: true,
          reason: 'non-retriable error'
        };
      }
      
      if (attempt === maxAttempts) {
        console.log(`🛑 Maximum retry attempts (${maxAttempts}) reached`);
        return {
          ...result,
          retryAttempt: attempt,
          retriesExhausted: true
        };
      }
      
      lastResult = result;
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
      
      console.log(`⏳ Waiting ${delay}ms before retry ${attempt + 1}...`);
      await sleep(delay);
      
    } catch (error) {
      lastError = error;
      const errorMessage = error.message || String(error);
      const isRetriable = isErrorRetriable(errorMessage, retriableErrorPatterns, nonRetriableErrorPatterns);
      
      console.error(`💥 Exception during order submission (attempt ${attempt}/${maxAttempts}):`, {
        error: errorMessage,
        isRetriable,
        willRetry: isRetriable && attempt < maxAttempts
      });
      
      if (!isRetriable) {
        console.log(`⛔ Exception indicates non-retriable error, stopping retries`);
        throw error;
      }
      
      if (attempt === maxAttempts) {
        console.log(`🛑 Maximum retry attempts (${maxAttempts}) reached, throwing error`);
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
      
      console.log(`⏳ Waiting ${delay}ms before retry ${attempt + 1}...`);
      await sleep(delay);
    }
  }
  
  // Fallback return (shouldn't reach here, but safety net)
  return lastResult || {
    success: false,
    error: lastError?.message || 'All retry attempts failed',
    retryAttempt: attempt - 1,
    retriesExhausted: true
  };
}

module.exports = {
  retryOrderSubmission,
  isErrorRetriable
};


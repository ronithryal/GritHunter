import React from 'react';

interface ErrorStateProps {
  errorType: '429' | '503' | 'search_failed' | 'invalid_url';
}

export function ErrorState({ errorType }: ErrorStateProps) {
  let message = '';
  
  switch (errorType) {
    case '429':
      message = "You've hit the search limit for this hour. Come back in a few minutes.";
      break;
    case '503':
      message = "Daily capacity reached. Try again tomorrow.";
      break;
    case 'search_failed':
      message = "Search is temporarily unavailable. Try again in a moment.";
      break;
    case 'invalid_url':
      message = "That doesn't look like a GitHub repo or profile URL. Try github.com/username or github.com/org/repo.";
      break;
  }

  return (
    <div className="w-full mt-6 p-4 rounded-lg bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-900/50">
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

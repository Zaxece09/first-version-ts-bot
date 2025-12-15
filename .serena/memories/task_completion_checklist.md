# Task Completion Checklist

## Before Marking Task Complete

### 1. Code Quality
- [ ] TypeScript types are correct (no `any` unless necessary)
- [ ] Error handling with try-catch where needed
- [ ] Added logging for critical paths (especially callbacks, IMAP, SMTP)
- [ ] Removed debug console.logs (unless needed for production debugging)

### 2. Testing
- [ ] **Manual Test Required**: Bot must be restarted to test changes
- [ ] Test the specific feature that was modified
- [ ] For conversation flows: test entire flow from start to end
- [ ] For menus: ensure all buttons respond (answerCallbackQuery called)
- [ ] For IMAP/SMTP: verify no connection crashes

### 3. Critical Checks for This Project
- [ ] **answerCallbackQuery**: Always call before editMessageText in conversation menus
- [ ] **IMAP Error Handling**: All IMAP operations (scan, drain, idle, logout) wrapped in try-catch
- [ ] **Role Checks**: Middleware checks roles for message/callbackQuery/inlineQuery
- [ ] **Background Operations**: No blocking operations in startup (use .then().catch())
- [ ] **Timeouts**: Consider adding timeouts for long-running operations

### 4. No Build/Lint/Format Commands
- This project has no configured linting or formatting tools
- TypeScript checking can be done manually: `bun tsc --noEmit`
- Runtime errors only visible when bot is running

### 5. Restart Bot
```powershell
# Stop current bot process (if running)
# Ctrl+C or kill process

# Start bot
bun run index.ts
```

### 6. Monitor Logs
- Watch console output for errors
- Check for new logs with emojis (📍, ✅, ❌)
- Verify no unhandled promise rejections
- Confirm bot responds to commands

## Common Issues to Avoid
- **Missing answerCallbackQuery**: Causes infinite loading on buttons
- **Uncaught IMAP errors**: Causes bot crash with "Connection not available"
- **Blocking startup**: Bot appears started but doesn't respond
- **Wrong role checks**: Users get "нету прав доступа" incorrectly
- **Syntax errors**: Unclosed blocks, missing parameters in setTimeout, etc.

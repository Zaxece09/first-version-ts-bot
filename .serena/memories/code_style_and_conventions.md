# Code Style and Conventions

## TypeScript Configuration
- **Target**: ESNext
- **Module**: Preserve (Bun native)
- **Strict Mode**: Enabled
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `noImplicitOverride: true`
  - `noFallthroughCasesInSwitch: true`
- **Module Resolution**: bundler
- **No Emit**: true (Bun runs TypeScript directly)

## Naming Conventions
- **Files**: camelCase (e.g., `emailAdd.ts`, `userMiddleware.ts`)
- **Classes**: PascalCase (e.g., `EmailStreamManager`)
- **Functions**: camelCase (e.g., `startAllForEveryone`)
- **Constants**: UPPER_SNAKE_CASE for env vars (e.g., `BOT_TOKEN`)
- **Database**: Snake_case for table/column names in schema

## Code Organization
- **Middleware**: `src/middlewares/` - request interceptors
- **Conversations**: `src/conversations/` - multi-step user flows
- **Commands**: `src/commands/` - slash command handlers
- **Menus**: `src/menus/` - inline keyboard definitions
- **Handlers**: `src/handlers/` - complex interaction handlers
- **DB Queries**: `src/db/queries/` - database operations by entity
- **Utils**: `src/utils/` - shared utility functions
- **Types**: `src/types/` - TypeScript type definitions

## Patterns
- **Error Handling**: Try-catch blocks with detailed logging
- **Async/Await**: Preferred over .then() chains
- **Imports**: ESM with explicit extensions allowed
- **Database**: Repository pattern in `src/db/queries/`
- **Logging**: console.log with emojis for visibility (📍, ✅, ❌, 🚀)
- **Grammy Conversations**: Use `conversation.wait()` and `conversation.waitFor()`
- **Menus**: Use `autoAnswer: false` for conversation menus, requires manual `ctx.answerCallbackQuery()`

## Comments
- Use Russian for user-facing messages
- Use English for code comments
- Add explanatory comments for complex logic
- Document critical error handling patterns

## Import Order
1. External packages (grammy, drizzle, etc.)
2. Internal modules (db, utils, types)
3. Relative imports (./menus, ../handlers)

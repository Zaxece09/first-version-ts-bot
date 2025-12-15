# Project Overview: Cris Mailer Bot

## Purpose
Telegram бот для массовых email рассылок с системой управления пользователями и админ панелью. Bot monitors IMAP email accounts, sends email replies using SMTP, and manages users through a Telegram interface.

## Tech Stack
- **Runtime**: Bun (JavaScript/TypeScript runtime)
- **Language**: TypeScript (strict mode, ESNext)
- **Bot Framework**: Grammy (Telegram bot framework)
  - @grammyjs/conversations - conversation flows
  - @grammyjs/menu - inline keyboard menus
  - @grammyjs/runner - bot runner
  - @grammyjs/auto-retry - automatic retries
  - @grammyjs/commands - command handling
  - @grammyjs/files - file handling
  - @grammyjs/hydrate - context hydration
  - @grammyjs/ratelimiter - rate limiting
- **Database**: SQLite with Drizzle ORM
- **Email**: 
  - ImapFlow - IMAP client for monitoring emails
  - Nodemailer - SMTP client for sending emails
  - mailparser - email parsing
- **AI Integration**: OpenAI SDK with DeepSeek API
- **HTTP**: Axios
- **Configuration**: dotenv with config.ini file

## Architecture
- Entry point: `index.ts` (or `src/index.ts`)
- Bot initialization in `src/bot.ts`
- Conversation flows in `src/conversations/`
- Inline menus in `src/menus/`
- Command handlers in `src/commands/`
- Callback handlers in `src/callbacks/`
- Middleware pipeline with role-based access control
- Background email monitoring via EmailStreamManager
- Database queries in `src/db/queries/`

## Key Features
- Role-based access: guest/user/admin
- Email account management (add, edit, monitor via IMAP)
- Email sending (replies with In-Reply-To header threading)
- Smart presets and templates
- Proxy support
- Admin panel for user management
- Background IMAP monitoring with auto-reconnect

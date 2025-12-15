# Suggested Commands for Development

## Running the Bot
```powershell
# Main entry point
bun run index.ts

# Alternative (if in root)
bun index.ts

# Create admin user (after bot started and user sent /start)
npx tsx create-admin.ts YOUR_TELEGRAM_ID
```

## Database Management
```powershell
# Apply database migrations
bun run drizzle-kit push

# Generate migrations
bun run drizzle-kit generate

# View database studio
bun run drizzle-kit studio
```

## Development
```powershell
# Install dependencies
bun install

# Check TypeScript types (no build, noEmit mode)
bun tsc --noEmit
```

## System Commands (Windows PowerShell)
```powershell
# List files
Get-ChildItem          # or ls
Get-ChildItem -Recurse # recursive

# Search in files
Select-String "pattern" -Path *.ts -Recurse

# Find files
Get-ChildItem -Recurse -Filter "*.ts"

# View file content
Get-Content file.txt   # or cat

# Process management
Get-Process bun
Stop-Process -Name bun
```

## Bot Commands (in Telegram)
- `/start` - Start bot
- `/admin` - Admin panel (admins only)
- `/config` - View configuration (admins only)
- `/send` - Send email campaign
- `/stop` - Stop email campaign
- `/status` - Campaign status

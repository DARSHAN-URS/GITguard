# GitGuard AI - Automated Code Reviewer

A Node.js + Express service that receives GitHub webhooks, analyzes PR diffs using AI (Groq/Llama 3), and posts automated review comments. Includes a dashboard for managing repository settings and viewing review history.

## 🎯 Features

- ✅ Secure webhook validation (HMAC SHA-256)
- ✅ Fetch PR diffs from GitHub API (Octokit)
- ✅ Clean and structure diffs (remove metadata, keep code)
- ✅ AI-powered code review (Groq/Llama 3)
- ✅ Automated GitHub PR review comments
- ✅ **Dashboard & Settings** (Week 4):
  - Toggle rules per repository (Strict Mode, Ignore Styling/Linter)
  - Review history log
  - Statistics and analytics

## 📋 Prerequisites

- Node.js >= 18.0.0
- GitHub Personal Access Token (with `repo` or `public_repo` scope)

## 🚀 Quick Start

### 1. Install & Configure

```bash
npm install
```

Create `.env` file:
```bash
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_TOKEN=your_github_token
GROQ_API_KEY=your_groq_api_key
COMMENT_BOT_ENABLED=true
PORT=3000
```

Generate webhook secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Configure GitHub Webhook

1. Repository → Settings → Webhooks → Add webhook
2. Payload URL: `https://your-domain.com/github/webhook` (use ngrok for local: `ngrok http 3000`)
3. Content type: `application/json`
4. Secret: Same as `GITHUB_WEBHOOK_SECRET`
5. Events: Select "Pull requests" only

### 3. Start Server

```bash
npm start          # Production
npm run dev        # Development (auto-reload)
```

## 📡 API Endpoints

### `POST /github/webhook`
Receives PR webhooks, fetches diffs, and returns cleaned data with LLM prompt.

**Response:**
```json
{
  "success": true,
  "data": {
    "repository": "owner/repo",
    "pullRequestNumber": 123,
    "cleanedDiff": [
      {
        "filename": "src/file.js",
        "language": "javascript",
        "changes": "// cleaned code only"
      }
    ],
    "llmPrompt": {
      "prompt": "# Code Review Request...",
      "format": "full",
      "estimatedTokens": 1500
    }
  }
}
```

### `GET /health`
Health check endpoint.

### `GET /prompt/last`
View the last generated LLM prompt.

### `GET /` (Dashboard)
Access the web dashboard for managing repository settings and viewing review history.

### `GET /api/dashboard/settings`
Get all repository settings.

### `PUT /api/dashboard/settings/:repository`
Update repository settings (strictMode, ignoreStyling, ignoreLinter, enabled).

### `GET /api/dashboard/history`
Get review history with optional filters.

### `GET /api/dashboard/statistics`
Get review statistics.

## 🔄 Processing Pipeline

1. **Webhook Validation** → Verify signature and headers
2. **Fetch PR Diff** → Get file changes from GitHub API
3. **Clean Diff** → Remove metadata, keep only code changes
4. **Generate Prompt** → Create LLM-ready prompt with cleaned diffs

## 📦 Output Format

```json
{
  "repository": "owner/repo",
  "pullRequestNumber": 123,
  "cleanedDiff": [
    {
      "filename": "path/to/file.js",
      "language": "javascript",
      "changes": "// code changes only",
      "status": "modified",
      "additions": 10,
      "deletions": 5
    }
  ],
  "llmPrompt": {
    "prompt": "# Code Review Request...",
    "estimatedTokens": 1500,
    "fileCount": 4
  }
}
```

## 🏗️ Project Structure

```
GitGuard/
├── server.js           # Express server & webhook handler
├── webhookHandler.js   # Webhook validation
├── diffFetcher.js      # GitHub API integration
├── diffCleaner.js      # Diff cleaning & structuring
├── promptGenerator.js  # LLM prompt generation
├── llmClient.js        # LLM API integration (Groq)
├── commentBot.js       # GitHub review comment posting
├── storage.js          # Repository settings & history storage
├── dashboard.js        # Dashboard API routes
├── logger.js           # Structured logging
├── public/             # Dashboard web interface
│   ├── index.html
│   ├── styles.css
│   └── dashboard.js
└── package.json
```

## 🔒 Security

- HMAC SHA-256 signature validation
- Timing-safe comparison
- Event filtering (only `pull_request` opened/reopened)
- Secret detection in diffs

## 📊 Dashboard Features (Week 4)

Access the dashboard at `http://localhost:3000` after starting the server.

**Repository Settings:**
- **Strict Mode**: More aggressive code review
- **Ignore Styling**: Skip formatting/style checks
- **Ignore Linter**: Skip linter warnings
- **Enable/Disable**: Toggle reviews per repository

**Review History:**
- View all past reviews
- Filter by repository
- See review details and timestamps

**Statistics:**
- Total reviews count
- Issues by type (Bug, Security, Performance, Quality)
- Repository statistics

## 🐛 Troubleshooting

**Webhook fails:**
- Verify `GITHUB_WEBHOOK_SECRET` matches GitHub webhook secret

**Diff fetching fails:**
- Check `GITHUB_TOKEN` is set and has correct scopes
- Ensure token has repository access

**Server won't start:**
- Node.js >= 18.0.0 required
- Port 3000 available
- Dependencies installed (`npm install`)

## 📄 License

MIT

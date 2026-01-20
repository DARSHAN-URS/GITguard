# GitGuard AI - Week 2: Diff Analyzer & Code Preparation

A secure Node.js + Express backend service that receives GitHub webhook requests, fetches Pull Request diffs, and prepares cleaned code changes for AI analysis.

## 🎯 Week 2 Objectives

- ✅ Securely receive GitHub webhook requests (Week 1)
- ✅ Validate incoming requests using webhook secret (Week 1)
- ✅ Fetch Pull Request diffs from GitHub API
- ✅ Extract and clean code changes from diffs
- ✅ Structure diffs for efficient AI analysis
- ✅ Detect programming languages
- ✅ Validate diffs for potential secrets

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- A GitHub repository with webhook access
- GitHub Personal Access Token (for fetching PR diffs)

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

**Dependencies:**
- `express` - Web framework
- `dotenv` - Environment variable management
- `@octokit/rest` - GitHub API client

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# GitHub Webhook Secret
# Generate a strong random secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
GITHUB_WEBHOOK_SECRET=your_strong_random_secret_here

# GitHub Personal Access Token (Required for Week 2)
# Create token at: https://github.com/settings/tokens
# Required scopes: repo (for private repos) or public_repo (for public repos)
GITHUB_TOKEN=your_github_personal_access_token_here

# Server Port (optional, defaults to 3000)
PORT=3000

# Node Environment (optional)
NODE_ENV=development
```

**Important:** 
- Generate a strong random secret for `GITHUB_WEBHOOK_SECRET`
- Create a GitHub Personal Access Token with appropriate scopes for `GITHUB_TOKEN`

### 3. Configure GitHub Webhook

1. Go to your GitHub repository
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Set the **Payload URL** to: `https://your-domain.com/github/webhook`
   - For local testing, use a tool like [ngrok](https://ngrok.com/): `ngrok http 3000`
4. Set **Content type** to: `application/json`
5. Set **Secret** to the same value as `GITHUB_WEBHOOK_SECRET` in your `.env` file
6. Under **Which events would you like to trigger this webhook?**, select:
   - **Let me select individual events**
   - Check **Pull requests**
7. Click **Add webhook**

### 4. Start the Server

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in `PORT`).

## 📡 API Endpoints

### `POST /github/webhook`

Receives GitHub webhook events, fetches PR diffs, and returns cleaned, structured diff data.

**Headers Required:**
- `X-GitHub-Event`: Event type (must be `pull_request`)
- `X-Hub-Signature-256`: SHA-256 HMAC signature
- `X-GitHub-Delivery`: Unique delivery ID

**Response Format (Week 2):**

Success (200 OK):
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "data": {
    "repository": "owner/repo",
    "pullRequestNumber": 123,
    "cleanedDiff": [
      {
        "filename": "src/utils/helper.js",
        "language": "javascript",
        "changes": "// Cleaned code changes only\nfunction newFunction() {\n  return true;\n}",
        "status": "modified",
        "additions": 10,
        "deletions": 5
      }
    ],
    "preparedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "GitGuard AI Webhook Listener"
}
```

## 🔒 Security Features

- **Signature Validation**: All webhook requests are validated using HMAC SHA-256
- **Header Validation**: Required headers are checked before processing
- **Event Filtering**: Only `pull_request` events with `opened` or `reopened` actions are processed
- **Timing-Safe Comparison**: Signature validation uses timing-safe comparison to prevent timing attacks
- **Secret Detection**: Basic validation to detect potential secrets in diffs

## 📊 Week 2: Diff Processing Pipeline

### 1. Fetch PR Diff
- Uses GitHub API (Octokit SDK) to fetch Pull Request files
- Retrieves raw diff patches for all changed files
- Handles single-file and multi-file PRs

### 2. Extract & Clean Diff
- Removes diff metadata (headers, line numbers, unchanged lines)
- Keeps only added/modified code
- Preserves minimal context for better understanding
- Handles binary files and large diffs

### 3. Structure for AI
- Detects programming language from file extensions
- Organizes changes by file
- Creates token-efficient output format
- Validates for potential secrets

### Processed Events
- ✅ `pull_request` with action `opened`
- ✅ `pull_request` with action `reopened`

### Ignored Events
- ❌ `push` events
- ❌ `issues` events
- ❌ `workflow` events
- ❌ `pull_request` with other actions (`closed`, `synchronize`, etc.)

## 📝 Logging

The service uses structured JSON logging for easy parsing and debugging:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "Diff processing completed",
  "repository": "owner/repo",
  "pullRequestNumber": 123,
  "filesProcessed": 3,
  "totalChangesBytes": 1024,
  "processingTimeMs": 250
}
```

## 🧪 Testing

### Using curl (for testing signature validation)

```bash
# Note: This will fail signature validation, but you can test the endpoint structure
curl -X POST http://localhost:3000/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature-256: sha256=test" \
  -H "X-GitHub-Delivery: test-delivery-id" \
  -d '{"action":"opened","pull_request":{"number":1,"title":"Test PR","user":{"login":"testuser"}},"repository":{"full_name":"test/repo"}}'
```

### Using GitHub Webhooks

The best way to test is to configure a real GitHub webhook pointing to your server (use ngrok for local development).

## 🏗️ Project Structure

```
GitGuard/
├── server.js           # Main Express server (Week 1 + Week 2 integration)
├── webhookHandler.js   # Webhook validation and PR data extraction (Week 1)
├── diffFetcher.js      # GitHub API integration for fetching PR diffs (Week 2)
├── diffCleaner.js      # Diff cleaning and structuring (Week 2)
├── logger.js          # Structured logging utility
├── package.json       # Dependencies and scripts
├── .env.example      # Environment variables template
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## 📦 Week 2 Output Format

The cleaned diff output follows this structure:

```json
{
  "repository": "owner/repo",
  "pullRequestNumber": 123,
  "cleanedDiff": [
    {
      "filename": "path/to/file.js",
      "language": "javascript",
      "changes": "// Only code changes, no metadata",
      "status": "modified",
      "additions": 10,
      "deletions": 5
    }
  ],
  "preparedAt": "2024-01-15T10:30:00.000Z"
}
```

**Features:**
- Token-efficient (removes unnecessary content)
- Language-aware (detects programming language)
- Structured (ready for AI analysis)
- Validated (checks for potential secrets)

## 🔄 Handoff to Week 3

The cleaned and structured diff data is ready for Week 3 modules that will:
- Perform AI-based code analysis
- Detect bugs, security issues, and performance problems
- Post automated review comments to GitHub

## ⚠️ Important Notes

- **No AI Analysis**: Week 2 does NOT perform any AI/LLM analysis
- **No Comments**: Week 2 does NOT post comments to GitHub
- **No Long-term Storage**: Data is only logged, not persisted
- **Diff Only**: Only fetches and cleans diffs, does not analyze code

## 🐛 Troubleshooting

### Webhook signature validation fails
- Ensure `GITHUB_WEBHOOK_SECRET` in `.env` matches the secret configured in GitHub
- Check that the raw body is being preserved correctly (Express middleware handles this)

### Diff fetching fails
- Verify `GITHUB_TOKEN` is set in `.env` file
- Check that the token has required scopes (`repo` or `public_repo`)
- Ensure the token has access to the repository
- Review server logs for detailed error messages

### Events not being processed
- Verify the webhook is configured to send `pull_request` events
- Check that the PR action is `opened` or `reopened`
- Review server logs for detailed error messages

### Server not starting
- Ensure Node.js >= 18.0.0 is installed
- Check that port 3000 (or your configured port) is available
- Verify all dependencies are installed (`npm install`)
- Check for ES module compatibility issues (Octokit uses dynamic imports)

### Empty or missing diffs
- Verify the PR has actual code changes
- Check that files are not binary or too large (GitHub may not provide patches)
- Review logs for API rate limiting or permission issues

## 📄 License

MIT

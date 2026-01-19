# GitGuard AI - Week 1: Webhook Listener

A secure Node.js + Express backend service that receives and validates GitHub webhook requests for Pull Request events.

## 🎯 Week 1 Objectives

- ✅ Securely receive GitHub webhook requests
- ✅ Listen specifically to Pull Request events
- ✅ Validate incoming requests using webhook secret
- ✅ Extract and log essential Pull Request metadata
- ✅ Ignore unrelated GitHub events

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- A GitHub repository with webhook access

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your GitHub webhook secret:

```
GITHUB_WEBHOOK_SECRET=your_strong_random_secret_here
```

**Important:** Generate a strong random secret. You can use:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

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

Receives GitHub webhook events and processes Pull Request events.

**Headers Required:**
- `X-GitHub-Event`: Event type (must be `pull_request`)
- `X-Hub-Signature-256`: SHA-256 HMAC signature
- `X-GitHub-Delivery`: Unique delivery ID

**Response Format:**

Success (200 OK):
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "data": {
    "repository": "owner/repo",
    "pullRequestNumber": 123,
    "title": "Fix bug in authentication",
    "author": "username",
    "action": "opened",
    "receivedAt": "2024-01-15T10:30:00.000Z"
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

## 📊 Event Processing

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
  "message": "Pull request event processed successfully",
  "repository": "owner/repo",
  "pullRequestNumber": 123,
  "title": "Fix bug",
  "author": "username",
  "action": "opened",
  "receivedAt": "2024-01-15T10:30:00.000Z",
  "deliveryId": "abc-123-def",
  "processingTimeMs": 5
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
├── server.js           # Main Express server
├── webhookHandler.js   # Webhook validation and PR data extraction
├── logger.js          # Structured logging utility
├── package.json       # Dependencies and scripts
├── .env.example      # Environment variables template
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## 🔄 Handoff to Week 2

The extracted Pull Request data follows this format:

```json
{
  "repository": "owner/repo",
  "pullRequestNumber": 123,
  "title": "PR Title",
  "author": "username",
  "action": "opened",
  "receivedAt": "2024-01-15T10:30:00.000Z"
}
```

This structured data is ready for Week 2 modules that will:
- Fetch Pull Request diffs
- Perform AI-based code analysis
- Post automated review comments

## ⚠️ Important Notes

- **No AI Analysis**: Week 1 does NOT perform any AI/LLM analysis
- **No Diff Fetching**: Week 1 does NOT fetch code diffs
- **No Comments**: Week 1 does NOT post comments to GitHub
- **No Long-term Storage**: Data is only logged, not persisted

## 🐛 Troubleshooting

### Webhook signature validation fails
- Ensure `GITHUB_WEBHOOK_SECRET` in `.env` matches the secret configured in GitHub
- Check that the raw body is being preserved correctly (Express middleware handles this)

### Events not being processed
- Verify the webhook is configured to send `pull_request` events
- Check that the PR action is `opened` or `reopened`
- Review server logs for detailed error messages

### Server not starting
- Ensure Node.js >= 18.0.0 is installed
- Check that port 3000 (or your configured port) is available
- Verify all dependencies are installed (`npm install`)

## 📄 License

MIT


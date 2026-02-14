# 🛡️ GitGuard AI Elite

**Enterprise-Grade Automated GitHub Code Review & Security Guardrail**

GitGuard AI Elite is a production-ready, scalable MERN-stack platform that automates pull request reviews using advanced LLMs (Llama 3 via Groq). It features a background job processing architecture, GitHub App integration, automated policy enforcement, and deep repository analytics.

---

## 🚀 Key Features

### 1. Elite Intelligence & Review
- **LLM-Powered Analysis**: Strict structured JSON reviews via Groq (Llama 3).
- **Deterministic Risk Scoring**: Score PRs (0-100) based on weighted issue categories (Security, Bug, Performance, Quality).
- **Inline GitHub Comments**: Posts actionable feedback directly to the code lines in the PR.
- **Diff Sanitization**: Advanced cleaning of raw diffs to optimize token usage and context relevance.

### 2. Enterprise Scalability
- **BullMQ Background Processing**: Decoupled webhook handling and review processing using Redis and BullMQ.
- **GitHub App Integration**: Secure, multitenant authentication using Installation Access Tokens and JWT signing.
- **Incremental Layered Architecture**: Clean separation of Controllers, Services, Models, and Workers.

### 3. Policy & Governance (NEW)
- **Policy Engine**: Define rules to automatically **BLOCK** PRs (using `REQUEST_CHANGES`) if they exceed risk thresholds.
- **Security Guardrails**: Automated blocking of PRs containing high-severity security vulnerabilities.
- **Compliant Development**: Enforce issue count limits per PR.

### 4. RBAC & Security
- **Role-Based Access Control**:
  - `Admin`: Full control over settings and blocking policies.
  - `Developer`: Dashboard access and manual review triggers.
  - `Viewer`: Read-only access to reviews and analytics.
- **Production Hardened**: Rate limiting, Helmet security headers, and centralized error handling.

### 5. Analytics & Dashboard
- **Risk Trends**: Aggregated monthly risk score and PR volume trends via Mongo Aggregation.
- **Issue Distribution**: Breakdown of issue categories (Security, Performance, etc.) over time.
- **Management UI**: React-based dashboard for policy configuration and review history.

---

## 🏗️ Architecture

```text
├── controllers/      # Webhook handling and API endpoints
├── services/         # Business logic (GitHub App, LLM, Review, Analytics)
├── models/           # MongoDB schemas (Repository, Review, Issue, Policy, User)
├── workers/          # BullMQ background job processors
├── queues/           # BullMQ queue configurations
├── utils/            # Shared utilities (Logger, DB, Diff Cleaners)
└── server.js         # Entry point (Middleware & Routing)
```

---

## 📋 Prerequisites

- **Node.js**: >= 18.0.0
- **MongoDB**: Active connection (Atlas or Local)
- **Redis**: For BullMQ queue management
- **GitHub App**: Created and installed on repositories
- **Groq API Key**: For Llama 3 analysis

---

## 🛠️ Setup & Installation

### 1. Environment Configuration
Create a `.env` file in the root:

```bash
# General
PORT=3000
MONGODB_URI=mongodb://localhost:27017/gitguard
REDIS_URL=redis://127.0.0.1:6379

# GitHub App Configuration
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_secret

# AI Configuration
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.1-8b-instant

# Auth (Mocked for Elite Demo)
# X-USER-ROLE: admin | developer | viewer
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start the Platform
```bash
# In production
npm start

# In development (Worker + Server)
npm run dev
```

---

## 📡 API Endpoints

### GitHub Integration
- `POST /github/webhook`: Ingests PR events and enqueues jobs.

### Dashboard & Analytics
- `GET /api/analytics/risk-trend`: Monthly risk and PR volume breakdown.
- `GET /api/dashboard/settings`: Retrieve managed repository list.
- `GET /api/dashboard/review/:id`: Fetch detailed review and issue list.

### Policy Engine
- `GET /api/policies/:repoId`: Get repository-specific enforcement rules.
- `PUT /api/policies/:repoId`: Update blocking thresholds (Admin only).

---

## 🔒 Security
- **HMAC Signatures**: Every GitHub payload is verified.
- **Dynamic Token Rotation**: No static tokens used; GitHub App installation tokens are refreshed on-demand.
- **RBAC Enforcement**: Middleware validates user roles before processing administrative requests.

---

## 📄 License
MIT © GitGuard AI Team

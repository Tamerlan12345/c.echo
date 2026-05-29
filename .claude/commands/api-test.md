# API Test

Test Centras Echo API endpoints end-to-end.

You are running an API diagnostic for the Centras Echo backend (Fastify on port 3001).
The project is at `d:\Проекты\c.echo`. The API runs at `http://localhost:3001`.

## What to do

Run the following checks IN ORDER and report results clearly:

### 1. Health check
```
GET http://localhost:3001/health
```
Expected: `{ "status": "ok" }` with HTTP 200.

### 2. Auth — guest login
```
POST http://localhost:3001/api/auth/guest
Body: { "name": "Test User" }
```
Save the `accessToken` and `refreshToken` from the response.

### 3. Token refresh
```
POST http://localhost:3001/api/auth/refresh
Body: { "refreshToken": "<from step 2>" }
```
Expected: new `accessToken` returned.

### 4. Get current user
```
GET http://localhost:3001/api/auth/me
Authorization: Bearer <accessToken from step 2>
```
Expected: user object with id, email, name.

### 5. List meetings
```
GET http://localhost:3001/api/meetings
Authorization: Bearer <accessToken>
```
Expected: `{ data: [] }` or array of meetings.

### 6. Create meeting
```
POST http://localhost:3001/api/meetings
Authorization: Bearer <accessToken>
Body: { "title": "API Test Meeting", "isPublic": true }
```
Save the meeting `id`.

### 7. Get LiveKit token
```
POST http://localhost:3001/api/livekit/token
Authorization: Bearer <accessToken>
Body: { "meetingId": "<id from step 6>" }
```
Expected: `{ data: { token: "...", serverUrl: "wss://..." } }`

### 8. End meeting (cleanup)
```
POST http://localhost:3001/api/meetings/<id>/end
Authorization: Bearer <accessToken>
```

### 9. Logout
```
POST http://localhost:3001/api/auth/logout
Authorization: Bearer <accessToken>
```

## Execution

Use `Bash` with `curl` or PowerShell `Invoke-WebRequest` to run each step.
If a step fails, show the HTTP status code and response body, then continue to the next step.

After all steps, print a summary table:
| Step | Endpoint | Status | Result |
|------|----------|--------|--------|

Flag any failures with the likely cause and fix suggestion.

**Arguments:** $ARGUMENTS
If arguments contain a URL (e.g. `https://api.example.com`), use that as the base URL instead of `http://localhost:3001`.

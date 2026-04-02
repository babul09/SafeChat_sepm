# Chat Message Reporting Feature

## Overview

The SafeChat application now includes a comprehensive **message reporting system** that allows users to flag inappropriate chat messages for moderation review. This feature integrates seamlessly with the existing toxicity detection and provides admins with tools to review and manage reports.

---

## Features Implemented

### 1. **User-Facing Report UI** (Frontend)
- **Report Button**: Appears on hover over received messages (marked with a flag icon)
- **Report Dialog Modal**: Allows users to:
  - Select a report reason (spam, harassment, hate speech, scam, other)
  - Add optional context/description
  - Submit report with confirmation feedback
- **Non-intrusive**: Report button hidden until user hovers over a message
- **No Self-Reports**: Users cannot report their own messages

### 2. **Backend Reporting API** (FastAPI)
#### Endpoints:
- **`POST /report_message`** — Submit a new message report
  - Request body: `reporter_username`, `message_id`, `reason`, `description` (optional)
  - Returns: Full report details including ID, status, timestamps
  - Validation: Prevents duplicate reports (same message from same reporter)

- **`GET /message_reports/pending`** — List all pending reports (for admin/moderation)
  - Returns: Array of pending reports with full context (reporter, reported user, message text)
  - Ordered by most recent first
  - Useful for moderation dashboards

- **`POST /message_reports/{report_id}/resolve`** — Mark report as resolved
  - Request body: `reviewed_by_username` (optional - admin who reviewed it)
  - Updates status to `resolved` with timestamp

- **`POST /message_reports/{report_id}/dismiss`** — Mark report as dismissed
  - Request body: `reviewed_by_username` (optional)
  - Updates status to `dismissed` with timestamp

### 3. **Database Schema**
#### `message_reports` Table:
```sql
CREATE TABLE message_reports (
  id SERIAL PRIMARY KEY,
  message_id INT NOT NULL REFERENCES chat_messages(id),
  reporter_id INT NOT NULL REFERENCES users(id),
  reported_user_id INT NOT NULL REFERENCES users(id),
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending' 
    CHECK (status IN ('pending', 'resolved', 'dismissed')),
  reviewed_by INT NULL REFERENCES users(id),
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (message_id, reporter_id)
);
```

#### Indexes:
- `idx_message_reports_reporter` — Fast lookup by reporter
- `idx_message_reports_reported` — Fast lookup by reported user
- `idx_message_reports_status` — Fast filtering by report status

#### Admin View:
```sql
CREATE VIEW v_pending_reports AS
SELECT all pending reports with:
  - Report ID, message ID
  - Reporter username, reported user username
  - Message text, reason, description
  - Created timestamp
```

---

## How It Works

### For Users:
1. **Browse chat** with another user
2. **Hover over a received message** (not their own)
3. **Red "Report" button appears** in top-right corner
4. **Click to open report dialog**
5. **Select reason** from dropdown
6. **Optionally add details** explaining the issue
7. **Click "Submit report"** to send
8. **Confirmation notification** appears

### For Admins:
1. **Query `/message_reports/pending`** to see all pending reports
2. **Review each report** (message content, reason, reporter notes)
3. **Call `/message_reports/{id}/resolve`** to mark as resolved (action taken)
4. **Call `/message_reports/{id}/dismiss`** to mark as false positive
5. **Optional**: Use `reviewed_by_username` to track who reviewed each report

---

## Report Reasons

Users can select from these predefined reasons:
- `spam` — Unsolicited or repetitive messages
- `harassment` — Bullying or personal attacks
- `hate` — Hate speech or slurs
- `scam` — Fraud or deceptive content
- `other` — Custom reason (with description field)

---

## API Examples

### Submit a Report:
```bash
curl -X POST http://localhost:8000/report_message \
  -H "Content-Type: application/json" \
  -d '{
    "reporter_username": "alice",
    "message_id": 42,
    "reason": "spam",
    "description": "This user has been spamming the same link repeatedly"
  }'
```

### Get Pending Reports:
```bash
curl http://localhost:8000/message_reports/pending
```

### Resolve a Report:
```bash
curl -X POST http://localhost:8000/message_reports/123/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "reviewed_by_username": "moderator_admin"
  }'
```

---

## File Changes

### Backend (`backend-ml/`)
1. **app.py**
   - Added Pydantic models: `MessageReportCreate`, `MessageReportItem`, `ReportActionResponse`, `ReportReviewPayload`
   - Added helper functions: `get_chat_message_by_id()`, `get_message_report_item()`
   - Added 4 new API endpoints (POST /report_message, GET /message_reports/pending, POST resolve, POST dismiss)
   - Created `message_reports` table in `create_tables()` function

2. **supabase_schema.sql**
   - Added `message_reports` table definition
   - Added 3 indexes and `v_pending_reports` view for Supabase compatibility

3. **message_reports.sql** (optional)
   - Standalone SQL file with full table, indexes, and view
   - Can be applied to local PostgreSQL or Supabase manually

### Frontend (`safechat-react/src/`)
1. **ChatPanel.jsx**
   - Imported `FlagIcon` from Heroicons
   - Added `reportMessage()` API client function
   - Added state for report dialog: `reportTarget`, `reportReason`, `reportDescription`, `isSubmittingReport`
   - Added UI functions: `openReportDialog()`, `closeReportDialog()`, `submitReport()`
   - Added "Report" button on message hover (only for received messages)
   - Added report modal form with dropdown and textarea
   - Wrapped main component in `<>` fragment to render both modal overlay and chat

---

## Task Completion Summary

✅ Backend reporting routes implemented  
✅ Frontend report UI with modal dialog  
✅ Database schema with unique constraint on (message_id, reporter_id)  
✅ Admin endpoints for reviewing reports  
✅ Duplicate report prevention  
✅ Python syntax validation passed  

---

## Next Steps (Optional Enhancements)

1. **Notification System**: Alert admins when new reports arrive
2. **Auto-Blocking**: Automatically block messages from flagged users
3. **Moderation Dashboard**: Full UI for admins to review/resolve reports
4. **Report Analytics**: Track report patterns by user or reason
5. **Appeal System**: Allow users to appeal dismissed reports
6. **Bulk Actions**: Mark multiple reports resolved in one action
7. **Email Notifications**: Notify users when their report is resolved

---

## Testing Recommendations

1. **Test submit report**: Report a message, verify it appears in `/message_reports/pending`
2. **Test duplicate prevention**: Try reporting same message twice, should fail on second
3. **Test self-report block**: Try reporting your own message, should fail
4. **Test admin endpoints**: Resolve/dismiss reports, verify status changes
5. **Test UI**: Hover over messages, click report button, submit form

---

## Integration with Existing Features

- **Toxicity Detection**: Reports complement automatic toxicity filtering (blocked messages still logged)
- **User Profiles**: `reported_user_id` and `reporter_id` link to existing user system
- **Chat System**: Integrates seamlessly with existing `chat_messages` table
- **Moderation**: Works alongside existing post/comment approval workflow

---

## Security Considerations

- ✅ **Parameterized SQL**: All queries use `%s` placeholders to prevent injection
- ✅ **Unique Constraint**: Prevents users from report-spamming the same message
- ✅ **Soft Deletes**: Reports stored indefinitely for audit trail
- ✅ **Reviewer Tracking**: `reviewed_by` field tracks which admin handled each report
- ⚠️ **Admin Access**: Currently no role-based access control on admin endpoints (TODO: add `/message_reports/pending` auth check)

---

## Database Migration

### For Existing Databases:
Run the SQL from `message_reports.sql` or `supabase_schema.sql` to add the table:

```sql
-- Option 1: Local PostgreSQL
psql -U postgres -d safechat < backend-ml/message_reports.sql

-- Option 2: Supabase Dashboard
-- Copy/paste content from supabase_schema.sql into SQL Editor
```

### For New Installations:
The `create_tables()` function in `app.py` automatically creates the table on first startup.

---

## Monitoring & Maintenance

1. **Query pending reports regularly**: Track backlog of new reports
2. **Archive old reports**: Consider moving resolved/dismissed reports to archive table after 90 days
3. **Monitor abuse**: Look for patterns (same reporter, same reason, same user)
4. **Metrics**: Count reports per user, per day, by reason type

---


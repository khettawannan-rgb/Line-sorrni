# Smart Procurement Module – Technical Notes

## Feature Overview
- Auto-reorder suggestions when stock levels fall below configured thresholds.
- Purchase Requisition (PR) and Purchase Order (PO) workflow with PDF generation and email delivery.
- Vendor management UI and procurement configuration pages in the admin portal.
- Background jobs to refresh stock snapshots and raise automated PRs.
- LINE OA command handlers for stock checks and PO status lookup.

## New File Structure (relative to `project-root/`)
```
src/models/
  PurchaseRequisition.js
  PurchaseOrder.js
  Vendor.js
  StockItem.js
  StockSnapshot.js
  ProcurementAuditLog.js

src/routes/
  procurement.js

src/services/procurement/
  automationService.js
  constants.js
  emailService.js
  helpers.js
  index.js
  notificationService.js
  pdfService.js
  prService.js
  poService.js
  stockService.js
  storageService.js
  vendorService.js

src/views/procurement/
  pr_list.ejs
  po_list.ejs
  vendor_list.ejs
  settings.ejs

src/views/pdf/
  po-template.ejs

src/data/
  mock_line_po_status.json

public/css/main.css (dialog/table styling additions)
public/js/main.js (dialog handlers + dynamic rows)
```

## Key Environment Variables
```
# Required for automation/webhook
DEFAULT_COMPANY_ID=<Mongo ObjectId>
PORTAL_BASE_URL=https://your.portal.host
PROCUREMENT_SAFETY_DAYS=3
ENABLE_PROCUREMENT_AUTOMATION=true
PROCUREMENT_NOTIFY_LINE_IDS=Uxxxxxxxxx,Uyyyyyyyy

# Email delivery
PROCUREMENT_EMAIL_HOST=smtp.gmail.com
PROCUREMENT_EMAIL_PORT=587
PROCUREMENT_EMAIL_SECURE=false
PROCUREMENT_EMAIL_USER=bot@example.com
PROCUREMENT_EMAIL_PASS=app-password
PROCUREMENT_EMAIL_FROM="NILA Procurement" <bot@example.com>

# Optional tuning
AUTO_PR_LOOKBACK_DAYS=2
AUTO_PR_SAFETY_MULTIPLIER=1.2
```

## Workflow Highlights
1. **Stock Monitor** (`runAutoReorder`) scans `StockItem` documents every 30 minutes and creates auto-generated PRs when inventory dips below reorder points.
2. **PR Board** (`/admin/pr`) lists requisitions, low stock alerts, and a dialog to create new PRs with attachments.
3. **PO Creation** automatically triggers:
   - PDF generation via Puppeteer using `views/pdf/po-template.ejs`.
   - Email delivery through Nodemailer (stream transport fallback in dev).
   - LINE OA notifications to subscribed procurement members.
4. **PO Status Updates** in `/admin/po` continue to notify LINE recipients with tracking information and PDF links.
5. **Vendor Directory** provides CRUD management; seeded sample vendors are created automatically on first visit if the collection is empty.

## LINE OA Commands (webhook)
- `เช็คของ` → Lists low-stock items with forecasted depletion time.
- `เปิดใบขอซื้อ` → Returns the admin PR URL for quick access.
- `เช็คสถานะใบสั่งซื้อ` or `เช็คสถานะใบสั่งซื้อ PO-XXXX` → Shows latest PO statuses or details for a specific PO, including tracking and PDF link when available.

Sample webhook payload for PO status lookup: `src/data/mock_line_po_status.json`.

## Background Jobs
- Existing daily summary cron remains untouched.
- New schedules (configured in `src/jobs/scheduler.js`):
  - `*/30 * * * *` → Auto PR generation for `DEFAULT_COMPANY_ID`.
  - `15 6 * * *` → Nightly stock snapshot persistence for historical analysis.

## PDF Generation
- Implemented via Puppeteer. PDFs stored in `storage/po/` and served through `/storage/po/:filename`.
- Template supports optional QR code injection (`options.qrCode`) for future extensions.

## Testing & Validation
1. `npm install` (new dependencies: `puppeteer`, `nodemailer`).
2. Ensure `.env` includes the procurement variables above. Without SMTP credentials, emails will be buffered and logged to stdout.
3. Start app (`npm run dev`) and visit:
   - `/admin/pr` → confirm low-stock cards, PR creation modal, draft submission flow.
   - `/admin/po` → create PO; verify PDF saved under `storage/po/` and email info printed in console.
   - `/admin/vendors` & `/admin/settings/procurement` for configuration pages.
4. Trigger LINE webhook commands (use `src/data/mock_line_po_status.json` with the webhook endpoint) to confirm responses.

## Follow-up Ideas
- Implement multi-item batch PR creation in the UI.
- Persist procurement notification recipients in MongoDB (instead of env).
- Add audit trail viewer page and richer filtering for PR/PO listings.
- Integrate real mail provider secrets via secrets manager.
- Generate QR codes for PO PDFs referencing a public status endpoint.

/**
 * One-off: turn old Feedback documents of type "complaint" into complaint tickets.
 *
 * Dry-run by default (prints what it would create). Safe to re-run: already-imported
 * feedback is skipped via legacyFeedbackId.
 * Run:   npx ts-node -r tsconfig-paths/register scripts/import-feedback-complaints.ts
 * Apply: npx ts-node -r tsconfig-paths/register scripts/import-feedback-complaints.ts --apply
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const APPLY = process.argv.includes('--apply');
const loose = (name: string) => mongoose.model(name, new mongoose.Schema({}, { strict: false, timestamps: true }));

const STATUS_MAP: Record<string, string> = { pending: 'new', acknowledged: 'investigating', resolved: 'resolved', closed: 'closed' };

// Cheap keyword guess so old complaints land in a useful category instead of all "other".
function guessCategory(text: string): string {
  const t = text.toLowerCase();
  if (/leak|damag|broken|spill|crush/.test(t)) return 'damaged';
  if (/wrong|different/.test(t)) return 'wrong_item';
  if (/missing|not received|short/.test(t)) return 'missing_item';
  if (/expir|stale|quality|taste|smell|rancid|fungus/.test(t)) return 'quality';
  if (/late|delay|not delivered/.test(t)) return 'late_delivery';
  if (/rude|behav/.test(t)) return 'delivery_behaviour';
  if (/refund|charged|payment/.test(t)) return 'payment';
  return 'other';
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);

  const Feedback = loose('Feedback');
  const Complaint = loose('Complaint');
  const Order = loose('Order');

  const feedbacks: any[] = await Feedback.find({ type: 'complaint' }).sort({ createdAt: 1 }).lean();
  const done = new Set((await Complaint.find({ legacyFeedbackId: { $ne: null } }).select('legacyFeedbackId').lean()).map((c: any) => String(c.legacyFeedbackId)));
  const year = new Date().getFullYear();
  let seq = await Complaint.countDocuments({ ticketNo: new RegExp(`^CMP-${year}-`) });

  let created = 0, skipped = 0;
  for (const f of feedbacks) {
    if (done.has(String(f._id)) || !f.user) { skipped++; continue; }
    const order: any = f.order ? await Order.findById(f.order).select('orderNumber').lean() : null;
    const status = STATUS_MAP[f.status] ?? 'new';
    const closedOut = status === 'resolved' || status === 'closed';
    const now = Date.now();
    const events: any[] = [{ kind: 'customer', text: f.message, byName: f.reviewerName || 'Customer', at: f.createdAt }];
    if (f.adminResponse) events.push({ kind: 'reply', text: f.adminResponse, byName: f.respondedBy || 'Admin', at: f.respondedAt || f.createdAt });
    events.push({ kind: 'status', text: 'Imported from old feedback', byName: 'System', at: new Date() });

    seq++;
    const doc = {
      ticketNo: `CMP-${year}-${String(seq).padStart(4, '0')}`,
      customerId: f.user,
      orderId: f.order ?? null,
      orderNumber: order?.orderNumber ?? '',
      category: guessCategory(f.message ?? ''),
      severity: 'medium',
      status,
      source: 'website',
      description: f.message ?? '',
      media: [...(f.images ?? []), ...(f.videos ?? [])],
      assignedTo: null,
      assignedToName: '',
      // Open imports get fresh deadlines so the whole backlog doesn't show as overdue on day one.
      firstResponseDueAt: closedOut ? f.createdAt : new Date(now + 24 * 3_600_000),
      resolutionDueAt: closedOut ? f.createdAt : new Date(now + 72 * 3_600_000),
      firstRespondedAt: f.respondedAt ?? null,
      resolvedAt: closedOut ? (f.respondedAt ?? f.updatedAt ?? null) : null,
      reassignedOnBreach: true,
      resolution: null,
      rootCause: '',
      csat: null,
      events,
      legacyFeedbackId: f._id,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    };
    console.log(`${APPLY ? 'create' : 'would create'} ${doc.ticketNo}  [${doc.category}/${doc.status}]  ${(f.message ?? '').slice(0, 60)}`);
    if (APPLY) await Complaint.collection.insertOne(doc);
    created++;
  }

  console.log(`\n${feedbacks.length} complaint feedbacks found: ${created} ${APPLY ? 'imported' : 'to import'}, ${skipped} skipped (already imported or no customer).`);
  if (!APPLY) console.log('Dry run. Re-run with --apply to write.');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

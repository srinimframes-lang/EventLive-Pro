import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const BOOKING_STATUSES = ['pending', 'approved', 'rejected'];

/**
 * A booking request created by a customer. It captures the desired event
 * details, the chosen package, and the uploaded payment proof. The Super Admin
 * verifies the payment and approves it — only then is the live Event created.
 */
const bookingSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Chosen package (snapshot name/price so historic bookings stay accurate).
    package: { type: Schema.Types.ObjectId, ref: 'Package' },
    packageName: { type: String, default: '', trim: true },
    amount: { type: Number, default: 0, min: 0 },

    // Desired event details (used to create the Event on approval).
    eventTitle: { type: String, default: '', trim: true },
    brideName: { type: String, default: '', trim: true },
    groomName: { type: String, default: '', trim: true },
    eventDate: { type: Date },
    venue: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },

    // Payment proof.
    paymentMethod: { type: String, default: '', trim: true }, // gpay / phonepe / paytm / upi / bank
    paymentReference: { type: String, default: '', trim: true },
    paymentScreenshot: { type: String, default: '' },

    status: { type: String, enum: BOOKING_STATUSES, default: 'pending', index: true },
    adminNote: { type: String, default: '', trim: true },

    // Linked event, created when the booking is approved.
    event: { type: Schema.Types.ObjectId, ref: 'Event', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Booking = model('Booking', bookingSchema);

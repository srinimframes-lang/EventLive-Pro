import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const chatMessageSchema = new Schema(
  {
    event: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Message is too long'],
    },
  },
  { timestamps: true }
);

// Hot path: recent chat history sorted by createdAt within an event.
chatMessageSchema.index({ event: 1, createdAt: -1 });

chatMessageSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const ChatMessage = model('ChatMessage', chatMessageSchema);

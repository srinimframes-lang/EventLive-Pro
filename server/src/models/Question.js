import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const questionSchema = new Schema(
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
      maxlength: [500, 'Question is too long'],
    },
    upvotes: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Tracks who upvoted (user id or anonymous client id) to prevent duplicates.
    upvoters: {
      type: [String],
      default: [],
    },
    isAnswered: {
      type: Boolean,
      default: false,
    },
    answer: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    answeredAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

questionSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.upvoters;
    delete ret.__v;
    return ret;
  },
});

export const Question = model('Question', questionSchema);

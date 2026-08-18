import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const STATE_TTL_MS = 10 * 60 * 1000;

const youtubeOauthStateSchema = new Schema(
  {
    state: { type: String, required: true, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    returnTo: { type: String, default: '/dashboard', trim: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

youtubeOauthStateSchema.statics.ttlMs = STATE_TTL_MS;

export { STATE_TTL_MS };
export const YoutubeOauthState = model('YoutubeOauthState', youtubeOauthStateSchema);

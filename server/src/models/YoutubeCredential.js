import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const youtubeCredentialSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    googleAccountId: { type: String, trim: true, default: '', index: true },
    channelId: { type: String, trim: true, default: '' },
    channelTitle: { type: String, trim: true, default: '' },
    accessTokenEnc: { type: String, default: '', select: false },
    refreshTokenEnc: { type: String, default: '', select: false },
    accessTokenExpiresAt: { type: Date, default: null },
    scopes: { type: [String], default: [] },
    connected: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

youtubeCredentialSchema.index({ user: 1, connected: 1 });

function stripSecrets(_doc, ret) {
  delete ret.accessTokenEnc;
  delete ret.refreshTokenEnc;
  delete ret.__v;
  return ret;
}

youtubeCredentialSchema.set('toJSON', {
  virtuals: true,
  transform: stripSecrets,
});

youtubeCredentialSchema.set('toObject', {
  virtuals: true,
  transform: stripSecrets,
});

youtubeCredentialSchema.methods.publicStatus = function publicStatus() {
  return {
    connected: Boolean(this.connected && (this.channelId || this.refreshTokenEnc || this.channelTitle)),
    channelId: this.connected ? this.channelId || '' : '',
    channelTitle: this.connected ? this.channelTitle || '' : '',
  };
};

export const YoutubeCredential = model('YoutubeCredential', youtubeCredentialSchema);

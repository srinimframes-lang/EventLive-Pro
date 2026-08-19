import dns from 'dns';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: 'server/.env' });

// Use public resolvers so Atlas SRV/TXT lookups do not depend on the local stub.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error('MONGODB_URI is missing');
}

await mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 15000,
});

const { User } = await import('./server/src/models/User.js');

const email = 'balajiliveservice@gmail.com';

const before = await User.findOne({ email }).select('name email role approved isActive');
if (!before) {
  console.log(JSON.stringify({ found: false, email }, null, 2));
  await mongoose.disconnect();
  process.exit(2);
}

await User.updateOne(
  { email },
  {
    $set: {
      role: 'admin',
      approved: true,
      isActive: true,
    },
  }
);

const after = await User.findOne({ email }).select('name email role approved isActive');
console.log(
  JSON.stringify(
    {
      found: true,
      before,
      after,
    },
    null,
    2
  )
);

await mongoose.disconnect();

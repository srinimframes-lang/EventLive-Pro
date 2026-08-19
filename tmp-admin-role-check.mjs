import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: 'server/.env' });

const raw = process.env.MONGODB_URI || '';
const parsed = new URL(raw.replace(/^mongodb\+srv:/, 'http:'));
const username = encodeURIComponent(decodeURIComponent(parsed.username));
const password = encodeURIComponent(decodeURIComponent(parsed.password));
const directUri =
  `mongodb://${username}:${password}` +
  '@ac-viarcc6-shard-00-00.kms9wdh.mongodb.net:27017' +
  ',ac-viarcc6-shard-00-01.kms9wdh.mongodb.net:27017' +
  ',ac-viarcc6-shard-00-02.kms9wdh.mongodb.net:27017/' +
  '?ssl=true&replicaSet=atlas-v73jmk-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

await mongoose.connect(directUri);

const { User } = await import('./server/src/models/User.js');

const email = 'balajiliveservice@gmail.com';
const user = await User.findOne({ email }).select('name email role approved isActive createdAt updatedAt');

console.log(JSON.stringify(user, null, 2) || 'null');

await mongoose.disconnect();

import mongoose from 'mongoose';
import { env } from '../config/env.js';

export async function connectToDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  console.log(`[db] connected to MongoDB (${env.appEnv})`);
}

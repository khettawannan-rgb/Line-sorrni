// src/db.js
import mongoose from 'mongoose';

export async function initDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[DB] MONGODB_URI is empty -> skip DB connection');
    return false;
  }
  try {
    mongoose.set('strictQuery', false);
    // กันไม่ให้คำสั่ง query ถูก buffer ไว้ ถ้ายังต่อไม่ได้
    mongoose.set('bufferCommands', false);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000, // เร็วหน่อย จะได้รู้ไวว่าต่อไม่ได้
    });
    console.log('Mongo connected');
    return true;
  } catch (err) {
    console.error('[DB] connect failed:', err.message);
    // ไม่ throw เพื่อไม่ให้แอปล้ม -> แอพยังรันต่อได้ในโหมดไม่มี DB
    return false;
  }
}

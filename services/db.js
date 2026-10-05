/* ============================================================
   LAMBALL VFC — MONGODB ATLAS DATABASE CLIENT (services/db.js)
   Connection pooling and client management for Express and Vercel.
   ============================================================ */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://andreagustan:p%40ssw0rd@cluster0.rws3uxo.mongodb.net/proclub_stats?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'proclub_stats';

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10
    });

    await client.connect();
    const db = client.db(DB_NAME);

    try {
      await db.collection('clubs').createIndex({ slug: 1 }, { unique: true });
    } catch (e) {
      // index might already exist
    }

    cachedClient = client;
    cachedDb = db;
    console.log('✅ MongoDB Atlas connected successfully to database:', DB_NAME);
    return { client, db };
  } catch (err) {
    console.error('❌ MongoDB Atlas connection error:', err.message);
    throw err;
  }
}

export async function getDb() {
  const { db } = await connectToDatabase();
  return db;
}

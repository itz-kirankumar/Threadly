import Database from 'better-sqlite3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import path from 'path';
import fs from 'fs';

// Environment variable toggle
const USE_AWS = process.env.USE_AWS === 'true';

// === SQLite Setup ===
let db: Database.Database | null = null;

if (!USE_AWS) {
  const dbPath = path.resolve(process.cwd(), 'wisentry.db');
  db = new Database(dbPath);
  
  // Initialize tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullName TEXT NOT NULL,
      startupName TEXT NOT NULL,
      industry TEXT NOT NULL,
      url TEXT,
      challenge1 TEXT,
      challenge2 TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS community (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// === AWS DynamoDB Setup ===
let ddbDocClient: DynamoDBDocumentClient | null = null;

if (USE_AWS) {
  const client = new DynamoDBClient({
    region: process.env.APP_AWS_REGION || 'eu-north-1',
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY || '',
    }
  });
  ddbDocClient = DynamoDBDocumentClient.from(client);
}

// === DB Interface ===
export async function insertWaitlist(data: {
  fullName: string;
  startupName: string;
  industry: string;
  url?: string;
  challenge1: string;
  challenge2?: string;
}) {
  if (USE_AWS && ddbDocClient) {
    await ddbDocClient.send(new PutCommand({
      TableName: 'Wisentry_Waitlist',
      Item: {
        id: Date.now().toString(),
        ...data,
        createdAt: new Date().toISOString()
      }
    }));
  } else if (db) {
    const stmt = db.prepare(`
      INSERT INTO waitlist (fullName, startupName, industry, url, challenge1, challenge2)
      VALUES (@fullName, @startupName, @industry, @url, @challenge1, @challenge2)
    `);
    stmt.run(data);
  }
}

export async function insertCommunityMember(email: string) {
  if (USE_AWS && ddbDocClient) {
    await ddbDocClient.send(new PutCommand({
      TableName: 'Wisentry_Community',
      Item: {
        email,
        createdAt: new Date().toISOString()
      }
    }));
  } else if (db) {
    try {
      const stmt = db.prepare(`INSERT INTO community (email) VALUES (@email)`);
      stmt.run({ email });
    } catch (e: any) {
      // Ignore unique constraint error if they try joining multiple times
      if (e.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
        throw e;
      }
    }
  }
}

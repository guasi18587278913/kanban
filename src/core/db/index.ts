import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { envConfigs } from '@/config';
import { isCloudflareWorker } from '@/shared/lib/env';

// Global database connection instance (singleton pattern)
let dbInstance: ReturnType<typeof drizzle> | null = null;
let client: ReturnType<typeof postgres> | null = null;

export function db() {
    // 1. Cloudflare D1 Support (Preferred for this deployment)
    // @ts-ignore
    const env = globalThis.env || (globalThis as any).__ENV__ || process.env;
    
    // Check for D1 binding 'DB'
    if (env && env.DB) {
        // We need to dynamically import or use the d1 driver if available
        // Since this codebase was Postgres-centric, we need to adapt.
        // Assuming we install drizzle-orm/d1-http or similar if needed, 
        // but typically D1 binding is used directly with drizzle-orm/d1
        
        const { drizzle } = require('drizzle-orm/d1');
        return drizzle(env.DB);
    }
  
    // 2. Existing Postgres Logic
    let databaseUrl = envConfigs.database_url;
  
    let isHyperdrive = false;
  
    if (isCloudflareWorker) {
      // In Cloudflare Workers, we get env from globalThis or the request context
      // However, since this is a utility function, we rely on the global context or passed env
      // For now, let's assume standard worker global scope
  
      // @ts-ignore - Cloudflare Workers global scope
  // ... existing logic continues ...
      const env = globalThis.env || (globalThis as any).__ENV__ || process.env;
  
      // Detect if set Hyperdrive
      isHyperdrive = env && 'HYPERDRIVE' in env;
  
      if (isHyperdrive) {
        const hyperdrive = env.HYPERDRIVE;
        databaseUrl = hyperdrive.connectionString;
        console.log('using Hyperdrive connection');
      }
    }
  
    if (!databaseUrl) {
      // If no DB URL and NO D1, throw error
      throw new Error('DATABASE_URL is not set and no D1 binding found');
    }
  
    // In Cloudflare Workers, create new connection each time
    if (isCloudflareWorker) {
      console.log('in Cloudflare Workers environment');
      // Workers environment uses minimal configuration
      const client = postgres(databaseUrl, {
        prepare: false,
        max: 1, // Limit to 1 connection in Workers
        idle_timeout: 10, // Shorter timeout for Workers
        connect_timeout: 5,
      });
  
      return drizzle(client);
    }
  
    // Singleton mode: reuse existing connection (good for traditional servers)
    if (envConfigs.db_singleton_enabled === 'true') {
      // Return existing instance if already initialized
      if (dbInstance) {
        return dbInstance;
      }
  
      // Create connection pool only once
      client = postgres(databaseUrl, {
        prepare: false,
        max: 10, // Maximum connections in pool
        idle_timeout: 30, // Idle connection timeout (seconds)
        connect_timeout: 10, // Connection timeout (seconds)
      });
  
      dbInstance = drizzle({ client });
      return dbInstance;
    }
  
    // Non-singleton mode: create new connection each time (good for serverless)
    // In serverless, the connection will be cleaned up when the function instance is destroyed
    const serverlessClient = postgres(databaseUrl, {
      prepare: false,
      max: 1, // Use single connection in serverless
      idle_timeout: 20,
      connect_timeout: 10,
      });
  
    return drizzle({ client: serverlessClient });
  }

// Optional: Function to close database connection (useful for testing or graceful shutdown)
// Note: Only works in singleton mode
export async function closeDb() {
  if (envConfigs.db_singleton_enabled && client) {
    await client.end();
    client = null;
    dbInstance = null;
  }
}

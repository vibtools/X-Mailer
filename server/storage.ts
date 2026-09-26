import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { hasRealDatabaseUrl, pool } from "./db";

dotenv.config();

export interface StorageConfigRow {
  provider: "supabase_s3";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrlBase: string;
  forcePathStyle: boolean;
  isEnabled: boolean;
  status: "connected" | "unconfigured" | "error";
  lastTested?: string;
  testMessage?: string;
}

// Initial default configuration
// Storage credentials are entered from the admin Storage Settings screen and persisted in PostgreSQL.
// They are never read from environment variables for the active runtime configuration.
const defaultConfig: StorageConfigRow = {
  provider: "supabase_s3",
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  publicUrlBase: "",
  forcePathStyle: true,
  isEnabled: false,
  status: "unconfigured",
};

// Initialize Supabase Storage Tables in PostgreSQL
export async function initStorageSchema() {
  if (!hasRealDatabaseUrl) {
    return;
  }
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS neon_storage_config (
          id VARCHAR(50) PRIMARY KEY,
          provider VARCHAR(50) DEFAULT 'supabase_s3',
          endpoint TEXT DEFAULT '',
          region VARCHAR(100) DEFAULT 'us-east-1',
          bucket VARCHAR(255) DEFAULT '',
          access_key_id TEXT DEFAULT '',
          secret_access_key TEXT DEFAULT '',
          public_url_base TEXT DEFAULT '',
          force_path_style BOOLEAN DEFAULT TRUE,
          is_enabled BOOLEAN DEFAULT FALSE,
          status VARCHAR(50) DEFAULT 'unconfigured',
          last_tested TIMESTAMP,
          test_message TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS neon_uploaded_files (
          id VARCHAR(100) PRIMARY KEY,
          file_name VARCHAR(255) NOT NULL,
          file_size BIGINT NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          s3_key TEXT NOT NULL,
          s3_url TEXT NOT NULL,
          bucket VARCHAR(255) NOT NULL,
          uploaded_by VARCHAR(255),
          source VARCHAR(50) DEFAULT 'attachment',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed initial config row if missing
      const check = await client.query(
        "SELECT COUNT(*) FROM neon_storage_config",
      );
      if (parseInt(check.rows[0].count, 10) === 0) {
        await client.query(
          `INSERT INTO neon_storage_config (
            id, provider, endpoint, region, bucket, access_key_id, secret_access_key,
            public_url_base, force_path_style, is_enabled, status
          ) VALUES ('default_storage', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            defaultConfig.provider,
            defaultConfig.endpoint,
            defaultConfig.region,
            defaultConfig.bucket,
            defaultConfig.accessKeyId,
            defaultConfig.secretAccessKey,
            defaultConfig.publicUrlBase,
            defaultConfig.forcePathStyle,
            defaultConfig.isEnabled,
            defaultConfig.status,
          ],
        );
      }
      console.log(
        "[Supabase S3 Storage] Storage schema initialized in PostgreSQL.",
      );
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(
      "[Supabase S3 Storage] Error initializing storage tables:",
      err.message,
    );
  }
}

// Fetch active storage configuration from PostgreSQL
export async function getStorageConfig(): Promise<StorageConfigRow> {
  if (!hasRealDatabaseUrl) return defaultConfig;
  try {
    const { rows } = await pool.query(
      "SELECT * FROM neon_storage_config WHERE id = $1 LIMIT 1",
      ["default_storage"],
    );
    if (rows.length === 0) return defaultConfig;
    const r = rows[0];
    return {
      provider: r.provider || "supabase_s3",
      endpoint: r.endpoint || "",
      region: r.region || "us-east-1",
      bucket: r.bucket || "",
      accessKeyId: r.access_key_id || "",
      secretAccessKey: r.secret_access_key || "",
      publicUrlBase: r.public_url_base || "",
      forcePathStyle: r.force_path_style !== false,
      isEnabled: r.is_enabled === true,
      status: r.status || "unconfigured",
      lastTested: r.last_tested
        ? new Date(r.last_tested).toISOString()
        : undefined,
      testMessage: r.test_message || undefined,
    };
  } catch (err) {
    return defaultConfig;
  }
}

// Save storage configuration into PostgreSQL
export async function saveStorageConfig(
  config: Partial<StorageConfigRow>,
): Promise<StorageConfigRow> {
  const current = await getStorageConfig();
  const merged: StorageConfigRow = {
    ...current,
    ...config,
    // Do not overwrite secret if client sent masked string (e.g. '••••••••')
    secretAccessKey:
      config.secretAccessKey === ""
        ? ""
        : config.secretAccessKey && !config.secretAccessKey.includes("•")
          ? config.secretAccessKey.trim()
          : current.secretAccessKey,
    endpoint:
      config.endpoint !== undefined ? config.endpoint.trim() : current.endpoint,
    bucket: config.bucket !== undefined ? config.bucket.trim() : current.bucket,
    region: config.region !== undefined ? config.region.trim() : current.region,
    accessKeyId:
      config.accessKeyId !== undefined
        ? config.accessKeyId.trim()
        : current.accessKeyId,
    publicUrlBase:
      config.publicUrlBase !== undefined
        ? config.publicUrlBase.trim()
        : current.publicUrlBase,
  };

  await pool.query(
    `INSERT INTO neon_storage_config (
      id, provider, endpoint, region, bucket, access_key_id, secret_access_key,
      public_url_base, force_path_style, is_enabled, status, last_tested, test_message, updated_at
    ) VALUES (
      'default_storage', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      provider = EXCLUDED.provider,
      endpoint = EXCLUDED.endpoint,
      region = EXCLUDED.region,
      bucket = EXCLUDED.bucket,
      access_key_id = EXCLUDED.access_key_id,
      secret_access_key = EXCLUDED.secret_access_key,
      public_url_base = EXCLUDED.public_url_base,
      force_path_style = EXCLUDED.force_path_style,
      is_enabled = EXCLUDED.is_enabled,
      status = EXCLUDED.status,
      last_tested = EXCLUDED.last_tested,
      test_message = EXCLUDED.test_message,
      updated_at = NOW()`,
    [
      merged.provider,
      merged.endpoint,
      merged.region,
      merged.bucket,
      merged.accessKeyId,
      merged.secretAccessKey,
      merged.publicUrlBase,
      merged.forcePathStyle,
      merged.isEnabled,
      merged.status,
      merged.lastTested ? new Date(merged.lastTested) : null,
      merged.testMessage || null,
    ],
  );

  return merged;
}

// Instantiate S3Client based on config
export function createS3Client(config: StorageConfigRow): S3Client {
  let endpointUrl = config.endpoint.trim();
  if (
    endpointUrl &&
    !endpointUrl.startsWith("http://") &&
    !endpointUrl.startsWith("https://")
  ) {
    endpointUrl = `https://${endpointUrl}`;
  }

  return new S3Client({
    endpoint: endpointUrl,
    region: config.region || "us-east-1",
    credentials: {
      accessKeyId: config.accessKeyId.trim(),
      secretAccessKey: config.secretAccessKey.trim(),
    },
    forcePathStyle: config.forcePathStyle !== false,
  });
}

// Test Supabase S3 Connection & Bucket Write Permissions
export async function testStorageConnection(
  testParams?: Partial<StorageConfigRow>,
): Promise<{
  connected: boolean;
  message: string;
  pingMs?: number;
  bucket?: string;
  endpoint?: string;
}> {
  const current = await getStorageConfig();
  const config: StorageConfigRow = {
    ...current,
    ...testParams,
    secretAccessKey:
      testParams?.secretAccessKey && !testParams.secretAccessKey.includes("•")
        ? testParams.secretAccessKey.trim()
        : current.secretAccessKey,
  };

  if (!config.endpoint) {
    return {
      connected: false,
      message:
        "Supabase S3 Endpoint URL is required (e.g. https://<ref>.supabase.co/storage/v1/s3)",
    };
  }
  if (!config.bucket) {
    return {
      connected: false,
      message: "Bucket name is required (e.g. rsender-files)",
    };
  }
  if (!config.accessKeyId || !config.secretAccessKey) {
    return {
      connected: false,
      message: "S3 Access Key ID and Secret Access Key are required",
    };
  }

  const startTime = Date.now();

  try {
    const s3 = createS3Client(config);

    // 1. Probe listing objects in bucket
    await s3.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        MaxKeys: 1,
      }),
    );

    // 2. Perform write probe to verify write permission
    const probeKey = `__health_probes/ping_${Date.now()}.json`;
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: probeKey,
        Body: Buffer.from(
          JSON.stringify({ ping: true, timestamp: new Date().toISOString() }),
        ),
        ContentType: "application/json",
      }),
    );

    // Clean up probe object
    await s3
      .send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: probeKey,
        }),
      )
      .catch(() => {});

    const pingMs = Date.now() - startTime;
    const successMsg = `Successfully connected to Supabase S3 storage! Verified read/write access to bucket "${config.bucket}" in ${pingMs}ms.`;

    // Update status in DB
    await pool.query(
      `UPDATE neon_storage_config
       SET status = 'connected', is_enabled = TRUE, last_tested = NOW(), test_message = $1, updated_at = NOW()
       WHERE id = 'default_storage'`,
      [successMsg],
    );

    return {
      connected: true,
      message: successMsg,
      pingMs,
      bucket: config.bucket,
      endpoint: config.endpoint,
    };
  } catch (err: any) {
    const errMsg = `Supabase S3 connection failed: ${err.message || err}`;
    await pool
      .query(
        `UPDATE neon_storage_config
       SET status = 'error', last_tested = NOW(), test_message = $1, updated_at = NOW()
       WHERE id = 'default_storage'`,
        [errMsg],
      )
      .catch(() => {});

    return {
      connected: false,
      message: errMsg,
      bucket: config.bucket,
      endpoint: config.endpoint,
    };
  }
}

// Helper to compute public URL for uploaded file
export function resolvePublicUrl(
  config: StorageConfigRow,
  s3Key: string,
): string {
  if (config.publicUrlBase && config.publicUrlBase.trim()) {
    const base = config.publicUrlBase.trim().replace(/\/$/, "");
    return `${base}/${s3Key}`;
  }

  // Supabase S3 standard public URL construction
  let endpoint = config.endpoint.trim().replace(/\/$/, "");
  if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
    endpoint = `https://${endpoint}`;
  }

  // If endpoint is Supabase format: https://<project-ref>.supabase.co/storage/v1/s3
  if (endpoint.includes(".supabase.co")) {
    const root = endpoint.split("/storage/v1")[0];
    return `${root}/storage/v1/object/public/${config.bucket}/${s3Key}`;
  }

  // Generic S3 path-style URL
  return `${endpoint}/${config.bucket}/${s3Key}`;
}

// Upload file to Supabase S3 Storage and register in database
export async function uploadFileToSupabase(options: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  source?: "attachment" | "recipient_csv" | "logo" | "favicon" | "general";
  uploadedBy?: string;
}): Promise<{
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  s3Url: string;
  bucket: string;
  provider: string;
}> {
  const config = await getStorageConfig();

  if (
    !config.isEnabled ||
    !config.endpoint ||
    !config.bucket ||
    !config.accessKeyId ||
    !config.secretAccessKey
  ) {
    throw new Error(
      "Supabase S3 Storage is not configured or enabled. Please configure storage credentials in Admin Settings > Storage Settings.",
    );
  }

  const cleanName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dateStr = new Date().toISOString().split("T")[0];
  const uniqueId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const s3Key = `uploads/${options.source || "attachment"}/${dateStr}/${uniqueId}_${cleanName}`;

  const s3 = createS3Client(config);

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: s3Key,
      Body: options.buffer,
      ContentType: options.mimeType || "application/octet-stream",
      CacheControl: "max-age=31536000, public",
    }),
  );

  const s3Url = resolvePublicUrl(config, s3Key);
  const fileSize = options.buffer.length;

  // Record in PostgreSQL
  await pool.query(
    `INSERT INTO neon_uploaded_files (
      id, file_name, file_size, mime_type, s3_key, s3_url, bucket, uploaded_by, source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uniqueId,
      options.fileName,
      fileSize,
      options.mimeType || "application/octet-stream",
      s3Key,
      s3Url,
      config.bucket,
      options.uploadedBy || "system",
      options.source || "attachment",
    ],
  );

  return {
    id: uniqueId,
    fileName: options.fileName,
    fileSize,
    mimeType: options.mimeType,
    s3Key,
    s3Url,
    bucket: config.bucket,
    provider: "supabase_s3",
  };
}

// Fetch list of uploaded files from PostgreSQL
export async function getUploadedFiles(limit = 100): Promise<any[]> {
  if (!hasRealDatabaseUrl) return [];
  try {
    const { rows } = await pool.query(
      `SELECT id, file_name as "fileName", file_size as "fileSize", mime_type as "mimeType",
              s3_key as "s3Key", s3_url as "s3Url", bucket, uploaded_by as "uploadedBy",
              source, created_at as "createdAt"
       FROM neon_uploaded_files
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows;
  } catch (err) {
    return [];
  }
}

// Delete file from Supabase S3 and PostgreSQL
export async function deleteUploadedFile(id: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM neon_uploaded_files WHERE id = $1",
      [id],
    );
    if (rows.length === 0) return false;

    const file = rows[0];
    const config = await getStorageConfig();

    if (
      config.endpoint &&
      config.bucket &&
      config.accessKeyId &&
      config.secretAccessKey
    ) {
      try {
        const s3 = createS3Client(config);
        await s3.send(
          new DeleteObjectCommand({
            Bucket: file.bucket || config.bucket,
            Key: file.s3_key,
          }),
        );
      } catch (err: any) {
        console.warn(
          `[Supabase S3 Storage] S3 file deletion warning: ${err.message}`,
        );
      }
    }

    await pool.query("DELETE FROM neon_uploaded_files WHERE id = $1", [id]);
    return true;
  } catch (err: any) {
    console.error(`[Supabase S3 Storage] Error deleting file: ${err.message}`);
    throw err;
  }
}

// Presigned URL generation for S3/MinIO uploads.

import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

let _client: S3Client | undefined;
let _config: S3Config | undefined;

export function initS3(cfg: S3Config) {
  _config = cfg;
  _client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKey,
      secretAccessKey: cfg.secretKey,
    },
    forcePathStyle: true, // required for MinIO
  });
}

export async function ensureBucket(): Promise<void> {
  if (!_client || !_config) throw new Error('S3 not initialized');
  try {
    await _client.send(new HeadBucketCommand({ Bucket: _config.bucket }));
  } catch {
    await _client.send(new CreateBucketCommand({ Bucket: _config.bucket }));
  }
}

export interface SignUploadInput {
  filename: string;
  contentType: string;
  sizeBytes: number;
  purpose: string;
  teamId: string;
  assetType?: string;
}

export interface SignUploadResult {
  upload_url: string;
  method: 'PUT';
  headers: Record<string, string>;
  file_url: string;
  expires_in: number;
}

const EXPIRES_IN = 300; // 5 minutes

export async function generatePresignedUrl(input: SignUploadInput): Promise<SignUploadResult> {
  if (!_client || !_config) throw new Error('S3 not initialized');

  const ext = path.extname(input.filename) || '';
  const assetType = input.assetType || 'misc';
  const key = `assets/${input.teamId}/${assetType}/${randomUUID()}${ext}`;

  const command = new PutObjectCommand({
    Bucket: _config.bucket,
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.sizeBytes,
  });

  const uploadUrl = await getSignedUrl(_client, command, { expiresIn: EXPIRES_IN });

  // file_url is the permanent URL to access the file after upload
  const fileUrl = `${_config.endpoint}/${_config.bucket}/${key}`;

  return {
    upload_url: uploadUrl,
    method: 'PUT',
    headers: {
      'Content-Type': input.contentType,
    },
    file_url: fileUrl,
    expires_in: EXPIRES_IN,
  };
}

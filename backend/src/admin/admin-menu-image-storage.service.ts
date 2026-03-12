import { BadRequestException, Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { extname } from 'node:path';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extensionFromFile(file: Express.Multer.File): string {
  const fromOriginal = extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (fromOriginal) {
    return fromOriginal;
  }

  const byMime: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };

  return byMime[file.mimetype] || '.bin';
}

function sha256Hex(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function toAmzDate(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

@Injectable()
export class AdminMenuImageStorageService {
  getMaxUploadBytes(): number {
    return parsePositiveInt(process.env.S3_UPLOAD_MAX_BYTES, DEFAULT_MAX_UPLOAD_BYTES);
  }

  isSupportedImage(file: Express.Multer.File): boolean {
    return ALLOWED_MIME_TYPES.has(file.mimetype);
  }

  async uploadMenuImage(restaurantId: string, file: Express.Multer.File): Promise<{ key: string; url: string }> {
    if (!file) {
      throw new BadRequestException({ error: 'IMAGE_FILE_REQUIRED', message: 'No image file provided.' });
    }

    if (!this.isSupportedImage(file)) {
      throw new BadRequestException({
        error: 'IMAGE_TYPE_NOT_SUPPORTED',
        message: 'Supported image types are: jpeg, png, webp, gif.',
      });
    }

    const maxUploadBytes = this.getMaxUploadBytes();
    if (file.size > maxUploadBytes) {
      throw new BadRequestException({
        error: 'IMAGE_TOO_LARGE',
        message: `Image exceeds max upload size (${maxUploadBytes} bytes).`,
      });
    }

    const requiredVars = ['S3_BUCKET', 'S3_REGION', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
    const missing = requiredVars.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new ServiceUnavailableException({
        error: 'STORAGE_NOT_CONFIGURED',
        message: `Object storage is not configured (${missing.join(', ')}).`,
      });
    }

    const bucket = process.env.S3_BUCKET!;
    const region = process.env.S3_REGION!;
    const endpointRaw = process.env.S3_ENDPOINT!;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID!;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY!;
    const sessionToken = process.env.S3_SESSION_TOKEN;
    const objectAcl = process.env.S3_OBJECT_ACL || 'public-read';
    const cacheControl = process.env.S3_CACHE_CONTROL || 'public, max-age=31536000, immutable';

    const safeRestaurantId = sanitizePathSegment(restaurantId);
    const key = `restaurants/${safeRestaurantId}/menu/${Date.now()}-${randomUUID()}${extensionFromFile(file)}`;

    const endpoint = endpointRaw.startsWith('http') ? endpointRaw : `https://${endpointRaw}`;
    const endpointUrl = new URL(endpoint);
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

    const host = forcePathStyle ? endpointUrl.host : `${bucket}.${endpointUrl.host}`;
    const path = forcePathStyle ? `/${bucket}/${key}` : `/${key}`;
    const uploadUrl = `${endpointUrl.protocol}//${host}${path}`;

    const now = new Date();
    const { amzDate, dateStamp } = toAmzDate(now);
    const payloadHash = sha256Hex(file.buffer);

    const canonicalHeaders = [
      `host:${host}`,
      `x-amz-acl:${objectAcl}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
      ...(sessionToken ? [`x-amz-security-token:${sessionToken}`] : []),
    ].join('\n');

    const signedHeaders = ['host', 'x-amz-acl', 'x-amz-content-sha256', 'x-amz-date', ...(sessionToken ? ['x-amz-security-token'] : [])].join(';');

    const canonicalRequest = ['PUT', path, '', `${canonicalHeaders}\n`, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': file.mimetype,
        'cache-control': cacheControl,
        'x-amz-acl': objectAcl,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
        authorization,
      },
      body: file.buffer,
    });

    if (!response.ok) {
      throw new InternalServerErrorException({
        error: 'IMAGE_UPLOAD_FAILED',
        message: `Image upload to object storage failed with status ${response.status}.`,
      });
    }

    return { key, url: this.buildPublicUrl(key, bucket, endpointUrl) };
  }

  private buildPublicUrl(key: string, bucket: string, endpointUrl: URL): string {
    const configuredBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (configuredBaseUrl) {
      return `${configuredBaseUrl}/${key}`;
    }

    return `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}/${key}`;
  }
}

import { BadRequestException, Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { UploadedMenuImageFile } from './menu-image-upload.types';

type AdminImageScope = 'menu' | 'branding-logo';

type UploadedAdminImageFile = UploadedMenuImageFile;

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

function extensionFromFile(file: UploadedAdminImageFile): string {
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
export class AdminMediaStorageService {
  private getManagedPrefix(restaurantId: string, scope: AdminImageScope): string {
    const safeRestaurantId = sanitizePathSegment(restaurantId);
    if (scope === 'branding-logo') {
      return `restaurants/${safeRestaurantId}/branding/logo/`;
    }
    return `restaurants/${safeRestaurantId}/menu/`;
  }

  getMaxUploadBytes(): number {
    return parsePositiveInt(process.env.S3_UPLOAD_MAX_BYTES, DEFAULT_MAX_UPLOAD_BYTES);
  }

  isSupportedImage(file: UploadedAdminImageFile): boolean {
    return ALLOWED_MIME_TYPES.has(file.mimetype);
  }

  async uploadMenuImage(restaurantId: string, file: UploadedAdminImageFile): Promise<{ key: string; url: string }> {
    return this.uploadImage(restaurantId, 'menu', file);
  }

  async uploadBrandingLogo(restaurantId: string, file: UploadedAdminImageFile): Promise<{ key: string; url: string }> {
    return this.uploadImage(restaurantId, 'branding-logo', file);
  }

  async deleteMenuImageIfManaged(restaurantId: string, imageUrl: string | null | undefined): Promise<void> {
    return this.deleteImageIfManaged(restaurantId, 'menu', imageUrl);
  }

  async deleteBrandingLogoIfManaged(restaurantId: string, imageUrl: string | null | undefined): Promise<void> {
    return this.deleteImageIfManaged(restaurantId, 'branding-logo', imageUrl);
  }

  private async uploadImage(
    restaurantId: string,
    scope: AdminImageScope,
    file: UploadedAdminImageFile,
  ): Promise<{ key: string; url: string }> {
    this.assertUploadableImage(file);

    const objectAcl = process.env.S3_OBJECT_ACL || 'public-read';
    const cacheControl = process.env.S3_CACHE_CONTROL || 'public, max-age=31536000, immutable';
    const key = `${this.getManagedPrefix(restaurantId, scope)}${Date.now()}-${randomUUID()}${extensionFromFile(file)}`;

    await this.sendObjectRequest('PUT', key, file, {
      objectAcl,
      cacheControl,
    });

    return { key, url: this.buildPublicUrl(key) };
  }

  private async deleteImageIfManaged(
    restaurantId: string,
    scope: AdminImageScope,
    imageUrl: string | null | undefined,
  ): Promise<void> {
    const key = this.extractManagedKeyFromUrl(restaurantId, scope, imageUrl);
    if (!key) return;

    await this.sendObjectRequest('DELETE', key);
  }

  private assertUploadableImage(file: UploadedAdminImageFile | null | undefined): asserts file is UploadedAdminImageFile {
    if (!file) {
      throw new BadRequestException({ error: 'IMAGE_FILE_REQUIRED', message: 'No image file provided.' });
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new ServiceUnavailableException({
        error: 'IMAGE_BUFFER_UNAVAILABLE',
        message: 'Uploaded image content is unavailable on the server. Verify multipart memory storage configuration.',
      });
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
  }

  private extractManagedKeyFromUrl(
    restaurantId: string,
    scope: AdminImageScope,
    imageUrl: string | null | undefined,
  ): string | null {
    if (!imageUrl) return null;

    const managedPrefix = this.getManagedPrefix(restaurantId, scope);
    const configuredBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');

    if (configuredBaseUrl && imageUrl.startsWith(`${configuredBaseUrl}/`)) {
      const key = imageUrl.slice(configuredBaseUrl.length + 1);
      return key.startsWith(managedPrefix) ? key : null;
    }

    const bucket = process.env.S3_BUCKET;
    const endpointRaw = process.env.S3_ENDPOINT;
    if (!bucket || !endpointRaw) return null;

    const endpoint = endpointRaw.startsWith('http') ? endpointRaw : `https://${endpointRaw}`;
    const endpointUrl = new URL(endpoint);

    const virtualHostPrefix = `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}/`;
    if (imageUrl.startsWith(virtualHostPrefix)) {
      const key = imageUrl.slice(virtualHostPrefix.length);
      return key.startsWith(managedPrefix) ? key : null;
    }

    const pathStylePrefix = `${endpointUrl.protocol}//${endpointUrl.host}/${bucket}/`;
    if (imageUrl.startsWith(pathStylePrefix)) {
      const key = imageUrl.slice(pathStylePrefix.length);
      return key.startsWith(managedPrefix) ? key : null;
    }

    return null;
  }

  private async sendObjectRequest(
    method: 'PUT' | 'DELETE',
    key: string,
    file?: UploadedAdminImageFile,
    options?: { objectAcl?: string; cacheControl?: string },
  ): Promise<void> {
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

    const endpoint = endpointRaw.startsWith('http') ? endpointRaw : `https://${endpointRaw}`;
    const endpointUrl = new URL(endpoint);
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

    const host = forcePathStyle ? endpointUrl.host : `${bucket}.${endpointUrl.host}`;
    const path = forcePathStyle ? `/${bucket}/${key}` : `/${key}`;
    const uploadUrl = `${endpointUrl.protocol}//${host}${path}`;

    const now = new Date();
    const { amzDate, dateStamp } = toAmzDate(now);
    const payloadHash = method === 'PUT' && file ? sha256Hex(file.buffer) : sha256Hex('');

    const canonicalHeaders = [
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
      ...(method === 'PUT' ? [`x-amz-acl:${options?.objectAcl || objectAcl}`] : []),
      ...(sessionToken ? [`x-amz-security-token:${sessionToken}`] : []),
    ].join('\n');

    const signedHeaders = [
      'host',
      ...(method === 'PUT' ? ['x-amz-acl'] : []),
      'x-amz-content-sha256',
      'x-amz-date',
      ...(sessionToken ? ['x-amz-security-token'] : []),
    ].join(';');

    const canonicalRequest = [method, path, '', `${canonicalHeaders}\n`, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(uploadUrl, {
      method,
      headers: {
        ...(method === 'PUT' && file ? { 'content-type': file.mimetype } : {}),
        ...(method === 'PUT' ? { 'cache-control': options?.cacheControl || cacheControl } : {}),
        ...(method === 'PUT' ? { 'x-amz-acl': options?.objectAcl || objectAcl } : {}),
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
        authorization,
      },
      body: method === 'PUT' && file ? new Uint8Array(file.buffer) : undefined,
    });

    if (!response.ok) {
      throw new InternalServerErrorException({
        error: method === 'PUT' ? 'IMAGE_UPLOAD_FAILED' : 'IMAGE_DELETE_FAILED',
        message: `Object storage ${method} failed with status ${response.status}.`,
      });
    }
  }

  private buildPublicUrl(key: string): string {
    const bucket = process.env.S3_BUCKET!;
    const endpointRaw = process.env.S3_ENDPOINT!;
    const endpoint = endpointRaw.startsWith('http') ? endpointRaw : `https://${endpointRaw}`;
    const endpointUrl = new URL(endpoint);

    const configuredBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (configuredBaseUrl) {
      return `${configuredBaseUrl}/${key}`;
    }

    return `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}/${key}`;
  }
}

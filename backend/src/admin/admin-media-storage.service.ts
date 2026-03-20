import { BadRequestException, Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { UploadedMenuImageFile } from './menu-image-upload.types';
import { PrismaService } from '../prisma/prisma.service';

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

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
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
  constructor(private readonly prisma: PrismaService) {}

  private getEndpointUrl(): URL {
    const endpointRaw = process.env.S3_ENDPOINT!;
    const endpoint = endpointRaw.startsWith('http') ? endpointRaw : `https://${endpointRaw}`;
    return new URL(endpoint);
  }

  private isAwsS3Endpoint(endpointUrl: URL): boolean {
    return endpointUrl.hostname === 's3.amazonaws.com' || endpointUrl.hostname.endsWith('.amazonaws.com');
  }

  private resolveObjectAcl(endpointUrl: URL): string | null {
    const configuredAcl = normalizeOptionalEnv(process.env.S3_OBJECT_ACL);
    if (configuredAcl) {
      return configuredAcl;
    }

    if (this.isAwsS3Endpoint(endpointUrl)) {
      return null;
    }

    return 'public-read';
  }

  private async getStorageNamespace(restaurantId: string): Promise<string> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true },
    });
    const candidate = typeof restaurant?.slug === 'string' && restaurant.slug.trim()
      ? restaurant.slug.trim()
      : restaurantId === 'demo-restaurant'
        ? 'alalouche'
      : restaurantId;

    return sanitizePathSegment(candidate);
  }

  private buildManagedPrefix(storageNamespace: string, scope: AdminImageScope): string {
    if (scope === 'branding-logo') {
      return `restaurants/${storageNamespace}/branding/logo/`;
    }
    return `restaurants/${storageNamespace}/menu/`;
  }

  private async getManagedPrefixes(restaurantId: string, scope: AdminImageScope): Promise<string[]> {
    const storageNamespace = await this.getStorageNamespace(restaurantId);
    const safeRestaurantId = sanitizePathSegment(restaurantId);
    const prefixes = [
      this.buildManagedPrefix(storageNamespace, scope),
      this.buildManagedPrefix(safeRestaurantId, scope),
    ];

    return [...new Set(prefixes)];
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

  async getMediaObject(key: string): Promise<{ body: Buffer; contentType: string | null; cacheControl: string | null }> {
    if (!key.startsWith('restaurants/')) {
      throw new BadRequestException({
        error: 'MEDIA_KEY_NOT_ALLOWED',
        message: 'Only managed restaurant media keys can be served publicly.',
      });
    }

    return this.sendObjectRequest('GET', key);
  }

  private async uploadImage(
    restaurantId: string,
    scope: AdminImageScope,
    file: UploadedAdminImageFile,
  ): Promise<{ key: string; url: string }> {
    this.assertUploadableImage(file);

    const objectAcl = this.resolveObjectAcl(this.getEndpointUrl());
    const cacheControl = process.env.S3_CACHE_CONTROL || 'public, max-age=31536000, immutable';
    const [managedPrefix] = await this.getManagedPrefixes(restaurantId, scope);
    const key = `${managedPrefix}${Date.now()}-${randomUUID()}${extensionFromFile(file)}`;

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
    const key = await this.extractManagedKeyFromUrl(restaurantId, scope, imageUrl);
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

  private async extractManagedKeyFromUrl(
    restaurantId: string,
    scope: AdminImageScope,
    imageUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!imageUrl) return null;

    const managedPrefixes = await this.getManagedPrefixes(restaurantId, scope);
    const configuredBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');

    if (configuredBaseUrl && imageUrl.startsWith(`${configuredBaseUrl}/`)) {
      const key = imageUrl.slice(configuredBaseUrl.length + 1);
      return managedPrefixes.some((prefix) => key.startsWith(prefix)) ? key : null;
    }

    const proxyKey = this.extractKeyFromMediaProxyUrl(imageUrl);
    if (proxyKey) {
      return managedPrefixes.some((prefix) => proxyKey.startsWith(prefix)) ? proxyKey : null;
    }

    const bucket = process.env.S3_BUCKET;
    const endpointRaw = process.env.S3_ENDPOINT;
    if (!bucket || !endpointRaw) return null;

    const endpoint = endpointRaw.startsWith('http') ? endpointRaw : `https://${endpointRaw}`;
    const endpointUrl = new URL(endpoint);

    const virtualHostPrefix = `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}/`;
    if (imageUrl.startsWith(virtualHostPrefix)) {
      const key = imageUrl.slice(virtualHostPrefix.length);
      return managedPrefixes.some((prefix) => key.startsWith(prefix)) ? key : null;
    }

    const pathStylePrefix = `${endpointUrl.protocol}//${endpointUrl.host}/${bucket}/`;
    if (imageUrl.startsWith(pathStylePrefix)) {
      const key = imageUrl.slice(pathStylePrefix.length);
      return managedPrefixes.some((prefix) => key.startsWith(prefix)) ? key : null;
    }

    const awsPublicPrefix = this.getAwsPublicBaseUrl(bucket);
    if (awsPublicPrefix && imageUrl.startsWith(`${awsPublicPrefix}/`)) {
      const key = imageUrl.slice(awsPublicPrefix.length + 1);
      return managedPrefixes.some((prefix) => key.startsWith(prefix)) ? key : null;
    }

    return null;
  }

  private getAwsPublicBaseUrl(bucket: string): string | null {
    const endpointUrl = this.getEndpointUrl();
    if (!this.isAwsS3Endpoint(endpointUrl)) {
      return null;
    }

    const region = normalizeOptionalEnv(process.env.S3_REGION) || 'us-east-1';
    if (region === 'us-east-1') {
      return `https://${bucket}.s3.amazonaws.com`;
    }

    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }

  private extractKeyFromMediaProxyUrl(imageUrl: string): string | null {
    try {
      const parsed = new URL(imageUrl);
      if (!parsed.pathname.endsWith('/public/media')) {
        return null;
      }

      const key = parsed.searchParams.get('key');
      return typeof key === 'string' && key.trim() ? key.trim() : null;
    } catch {
      return null;
    }
  }

  private async sendObjectRequest(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    file?: UploadedAdminImageFile,
    options?: { objectAcl?: string | null; cacheControl?: string },
  ): Promise<{ body: Buffer; contentType: string | null; cacheControl: string | null }> {
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
    const cacheControl = process.env.S3_CACHE_CONTROL || 'public, max-age=31536000, immutable';

    const endpointUrl = this.getEndpointUrl();
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
    const objectAcl = this.resolveObjectAcl(endpointUrl);
    const resolvedObjectAcl = options?.objectAcl ?? objectAcl ?? undefined;

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
      ...(method === 'PUT' && resolvedObjectAcl ? [`x-amz-acl:${resolvedObjectAcl}`] : []),
      ...(sessionToken ? [`x-amz-security-token:${sessionToken}`] : []),
    ].join('\n');

    const signedHeaders = [
      'host',
      ...(method === 'PUT' && resolvedObjectAcl ? ['x-amz-acl'] : []),
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
        ...(method === 'PUT' && resolvedObjectAcl ? { 'x-amz-acl': resolvedObjectAcl } : {}),
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
        authorization,
      },
      body: method === 'PUT' && file ? new Uint8Array(file.buffer) : undefined,
    });

    if (!response.ok) {
      throw new InternalServerErrorException({
        error: method === 'PUT' ? 'IMAGE_UPLOAD_FAILED' : method === 'GET' ? 'IMAGE_READ_FAILED' : 'IMAGE_DELETE_FAILED',
        message: `Object storage ${method} failed with status ${response.status}.`,
      });
    }

    if (method === 'GET') {
      const arrayBuffer = await response.arrayBuffer();
      return {
        body: Buffer.from(arrayBuffer),
        contentType: response.headers.get('content-type'),
        cacheControl: response.headers.get('cache-control'),
      };
    }

    return { body: Buffer.alloc(0), contentType: null, cacheControl: null };
  }

  private buildPublicUrl(key: string): string {
    const bucket = process.env.S3_BUCKET!;
    const endpointUrl = this.getEndpointUrl();

    const configuredBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (configuredBaseUrl) {
      return `${configuredBaseUrl}/${key}`;
    }

    const awsPublicBaseUrl = this.getAwsPublicBaseUrl(bucket);
    if (awsPublicBaseUrl) {
      return `${awsPublicBaseUrl}/${key}`;
    }

    return `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}/${key}`;
  }
}

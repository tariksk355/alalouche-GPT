import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PublicConfigController } from './public-config.controller';
import { PublicConfigService } from './public-config.service';
import { AdminMediaStorageService } from '../admin/admin-media-storage.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [PublicConfigController],
  providers: [PublicConfigService, AdminMediaStorageService],
})
export class PublicConfigModule {}

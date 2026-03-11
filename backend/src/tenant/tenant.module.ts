import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantResolverService } from './tenant-resolver.service';

@Module({
  imports: [PrismaModule],
  providers: [TenantResolverService, TenantContextGuard],
  exports: [TenantResolverService, TenantContextGuard],
})
export class TenantModule {}

import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from './internal/generated/database';
import { KYSELY, kyselyProvider } from './internal/kysely';
import { AuthRepository } from './repositories/auth.repository';
import { ReferenceRepository } from './repositories/reference.repository';
import { UserRepository } from './repositories/user.repository';
import { FollowRepository } from './repositories/follow.repository';
import { BlockRepository } from './repositories/block.repository';
import { CircleRepository } from './repositories/circle.repository';
import { CommunityRepository } from './repositories/community.repository';
import { VenueRepository } from './repositories/venue.repository';
import { EventRepository } from './repositories/event.repository';
import { RegistrationRepository } from './repositories/registration.repository';
import { AttendanceRepository } from './repositories/attendance.repository';

// Repositories are added to both `providers` and `exports` as batches land.
@Global()
@Module({
  providers: [
    kyselyProvider,
    ReferenceRepository,
    AuthRepository,
    UserRepository,
    FollowRepository,
    BlockRepository,
    CircleRepository,
    CommunityRepository,
    VenueRepository,
    EventRepository,
    RegistrationRepository,
    AttendanceRepository,
  ],
  exports: [
    ReferenceRepository,
    AuthRepository,
    UserRepository,
    FollowRepository,
    BlockRepository,
    CircleRepository,
    CommunityRepository,
    VenueRepository,
    EventRepository,
    RegistrationRepository,
    AttendanceRepository,
  ],
})
export class DataModule implements OnModuleDestroy {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** Closes the pool when the application shuts down. */
  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}

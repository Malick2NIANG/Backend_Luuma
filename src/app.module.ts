import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ChatModule } from './chat/chat.module';
import { CurrencyModule } from './currency/currency.module';
import { FavoritesModule } from './favorites/favorites.module';
import { GlossaryModule } from './glossary/glossary.module';
import { LegalModule } from './legal/legal.module';
import { FeedModule } from './feed/feed.module';
import { FollowsModule } from './follows/follows.module';
import { GpsModule } from './gps/gps.module';
import { MailModule } from './mail/mail.module';
import { MeModule } from './me/me.module';
import { MerchantsModule } from './merchants/merchants.module';
import { OrdersModule } from './orders/orders.module';
import { PackagesModule } from './packages/packages.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { StoriesModule } from './stories/stories.module';
import { TripsModule } from './trips/trips.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    AuthModule,
    MeModule,
    TripsModule,
    GpsModule,
    MerchantsModule,
    ProductsModule,
    OrdersModule,
    PackagesModule,
    StorageModule,
    ChatModule,
    AdminModule,
    FollowsModule,
    FavoritesModule,
    FeedModule,
    SearchModule,
    StoriesModule,
    CurrencyModule,
    GlossaryModule,
    LegalModule,
    // Feature modules go here
  ],
})
export class AppModule {}

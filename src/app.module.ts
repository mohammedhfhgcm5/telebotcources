import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { BotModule } from './bot/bot.module';

@Module({
  imports: [PrismaModule, BotModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

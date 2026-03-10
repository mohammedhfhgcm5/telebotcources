import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { TelegramController } from './telegram.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TelegramController],
  providers: [BotService],
})
export class BotModule {}

import { Controller, Post, Req } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly botService: BotService) {}

  @Post()
  async handleUpdate(@Req() req: any) {
    await this.botService.bot.handleUpdate(req.body);
    return { ok: true };
  }
}

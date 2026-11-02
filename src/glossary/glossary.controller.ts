import { Controller, Get, Query } from '@nestjs/common';
import { GlossaryService } from './glossary.service';

/**
 * Public : les descriptions sont lisibles sans compte, leur glossaire doit
 * l'être aussi.
 */
@Controller('glossary')
export class GlossaryController {
  constructor(private readonly glossary: GlossaryService) {}

  @Get()
  list(@Query('lang') lang?: string) {
    return this.glossary.list(lang ?? '');
  }
}

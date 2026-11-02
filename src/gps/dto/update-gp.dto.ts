import { PartialType } from '@nestjs/swagger';
import { CreateGpDto } from './create-gp.dto';

export class UpdateGpDto extends PartialType(CreateGpDto) {}

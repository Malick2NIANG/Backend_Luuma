import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const FOLLOW_TARGETS = ['merchant', 'gp'] as const;
export type FollowTarget = (typeof FOLLOW_TARGETS)[number];

export class FollowDto {
  @IsIn(FOLLOW_TARGETS, { message: 'Cible invalide (merchant ou gp).' })
  target!: FollowTarget;

  @IsString()
  @IsNotEmpty()
  targetId!: string;
}

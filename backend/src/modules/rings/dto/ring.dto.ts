import { IsIn, IsUUID } from 'class-validator';

export class StartRingDto {
  @IsUUID()
  visitorId!: string;

  @IsIn(['GATE_TO_HOST', 'HOST_TO_GATE'])
  direction!: 'GATE_TO_HOST' | 'HOST_TO_GATE';
}

export class RingActionDto {
  @IsIn(['accept', 'decline', 'busy', 'cancel'])
  action!: 'accept' | 'decline' | 'busy' | 'cancel';
}

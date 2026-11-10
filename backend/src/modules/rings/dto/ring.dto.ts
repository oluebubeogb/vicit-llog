import { IsIn, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class StartRingDto {
  @ValidateIf((o) => !o.dispatchId)
  @IsUUID()
  visitorId?: string;

  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  @IsOptional()
  @IsUUID()
  hostId?: string;

  @IsIn(['GATE_TO_HOST', 'HOST_TO_GATE'])
  direction!: 'GATE_TO_HOST' | 'HOST_TO_GATE';
}

export class RingActionDto {
  @IsIn(['accept', 'decline', 'busy', 'cancel', 'hangup'])
  action!: 'accept' | 'decline' | 'busy' | 'cancel' | 'hangup';
}

export class RingSignalDto {
  @IsIn(['offer', 'answer', 'ice', 'hangup'])
  type!: 'offer' | 'answer' | 'ice' | 'hangup';

  @IsOptional()
  @IsString()
  sdp?: string;

  @IsOptional()
  candidate?: any;
}
